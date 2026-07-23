const BUILD = "kairos-customer-delivery-20260723-1";
const REGISTRY_OBJECT = "mmg-customer-delivery-registry";
const PRODUCT_PREFIX = "delivery:product:";
const TOKEN_PREFIX = "delivery:token:";
const ORDER_PREFIX = "delivery:order:";
const TOKEN_TTL_DAYS = 3650;
const tokenCache = new Map();

export async function handleCustomerDelivery(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/customer-delivery/status") return status(env);
  if (request.method === "POST" && url.pathname === "/api/customer-delivery/attach") return attach(request, env);
  if (request.method === "POST" && url.pathname === "/api/customer-delivery/shopify/webhooks/orders-paid") return paidOrderWebhook(request, env);
  if (request.method === "GET" && url.pathname === "/api/customer-delivery/access") return access(request, env);
  if (request.method === "GET" && url.pathname === "/api/customer-delivery/download") return download(request, env);
  return null;
}

export async function handleCustomerDeliveryObjectRequest(state, request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/customer-delivery/")) return null;
  if (request.method === "POST" && url.pathname === "/customer-delivery/register") return registerProduct(state, request);
  if (request.method === "POST" && url.pathname === "/customer-delivery/orders-paid") return issueEntitlements(state, request);
  if (request.method === "GET" && url.pathname === "/customer-delivery/access") return readEntitlement(state, url.searchParams.get("token") || "");
  return json({ status: "not-found", error: { code: "customer_delivery_route_not_found", message: "Customer delivery route not found." } }, 404);
}

async function status(env) {
  const checks = {
    durableObjectBinding: Boolean(env?.KAIROS_PROJECTS),
    shopifyDomainConfigured: nonEmpty(env?.SHOPIFY_STORE_DOMAIN),
    shopifyAuthenticationConfigured: Boolean(nonEmpty(env?.SHOPIFY_CLIENT_ID) && nonEmpty(env?.SHOPIFY_CLIENT_SECRET)) || nonEmpty(env?.SHOPIFY_ADMIN_ACCESS_TOKEN),
    shopifyWebhookSecretConfigured: nonEmpty(env?.SHOPIFY_WEBHOOK_SECRET || env?.SHOPIFY_API_SECRET || env?.SHOPIFY_CLIENT_SECRET),
    mediaSigningSecretConfigured: nonEmpty(env?.KAIROS_MEDIA_SIGNING_SECRET),
    storefrontOriginConfigured: /^https:\/\//.test(String(env?.MMG_STOREFRONT_ORIGIN || "")),
  };
  const missing = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
  return json({
    status: missing.length ? "not-ready" : "ready",
    ready: missing.length === 0,
    build: BUILD,
    checks,
    missing,
    capabilities: {
      productPackageAttachment: true,
      paidOrderWebhook: true,
      durableCustomerEntitlements: true,
      signedCustomerDownloads: true,
      shopifyOrderStatusDeliveryLink: true,
      customerNotificationThroughFulfillment: true,
    },
  }, missing.length ? 503 : 200);
}

async function attach(request, env) {
  try {
    requireStorage(env);
    const body = await request.json();
    const projectId = clean(body?.projectId, 160);
    const productId = normalizeGid(body?.productId, "Product");
    const variantId = body?.variantId ? normalizeGid(body.variantId, "ProductVariant") : null;
    if (String(body?.confirmation || "") !== "ATTACH CUSTOMER DELIVERY") throw fail(403, "delivery_attachment_confirmation_required", "Type ATTACH CUSTOMER DELIVERY to attach the customer package.");
    if (!/^[a-z0-9-]{20,}$/i.test(projectId)) throw fail(400, "delivery_project_required", "A completed publishing project is required.");
    if (!productId) throw fail(400, "delivery_product_required", "A Shopify product ID is required.");

    const packageResponse = await fetch(`${new URL(request.url).origin}/api/admin-asset-vault/projects/${encodeURIComponent(projectId)}/package`);
    if (!packageResponse.ok) throw fail(409, "delivery_package_unavailable", "The final customer package is not available in the Admin Asset Vault.");
    const packageBytes = Number(packageResponse.headers.get("Content-Length") || 0);

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
      packageBytes,
      packageArtifact: "complete-production-package.zip",
      customerPackage: true,
      attachedAt: new Date().toISOString(),
      build: BUILD,
    };
    const registry = registryStub(env);
    const registered = await registry.fetch("https://kairos.internal/customer-delivery/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapping),
    });
    if (!registered.ok) throw fail(registered.status, "delivery_registry_failed", "The customer delivery mapping could not be stored.");

    await setProductDeliveryMetafields(env, mapping);
    const webhook = await ensureOrdersPaidWebhook(request, env);
    return json({
      status: "attached-and-verified",
      build: BUILD,
      mapping,
      webhook,
      nextAction: "Review the draft product, then publish it through the governed live-publication control. Paid orders will receive a signed delivery link through Shopify fulfillment notification and order status.",
    }, 201);
  } catch (error) {
    return failure(error, "customer_delivery_attachment_failed");
  }
}

async function paidOrderWebhook(request, env) {
  const raw = new Uint8Array(await request.arrayBuffer());
  const secret = String(env.SHOPIFY_WEBHOOK_SECRET || env.SHOPIFY_API_SECRET || env.SHOPIFY_CLIENT_SECRET || "").trim();
  const supplied = String(request.headers.get("X-Shopify-Hmac-Sha256") || "").trim();
  if (!secret || !supplied || !(await verifyShopifyHmac(raw, supplied, secret))) return json({ status: "denied" }, 401);

  try {
    requireStorage(env);
    const order = JSON.parse(new TextDecoder().decode(raw));
    const normalized = {
      orderId: normalizeGid(order.admin_graphql_api_id || order.id, "Order"),
      orderName: clean(order.name || order.order_number || order.id, 120),
      email: clean(order.email || order.contact_email || order.customer?.email, 320).toLowerCase(),
      customerId: order.customer?.admin_graphql_api_id ? normalizeGid(order.customer.admin_graphql_api_id, "Customer") : null,
      lineItems: (order.line_items || []).map((item) => ({
        productId: normalizeGid(item.admin_graphql_api_product_id || item.product_id, "Product"),
        variantId: item.admin_graphql_api_variant_id || item.variant_id ? normalizeGid(item.admin_graphql_api_variant_id || item.variant_id, "ProductVariant") : null,
        lineItemId: item.admin_graphql_api_id || item.id ? normalizeGid(item.admin_graphql_api_id || item.id, "LineItem") : null,
        title: clean(item.title || item.name, 255),
        quantity: Math.max(1, Number(item.quantity || 1)),
      })),
      paidAt: order.processed_at || order.created_at || new Date().toISOString(),
    };
    if (!normalized.orderId) throw fail(400, "delivery_order_invalid", "The paid order did not include a valid Shopify order ID.");

    const origin = new URL(request.url).origin;
    const response = await registryStub(env).fetch("https://kairos.internal/customer-delivery/orders-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...normalized, origin }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) throw fail(response.status || 500, "delivery_entitlement_issue_failed", result?.error?.message || "Customer entitlements could not be issued.");

    for (const entitlement of result.entitlements || []) {
      await setOrderDeliveryMetafield(env, normalized.orderId, entitlement).catch(() => null);
    }
    if ((result.entitlements || []).length) await createDigitalFulfillment(env, normalized.orderId, result.entitlements).catch(() => null);
    return json({ status: "processed", entitlementCount: result.entitlements?.length || 0 });
  } catch (error) {
    console.error("customer delivery webhook failed", error);
    return failure(error, "customer_delivery_webhook_failed");
  }
}

async function access(request, env) {
  try {
    requireStorage(env);
    const token = String(new URL(request.url).searchParams.get("token") || "").trim();
    if (token.length < 40) throw fail(400, "delivery_token_required", "A valid customer delivery token is required.");
    const response = await registryStub(env).fetch(`https://kairos.internal/customer-delivery/access?token=${encodeURIComponent(token)}`);
    const entitlement = await response.json().catch(() => null);
    if (!response.ok || !entitlement) throw fail(response.status || 404, "delivery_access_denied", entitlement?.error?.message || "This customer delivery link is invalid or unavailable.");
    const origin = new URL(request.url).origin;
    return json({
      status: "available",
      title: entitlement.title,
      orderName: entitlement.orderName,
      issuedAt: entitlement.issuedAt,
      files: entitlement.files,
      downloadURL: `${origin}/api/customer-delivery/download?token=${encodeURIComponent(token)}&projectId=${encodeURIComponent(entitlement.projectId)}`,
    });
  } catch (error) {
    return failure(error, "customer_delivery_access_failed");
  }
}

async function download(request, env) {
  try {
    requireStorage(env);
    const url = new URL(request.url);
    const token = String(url.searchParams.get("token") || "").trim();
    const projectId = clean(url.searchParams.get("projectId"), 160);
    const accessResponse = await registryStub(env).fetch(`https://kairos.internal/customer-delivery/access?token=${encodeURIComponent(token)}`);
    const entitlement = await accessResponse.json().catch(() => null);
    if (!accessResponse.ok || !entitlement || entitlement.projectId !== projectId) throw fail(403, "delivery_download_denied", "This download link is invalid for the requested package.");
    const packageResponse = await fetch(`${url.origin}/api/admin-asset-vault/projects/${encodeURIComponent(projectId)}/package`);
    if (!packageResponse.ok || !packageResponse.body) throw fail(404, "delivery_package_missing", "The customer package is unavailable.");
    const headers = new Headers(packageResponse.headers);
    headers.set("Content-Type", "application/zip");
    headers.set("Content-Disposition", `attachment; filename="${safeFilename(entitlement.title)}-Customer-Package.zip"`);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return new Response(packageResponse.body, { status: 200, headers });
  } catch (error) {
    return failure(error, "customer_delivery_download_failed");
  }
}

async function registerProduct(state, request) {
  const mapping = await request.json();
  if (!mapping?.productId || !mapping?.projectId) return json({ status: "invalid" }, 400);
  await state.storage.put(`${PRODUCT_PREFIX}${mapping.productId}`, mapping);
  await state.storage.put(`${PRODUCT_PREFIX}${mapping.variantId}`, mapping);
  return json({ status: "registered", mapping });
}

async function issueEntitlements(state, request) {
  const order = await request.json();
  const previous = await state.storage.get(`${ORDER_PREFIX}${order.orderId}`);
  if (previous?.entitlements?.length) return json(previous);
  const entitlements = [];
  for (const item of order.lineItems || []) {
    const mapping = await state.storage.get(`${PRODUCT_PREFIX}${item.variantId || item.productId}`) || await state.storage.get(`${PRODUCT_PREFIX}${item.productId}`);
    if (!mapping) continue;
    const token = randomToken();
    const tokenHash = await sha256(token);
    const record = {
      tokenHash,
      projectId: mapping.projectId,
      productId: mapping.productId,
      variantId: mapping.variantId,
      title: mapping.title,
      orderId: order.orderId,
      orderName: order.orderName,
      email: order.email,
      customerId: order.customerId,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + TOKEN_TTL_DAYS * 86400000).toISOString(),
      files: ["Digital Edition PDF", "Customer Specification PDF", "KDP Interior PDF", "Portrait Cover PNG", "Square Thumbnail PNG", "README"],
      downloadCount: 0,
      revoked: false,
    };
    await state.storage.put(`${TOKEN_PREFIX}${tokenHash}`, record);
    entitlements.push({ ...record, token, accessURL: `${order.origin}/api/customer-delivery/access?token=${encodeURIComponent(token)}` });
  }
  const result = { status: "issued", orderId: order.orderId, orderName: order.orderName, entitlements };
  await state.storage.put(`${ORDER_PREFIX}${order.orderId}`, result);
  return json(result);
}

async function readEntitlement(state, token) {
  const tokenHash = await sha256(token);
  const record = await state.storage.get(`${TOKEN_PREFIX}${tokenHash}`);
  if (!record || record.revoked || Date.parse(record.expiresAt) <= Date.now()) return json({ status: "denied", error: { message: "This delivery link is invalid, expired, or revoked." } }, 403);
  record.lastAccessedAt = new Date().toISOString();
  await state.storage.put(`${TOKEN_PREFIX}${tokenHash}`, record);
  return json({ status: "available", ...record });
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

async function ensureOrdersPaidWebhook(request, env) {
  const callbackUrl = `${new URL(request.url).origin}/api/customer-delivery/shopify/webhooks/orders-paid`;
  const existing = await gql(env, `query{webhookSubscriptions(first:100,topics:[ORDERS_PAID]){nodes{id endpoint{... on WebhookHttpEndpoint{callbackUrl}}}}}`);
  const found = existing?.webhookSubscriptions?.nodes?.find((node) => node?.endpoint?.callbackUrl === callbackUrl);
  if (found) return { status: "verified", id: found.id, callbackUrl };
  const created = await gql(env, `mutation($topic:WebhookSubscriptionTopic!,$webhookSubscription:WebhookSubscriptionInput!){webhookSubscriptionCreate(topic:$topic,webhookSubscription:$webhookSubscription){webhookSubscription{id endpoint{... on WebhookHttpEndpoint{callbackUrl}}} userErrors{field message}}}`, {
    topic: "ORDERS_PAID",
    webhookSubscription: { callbackUrl, format: "JSON" },
  });
  reject(created?.webhookSubscriptionCreate);
  return { status: "created", id: created?.webhookSubscriptionCreate?.webhookSubscription?.id, callbackUrl };
}

async function createDigitalFulfillment(env, orderId, entitlements) {
  const data = await gql(env, `query($id:ID!){order(id:$id){fulfillmentOrders(first:20){nodes{id status lineItems(first:100){nodes{id lineItem{id product{id} variant{id}}}}}}}}`, { id: orderId });
  const nodes = data?.order?.fulfillmentOrders?.nodes || [];
  const productIds = new Set(entitlements.map((item) => item.productId));
  const lineItemsByOrder = [];
  for (const fulfillmentOrder of nodes) {
    if (!["OPEN", "IN_PROGRESS", "SCHEDULED"].includes(fulfillmentOrder.status)) continue;
    const lineItems = (fulfillmentOrder.lineItems?.nodes || []).filter((entry) => productIds.has(entry?.lineItem?.product?.id));
    if (lineItems.length) lineItemsByOrder.push({ fulfillmentOrderId: fulfillmentOrder.id, fulfillmentOrderLineItems: lineItems.map((entry) => ({ id: entry.id, quantity: 1 })) });
  }
  if (!lineItemsByOrder.length) return null;
  const accessURL = entitlements[0].accessURL;
  const created = await gql(env, `mutation($fulfillment:FulfillmentInput!,$message:String){fulfillmentCreate(fulfillment:$fulfillment,message:$message){fulfillment{id status trackingInfo{company number url}} userErrors{field message}}}`, {
    fulfillment: {
      lineItemsByFulfillmentOrder: lineItemsByOrder,
      notifyCustomer: true,
      trackingInfo: { company: "Mindset Media Group Digital Delivery", number: `DIGITAL-${Date.now()}`, url: accessURL },
    },
    message: "Your Mindset Media Group digital package is ready. Use the delivery link in this fulfillment notification or your order status page.",
  });
  reject(created?.fulfillmentCreate);
  return created?.fulfillmentCreate?.fulfillment || null;
}

async function readProduct(env, id) {
  const data = await gql(env, `query($id:ID!){product(id:$id){id title handle status variants(first:10){nodes{id}}}}`, { id });
  return data?.product || null;
}

async function gql(env, query, variables) {
  const store = storeDomain(env);
  const version = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  const token = await accessToken(env, store);
  const response = await fetch(`https://${store}/admin/api/${version}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
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
    const response = await fetch(`https://${store}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) throw fail(401, "shopify_auth_failed", "Shopify client credentials failed.");
    tokenCache.set(key, { token: body.access_token, expires: Date.now() + 3_300_000 });
    return body.access_token;
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw fail(503, "shopify_not_configured", "Shopify credentials are not configured.");
  return token;
}

async function verifyShopifyHmac(bytes, supplied, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes));
  const expected = bytesToBase64(signature);
  return timingSafeEqual(expected, supplied);
}

function registryStub(env) { const id = env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT); return env.KAIROS_PROJECTS.get(id); }
function requireStorage(env) { if (!env?.KAIROS_PROJECTS) throw fail(503, "customer_delivery_storage_unavailable", "Customer delivery storage is not configured."); }
function storeDomain(env) { const value = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) throw fail(503, "shopify_invalid_domain", "Shopify store domain is invalid."); return value; }
function reject(payload) { const errors = payload?.userErrors || []; if (errors.length) throw fail(422, "shopify_customer_delivery_rejected", errors.map((item) => item.message).join("; ")); }
function normalizeGid(value, type) { const text = String(value || "").trim(); if (text.startsWith(`gid://shopify/${type}/`)) return text; const match = text.match(/(\d+)$/); return match ? `gid://shopify/${type}/${match[1]}` : null; }
function randomToken() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
async function sha256(value) { const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value; return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function bytesToBase64(bytes) { let binary = ""; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + 0x8000))); return btoa(binary); }
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let result = 0; for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index); return result === 0; }
function safeFilename(value) { return String(value || "digital-product").normalize("NFKD").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "digital-product"; }
function clean(value, max = 1000) { return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function nonEmpty(value) { return String(value || "").trim().length > 0; }
function fail(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function failure(error, code) { return json({ status: "failed", build: BUILD, error: { code: error?.code || code, message: error instanceof Error ? error.message : "Customer delivery failed." } }, Number(error?.status || 500)); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Customer-Delivery": BUILD } }); }
