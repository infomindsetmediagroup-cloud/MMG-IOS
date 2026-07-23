import {
  handleCustomerDelivery as handleLegacyCustomerDelivery,
  handleCustomerDeliveryObjectRequest,
} from "./kairos-customer-delivery-v1.js";

export const KAIROS_CUSTOMER_DELIVERY_BUILD = "kairos-customer-delivery-20260723-2";

const REGISTRY_OBJECT = "mmg-customer-delivery-registry";
const tokenCache = new Map();

export { handleCustomerDeliveryObjectRequest };

export async function handleCustomerDelivery(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/customer-delivery/status") return status(env);
  if (request.method === "POST" && url.pathname === "/api/customer-delivery/attach") return attachCustomerDelivery(request, env);
  if (request.method === "POST" && url.pathname === "/api/customer-delivery/shopify/webhooks/orders-paid") return paidOrderWebhook(request, env);
  return handleLegacyCustomerDelivery(request, env);
}

export async function attachCustomerDelivery(request, env) {
  try {
    requireStorage(env);
    const body = await request.json();
    const projectId = clean(body?.projectId, 160);
    const productId = normalizeGid(body?.productId, "Product");
    const variantId = body?.variantId ? normalizeGid(body.variantId, "ProductVariant") : null;
    if (String(body?.confirmation || "") !== "ATTACH CUSTOMER DELIVERY") throw fail(403, "delivery_attachment_confirmation_required", "Type ATTACH CUSTOMER DELIVERY to attach the customer package.");
    if (!/^[a-z0-9-]{20,}$/i.test(projectId)) throw fail(400, "delivery_project_required", "A completed publishing project is required.");
    if (!productId) throw fail(400, "delivery_product_required", "A Shopify product ID is required.");

    const origin = new URL(request.url).origin;
    const packageResponse = await fetch(`${origin}/api/admin-asset-vault/projects/${encodeURIComponent(projectId)}/package`);
    if (!packageResponse.ok) throw fail(409, "delivery_package_unavailable", "The final customer package is not available in the Admin Asset Vault.");

    const product = await readProduct(env, productId);
    if (!product) throw fail(404, "delivery_product_not_found", "The Shopify product was not found.");
    if (product.status !== "DRAFT") throw fail(409, "delivery_requires_draft_product", "Customer delivery must be attached while the Shopify product is still a draft.");
    const resolvedVariantId = variantId || product.variants?.nodes?.[0]?.id;
    if (!resolvedVariantId) throw fail(409, "delivery_variant_missing", "The Shopify product does not have a deliverable variant.");

    const mapping = {
      projectId,
      productId,
      variantId: resolvedVariantId,
      title: clean(product.title, 255),
      handle: clean(product.handle, 255),
      packageBytes: Number(packageResponse.headers.get("Content-Length") || 0),
      packageArtifact: "complete-production-package.zip",
      customerPackage: true,
      attachedAt: new Date().toISOString(),
      build: KAIROS_CUSTOMER_DELIVERY_BUILD,
    };

    const registered = await registryStub(env).fetch("https://kairos.internal/customer-delivery/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapping),
    });
    const registration = await registered.json().catch(() => null);
    if (!registered.ok || registration?.status !== "registered") throw fail(registered.status || 500, "delivery_registry_failed", "The customer delivery mapping could not be stored.");

    await setProductDeliveryMetafields(env, mapping);
    const webhook = await ensureOrdersPaidWebhook(request, env);
    return json({
      status: "attached-and-verified",
      build: KAIROS_CUSTOMER_DELIVERY_BUILD,
      mapping,
      webhook,
      nextAction: "Review the draft product and complete the governed live-publication approval.",
    }, 201);
  } catch (error) {
    return failure(error, "customer_delivery_attachment_failed");
  }
}

async function paidOrderWebhook(request, env) {
  const raw = new Uint8Array(await request.arrayBuffer());
  const secret = String(env.SHOPIFY_CLIENT_SECRET || env.SHOPIFY_WEBHOOK_SECRET || env.SHOPIFY_API_SECRET || "").trim();
  const supplied = String(request.headers.get("X-Shopify-Hmac-Sha256") || "").trim();
  if (!secret || !supplied || !(await verifyShopifyHmac(raw, supplied, secret))) return json({ status: "denied" }, 401);

  const deliveryId = clean(request.headers.get("X-Shopify-Webhook-Id") || request.headers.get("Webhook-Id"), 160);
  try {
    requireStorage(env);
    const decoded = JSON.parse(new TextDecoder().decode(raw));
    const order = unwrapOrderPayload(decoded);
    const normalized = normalizeOrder(order, new URL(request.url).origin, deliveryId);
    if (!normalized.orderId) throw fail(400, "delivery_order_invalid", "The paid order did not include a valid Shopify order ID.");

    const response = await registryStub(env).fetch("https://kairos.internal/customer-delivery/orders-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) throw fail(response.status || 500, "delivery_entitlement_issue_failed", result?.error?.message || "Customer entitlements could not be issued.");

    const deliveryResults = [];
    for (const entitlement of result.entitlements || []) {
      const metafield = await setOrderDeliveryMetafield(env, normalized.orderId, entitlement).then(() => "stored").catch((error) => `failed:${error.message}`);
      deliveryResults.push({ projectId: entitlement.projectId, metafield });
    }
    const fulfillment = (result.entitlements || []).length
      ? await createDigitalFulfillment(env, normalized.orderId, result.entitlements).catch((error) => ({ status: "failed", message: error.message }))
      : null;

    return json({
      status: "processed",
      build: KAIROS_CUSTOMER_DELIVERY_BUILD,
      deliveryId,
      entitlementCount: result.entitlements?.length || 0,
      deliveryResults,
      fulfillment,
    });
  } catch (error) {
    console.error("customer delivery webhook failed", { deliveryId, error: error instanceof Error ? error.message : error });
    return failure(error, "customer_delivery_webhook_failed");
  }
}

function unwrapOrderPayload(value) {
  if (value?.order && typeof value.order === "object") return value.order;
  if (value?.payload?.order && typeof value.payload.order === "object") return value.payload.order;
  if (value?.data?.order && typeof value.data.order === "object") return value.data.order;
  if (value?.payload && typeof value.payload === "object" && (value.payload.id || value.payload.admin_graphql_api_id)) return value.payload;
  return value || {};
}

function normalizeOrder(order, origin, deliveryId) {
  const lineItems = order.line_items || order.lineItems || order.items || [];
  const customer = order.customer || {};
  return {
    orderId: normalizeGid(order.admin_graphql_api_id || order.adminGraphqlApiId || order.id, "Order"),
    orderName: clean(order.name || order.order_number || order.orderNumber || order.id, 120),
    email: clean(order.email || order.contact_email || order.contactEmail || customer.email, 320).toLowerCase(),
    customerId: normalizeGid(customer.admin_graphql_api_id || customer.adminGraphqlApiId || customer.id, "Customer"),
    lineItems: Array.isArray(lineItems) ? lineItems.map((item) => ({
      productId: normalizeGid(item.admin_graphql_api_product_id || item.adminGraphqlApiProductId || item.product_id || item.productId || item.product?.id, "Product"),
      variantId: normalizeGid(item.admin_graphql_api_variant_id || item.adminGraphqlApiVariantId || item.variant_id || item.variantId || item.variant?.id, "ProductVariant"),
      lineItemId: normalizeGid(item.admin_graphql_api_id || item.adminGraphqlApiId || item.id, "LineItem"),
      title: clean(item.title || item.name, 255),
      quantity: Math.max(1, Number(item.quantity || 1)),
    })).filter((item) => item.productId || item.variantId) : [],
    paidAt: order.processed_at || order.processedAt || order.created_at || order.createdAt || new Date().toISOString(),
    origin,
    deliveryId,
  };
}

async function ensureOrdersPaidWebhook(request, env) {
  const uri = `${new URL(request.url).origin}/api/customer-delivery/shopify/webhooks/orders-paid`;
  const existing = await gql(env, `query{webhookSubscriptions(first:100,topics:[ORDERS_PAID]){nodes{id topic uri}}}`);
  const found = existing?.webhookSubscriptions?.nodes?.find((node) => node?.uri === uri);
  if (found) return { status: "verified", id: found.id, topic: found.topic, uri };

  const created = await gql(env, `mutation($topic:WebhookSubscriptionTopic!,$webhookSubscription:WebhookSubscriptionInput!){webhookSubscriptionCreate(topic:$topic,webhookSubscription:$webhookSubscription){webhookSubscription{id topic uri} userErrors{field message}}}`, {
    topic: "ORDERS_PAID",
    webhookSubscription: { uri, format: "JSON" },
  });
  reject(created?.webhookSubscriptionCreate);
  const webhook = created?.webhookSubscriptionCreate?.webhookSubscription;
  if (!webhook?.id || webhook.uri !== uri) throw fail(502, "delivery_webhook_verification_failed", "Shopify did not verify the paid-order webhook subscription.");
  return { status: "created", id: webhook.id, topic: webhook.topic, uri: webhook.uri };
}

async function setProductDeliveryMetafields(env, mapping) {
  const values = [
    { ownerId: mapping.productId, namespace: "mmg_delivery", key: "project_id", type: "single_line_text_field", value: mapping.projectId },
    { ownerId: mapping.productId, namespace: "mmg_delivery", key: "delivery_mode", type: "single_line_text_field", value: "signed-customer-package" },
    { ownerId: mapping.productId, namespace: "mmg_delivery", key: "package_artifact", type: "single_line_text_field", value: mapping.packageArtifact },
    { ownerId: mapping.variantId, namespace: "mmg_delivery", key: "project_id", type: "single_line_text_field", value: mapping.projectId },
  ];
  const data = await gql(env, `mutation($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){metafields{id namespace key value} userErrors{field message code}}}`, { metafields: values });
  reject(data?.metafieldsSet);
}

async function setOrderDeliveryMetafield(env, orderId, entitlement) {
  const data = await gql(env, `mutation($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){metafields{id} userErrors{field message code}}}`, {
    metafields: [{ ownerId: orderId, namespace: "mmg_delivery", key: `access_${entitlement.projectId.slice(-12)}`, type: "url", value: entitlement.accessURL }],
  });
  reject(data?.metafieldsSet);
}

async function createDigitalFulfillment(env, orderId, entitlements) {
  const data = await gql(env, `query($id:ID!){order(id:$id){fulfillmentOrders(first:20){nodes{id status lineItems(first:100){nodes{id remainingQuantity lineItem{id product{id} variant{id}}}}}}}}`, { id: orderId });
  const nodes = data?.order?.fulfillmentOrders?.nodes || [];
  const productIds = new Set(entitlements.map((item) => item.productId));
  const lineItemsByFulfillmentOrder = [];
  for (const fulfillmentOrder of nodes) {
    if (!["OPEN", "IN_PROGRESS", "SCHEDULED"].includes(fulfillmentOrder.status)) continue;
    const selected = (fulfillmentOrder.lineItems?.nodes || []).filter((entry) => productIds.has(entry?.lineItem?.product?.id) && Number(entry.remainingQuantity || 0) > 0);
    if (selected.length) {
      lineItemsByFulfillmentOrder.push({
        fulfillmentOrderId: fulfillmentOrder.id,
        fulfillmentOrderLineItems: selected.map((entry) => ({ id: entry.id, quantity: Number(entry.remainingQuantity || 1) })),
      });
    }
  }
  if (!lineItemsByFulfillmentOrder.length) return { status: "not-required", reason: "No open fulfillment-order lines matched the delivered digital products." };

  const accessURL = entitlements[0].accessURL;
  const created = await gql(env, `mutation($fulfillment:FulfillmentInput!,$message:String){fulfillmentCreate(fulfillment:$fulfillment,message:$message){fulfillment{id status trackingInfo{company number url}} userErrors{field message}}}`, {
    fulfillment: {
      lineItemsByFulfillmentOrder,
      notifyCustomer: true,
      trackingInfo: { company: "Mindset Media Group Digital Delivery", number: `DIGITAL-${Date.now()}`, url: accessURL },
    },
    message: "Your Mindset Media Group digital package is ready. Use the secure delivery link in this notification.",
  });
  reject(created?.fulfillmentCreate);
  return { status: "created", fulfillment: created?.fulfillmentCreate?.fulfillment || null };
}

async function readProduct(env, id) {
  const data = await gql(env, `query($id:ID!){product(id:$id){id title handle status variants(first:10){nodes{id}}}}`, { id });
  return data?.product || null;
}

async function gql(env, query, variables) {
  const store = storeDomain(env);
  const version = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  const token = await accessToken(env, store);
  const response = await fetch(`https://${store}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(response.status, "shopify_graphql_http_error", body?.errors?.[0]?.message || `Shopify returned ${response.status}.`);
  if (body.errors?.length) throw fail(422, "shopify_graphql_error", body.errors.map((item) => item.message).join("; "));
  return body.data || {};
}

async function accessToken(env, store) {
  const id = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const secret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  const key = `${store}:${id}`;
  if (id && secret) {
    const cached = tokenCache.get(key);
    if (cached?.expires > Date.now()) return cached.token;
    const response = await fetch(`https://${store}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) throw fail(401, "shopify_auth_failed", "Shopify client credentials failed.");
    tokenCache.set(key, { token: body.access_token, expires: Date.now() + Math.max(300_000, Number(body.expires_in || 3600) * 1000 - 300_000) });
    return body.access_token;
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw fail(503, "shopify_not_configured", "Shopify credentials are not configured.");
  return token;
}

async function status(env) {
  const checks = {
    durableObjectBinding: Boolean(env?.KAIROS_PROJECTS),
    shopifyDomainConfigured: nonEmpty(env?.SHOPIFY_STORE_DOMAIN),
    shopifyAuthenticationConfigured: Boolean(nonEmpty(env?.SHOPIFY_CLIENT_ID) && nonEmpty(env?.SHOPIFY_CLIENT_SECRET)) || nonEmpty(env?.SHOPIFY_ADMIN_ACCESS_TOKEN),
    shopifyClientSecretConfigured: nonEmpty(env?.SHOPIFY_CLIENT_SECRET),
    mediaSigningSecretConfigured: nonEmpty(env?.KAIROS_MEDIA_SIGNING_SECRET),
    storefrontOriginConfigured: /^https:\/\//.test(String(env?.MMG_STOREFRONT_ORIGIN || "")),
  };
  const missing = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
  return json({
    status: missing.length ? "not-ready" : "ready",
    ready: missing.length === 0,
    build: KAIROS_CUSTOMER_DELIVERY_BUILD,
    checks,
    missing,
    capabilities: {
      productPackageAttachment: true,
      currentShopifyWebhookContract: true,
      paidOrderWebhook: true,
      classicAndWrappedOrderPayloads: true,
      durableCustomerEntitlements: true,
      signedCustomerDownloads: true,
      shopifyOrderStatusDeliveryLink: true,
      customerNotificationThroughFulfillment: true,
    },
  }, missing.length ? 503 : 200);
}

async function verifyShopifyHmac(bytes, supplied, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes));
  return timingSafeEqual(bytesToBase64(signature), supplied);
}

function registryStub(env) { return env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT)); }
function requireStorage(env) { if (!env?.KAIROS_PROJECTS) throw fail(503, "customer_delivery_storage_unavailable", "Customer delivery storage is not configured."); }
function storeDomain(env) { const value = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) throw fail(503, "shopify_invalid_domain", "Shopify store domain is invalid."); return value; }
function reject(payload) { const errors = payload?.userErrors || []; if (errors.length) throw fail(422, "shopify_customer_delivery_rejected", errors.map((item) => item.message).join("; ")); }
function normalizeGid(value, type) { const text = String(value || "").trim(); if (text.startsWith(`gid://shopify/${type}/`)) return text; const match = text.match(/(\d+)$/); return match ? `gid://shopify/${type}/${match[1]}` : null; }
function bytesToBase64(bytes) { let binary = ""; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + 0x8000))); return btoa(binary); }
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let result = 0; for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index); return result === 0; }
function clean(value, max = 1000) { return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function nonEmpty(value) { return String(value || "").trim().length > 0; }
function fail(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function failure(error, code) { return json({ status: "failed", build: KAIROS_CUSTOMER_DELIVERY_BUILD, error: { code: error?.code || code, message: error instanceof Error ? error.message : "Customer delivery failed." } }, Number(error?.status || 500)); }
function json(value, statusCode = 200) { return new Response(JSON.stringify(value), { status: statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Customer-Delivery": KAIROS_CUSTOMER_DELIVERY_BUILD } }); }
