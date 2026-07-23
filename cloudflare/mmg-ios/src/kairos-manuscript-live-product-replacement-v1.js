export const KAIROS_MANUSCRIPT_LIVE_PRODUCT_REPLACEMENT_BUILD = "kairos-manuscript-live-product-replacement-20260722-1";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const PREPARE_CONFIRMATION = "REPLACE LIVE PRODUCT FROM VAULT";
const ROLLBACK_CONFIRMATION = "ROLL BACK LIVE PRODUCT REPLACEMENT";
const APPROVED_TEMPLATE_SUFFIXES = new Set(["mmg-book-product", "mmg-ai-image-mastery", "mmg-digital-download"]);
const PRODUCT_GRAPHICS = new Set([
  "product-hero.svg",
  "book-mockup.svg",
  "what-youll-learn.svg",
  "who-this-book-is-for.svg",
  "inside-the-book.svg",
  "prompt-framework.svg",
  "social-square.svg",
  "social-portrait.svg",
  "social-story.svg",
]);
const tokenCache = new Map();

export async function handleManuscriptLiveProductReplacement(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/live-product-replacement\/(prepare|execute|rollback)$/i);
  if (!match) return null;

  if (request.method !== "POST") {
    return failure(405, "live_product_replacement_method_not_allowed", "This controlled live-product replacement method is not allowed.");
  }

  const projectId = match[1];
  const action = match[2].toLowerCase();

  try {
    if (action === "prepare") return prepareReplacement(request, env, projectId);
    if (action === "execute") return executeReplacement(request, env, projectId);
    if (action === "rollback") return rollbackReplacement(request, env, projectId);
    return failure(404, "live_product_replacement_route_not_found", "The controlled live-product replacement route was not found.");
  } catch (caught) {
    return failure(
      Number(caught?.status || 500),
      caught?.code || "live_product_replacement_failed",
      caught instanceof Error ? caught.message : "The controlled live-product replacement failed.",
    );
  }
}

export function buildLiveProductReplacementPlan({ pipeline, productPackage, currentProduct, origin }) {
  if (!pipeline?.metadata || !pipeline?.vault?.integrity?.passed) {
    throw fail(409, "vault_package_required", "A checksum-verified Admin Asset Vault package is required before replacing a live product.");
  }
  if (!currentProduct?.id || currentProduct.status !== "ACTIVE") {
    throw fail(409, "active_product_required", "The controlled replacement workflow requires an existing active Shopify product.");
  }

  const templateSuffix = String(pipeline.metadata.templateSuffix || "").trim();
  if (!APPROVED_TEMPLATE_SUFFIXES.has(templateSuffix)) {
    throw fail(400, "product_template_not_approved", "The vaulted product template is not approved by the MMG digital-product contract.");
  }

  const assets = Array.isArray(pipeline.vault.assets) ? pipeline.vault.assets : [];
  const cover = chooseCover(assets);
  if (!cover) throw fail(422, "approved_cover_missing", "The Admin Asset Vault does not contain an approved PNG or JPEG cover.");
  const graphics = assets.filter((asset) => PRODUCT_GRAPHICS.has(String(asset?.filename || "")));
  const title = clean(productPackage?.title || pipeline.metadata.title, 255);
  const descriptionHtml = String(productPackage?.shopifyHTML || "").trim();
  if (!title || !descriptionHtml) throw fail(422, "product_package_invalid", "The vaulted product package does not contain valid Shopify title and description content.");

  return {
    desired: {
      title,
      handle: currentProduct.handle,
      descriptionHtml,
      productType: clean(pipeline.metadata.productType || currentProduct.productType || "Digital Download", 255),
      tags: uniqueStrings(productPackage?.tags || [], 40),
      status: "ACTIVE",
      templateSuffix,
      seo: {
        title: clean(productPackage?.seo?.title || pipeline.metadata.title, 70),
        description: clean(productPackage?.seo?.metaDescription || pipeline.metadata.description, 320),
      },
      price: currentProduct.variants?.nodes?.[0]?.price || null,
    },
    assets: {
      cover: {
        assetId: cover.assetId,
        filename: cover.filename,
        source: absoluteURL(origin, cover.downloadURL),
        alt: `${title} digital guide cover by ${pipeline.metadata.author || "Michael King"}`,
      },
      files: graphics.map((asset) => ({
        assetId: asset.assetId,
        filename: asset.filename,
        source: absoluteURL(origin, asset.downloadURL),
        alt: `${title} — ${label(asset.filename)}`,
        role: String(asset.role || "PRODUCT_ASSET"),
      })),
      packageDownloadURL: absoluteURL(origin, pipeline.vault.packageDownloadURL),
    },
  };
}

async function prepareReplacement(request, env, projectId) {
  requireLiveReplacementEnabled(env);
  const pipeline = await requireProductionPipeline(env, projectId);
  const productPackage = await readManufacturingArtifact(env, pipeline.manufacturingProjectId, "product-package.json");
  const handle = clean(productPackage?.handle || pipeline.metadata?.handle, 255);
  if (!handle) throw fail(422, "product_handle_missing", "The vaulted product package does not contain a Shopify handle.");

  const currentProduct = await findProductByHandle(env, handle);
  if (!currentProduct) throw fail(404, "existing_live_product_not_found", "No existing Shopify product uses the vaulted product handle.");
  if (currentProduct.status !== "ACTIVE") throw fail(409, "existing_product_not_active", "The existing Shopify product is not active. Use the governed DRAFT workflow instead.");

  const plan = buildLiveProductReplacementPlan({
    pipeline,
    productPackage,
    currentProduct,
    origin: new URL(request.url).origin,
  });
  const existing = pipeline.shopify?.replacement;
  if (
    existing?.status === "awaiting-live-replacement-approval"
    && existing?.productBefore?.id === currentProduct.id
    && existing?.productBefore?.updatedAt === currentProduct.updatedAt
    && existing?.desired?.templateSuffix === plan.desired.templateSuffix
  ) {
    return json(pipeline);
  }

  const replacement = {
    releaseId: crypto.randomUUID(),
    build: KAIROS_MANUSCRIPT_LIVE_PRODUCT_REPLACEMENT_BUILD,
    status: "awaiting-live-replacement-approval",
    preparedAt: new Date().toISOString(),
    confirmationRequired: PREPARE_CONFIRMATION,
    productBefore: snapshotProduct(currentProduct),
    desired: plan.desired,
    assets: plan.assets,
    safeguards: {
      existingProductUpdatedInPlace: true,
      handlePreserved: true,
      pricePreserved: true,
      activeStatusPreserved: true,
      digitalDeliveryAssociationsPreserved: true,
      adminAssetVaultRequired: true,
      customTemplateAllowlisted: true,
      explicitApprovalRequired: true,
      storefrontVerificationRequired: true,
      rollbackEvidenceRequired: true,
      themeMutationAuthorized: false,
      navigationMutationAuthorized: false,
      pageMutationAuthorized: false,
    },
  };

  const next = {
    ...pipeline,
    shopify: {
      ...pipeline.shopify,
      status: "awaiting-live-replacement-approval",
      replacement,
    },
    updatedAt: new Date().toISOString(),
    nextAction: "Review the protected live-product replacement, then explicitly approve applying the vaulted content and assets.",
  };
  await putPipelineRecord(env, projectId, next);
  return json(next, 202);
}

async function executeReplacement(request, env, projectId) {
  requireLiveReplacementEnabled(env);
  const body = await request.json().catch(() => ({}));
  if (String(body?.confirmation || "") !== PREPARE_CONFIRMATION) {
    throw fail(403, "live_product_replacement_confirmation_required", `confirmation must equal ${PREPARE_CONFIRMATION}.`);
  }

  const pipeline = await requireProductionPipeline(env, projectId);
  const replacement = pipeline.shopify?.replacement;
  if (!replacement || replacement.status !== "awaiting-live-replacement-approval") {
    throw fail(409, "live_product_replacement_not_prepared", "Prepare and review the controlled live-product replacement before execution.");
  }

  const current = await readProduct(env, replacement.productBefore.id);
  assertProductUnchanged(current, replacement.productBefore);

  await updateProduct(env, current.id, replacement.desired);
  const createdCover = await createProductCover(env, current.id, replacement.assets.cover);
  const coverMediaId = createdCover?.media?.[0]?.id;
  if (!coverMediaId) throw fail(502, "replacement_cover_unconfirmed", "Shopify did not confirm the new vaulted product cover.");
  await moveMediaFirst(env, current.id, coverMediaId);

  const createdFiles = replacement.assets.files.length
    ? await createFiles(env, replacement.assets.files)
    : [];
  const fileIds = createdFiles.map((item) => item?.id).filter(Boolean);
  if (fileIds.length !== replacement.assets.files.length) {
    throw fail(502, "replacement_files_unconfirmed", "Shopify did not confirm every vaulted supporting asset.");
  }

  const verified = await readProduct(env, current.id);
  verifyReplacement(verified, replacement, coverMediaId);
  const verifiedFiles = fileIds.length ? await readFiles(env, fileIds) : [];
  if (verifiedFiles.length !== fileIds.length) {
    throw fail(502, "replacement_files_verification_failed", "Shopify did not verify every new supporting asset file.");
  }

  const liveProbe = await probeProduct(env, verified.handle);
  if (!liveProbe.ok) {
    throw fail(502, "replacement_storefront_verification_failed", `The updated live product could not be verified on the storefront (HTTP ${liveProbe.status || 0}).`);
  }

  const completedAt = new Date().toISOString();
  const completedReplacement = {
    ...replacement,
    status: "live-product-replaced-and-verified",
    executedAt: completedAt,
    executedBy: clean(body?.actor || "MMG Executive", 120),
    result: {
      product: snapshotProduct(verified),
      featuredMediaId: coverMediaId,
      files: verifiedFiles.map(summarizeFile),
      liveProbe,
    },
    rollback: {
      productId: current.id,
      productBefore: replacement.productBefore,
      mediaIds: [coverMediaId],
      fileIds,
      confirmationRequired: ROLLBACK_CONFIRMATION,
    },
  };

  const next = {
    ...pipeline,
    metadata: {
      ...pipeline.metadata,
      publicationStatus: "ACTIVE",
      liveURL: liveProbe.finalURL,
    },
    shopify: {
      ...pipeline.shopify,
      status: "live-product-replaced-and-verified",
      replacement: completedReplacement,
    },
    updatedAt: completedAt,
    nextAction: "The existing live Shopify product now uses the verified vaulted content, approved template, and new product assets.",
  };
  await putPipelineRecord(env, projectId, next);
  return json(next);
}

async function rollbackReplacement(request, env, projectId) {
  requireLiveReplacementEnabled(env);
  const body = await request.json().catch(() => ({}));
  if (String(body?.confirmation || "") !== ROLLBACK_CONFIRMATION) {
    throw fail(403, "live_product_replacement_rollback_confirmation_required", `confirmation must equal ${ROLLBACK_CONFIRMATION}.`);
  }

  const pipeline = await requireProductionPipeline(env, projectId);
  const replacement = pipeline.shopify?.replacement;
  if (replacement?.status !== "live-product-replaced-and-verified" || !replacement?.rollback) {
    throw fail(409, "live_product_replacement_rollback_unavailable", "No completed live-product replacement rollback package is available.");
  }

  const current = await readProduct(env, replacement.rollback.productId);
  if (!current?.id || current.status !== "ACTIVE") {
    throw fail(409, "live_product_changed", "The live product no longer matches the controlled replacement workflow. Automatic rollback is blocked.");
  }

  await updateProduct(env, current.id, replacement.rollback.productBefore);
  if (replacement.rollback.mediaIds.length) await deleteProductMedia(env, current.id, replacement.rollback.mediaIds);
  if (replacement.rollback.fileIds.length) await deleteFiles(env, replacement.rollback.fileIds);

  const restored = await readProduct(env, current.id);
  verifyRestored(restored, replacement.rollback.productBefore);
  const liveProbe = await probeProduct(env, restored.handle);
  if (!liveProbe.ok) throw fail(502, "replacement_rollback_storefront_verification_failed", "The restored live product could not be verified on the storefront.");

  const rolledBackAt = new Date().toISOString();
  const next = {
    ...pipeline,
    metadata: {
      ...pipeline.metadata,
      publicationStatus: "ACTIVE",
      liveURL: liveProbe.finalURL,
    },
    shopify: {
      ...pipeline.shopify,
      status: "live-product-replacement-rolled-back-and-verified",
      replacement: {
        ...replacement,
        status: "live-product-replacement-rolled-back-and-verified",
        rolledBackAt,
        rolledBackBy: clean(body?.actor || "MMG Executive", 120),
        rollbackResult: {
          product: snapshotProduct(restored),
          liveProbe,
        },
      },
    },
    updatedAt: rolledBackAt,
    nextAction: "The prior live Shopify product content and template were restored and verified.",
  };
  await putPipelineRecord(env, projectId, next);
  return json(next);
}

async function readManufacturingArtifact(env, manufacturingProjectId, name) {
  requireProjects(env);
  if (!/^[a-f0-9-]{20,}$/i.test(String(manufacturingProjectId || ""))) {
    throw fail(409, "manufacturing_project_missing", "The production package does not reference a valid manufacturing project.");
  }
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(manufacturingProjectId));
  const response = await stub.fetch(`https://kairos.internal/product-manufacturing/artifacts/${encodeURIComponent(name)}`);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw fail(response.status || 502, "manufacturing_artifact_unavailable", `The required ${name} artifact could not be loaded.`);
  return body;
}

async function requireProductionPipeline(env, projectId) {
  const record = await optionalPipelineRecord(env, projectId);
  if (!record || record.status !== "production-ready" || !record.vault?.integrity?.passed) {
    throw fail(409, "production_package_required", "Build, verify, and vault the production package before replacing a live Shopify product.");
  }
  return record;
}

async function optionalPipelineRecord(env, projectId) {
  const response = await registryStub(env).fetch(`https://kairos.internal/registry/manuscripts/${projectId}/auto-pipeline`);
  return response.ok ? response.json() : null;
}

async function putPipelineRecord(env, projectId, record) {
  const response = await registryStub(env).fetch(`https://kairos.internal/registry/manuscripts/${projectId}/auto-pipeline`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw fail(response.status || 502, "replacement_record_store_failed", body?.error?.message || "The controlled replacement record could not be stored.");
}

function registryStub(env) {
  requireProjects(env);
  return env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
}

function requireProjects(env) {
  if (!env?.KAIROS_PROJECTS) throw fail(503, "pipeline_storage_unavailable", "Kairos project storage is unavailable.");
}

function requireLiveReplacementEnabled(env) {
  const writes = String(env?.KAIROS_SHOPIFY_WRITES_ENABLED || "false").toLowerCase() === "true";
  const live = String(env?.KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED || "false").toLowerCase() === "true";
  if (!writes || !live) throw fail(403, "live_product_replacement_disabled", "Controlled live-product replacement is disabled in the Kairos runtime.");
}

async function findProductByHandle(env, handle) {
  const data = await gql(env, `query($q:String!){products(first:2,query:$q){nodes{${PRODUCT_FIELDS}}}}`, { q: `handle:${handle}` });
  return data?.products?.nodes?.[0] || null;
}

async function readProduct(env, id) {
  const data = await gql(env, `query($id:ID!){product(id:$id){${PRODUCT_FIELDS}}}`, { id });
  return data?.product || null;
}

const PRODUCT_FIELDS = `id title handle descriptionHtml productType tags status templateSuffix updatedAt seo{title description} variants(first:1){nodes{id price}} featuredMedia{... on MediaImage{id status alt image{url width height}}} media(first:100){nodes{... on MediaImage{id status alt image{url width height}}}}`;

async function updateProduct(env, id, desired) {
  const product = {
    id,
    title: desired.title,
    handle: desired.handle,
    descriptionHtml: desired.descriptionHtml,
    productType: desired.productType,
    tags: desired.tags,
    status: desired.status || "ACTIVE",
    templateSuffix: desired.templateSuffix,
    seo: desired.seo,
  };
  const data = await gql(env, `mutation($product:ProductUpdateInput!){productUpdate(product:$product){product{id updatedAt} userErrors{field message}}}`, { product });
  reject(data?.productUpdate, "userErrors", "shopify_product_replacement_rejected");
}

async function createProductCover(env, productId, cover) {
  const data = await gql(env, `mutation($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){media{id alt mediaContentType status preview{image{url}}} mediaUserErrors{field message}}}`, {
    productId,
    media: [{ originalSource: cover.source, alt: cover.alt, mediaContentType: "IMAGE" }],
  });
  reject(data?.productCreateMedia, "mediaUserErrors", "shopify_cover_replacement_rejected");
  return data?.productCreateMedia || {};
}

async function moveMediaFirst(env, productId, mediaId) {
  const data = await gql(env, `mutation($id:ID!,$moves:[MoveInput!]!){productReorderMedia(id:$id,moves:$moves){job{id done} mediaUserErrors{field message}}}`, {
    id: productId,
    moves: [{ id: mediaId, newPosition: "0" }],
  });
  reject(data?.productReorderMedia, "mediaUserErrors", "shopify_media_reorder_rejected");
}

async function createFiles(env, files) {
  const data = await gql(env, `mutation($files:[FileCreateInput!]!){fileCreate(files:$files){files{... on GenericFile{id alt fileStatus url} ... on MediaImage{id alt fileStatus image{url}}} userErrors{field message}}}`, {
    files: files.map((file) => ({ originalSource: file.source, contentType: "FILE", alt: file.alt })),
  });
  reject(data?.fileCreate, "userErrors", "shopify_product_files_rejected");
  return data?.fileCreate?.files || [];
}

async function readFiles(env, ids) {
  const data = await gql(env, `query($ids:[ID!]!){nodes(ids:$ids){... on GenericFile{id alt fileStatus url} ... on MediaImage{id alt fileStatus image{url}}}}`, { ids });
  return (data?.nodes || []).filter(Boolean);
}

async function deleteProductMedia(env, productId, mediaIds) {
  const data = await gql(env, `mutation($productId:ID!,$mediaIds:[ID!]!){productDeleteMedia(productId:$productId,mediaIds:$mediaIds){deletedMediaIds mediaUserErrors{field message}}}`, { productId, mediaIds });
  reject(data?.productDeleteMedia, "mediaUserErrors", "shopify_replacement_media_rollback_rejected");
}

async function deleteFiles(env, fileIds) {
  const data = await gql(env, `mutation($fileIds:[ID!]!){fileDelete(fileIds:$fileIds){deletedFileIds userErrors{field message}}}`, { fileIds });
  reject(data?.fileDelete, "userErrors", "shopify_replacement_files_rollback_rejected");
}

async function probeProduct(env, handle) {
  const store = String(env.SHOPIFY_STOREFRONT_DOMAIN || env.MMG_STOREFRONT_ORIGIN || `https://${storeDomain(env)}`).trim().replace(/\/$/, "");
  const url = `${store.startsWith("http") ? store : `https://${store}`}/products/${encodeURIComponent(handle)}`;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Kairos-Live-Product-Replacement/1.0", Accept: "text/html" },
      signal: AbortSignal.timeout(20000),
    });
    const type = response.headers.get("content-type") || "";
    const html = type.includes("text/html") ? await response.text() : "";
    return {
      ok: response.ok && Boolean(html),
      status: response.status,
      finalURL: response.url,
      contentType: type,
      bytes: html.length,
      latencyMs: Date.now() - started,
      title: decodeHTML(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim(),
    };
  } catch (error) {
    return { ok: false, status: 0, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "Live product probe failed." };
  }
}

function assertProductUnchanged(actual, expected) {
  if (!actual?.id || actual.id !== expected.id) throw fail(409, "product_identity_changed", "The active Shopify product identity changed after replacement preparation.");
  if (actual.status !== "ACTIVE") throw fail(409, "product_status_changed", "The Shopify product is no longer active.");
  if (actual.updatedAt !== expected.updatedAt) throw fail(409, "product_changed_after_replacement_review", "The live Shopify product changed after replacement preparation. Prepare a new replacement review.");
  if (actual.handle !== expected.handle) throw fail(409, "product_handle_changed", "The Shopify product handle changed after replacement preparation.");
}

function verifyReplacement(actual, replacement, coverMediaId) {
  if (!actual?.id || actual.id !== replacement.productBefore.id) throw fail(502, "replacement_product_identity_failed", "Shopify did not preserve the existing product identity.");
  if (actual.status !== "ACTIVE") throw fail(502, "replacement_active_status_failed", "Shopify did not preserve the active product status.");
  if (actual.handle !== replacement.productBefore.handle) throw fail(502, "replacement_handle_failed", "Shopify did not preserve the product handle.");
  if ((actual.templateSuffix || "") !== replacement.desired.templateSuffix) throw fail(502, "replacement_template_verification_failed", "Shopify did not verify the approved custom template.");
  if (actual.title !== replacement.desired.title) throw fail(502, "replacement_title_verification_failed", "Shopify did not verify the vaulted product title.");
  if (!(actual.media?.nodes || []).some((item) => item?.id === coverMediaId)) throw fail(502, "replacement_cover_verification_failed", "Shopify did not verify the new vaulted cover media.");
  const actualPrice = actual.variants?.nodes?.[0]?.price || null;
  if (String(actualPrice || "") !== String(replacement.productBefore.price || "")) throw fail(502, "replacement_price_preservation_failed", "The existing product price changed during replacement.");
}

function verifyRestored(actual, expected) {
  if (!actual?.id || actual.id !== expected.id) throw fail(502, "replacement_rollback_identity_failed", "Shopify did not preserve the product identity during rollback.");
  if (actual.status !== expected.status) throw fail(502, "replacement_rollback_status_failed", "Shopify did not restore the prior product status.");
  if (actual.title !== expected.title) throw fail(502, "replacement_rollback_title_failed", "Shopify did not restore the prior product title.");
  if ((actual.templateSuffix || "") !== (expected.templateSuffix || "")) throw fail(502, "replacement_rollback_template_failed", "Shopify did not restore the prior product template.");
}

function snapshotProduct(product) {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    descriptionHtml: product.descriptionHtml,
    productType: product.productType,
    tags: product.tags || [],
    status: product.status,
    templateSuffix: product.templateSuffix || "",
    updatedAt: product.updatedAt,
    seo: product.seo || {},
    price: product.variants?.nodes?.[0]?.price || null,
    variants: product.variants || { nodes: [] },
    featuredMedia: product.featuredMedia || null,
    media: product.media || { nodes: [] },
  };
}

function chooseCover(assets) {
  return assets.find((asset) => asset?.role === "APPROVED_COVER" && /\.(png|jpe?g)$/i.test(String(asset?.filename || "")))
    || assets.find((asset) => /^approved-cover\.(png|jpe?g)$/i.test(String(asset?.filename || "")))
    || null;
}

function uniqueStrings(values, limit) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => clean(value, 255)).filter(Boolean))].slice(0, limit);
}

function absoluteURL(origin, value) {
  return new URL(String(value || ""), origin).toString();
}

function label(filename) {
  return String(filename || "asset").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function summarizeFile(item) {
  return { id: item.id, alt: item.alt || "", status: item.fileStatus || null, url: item.url || item.image?.url || null };
}

function reject(payload, key, code) {
  const list = payload?.[key] || [];
  if (list.length) throw fail(422, code, list.map((item) => item.message).join("; "));
  if (!payload) throw fail(502, `${code}_unconfirmed`, "Shopify did not confirm the controlled replacement mutation.");
}

async function gql(env, query, variables) {
  const store = storeDomain(env);
  const version = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  const token = await accessToken(env, store);
  const response = await fetch(`https://${store}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
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
    tokenCache.set(key, { token: body.access_token, expires: Date.now() + 3300000 });
    return body.access_token;
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw fail(503, "shopify_not_configured", "Shopify credentials are not configured.");
  return token;
}

function storeDomain(env) {
  const value = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) throw fail(503, "shopify_invalid_domain", "Shopify store domain is invalid.");
  return value;
}

function decodeHTML(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function failure(status, code, message) {
  return json({ status: "failed", build: KAIROS_MANUSCRIPT_LIVE_PRODUCT_REPLACEMENT_BUILD, error: { code, message } }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Live-Product-Replacement": KAIROS_MANUSCRIPT_LIVE_PRODUCT_REPLACEMENT_BUILD,
    },
  });
}
