const BUILD = "shopify-resource-release-20260712-1";
const TTL = 60 * 60 * 24;
const tokenCache = new Map();

export async function handleResourceReleaseRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/shopify/resource-release/prepare" && request.method === "POST") return prepare(request, env);
  if (url.pathname === "/api/shopify/resource-release/publish" && request.method === "POST") return publish(request, env);
  if (url.pathname === "/api/shopify/resource-release/rollback" && request.method === "POST") return rollback(request, env);
  const match = url.pathname.match(/^\/api\/shopify\/resource-release\/records\/([a-f0-9-]+)$/i);
  if (match && request.method === "GET") return readRecord(request, match[1]);
  return null;
}

async function prepare(request, env) {
  try {
    const body = await request.json();
    const reviewID = String(body?.reviewID || "").trim();
    if (!reviewID) throw fail(400, "review_id_required", "An approved visual review ID is required.");
    const cached = await caches.default.match(reviewRequest(request, reviewID));
    if (!cached) throw fail(404, "visual_review_not_found", "The approved visual review expired or was not found.");
    const review = await cached.json();
    if (review?.status !== "visual-review-approved" || review?.executiveDecision?.decision !== "approved") throw fail(409, "visual_approval_required", "Executive visual approval is required before resource publication.");
    const target = review?.releaseTarget;
    if (!target || target.releaseType !== "resource-assignment") throw fail(409, "resource_release_target_required", "This visual review does not contain a site-wide resource assignment.");
    const assignment = normalizeAssignment(target);
    const current = await readResource(env, assignment);
    if (!current?.id) throw fail(409, "resource_not_found", "The approved Shopify resource could not be resolved before release.");
    if (assignment.resourceID && assignment.resourceID !== current.id) throw fail(409, "resource_identity_changed", "The Shopify resource identity changed after staging approval.");

    const releaseID = crypto.randomUUID();
    const record = {
      releaseID,
      reviewID,
      status: "awaiting-resource-publication-approval",
      build: BUILD,
      createdAt: new Date().toISOString(),
      platform: "cloudflare-and-shopify",
      assignment,
      resourceBefore: summarizeResource(current),
      visualReview: { decision: review.executiveDecision, checkedAt: review.checkedAt, automatedChecks: review.automatedChecks, pageEvidence: review.pageEvidence },
      safeguards: {
        expectedConfirmation: "PUBLISH APPROVED RESOURCE",
        rollbackConfirmation: "ROLL BACK LIVE RESOURCE",
        exactResourceIdentityRequired: true,
        exactTemplateSuffixRequired: true,
        liveVerificationRequired: true,
        navigationRequiresSeparateApproval: true,
        cloudflareAuthoritative: true,
        vercelIgnored: true
      },
      publication: null,
      rollback: null
    };
    await save(request, record);
    return json(record, 201);
  } catch (error) { return errorResponse(error); }
}

async function publish(request, env) {
  try {
    const body = await request.json();
    const releaseID = String(body?.releaseID || "").trim();
    const confirmation = String(body?.confirmation || "").trim();
    if (!releaseID) throw fail(400, "release_id_required", "Release ID is required.");
    if (confirmation !== "PUBLISH APPROVED RESOURCE") throw fail(403, "resource_publication_confirmation_required", "Type PUBLISH APPROVED RESOURCE to authorize publication.");
    const record = await load(request, releaseID);
    if (!record) throw fail(404, "resource_release_not_found", "The resource release record expired or was not found.");
    if (record.status !== "awaiting-resource-publication-approval") throw fail(409, "resource_release_state_invalid", "This resource release is not awaiting publication approval.");

    const before = await readResource(env, record.assignment);
    assertUnchanged(before, record.resourceBefore);
    const mutation = await assignTemplate(env, record.assignment, before);
    const after = await readResource(env, record.assignment);
    if (!after?.id || after.templateSuffix !== record.assignment.templateSuffix) throw fail(502, "resource_assignment_verification_failed", "Shopify did not confirm the approved template assignment.");
    if (record.assignment.resourceType === "page" && record.assignment.createdForPreview && !after.isPublished) {
      throw fail(502, "preview_page_publication_failed", "The approved preview page was not published.");
    }
    const liveProbe = await probeResource(env, record.assignment, after.handle);
    const updated = {
      ...record,
      status: liveProbe.ok ? "resource-published-and-verified" : "resource-published-needs-attention",
      resourceAfter: summarizeResource(after),
      publication: {
        approvedBy: String(body?.actor || "Executive").slice(0, 120),
        approvedAt: new Date().toISOString(),
        confirmation,
        mutation,
        liveProbe
      },
      nextAction: liveProbe.ok ? "The approved resource assignment is live and verified. Rollback remains available." : "Review the live resource immediately or execute rollback."
    };
    await save(request, updated);
    return json(updated, liveProbe.ok ? 200 : 202);
  } catch (error) { return errorResponse(error); }
}

async function rollback(request, env) {
  try {
    const body = await request.json();
    const releaseID = String(body?.releaseID || "").trim();
    const confirmation = String(body?.confirmation || "").trim();
    if (!releaseID) throw fail(400, "release_id_required", "Release ID is required.");
    if (confirmation !== "ROLL BACK LIVE RESOURCE") throw fail(403, "resource_rollback_confirmation_required", "Type ROLL BACK LIVE RESOURCE to authorize rollback.");
    const record = await load(request, releaseID);
    if (!record?.publication) throw fail(409, "resource_release_not_published", "This resource release has not been published.");
    const current = await readResource(env, record.assignment);
    if (!current?.id || current.templateSuffix !== record.assignment.templateSuffix) throw fail(409, "resource_changed_after_publication", "The live resource no longer matches this release. Automatic rollback is blocked.");
    const rollbackMutation = await restoreResource(env, record.assignment, record.resourceBefore, current);
    const after = await readResource(env, record.assignment);
    if (!after?.id) throw fail(502, "resource_rollback_verification_failed", "Shopify did not return the resource after rollback.");
    if (String(after.templateSuffix || "") !== String(record.resourceBefore.templateSuffix || "")) throw fail(502, "resource_rollback_template_mismatch", "The prior template suffix was not restored.");
    if (record.assignment.resourceType === "page" && typeof record.resourceBefore.isPublished === "boolean" && after.isPublished !== record.resourceBefore.isPublished) throw fail(502, "resource_rollback_publication_mismatch", "The prior page publication state was not restored.");
    const liveProbe = await probeResource(env, record.assignment, after.handle);
    const updated = {
      ...record,
      status: liveProbe.ok ? "resource-rolled-back-and-verified" : "resource-rolled-back-needs-attention",
      rollback: {
        approvedBy: String(body?.actor || "Executive").slice(0, 120),
        approvedAt: new Date().toISOString(),
        confirmation,
        mutation: rollbackMutation,
        restoredResource: summarizeResource(after),
        liveProbe
      },
      nextAction: liveProbe.ok ? "The prior resource assignment is restored and verified." : "The resource was restored, but the live probe requires review."
    };
    await save(request, updated);
    return json(updated, liveProbe.ok ? 200 : 202);
  } catch (error) { return errorResponse(error); }
}

function normalizeAssignment(target) {
  const resource = target.resource || {};
  const type = String(target.resourceType || resource.resourceType || "").trim();
  if (!["page", "product", "collection"].includes(type)) throw fail(400, "resource_type_invalid", "Resource release supports page, product, or collection assignments.");
  const suffix = String(target.templateSuffix || "").trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(suffix)) throw fail(400, "template_suffix_invalid", "The approved template suffix is invalid.");
  return {
    resourceType: type,
    resourceID: target.resourceID || resource.id || null,
    resourceHandle: String(target.resourceHandle || resource.handle || "").trim(),
    templateSuffix: suffix,
    createdForPreview: Boolean(resource.createdForPreview || target.createUnpublishedPreviewPage)
  };
}

async function readResource(env, assignment) {
  const query = assignment.resourceID ? `id:${assignment.resourceID}` : `handle:${assignment.resourceHandle}`;
  if (assignment.resourceType === "page") {
    const data = await shopify(env, `query($q:String!){pages(first:2,query:$q){nodes{id title handle templateSuffix isPublished}}}`, { q: query });
    return data?.pages?.nodes?.[0] || null;
  }
  if (assignment.resourceType === "product") {
    const data = await shopify(env, `query($q:String!){products(first:2,query:$q){nodes{id title handle templateSuffix status}}}`, { q: query });
    return data?.products?.nodes?.[0] || null;
  }
  const data = await shopify(env, `query($q:String!){collections(first:2,query:$q){nodes{id title handle templateSuffix}}}`, { q: query });
  return data?.collections?.nodes?.[0] || null;
}

async function assignTemplate(env, assignment, current) {
  if (assignment.resourceType === "page") {
    const data = await shopify(env, `mutation($id:ID!,$page:PageUpdateInput!){pageUpdate(id:$id,page:$page){page{id title handle templateSuffix isPublished} userErrors{field message}}}`, { id: current.id, page: { templateSuffix: assignment.templateSuffix, isPublished: true } });
    assertMutation(data?.pageUpdate, "page_update_rejected");
    return data.pageUpdate;
  }
  if (assignment.resourceType === "product") {
    const data = await shopify(env, `mutation($product:ProductUpdateInput!){productUpdate(product:$product){product{id title handle templateSuffix status} userErrors{field message}}}`, { product: { id: current.id, templateSuffix: assignment.templateSuffix } });
    assertMutation(data?.productUpdate, "product_update_rejected");
    return data.productUpdate;
  }
  const data = await shopify(env, `mutation($input:CollectionInput!){collectionUpdate(input:$input){collection{id title handle templateSuffix} userErrors{field message}}}`, { input: { id: current.id, templateSuffix: assignment.templateSuffix } });
  assertMutation(data?.collectionUpdate, "collection_update_rejected");
  return data.collectionUpdate;
}

async function restoreResource(env, assignment, before, current) {
  if (assignment.resourceType === "page") {
    const data = await shopify(env, `mutation($id:ID!,$page:PageUpdateInput!){pageUpdate(id:$id,page:$page){page{id title handle templateSuffix isPublished} userErrors{field message}}}`, { id: current.id, page: { templateSuffix: before.templateSuffix || null, isPublished: Boolean(before.isPublished) } });
    assertMutation(data?.pageUpdate, "page_rollback_rejected");
    return data.pageUpdate;
  }
  if (assignment.resourceType === "product") {
    const data = await shopify(env, `mutation($product:ProductUpdateInput!){productUpdate(product:$product){product{id title handle templateSuffix status} userErrors{field message}}}`, { product: { id: current.id, templateSuffix: before.templateSuffix || null } });
    assertMutation(data?.productUpdate, "product_rollback_rejected");
    return data.productUpdate;
  }
  const data = await shopify(env, `mutation($input:CollectionInput!){collectionUpdate(input:$input){collection{id title handle templateSuffix} userErrors{field message}}}`, { input: { id: current.id, templateSuffix: before.templateSuffix || null } });
  assertMutation(data?.collectionUpdate, "collection_rollback_rejected");
  return data.collectionUpdate;
}

function assertMutation(payload, code) {
  const errors = Array.isArray(payload?.userErrors) ? payload.userErrors.filter(item => item?.message) : [];
  if (errors.length) throw fail(422, code, errors.map(item => item.message).join("; "));
  if (!payload) throw fail(502, `${code}_unconfirmed`, "Shopify did not confirm the resource mutation.");
}

function assertUnchanged(actual, expected) {
  if (!actual?.id || actual.id !== expected.id) throw fail(409, "resource_identity_changed", "The Shopify resource changed after release preparation.");
  if (String(actual.templateSuffix || "") !== String(expected.templateSuffix || "")) throw fail(409, "resource_template_changed", "The resource template changed after release preparation.");
  if (typeof expected.isPublished === "boolean" && actual.isPublished !== expected.isPublished) throw fail(409, "resource_publication_state_changed", "The page publication state changed after release preparation.");
}

async function probeResource(env, assignment, handle) {
  const store = String(env.SHOPIFY_STOREFRONT_DOMAIN || env.SHOPIFY_STORE_DOMAIN || "07kd8e-qw.myshopify.com").trim().toLowerCase();
  const path = assignment.resourceType === "product" ? `/products/${handle}` : assignment.resourceType === "collection" ? `/collections/${handle}` : `/pages/${handle}`;
  const started = Date.now();
  try {
    const response = await fetch(`https://${store}${path}`, { redirect: "follow", headers: { "User-Agent": "Kairos-Resource-Release/1.0", Accept: "text/html" }, signal: AbortSignal.timeout(20000) });
    const type = response.headers.get("content-type") || "";
    const html = type.includes("text/html") ? await response.text() : "";
    return { ok: response.ok && Boolean(html), status: response.status, finalURL: response.url, contentType: type, bytes: html.length, latencyMs: Date.now() - started, title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim() };
  } catch (error) { return { ok: false, status: 0, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "Resource probe failed." }; }
}

async function shopify(env, query, variables) {
  const store = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const version = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(store)) throw fail(503, "shopify_invalid_domain", "Shopify store domain is invalid.");
  const auth = await accessToken(env, store);
  const response = await fetch(`https://${store}/admin/api/${version}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(response.status, "shopify_graphql_http_error", body?.errors?.[0]?.message || `Shopify returned HTTP ${response.status}.`);
  if (Array.isArray(body?.errors) && body.errors.length) throw fail(422, "shopify_graphql_error", body.errors.map(item => item?.message).filter(Boolean).join("; "));
  return body?.data || {};
}

async function accessToken(env, store) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (clientId && clientSecret) {
    const key = `${store}:${clientId}`;
    const cached = tokenCache.get(key);
    if (cached?.expiresAt > Date.now()) return cached;
    const response = await fetch(`https://${store}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }), signal: AbortSignal.timeout(30000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.access_token) throw fail(401, "shopify_client_credentials_invalid", body?.error_description || body?.error || "Shopify client credentials were rejected.");
    const value = { token: String(body.access_token), expiresAt: Date.now() + 55 * 60 * 1000 };
    tokenCache.set(key, value);
    return value;
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw fail(503, "shopify_not_configured", "Shopify credentials are not configured.");
  return { token, expiresAt: Number.MAX_SAFE_INTEGER };
}

function summarizeResource(resource) { return { id: resource.id, title: String(resource.title || ""), handle: String(resource.handle || ""), templateSuffix: resource.templateSuffix || "", isPublished: typeof resource.isPublished === "boolean" ? resource.isPublished : undefined, status: resource.status || undefined }; }
function reviewRequest(request, reviewID) { return new Request(`${new URL(request.url).origin}/__kairos/visual-review/${reviewID}`); }
function recordRequest(request, releaseID) { return new Request(`${new URL(request.url).origin}/__kairos/resource-release/${releaseID}`); }
async function save(request, record) { await caches.default.put(recordRequest(request, record.releaseID), new Response(JSON.stringify(record), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${TTL}` } })); }
async function load(request, releaseID) { const response = await caches.default.match(recordRequest(request, releaseID)); return response ? response.json() : null; }
async function readRecord(request, releaseID) { const record = await load(request, releaseID); return record ? json(record) : json({ status: "not-found", error: { code: "resource_release_not_found", message: "The resource release record expired or was not found." } }, 404); }
function decode(value) { return String(value || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
function fail(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function errorResponse(error) { return json({ status: "failed", build: BUILD, error: { code: error?.code || "resource_release_failed", message: error instanceof Error ? error.message : "Resource release failed." } }, Number(error?.status || 500)); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
