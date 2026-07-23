const BUILD = "kairos-product-media-20260713-1";
const TTL = 60 * 60 * 24;
const tokenCache = new Map();
const GRAPHIC_NAMES = [
  "product-hero.svg",
  "book-mockup.svg",
  "what-youll-learn.svg",
  "who-this-book-is-for.svg",
  "inside-the-book.svg",
  "prompt-framework.svg",
  "social-square.svg",
  "social-portrait.svg",
  "social-story.svg",
];

export async function handleProductMedia(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/shopify/product-media/prepare" && request.method === "POST") return prepare(request, env);
  if (url.pathname === "/api/shopify/product-media/execute" && request.method === "POST") return execute(request, env);
  if (url.pathname === "/api/shopify/product-media/rollback" && request.method === "POST") return rollback(request, env);
  const match = url.pathname.match(/^\/api\/shopify\/product-media\/records\/([a-f0-9-]+)$/i);
  if (match && request.method === "GET") return readRecord(request, match[1]);
  return null;
}

async function prepare(request, env) {
  try {
    const body = await request.json();
    const productReleaseId = String(body?.productReleaseId || "").trim();
    if (!productReleaseId) throw err(400, "product_release_required", "A verified Shopify product draft is required.");
    const productRelease = await internalJSON(request, `/api/shopify/product-publication/records/${encodeURIComponent(productReleaseId)}`);
    if (productRelease?.status !== "draft-created-and-verified" || !productRelease?.result?.id) throw err(409, "product_draft_required", "Create and verify the Shopify product draft before installing media.");
    const project = await internalJSON(request, `/api/publishing/jobs/${encodeURIComponent(productRelease.projectId)}`);
    if (project?.status !== "completed") throw err(409, "project_not_complete", "The source product project is not complete.");

    const artifacts = Array.isArray(project.artifacts) ? project.artifacts : [];
    const cover = chooseCover(artifacts);
    if (!cover) throw err(422, "cover_artifact_missing", "The completed product package does not contain a usable PNG or JPEG cover.");
    const graphics = GRAPHIC_NAMES.map(name => artifacts.find(item => item?.name === name)).filter(Boolean);
    const current = await readProduct(env, productRelease.result.id);
    if (!current) throw err(404, "shopify_product_missing", "The verified Shopify draft product no longer exists.");
    if (current.status !== "DRAFT") throw err(409, "product_not_draft", "Media installation is restricted to a Shopify draft product.");

    const releaseId = crypto.randomUUID();
    const desired = {
      cover: {
        name: cover.name,
        source: absoluteArtifactURL(request, cover.url),
        alt: `${project.title || current.title} cover — Mindset Media Group™`,
        role: "featured-product-image",
      },
      files: graphics.map((item, index) => ({
        name: item.name,
        source: absoluteArtifactURL(request, item.url),
        alt: `${project.title || current.title} — ${label(item.name)}`,
        order: index + 1,
        role: item.name.startsWith("social-") ? "social-marketing-asset" : "product-page-asset",
      })),
    };
    const record = {
      releaseId,
      productReleaseId,
      projectId: productRelease.projectId,
      build: BUILD,
      status: "awaiting-media-approval",
      createdAt: new Date().toISOString(),
      product: snapshotProduct(current),
      desired,
      existingMedia: current.media?.nodes || [],
      confirmationRequired: "INSTALL PRODUCT MEDIA",
      safeguards: {
        draftProductOnly: true,
        existingMediaPreserved: true,
        approvedCoverInstalledAsFeatured: true,
        derivedSVGsStoredInShopifyFiles: true,
        storefrontPublicationAuthorized: false,
        rollbackRequired: true,
      },
    };
    await save(request, record);
    return json(record, 201);
  } catch (error) {
    return failure(error, "product_media_prepare_failed");
  }
}

async function execute(request, env) {
  try {
    const body = await request.json();
    const record = await load(request, String(body?.releaseId || ""));
    if (!record) throw err(404, "media_release_not_found", "The product-media release expired or was not found.");
    if (record.status !== "awaiting-media-approval") throw err(409, "media_release_state_invalid", "This media release is not awaiting approval.");
    if (String(body?.confirmation || "") !== record.confirmationRequired) throw err(403, "media_confirmation_required", `Type ${record.confirmationRequired} to authorize media installation.`);

    const current = await readProduct(env, record.product.id);
    if (!current || current.status !== "DRAFT") throw err(409, "product_draft_changed", "The Shopify draft product changed or is no longer a draft.");
    if (current.updatedAt !== record.product.updatedAt) throw err(409, "product_changed", "The Shopify product changed after media preparation. Prepare a new media release.");

    const mediaPayload = await createProductCover(env, current.id, record.desired.cover);
    const mediaId = mediaPayload?.media?.[0]?.id;
    if (!mediaId) throw err(502, "cover_media_unconfirmed", "Shopify did not confirm creation of the product cover media.");
    await moveMediaFirst(env, current.id, mediaId);

    const filePayload = record.desired.files.length ? await createFiles(env, record.desired.files) : [];
    const fileIds = filePayload.map(item => item.id).filter(Boolean);
    const verified = await readProduct(env, current.id);
    const verifiedCover = verified?.media?.nodes?.find(item => item.id === mediaId);
    if (!verifiedCover) throw err(502, "cover_media_verification_failed", "Shopify did not return the installed product cover during verification.");
    const files = fileIds.length ? await readFiles(env, fileIds) : [];
    if (files.length !== fileIds.length) throw err(502, "product_files_verification_failed", "Shopify did not verify every approved product asset file.");

    const updated = {
      ...record,
      status: "media-installed-and-verified",
      executedAt: new Date().toISOString(),
      executedBy: String(body?.actor || "Executive").slice(0, 120),
      result: {
        product: snapshotProduct(verified),
        featuredMedia: summarizeMedia(verifiedCover),
        files: files.map(summarizeFile),
        mediaOrder: (verified.media?.nodes || []).map((item, index) => ({ id: item.id, position: index, alt: item.alt || "" })),
      },
      rollback: {
        productId: current.id,
        mediaIds: [mediaId],
        fileIds,
      },
      nextAction: "Open the draft product preview, complete product-page visual verification, then use Resource Release Control for publication.",
    };
    await save(request, updated);
    return json(updated);
  } catch (error) {
    return failure(error, "product_media_execute_failed");
  }
}

async function rollback(request, env) {
  try {
    const body = await request.json();
    const record = await load(request, String(body?.releaseId || ""));
    if (!record?.rollback) throw err(409, "media_rollback_unavailable", "No product-media rollback package is available.");
    if (String(body?.confirmation || "") !== "ROLL BACK PRODUCT MEDIA") throw err(403, "media_rollback_confirmation_required", "Type ROLL BACK PRODUCT MEDIA to authorize rollback.");
    const product = await readProduct(env, record.rollback.productId);
    if (!product) throw err(404, "shopify_product_missing", "The Shopify product no longer exists.");
    if (record.rollback.mediaIds.length) await deleteProductMedia(env, record.rollback.productId, record.rollback.mediaIds);
    if (record.rollback.fileIds.length) await deleteFiles(env, record.rollback.fileIds);
    const verified = await readProduct(env, record.rollback.productId);
    if ((verified?.media?.nodes || []).some(item => record.rollback.mediaIds.includes(item.id))) throw err(502, "media_rollback_verification_failed", "Shopify still reports media that should have been removed.");
    const updated = {
      ...record,
      status: "media-rolled-back-and-verified",
      rolledBackAt: new Date().toISOString(),
      rolledBackBy: String(body?.actor || "Executive").slice(0, 120),
    };
    await save(request, updated);
    return json(updated);
  } catch (error) {
    return failure(error, "product_media_rollback_failed");
  }
}

async function createProductCover(env, productId, cover) {
  const data = await gql(env, `mutation($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){media{id alt mediaContentType status preview{image{url}}} mediaUserErrors{field message}}}`, {
    productId,
    media: [{ originalSource: cover.source, alt: cover.alt, mediaContentType: "IMAGE" }],
  });
  reject(data?.productCreateMedia, "mediaUserErrors");
  return data?.productCreateMedia || {};
}

async function moveMediaFirst(env, productId, mediaId) {
  const data = await gql(env, `mutation($id:ID!,$moves:[MoveInput!]!){productReorderMedia(id:$id,moves:$moves){job{id done} mediaUserErrors{field message}}}`, {
    id: productId,
    moves: [{ id: mediaId, newPosition: "0" }],
  });
  reject(data?.productReorderMedia, "mediaUserErrors");
}

async function createFiles(env, files) {
  const data = await gql(env, `mutation($files:[FileCreateInput!]!){fileCreate(files:$files){files{... on GenericFile{id alt fileStatus url} ... on MediaImage{id alt fileStatus image{url}}} userErrors{field message}}}`, {
    files: files.map(file => ({ originalSource: file.source, contentType: "FILE", alt: file.alt })),
  });
  reject(data?.fileCreate);
  return data?.fileCreate?.files || [];
}

async function deleteProductMedia(env, productId, mediaIds) {
  const data = await gql(env, `mutation($productId:ID!,$mediaIds:[ID!]!){productDeleteMedia(productId:$productId,mediaIds:$mediaIds){deletedMediaIds mediaUserErrors{field message}}}`, { productId, mediaIds });
  reject(data?.productDeleteMedia, "mediaUserErrors");
}

async function deleteFiles(env, fileIds) {
  const data = await gql(env, `mutation($fileIds:[ID!]!){fileDelete(fileIds:$fileIds){deletedFileIds userErrors{field message}}}`, { fileIds });
  reject(data?.fileDelete);
}

async function readProduct(env, id) {
  const data = await gql(env, `query($id:ID!){product(id:$id){id title handle status updatedAt media(first:50){nodes{id alt mediaContentType status preview{image{url}}}}}}`, { id });
  return data?.product || null;
}

async function readFiles(env, ids) {
  const data = await gql(env, `query($ids:[ID!]!){nodes(ids:$ids){... on GenericFile{id alt fileStatus url} ... on MediaImage{id alt fileStatus image{url}}}}`, { ids });
  return (data?.nodes || []).filter(Boolean);
}

async function internalJSON(request, path) {
  const response = await fetch(`${new URL(request.url).origin}${path}`, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw err(response.status || 502, "internal_record_unavailable", body?.error?.message || "Kairos could not retrieve the required production record.");
  return body;
}

function chooseCover(artifacts) {
  return artifacts.find(item => /^approved-cover\.(png|jpe?g)$/i.test(String(item?.name || "")))
    || artifacts.find(item => /^cover-preview\.(png|jpe?g)$/i.test(String(item?.name || "")))
    || artifacts.find(item => item?.name === "ebook-cover.png")
    || null;
}
function absoluteArtifactURL(request, value) { return new URL(String(value || ""), new URL(request.url).origin).toString(); }
function label(name) { return String(name || "asset").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function snapshotProduct(product) { return { id: product.id, title: product.title, handle: product.handle, status: product.status, updatedAt: product.updatedAt, mediaCount: product.media?.nodes?.length || 0 }; }
function summarizeMedia(item) { return { id: item.id, alt: item.alt || "", contentType: item.mediaContentType, status: item.status, url: item.preview?.image?.url || null }; }
function summarizeFile(item) { return { id: item.id, alt: item.alt || "", status: item.fileStatus || null, url: item.url || item.image?.url || null }; }
function reject(payload, key = "userErrors") { const list = payload?.[key] || []; if (list.length) throw err(422, "shopify_media_mutation_rejected", list.map(item => item.message).join("; ")); }

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
  if (!response.ok) throw err(response.status, "shopify_graphql_http_error", body?.errors?.[0]?.message || `Shopify returned ${response.status}.`);
  if (body.errors?.length) throw err(422, "shopify_graphql_error", body.errors.map(item => item.message).join("; "));
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
    if (!response.ok || !body.access_token) throw err(401, "shopify_auth_failed", "Shopify client credentials failed.");
    tokenCache.set(key, { token: body.access_token, expires: Date.now() + 3_300_000 });
    return body.access_token;
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw err(503, "shopify_not_configured", "Shopify credentials are not configured.");
  return token;
}
function storeDomain(env) { const value = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) throw err(503, "shopify_invalid_domain", "Shopify store domain is invalid."); return value; }
function recordRequest(request, id) { return new Request(`${new URL(request.url).origin}/__kairos/product-media/${id}`); }
async function save(request, record) { await caches.default.put(recordRequest(request, record.releaseId), new Response(JSON.stringify(record), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${TTL}` } })); }
async function load(request, id) { const response = await caches.default.match(recordRequest(request, id)); return response ? response.json() : null; }
async function readRecord(request, id) { const record = await load(request, id); return record ? json(record) : json({ status: "not-found", error: { message: "Product media record not found." } }, 404); }
function err(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function failure(error, code) { return json({ status: "failed", build: BUILD, error: { code: error?.code || code, message: error instanceof Error ? error.message : "Product media installation failed." } }, Number(error?.status || 500)); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
