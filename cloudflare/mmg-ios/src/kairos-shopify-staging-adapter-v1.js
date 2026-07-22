const BUILD = "kairos-shopify-staging-adapter-20260722-2";
const PROJECT_KEY = "publishing:project";
const API_VERSION = "2026-07";

export async function handleShopifyStagingObjectRequest(state, request, env = {}) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/internal\/publishing\/projects\/([^/]+)\/shopify-staging(?:\/(rollback))?$/);
  if (!match || request.method !== "POST") return null;

  const project = await state.storage.get(PROJECT_KEY);
  if (!project) return jsonError("project_not_found", "Project not found.", 404);

  if (match[2] === "rollback") return rollbackStaging(state, project, env);
  return stageDraftProduct(state, project, env);
}

export async function stageDraftProduct(state, project, env = {}) {
  assertStagingEligible(project);
  const productMetadataArtifact = project.artifacts.find((artifact) => artifact.kind === "PRODUCT_METADATA");
  const metadata = JSON.parse(decode(await state.storage.get(productMetadataArtifact.storageKey)));
  assertDraftMetadata(metadata);

  const primaryImage = selectRenderedPrimaryImage(project);
  const media = buildCoverMedia(primaryImage, metadata);
  const client = createShopifyClient(env);
  const existingReceipt = project.shopifyStaging?.receipt || null;
  const operationId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  let rollback = null;
  let result;
  if (existingReceipt?.productId) {
    const before = await client.query(PRODUCT_SNAPSHOT_QUERY, { id: existingReceipt.productId });
    const product = before?.product;
    if (!product) throw stagingError("staged_product_missing", "Previously staged Shopify product no longer exists.", 409);
    if (product.status !== "DRAFT") throw stagingError("staged_product_not_draft", "Existing staged product is no longer DRAFT.", 409);
    rollback = snapshotRollback(product);
    result = await client.mutate(PRODUCT_UPDATE_MUTATION, {
      input: toProductInput(metadata, existingReceipt.productId),
      media,
    });
    assertNoUserErrors(result?.productUpdate?.userErrors, "product_update_failed");
    result = result.productUpdate.product;
  } else {
    result = await client.mutate(PRODUCT_CREATE_MUTATION, {
      input: toProductInput(metadata),
      media,
    });
    assertNoUserErrors(result?.productCreate?.userErrors, "product_create_failed");
    result = result.productCreate.product;
    rollback = { action: "DELETE_CREATED_DRAFT", productId: result?.id };
  }

  if (!result?.id) throw stagingError("shopify_product_missing", "Shopify did not return a staged product ID.", 502);
  if (result.status !== "DRAFT") throw stagingError("shopify_draft_guard_failed", "Shopify returned a non-DRAFT product.", 502);

  const completedAt = new Date().toISOString();
  const receipt = {
    schemaVersion: "1.0.0",
    build: BUILD,
    operationId,
    mode: existingReceipt?.productId ? "UPDATE_DRAFT" : "CREATE_DRAFT",
    startedAt,
    completedAt,
    productId: result.id,
    handle: result.handle,
    status: result.status,
    title: result.title,
    adminGraphqlApiVersion: String(env.SHOPIFY_ADMIN_API_VERSION || API_VERSION),
    metadataArtifactId: productMetadataArtifact.id,
    metadataSha256: productMetadataArtifact.sha256,
    coverSourceAssetId: project.sourceAssets.find((asset) => asset.role === "COVER_SOURCE")?.id || null,
    renderedPrimaryImageArtifactId: primaryImage.id,
    renderedPrimaryImageSha256: primaryImage.sha256,
    renderedPrimaryImageDimensions: { width: primaryImage.width, height: primaryImage.height },
    renderedPrimaryImageUrlExpiresAt: primaryImage.signedUrlExpiresAt,
    mediaAttached: media.length === 1,
    productPublished: false,
    publicationMutationExecuted: false,
    liveMutationAuthorized: false,
  };

  const updated = {
    ...project,
    status: "COMPLETED",
    stages: project.stages.map((stage) => stage.name === "SHOPIFY_STAGING_HANDOFF"
      ? { ...stage, status: "SUCCEEDED", startedAt, completedAt, requiresHumanReview: false }
      : stage),
    run: {
      ...project.run,
      status: "COMPLETED",
      currentStage: "SHOPIFY_STAGING_HANDOFF",
      completedAt,
      lastHeartbeatAt: completedAt,
    },
    shopifyStaging: {
      status: "COMPLETED",
      receipt,
      rollback,
      rollbackAvailable: true,
    },
    completedAt,
    updatedAt: completedAt,
  };
  await state.storage.put(PROJECT_KEY, updated);

  return json({ status: "completed", build: BUILD, project: updated, receipt, rollback, safeguards: safeguards() }, 200);
}

async function rollbackStaging(state, project, env) {
  const staging = project.shopifyStaging;
  if (!staging?.rollbackAvailable || !staging.rollback) {
    return jsonError("rollback_unavailable", "No Shopify staging rollback is available.", 409);
  }
  const client = createShopifyClient(env);
  const rollback = staging.rollback;
  let result;
  if (rollback.action === "DELETE_CREATED_DRAFT") {
    result = await client.mutate(PRODUCT_DELETE_MUTATION, { input: { id: rollback.productId } });
    assertNoUserErrors(result?.productDelete?.userErrors, "product_delete_failed");
  } else if (rollback.action === "RESTORE_DRAFT_SNAPSHOT") {
    result = await client.mutate(PRODUCT_UPDATE_MUTATION, { input: rollback.input, media: [] });
    assertNoUserErrors(result?.productUpdate?.userErrors, "product_restore_failed");
  } else {
    return jsonError("rollback_invalid", "Stored rollback action is invalid.", 409);
  }

  const rolledBackAt = new Date().toISOString();
  const updated = {
    ...project,
    status: "APPROVED_FOR_SHOPIFY_STAGING",
    stages: project.stages.map((stage) => stage.name === "SHOPIFY_STAGING_HANDOFF"
      ? { name: stage.name, status: "PENDING" }
      : stage),
    shopifyStaging: { ...staging, status: "ROLLED_BACK", rollbackAvailable: false, rolledBackAt },
    completedAt: undefined,
    updatedAt: rolledBackAt,
  };
  await state.storage.put(PROJECT_KEY, updated);
  return json({ status: "rolled-back", build: BUILD, project: updated, safeguards: safeguards() });
}

export function createShopifyClient(env) {
  const shop = String(env.SHOPIFY_STORE_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "");
  const version = String(env.SHOPIFY_ADMIN_API_VERSION || API_VERSION);
  if (!shop || !token) throw stagingError("shopify_credentials_unavailable", "Shopify staging credentials are unavailable.", 503);
  const endpoint = `https://${shop}/admin/api/${version}/graphql.json`;

  async function execute(query, variables) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw stagingError("shopify_http_failed", `Shopify returned HTTP ${response.status}.`, 502);
    if (payload?.errors?.length) throw stagingError("shopify_graphql_failed", payload.errors.map((item) => item.message).join("; "), 502);
    return payload?.data || {};
  }
  return { query: execute, mutate: execute };
}

function assertStagingEligible(project) {
  if (project.status !== "APPROVED_FOR_SHOPIFY_STAGING") throw stagingError("staging_not_approved", "Project is not approved for Shopify staging.", 409);
  if (project.governance?.liveShopifyMutationAuthorized !== false) throw stagingError("live_mutation_guard_failed", "Live Shopify mutation authorization must remain false.", 409);
  const handoff = project.stages.find((stage) => stage.name === "SHOPIFY_STAGING_HANDOFF");
  if (!handoff || handoff.status !== "PENDING") throw stagingError("handoff_not_pending", "Shopify staging handoff is not pending.", 409);
}

function assertDraftMetadata(metadata) {
  if (metadata.status !== "DRAFT") throw stagingError("metadata_not_draft", "Shopify metadata status must be DRAFT.", 409);
  if (metadata.liveMutationAuthorized !== false) throw stagingError("metadata_live_mutation_guard_failed", "Product metadata cannot authorize live mutation.", 409);
  if (!metadata.title || !metadata.handle || !metadata.descriptionHtml) throw stagingError("metadata_incomplete", "Shopify product metadata is incomplete.", 409);
}

function toProductInput(metadata, id) {
  return {
    ...(id ? { id } : {}),
    title: metadata.title,
    handle: metadata.handle,
    descriptionHtml: metadata.descriptionHtml,
    vendor: metadata.vendor || "Mindset Media Group",
    productType: metadata.productType || "Digital Product",
    status: "DRAFT",
    tags: metadata.tags || [],
    seo: { title: metadata.seoTitle, description: metadata.metaDescription },
  };
}

function selectRenderedPrimaryImage(project) {
  const artifact = project.artifacts.find((item) => item.kind === "STOREFRONT_PRIMARY_IMAGE");
  if (!artifact) throw stagingError("rendered_primary_image_missing", "Rendered 2048×3072 primary product image is required before Shopify staging.", 409);
  if (artifact.width !== 2048 || artifact.height !== 3072) throw stagingError("rendered_primary_image_dimensions_invalid", "Primary product image must be 2048×3072.", 409);
  if (!artifact.signedStagingUrl) throw stagingError("rendered_primary_image_url_missing", "Rendered primary image requires a signed staging URL.", 409);
  if (!/^[a-f0-9]{64}$/i.test(artifact.sha256 || "")) throw stagingError("rendered_primary_image_checksum_invalid", "Rendered primary image checksum is invalid.", 409);
  return artifact;
}

function buildCoverMedia(primaryImage, metadata) {
  return [{ originalSource: primaryImage.signedStagingUrl, mediaContentType: "IMAGE", alt: `${metadata.title} cover` }];
}

function snapshotRollback(product) {
  return {
    action: "RESTORE_DRAFT_SNAPSHOT",
    productId: product.id,
    input: {
      id: product.id,
      title: product.title,
      handle: product.handle,
      descriptionHtml: product.descriptionHtml,
      vendor: product.vendor,
      productType: product.productType,
      status: "DRAFT",
      tags: product.tags || [],
      seo: product.seo || {},
    },
  };
}

function assertNoUserErrors(errors, code) {
  if (errors?.length) throw stagingError(code, errors.map((item) => item.message).join("; "), 422);
}

function safeguards() {
  return {
    productStatus: "DRAFT",
    publicationMutationExecuted: false,
    salesChannelPublicationBlocked: true,
    liveShopifyMutationAuthorized: false,
    renderedPrimaryImageRequired: true,
    croppingAllowed: false,
    redrawingAllowed: false,
    rollbackPersisted: true,
  };
}

function stagingError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function jsonError(code, message, status) {
  return json({ status: "failed", build: BUILD, error: { code, message }, safeguards: safeguards() }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Shopify-Staging": BUILD } });
}

function decode(value) {
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(value));
  return String(value || "");
}

const PRODUCT_SNAPSHOT_QUERY = `query KairosStagedProduct($id: ID!) { product(id: $id) { id title handle descriptionHtml vendor productType status tags seo { title description } } }`;
const PRODUCT_CREATE_MUTATION = `mutation KairosCreateDraftProduct($input: ProductInput!, $media: [CreateMediaInput!]) { productCreate(input: $input, media: $media) { product { id title handle status } userErrors { field message } } }`;
const PRODUCT_UPDATE_MUTATION = `mutation KairosUpdateDraftProduct($input: ProductInput!, $media: [CreateMediaInput!]) { productUpdate(input: $input, media: $media) { product { id title handle status } userErrors { field message } } }`;
const PRODUCT_DELETE_MUTATION = `mutation KairosDeleteDraftProduct($input: ProductDeleteInput!) { productDelete(input: $input) { deletedProductId userErrors { field message } } }`;
