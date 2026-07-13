const BUILD = "kairos-product-launch-control-20260713-1";
const TTL = 60 * 60 * 24;
const tokenCache = new Map();

export async function handleProductLaunchControl(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/shopify/product-launch/prepare" && request.method === "POST") return prepare(request, env);
  if (url.pathname === "/api/shopify/product-launch/decision" && request.method === "POST") return decide(request, env);
  if (url.pathname === "/api/shopify/product-launch/publish" && request.method === "POST") return publish(request, env);
  if (url.pathname === "/api/shopify/product-launch/rollback" && request.method === "POST") return rollback(request, env);
  const match = url.pathname.match(/^\/api\/shopify\/product-launch\/records\/([a-f0-9-]+)$/i);
  if (match && request.method === "GET") return readRecord(request, match[1]);
  return null;
}

async function prepare(request, env) {
  try {
    const body = await request.json();
    const mediaReleaseId = String(body?.mediaReleaseId || "").trim();
    if (!mediaReleaseId) throw err(400, "media_release_required", "A verified product-media release is required.");
    const mediaRecord = await readCached(request, "product-media", mediaReleaseId);
    if (!mediaRecord || mediaRecord.status !== "media-installed-and-verified") throw err(409, "product_media_not_verified", "Install and verify the product media before launch review.");
    const productId = mediaRecord.product?.id || mediaRecord.result?.productId;
    const product = await readProduct(env, productId);
    if (!product?.id) throw err(404, "product_not_found", "The Shopify draft product could not be found.");
    if (product.status !== "DRAFT") throw err(409, "product_not_draft", "Product launch review requires the product to remain DRAFT.");

    const releaseId = crypto.randomUUID();
    const record = {
      releaseId,
      mediaReleaseId,
      build: BUILD,
      status: "awaiting-product-visual-review",
      createdAt: new Date().toISOString(),
      productBefore: snapshot(product),
      preview: {
        mode: "command-center-product-proof",
        title: product.title,
        handle: product.handle,
        price: product.variants?.nodes?.[0]?.price || null,
        descriptionHtml: product.descriptionHtml || "",
        featuredMedia: product.featuredMedia || product.media?.nodes?.[0] || null,
        media: product.media?.nodes || [],
        seo: product.seo || {},
        storefrontPath: `/products/${product.handle}`,
      },
      requiredChecks: [
        "The approved cover is the first and featured product image.",
        "The title, description, price, and format information are correct.",
        "The page clearly explains what the customer receives.",
        "Mobile hierarchy, spacing, image containment, and purchase controls are usable.",
        "SEO title, description, image alt text, and product handle are accurate.",
        "No placeholder cover, unsupported claim, unavailable format, or false capability appears.",
        "The product remains DRAFT and unavailable to the storefront until final approval.",
      ],
      executiveDecision: null,
      publication: null,
      rollback: null,
      safeguards: {
        exactProductIdentityRequired: true,
        sourceTimestampBinding: product.updatedAt,
        visualApprovalRequired: true,
        explicitPublicationConfirmation: "PUBLISH PRODUCT LIVE",
        explicitRollbackConfirmation: "ROLL BACK LIVE PRODUCT",
        onlineStorePublicationRequired: true,
        cloudflareAndShopifyAuthoritative: true,
      },
    };
    await save(request, record);
    return json(record, 201);
  } catch (error) { return failure(error, "product_launch_prepare_failed"); }
}

async function decide(request, env) {
  try {
    const body = await request.json();
    const record = await load(request, String(body?.releaseId || ""));
    if (!record) throw err(404, "product_launch_not_found", "The product launch review expired or was not found.");
    if (record.status !== "awaiting-product-visual-review") throw err(409, "product_launch_state_invalid", "This product is not awaiting visual review.");
    const decision = String(body?.decision || "").trim().toLowerCase();
    if (!["approved", "revision-requested", "rejected"].includes(decision)) throw err(400, "product_visual_decision_invalid", "Choose approved, revision-requested, or rejected.");
    const checks = Array.isArray(body?.checks) ? body.checks.map(Boolean) : [];
    if (decision === "approved" && (checks.length !== record.requiredChecks.length || checks.some(value => !value))) throw err(409, "product_visual_checks_incomplete", "Complete every product visual-review check before approval.");
    const product = await readProduct(env, record.productBefore.id);
    assertProductUnchanged(product, record.productBefore);
    const updated = {
      ...record,
      status: decision === "approved" ? "product-visual-review-approved" : decision,
      executiveDecision: { decision, actor: String(body?.actor || "Executive").slice(0, 120), decidedAt: new Date().toISOString(), notes: String(body?.notes || "").slice(0, 2000), checks },
      nextAction: decision === "approved" ? "Use Product Launch Control to publish the exact approved draft to the Online Store." : "Return the product package to revision. Do not publish.",
    };
    await save(request, updated);
    return json(updated);
  } catch (error) { return failure(error, "product_visual_decision_failed"); }
}

async function publish(request, env) {
  try {
    const body = await request.json();
    const record = await load(request, String(body?.releaseId || ""));
    if (!record) throw err(404, "product_launch_not_found", "The product launch record expired or was not found.");
    if (record.status !== "product-visual-review-approved") throw err(409, "product_visual_approval_required", "Approved product visual review is required before publication.");
    if (String(body?.confirmation || "") !== "PUBLISH PRODUCT LIVE") throw err(403, "product_publish_confirmation_required", "Type PUBLISH PRODUCT LIVE to authorize storefront publication.");
    const before = await readProduct(env, record.productBefore.id);
    assertProductUnchanged(before, record.productBefore);
    const onlineStore = await findOnlineStorePublication(env);
    if (!onlineStore?.id) throw err(409, "online_store_publication_not_found", "Shopify Online Store publication could not be resolved.");

    await updateProductStatus(env, before.id, "ACTIVE");
    await publishToPublication(env, before.id, onlineStore.id);
    const after = await readProduct(env, before.id);
    if (!after?.id || after.status !== "ACTIVE") throw err(502, "product_activation_verification_failed", "Shopify did not verify the product as ACTIVE.");
    const liveProbe = await probeProduct(env, after.handle);
    const updated = {
      ...record,
      status: liveProbe.ok ? "product-live-and-verified" : "product-live-needs-attention",
      publication: {
        approvedBy: String(body?.actor || "Executive").slice(0, 120),
        approvedAt: new Date().toISOString(),
        confirmation: "PUBLISH PRODUCT LIVE",
        onlineStorePublication: onlineStore,
        productAfter: snapshot(after),
        liveProbe,
      },
      nextAction: liveProbe.ok ? "The approved product is live and verified. Rollback remains available." : "Review the live product immediately or execute rollback.",
    };
    await save(request, updated);
    return json(updated, liveProbe.ok ? 200 : 202);
  } catch (error) { return failure(error, "product_publish_failed"); }
}

async function rollback(request, env) {
  try {
    const body = await request.json();
    const record = await load(request, String(body?.releaseId || ""));
    if (!record?.publication) throw err(409, "product_launch_not_published", "This product launch has not been published.");
    if (String(body?.confirmation || "") !== "ROLL BACK LIVE PRODUCT") throw err(403, "product_rollback_confirmation_required", "Type ROLL BACK LIVE PRODUCT to authorize rollback.");
    const current = await readProduct(env, record.productBefore.id);
    if (!current?.id || current.status !== "ACTIVE") throw err(409, "live_product_changed", "The live product no longer matches this launch. Automatic rollback is blocked.");
    const publicationId = record.publication.onlineStorePublication?.id;
    if (publicationId) await unpublishFromPublication(env, current.id, publicationId);
    await updateProductStatus(env, current.id, record.productBefore.status || "DRAFT");
    const restored = await readProduct(env, current.id);
    if (!restored?.id || restored.status !== (record.productBefore.status || "DRAFT")) throw err(502, "product_rollback_verification_failed", "Shopify did not restore the prior product status.");
    const updated = {
      ...record,
      status: "product-rolled-back-and-verified",
      rollback: { approvedBy: String(body?.actor || "Executive").slice(0, 120), approvedAt: new Date().toISOString(), confirmation: "ROLL BACK LIVE PRODUCT", restoredProduct: snapshot(restored) },
      nextAction: "The product was removed from the Online Store and restored to its prior draft state.",
    };
    await save(request, updated);
    return json(updated);
  } catch (error) { return failure(error, "product_rollback_failed"); }
}

async function readProduct(env, id) {
  const data = await gql(env, `query($id:ID!){product(id:$id){id title handle descriptionHtml productType tags status templateSuffix updatedAt seo{title description} featuredMedia{... on MediaImage{id status alt image{url width height}}} media(first:30){nodes{... on MediaImage{id status alt image{url width height}}}} variants(first:1){nodes{id price}}}}`, { id });
  return data?.product || null;
}
async function findOnlineStorePublication(env) {
  const data = await gql(env, `query{publications(first:50){nodes{id name app{title}}}}`, {});
  const nodes = data?.publications?.nodes || [];
  return nodes.find(item => /online store/i.test(`${item?.name || ""} ${item?.app?.title || ""}`)) || null;
}
async function updateProductStatus(env, id, status) {
  const data = await gql(env, `mutation($product:ProductUpdateInput!){productUpdate(product:$product){product{id status updatedAt} userErrors{field message}}}`, { product: { id, status } });
  reject(data?.productUpdate);
}
async function publishToPublication(env, id, publicationId) {
  const data = await gql(env, `mutation($id:ID!,$input:[PublicationInput!]!){publishablePublish(id:$id,input:$input){publishable{availablePublicationsCount{count}} userErrors{field message}}}`, { id, input: [{ publicationId }] });
  reject(data?.publishablePublish);
}
async function unpublishFromPublication(env, id, publicationId) {
  const data = await gql(env, `mutation($id:ID!,$input:[PublicationInput!]!){publishableUnpublish(id:$id,input:$input){publishable{availablePublicationsCount{count}} userErrors{field message}}}`, { id, input: [{ publicationId }] });
  reject(data?.publishableUnpublish);
}
async function probeProduct(env, handle) {
  const store = String(env.SHOPIFY_STOREFRONT_DOMAIN || env.MMG_STOREFRONT_ORIGIN || `https://${storeDomain(env)}`).trim().replace(/\/$/, "");
  const url = `${store.startsWith("http") ? store : `https://${store}`}/products/${encodeURIComponent(handle)}`;
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Kairos-Product-Launch/1.0", Accept: "text/html" }, signal: AbortSignal.timeout(20000) });
    const type = response.headers.get("content-type") || "";
    const html = type.includes("text/html") ? await response.text() : "";
    return { ok: response.ok && Boolean(html), status: response.status, finalURL: response.url, contentType: type, bytes: html.length, latencyMs: Date.now() - started, title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim() };
  } catch (error) { return { ok: false, status: 0, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "Live product probe failed." }; }
}

function assertProductUnchanged(actual, expected) {
  if (!actual?.id || actual.id !== expected.id) throw err(409, "product_identity_changed", "The Shopify product identity changed after review preparation.");
  if (actual.updatedAt !== expected.updatedAt) throw err(409, "product_changed_after_review", "The Shopify product changed after review preparation. Prepare a new launch review.");
  if (actual.status !== expected.status) throw err(409, "product_status_changed", "The Shopify product status changed after review preparation.");
}
function snapshot(product) { return { id: product.id, title: product.title, handle: product.handle, status: product.status, templateSuffix: product.templateSuffix || "", updatedAt: product.updatedAt, price: product.variants?.nodes?.[0]?.price || null, seo: product.seo || {}, mediaCount: product.media?.nodes?.length || 0, featuredMedia: product.featuredMedia || null }; }
function reject(payload) { const list = payload?.userErrors || []; if (list.length) throw err(422, "shopify_mutation_rejected", list.map(item => item.message).join("; ")); if (!payload) throw err(502, "shopify_mutation_unconfirmed", "Shopify did not confirm the mutation."); }
async function gql(env, query, variables) {
  const store = storeDomain(env), version = String(env.SHOPIFY_API_VERSION || "2026-07").trim(), token = await accessToken(env, store);
  const response = await fetch(`https://${store}/admin/api/${version}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw err(response.status, "shopify_graphql_http_error", body?.errors?.[0]?.message || `Shopify returned ${response.status}.`);
  if (body.errors?.length) throw err(422, "shopify_graphql_error", body.errors.map(item => item.message).join("; "));
  return body.data || {};
}
async function accessToken(env, store) {
  const id = String(env.SHOPIFY_CLIENT_ID || "").trim(), secret = String(env.SHOPIFY_CLIENT_SECRET || "").trim(), key = `${store}:${id}`;
  if (id && secret) { const cached = tokenCache.get(key); if (cached?.expires > Date.now()) return cached.token; const response = await fetch(`https://${store}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }) }); const body = await response.json().catch(() => ({})); if (!response.ok || !body.access_token) throw err(401, "shopify_auth_failed", "Shopify client credentials failed."); tokenCache.set(key, { token: body.access_token, expires: Date.now() + 3300000 }); return body.access_token; }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim(); if (!token) throw err(503, "shopify_not_configured", "Shopify credentials are not configured."); return token;
}
function storeDomain(env) { const value = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) throw err(503, "shopify_invalid_domain", "Shopify store domain is invalid."); return value; }
function recordRequest(request, id) { return new Request(`${new URL(request.url).origin}/__kairos/product-launch/${id}`); }
function cacheRequest(request, type, id) { return new Request(`${new URL(request.url).origin}/__kairos/${type}/${id}`); }
async function readCached(request, type, id) { const response = await caches.default.match(cacheRequest(request, type, id)); return response ? response.json() : null; }
async function save(request, record) { await caches.default.put(recordRequest(request, record.releaseId), new Response(JSON.stringify(record), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${TTL}` } })); }
async function load(request, id) { const response = await caches.default.match(recordRequest(request, id)); return response ? response.json() : null; }
async function readRecord(request, id) { const record = await load(request, id); return record ? json(record) : json({ status: "not-found", error: { message: "Product launch record not found." } }, 404); }
function decode(value) { return String(value || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
function err(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function failure(error, code) { return json({ status: "failed", build: BUILD, error: { code: error?.code || code, message: error instanceof Error ? error.message : "Product launch control failed." } }, Number(error?.status || 500)); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
