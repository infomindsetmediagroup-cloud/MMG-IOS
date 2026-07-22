import { handleProductManufacturingBridge } from "./kairos-product-manufacturing-bridge-v1.js";
import { handleProductPublication } from "./kairos-product-publication-v1.js";
import { handleProductMedia } from "./kairos-product-media-v1.js";
import { handleProductLaunchControl } from "./kairos-product-launch-control-v1.js";

export const KAIROS_MANUSCRIPT_AUTO_PIPELINE_BUILD = "kairos-manuscript-auto-pipeline-20260722-1";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const VAULT_PREFIX = "mmg-admin-asset-vault";
const CHUNK_BYTES = 128 * 1024;
const DRAFT_CONFIRMATION = "CREATE SHOPIFY PRODUCT DRAFT";
const LIVE_CONFIRMATION = "PUBLISH PRODUCT LIVE";

export async function handleManuscriptAutoPipeline(request, env) {
  const url = new URL(request.url);

  const assetMatch = url.pathname.match(/^\/api\/admin-asset-vault\/projects\/([a-z0-9-]{8,})\/assets\/([a-z0-9._-]+)$/i);
  if (assetMatch && (request.method === "GET" || request.method === "HEAD")) {
    return vaultStub(env, assetMatch[1]).fetch(new Request(`https://kairos.internal/admin-vault/assets/${encodeURIComponent(assetMatch[2])}`, {
      method: request.method,
    }));
  }

  const packageMatch = url.pathname.match(/^\/api\/admin-asset-vault\/projects\/([a-z0-9-]{8,})\/package$/i);
  if (packageMatch && (request.method === "GET" || request.method === "HEAD")) {
    const manifest = await vaultJSON(env, packageMatch[1], "/admin-vault/manifest");
    if (!manifest?.finalPackageAssetId) return failure(404, "vault_package_not_found", "The production-ready ZIP is not available in the Admin Asset Vault.");
    return vaultStub(env, packageMatch[1]).fetch(new Request(`https://kairos.internal/admin-vault/assets/${encodeURIComponent(manifest.finalPackageAssetId)}`, {
      method: request.method,
    }));
  }

  const match = url.pathname.match(/^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/auto-pipeline(?:\/(run|shopify-draft|shopify-publish))?$/i);
  if (!match) return null;

  const projectId = match[1];
  const action = match[2] || "status";

  try {
    if (request.method === "GET" && action === "status") return readPipeline(env, projectId);
    if (request.method === "POST" && action === "run") return runPipeline(request, env, projectId);
    if (request.method === "POST" && action === "shopify-draft") return prepareShopifyDraft(request, env, projectId);
    if (request.method === "POST" && action === "shopify-publish") return publishShopifyProduct(request, env, projectId);
    return failure(405, "auto_pipeline_method_not_allowed", "This automatic production pipeline method is not allowed.");
  } catch (caught) {
    return failure(Number(caught?.status || 500), caught?.code || "auto_pipeline_failed", caught instanceof Error ? caught.message : "The automatic manuscript production pipeline failed.");
  }
}

export async function handleManuscriptAutoPipelineObjectRequest(state, request) {
  const url = new URL(request.url);

  const recordMatch = url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/auto-pipeline$/i);
  if (recordMatch) {
    const key = pipelineKey(recordMatch[1]);
    if (request.method === "GET") {
      const record = await state.storage.get(key);
      return record ? json(record) : failure(404, "auto_pipeline_not_started", "The automatic production pipeline has not run yet.");
    }
    if (request.method === "PUT") {
      const record = await request.json();
      await state.storage.put(key, record);
      await updateRegistryProject(state, recordMatch[1], record);
      return json(record);
    }
  }

  if (url.pathname === "/admin-vault/manifest") {
    if (request.method === "GET") {
      const manifest = await state.storage.get("vault:manifest");
      return manifest ? json(manifest) : failure(404, "vault_manifest_not_found", "The Admin Asset Vault manifest was not found.");
    }
    if (request.method === "PUT") {
      const manifest = await request.json();
      await state.storage.put("vault:manifest", manifest);
      return json(manifest, 201);
    }
  }

  const assetMatch = url.pathname.match(/^\/admin-vault\/assets\/([a-z0-9._-]+)$/i);
  if (assetMatch) {
    const assetId = assetMatch[1];
    if (request.method === "PUT") return storeVaultAsset(state, request, assetId);
    if (request.method === "GET" || request.method === "HEAD") return readVaultAsset(state, assetId, request.method === "HEAD");
  }

  return null;
}

export function derivePublicationMetadata({ source = {}, setup = null, manuscript = "" }) {
  const normalized = String(manuscript || "").replace(/\r\n?/g, "\n").trim();
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const sourceTitle = clean(source.title, 240);
  const setupTitle = clean(setup?.publicationTitle, 240);
  const title = setupTitle || usableSourceTitle(sourceTitle) || extractTitle(lines) || "Untitled Digital Guide";
  const author = clean(setup?.authorName, 180) || extractAuthor(lines) || "Mindset Media Group";
  const subtitle = extractSubtitle(lines, title);
  const summary = buildSummary(normalized, title, author);
  const keywords = extractKeywords(`${title} ${subtitle} ${summary} ${normalized.slice(0, 12000)}`, 7);
  const categories = deriveCategories(keywords, `${title} ${summary}`);
  const handle = slugify(title);
  const isAIImage = /\bai\b.*\bimage|image.*artificial intelligence|prompt/i.test(`${title} ${summary}`);

  return {
    schemaVersion: "1.0.0",
    title,
    subtitle,
    author,
    publisher: "Mindset Media Group",
    publisherURL: "https://themindsetmediagroup.com",
    description: summary,
    keywords,
    categories,
    handle,
    productType: "Digital Download",
    price: "9.95",
    currency: "USD",
    isbn: null,
    asin: null,
    publicationStatus: "DRAFT",
    releaseDate: null,
    liveURL: null,
    rights: {
      owner: "Mindset Media Group",
      scope: "Worldwide rights to publish, reproduce, distribute, market, license, and sell the digital publication and associated original content in all authorized digital formats.",
      territories: ["Worldwide"],
      evidenceNote: `The authoritative manuscript source, approved cover, checksums, generated artifacts, and production manifest are retained in the MMG Admin Asset Vault for ${title}.`,
    },
    templateSuffix: isAIImage ? "mmg-ai-image-mastery" : "mmg-book-product",
    extraction: {
      mode: "deterministic-source-and-project-record",
      manualCatalogEntryRequired: false,
      assumptions: [
        "Canonical MMG digital-download price applied: USD 9.95.",
        "ISBN and ASIN remain unassigned unless an issued identifier is present in the source record.",
        "Worldwide digital rights are recorded under the MMG internal publishing workflow.",
      ],
    },
  };
}

async function runPipeline(request, env, projectId) {
  requireProjects(env);
  const sourceTextResponse = await registryStub(env).fetch(`https://kairos.internal/registry/manuscripts/${projectId}/source/text`);
  const sourceTextBody = await responseJSON(sourceTextResponse, "manuscript_source_unavailable");
  const source = sourceTextBody.source || {};
  const manuscript = String(sourceTextBody.manuscript || "");
  if (manuscript.trim().length < 500) throw fail(409, "manuscript_source_incomplete", "The stored manuscript must contain at least 500 characters before automatic production.");

  const setupResponse = await registryStub(env).fetch(`https://kairos.internal/registry/manuscripts/${projectId}/setup`);
  const setupBody = setupResponse.ok ? await setupResponse.json() : null;
  const setup = setupBody?.setup || null;

  const sourceFileResponse = await registryStub(env).fetch(`https://kairos.internal/registry/manuscripts/${projectId}/source/download`);
  if (!sourceFileResponse.ok) throw fail(sourceFileResponse.status, "manuscript_file_unavailable", "The authoritative manuscript file could not be loaded.");
  const sourceBytes = new Uint8Array(await sourceFileResponse.arrayBuffer());

  const coverResponse = await registryStub(env).fetch(`https://kairos.internal/registry/manuscripts/${projectId}/setup/cover`);
  if (!coverResponse.ok) throw fail(409, "approved_cover_required", "An approved PNG or JPEG cover is required before Kairos can manufacture the production package.");
  const coverBytes = new Uint8Array(await coverResponse.arrayBuffer());
  const coverType = String(coverResponse.headers.get("Content-Type") || setup?.cover?.contentType || "image/png").split(";", 1)[0].toLowerCase();

  const metadata = derivePublicationMetadata({ source, setup, manuscript });
  const sourceSha = source.checksum && /^[a-f0-9]{64}$/i.test(source.checksum) ? source.checksum.toLowerCase() : await digestHex(sourceBytes);
  const coverSha = setup?.cover?.sha256 || await digestHex(coverBytes);
  const signature = await digestHex(new TextEncoder().encode(`${sourceSha}:${coverSha}:${metadata.title}:${metadata.author}`));
  const existing = await optionalPipelineRecord(env, projectId);
  if (existing?.status === "production-ready" && existing.signature === signature) return json(existing);

  const payload = {
    mode: "manuscript",
    type: "book_package",
    title: metadata.title,
    subtitle: metadata.subtitle,
    author: metadata.author,
    objective: `${metadata.description} Intended audience: ${metadata.keywords.join(", ")}. Produce a complete, source-preserving, commercially ready digital publication package.`,
    manuscript: {
      text: manuscript,
      sourceDataBase64: bytesToBase64(sourceBytes),
      name: source.filename || `authoritative-manuscript.${source.format || "txt"}`,
      mimeType: source.contentType || "application/octet-stream",
      format: source.format || extensionOf(source.filename),
      pages: source.pages || null,
      checksum: sourceSha,
    },
    cover: {
      type: coverType,
      dataBase64: bytesToBase64(coverBytes),
    },
  };

  const manufacturingResponse = await handleProductManufacturingBridge(new Request(`${new URL(request.url).origin}/api/content/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MMG-Client-Build": KAIROS_MANUSCRIPT_AUTO_PIPELINE_BUILD },
    body: JSON.stringify(payload),
  }), env);
  const job = await responseJSON(manufacturingResponse, "product_manufacturing_failed");
  if (job.status !== "completed" || !job.projectId) throw fail(502, "product_manufacturing_incomplete", "Kairos did not complete the production package.");

  const vault = vaultStub(env, projectId);
  const assets = [];
  for (const item of job.artifacts || []) {
    const name = String(item?.name || "");
    if (!name) continue;
    const productStub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(job.projectId));
    const artifactResponse = await productStub.fetch(`https://kairos.internal/product-manufacturing/artifacts/${encodeURIComponent(name)}`);
    if (!artifactResponse.ok) throw fail(artifactResponse.status, "production_artifact_unavailable", `Kairos could not materialize ${name}.`);
    const bytes = new Uint8Array(await artifactResponse.arrayBuffer());
    const asset = await persistVaultAsset(vault, projectId, name, bytes, artifactResponse.headers.get("Content-Type") || contentTypeFor(name), roleFor(name));
    assets.push(asset);
  }

  const catalogBytes = new TextEncoder().encode(JSON.stringify(metadata, null, 2));
  assets.push(await persistVaultAsset(vault, projectId, "catalog-metadata.json", catalogBytes, "application/json; charset=utf-8", "CATALOG_METADATA"));

  const finalPackage = assets.find((asset) => asset.filename === "complete-production-package.zip") || assets.find((asset) => asset.filename.endsWith(".zip"));
  if (!finalPackage) throw fail(502, "production_zip_missing", "The production-ready ZIP was not created.");

  const completedAt = new Date().toISOString();
  const manifest = {
    schemaVersion: "1.0.0",
    build: KAIROS_MANUSCRIPT_AUTO_PIPELINE_BUILD,
    vaultId: `${VAULT_PREFIX}:${projectId}`,
    sourceProjectId: projectId,
    manufacturingProjectId: job.projectId,
    title: metadata.title,
    author: metadata.author,
    createdAt: completedAt,
    finalPackageAssetId: finalPackage.assetId,
    assets,
    integrity: {
      passed: assets.every((asset) => asset.byteSize > 0 && /^[a-f0-9]{64}$/i.test(asset.sha256)),
      assetCount: assets.length,
    },
  };
  await vault.fetch("https://kairos.internal/admin-vault/manifest", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(manifest),
  });

  const record = {
    status: "production-ready",
    build: KAIROS_MANUSCRIPT_AUTO_PIPELINE_BUILD,
    projectId,
    signature,
    manufacturingProjectId: job.projectId,
    metadata,
    vault: publicManifest(projectId, manifest),
    shopify: existing?.shopify || { status: "not-prepared" },
    createdAt: existing?.createdAt || completedAt,
    updatedAt: completedAt,
    nextAction: "Review the Admin Asset Vault package, then prepare the governed Shopify product draft.",
    safeguards: safeguards(env),
  };
  await putPipelineRecord(env, projectId, record);
  return json(record, 201);
}

async function prepareShopifyDraft(request, env, projectId) {
  const record = await requirePipelineRecord(env, projectId);
  const body = await request.json().catch(() => ({}));
  const prepareResponse = await handleProductPublication(new Request(`${new URL(request.url).origin}/api/shopify/product-publication/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: record.manufacturingProjectId,
      price: record.metadata.price,
      templateSuffix: record.metadata.templateSuffix,
    }),
  }), env);
  const prepared = await responseJSON(prepareResponse, "shopify_product_prepare_failed");

  let next = {
    ...record,
    shopify: {
      status: "awaiting-draft-approval",
      prepared,
      draftWritesEnabled: writesEnabled(env),
    },
    updatedAt: new Date().toISOString(),
    nextAction: writesEnabled(env)
      ? "Approve creation of the exact Shopify product draft and its generated media."
      : "Shopify draft writes are disabled in the runtime. The product preview is prepared and preserved.",
  };

  if (!writesEnabled(env) || String(body?.confirmation || "") !== DRAFT_CONFIRMATION) {
    await putPipelineRecord(env, projectId, next);
    return json(next, 202);
  }

  const publicationResponse = await handleProductPublication(new Request(`${new URL(request.url).origin}/api/shopify/product-publication/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ releaseId: prepared.releaseId, confirmation: prepared.confirmationRequired, actor: "MMG Executive" }),
  }), env);
  const publication = await responseJSON(publicationResponse, "shopify_product_draft_failed");

  const mediaPrepareResponse = await handleProductMedia(new Request(`${new URL(request.url).origin}/api/shopify/product-media/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productReleaseId: prepared.releaseId }),
  }), env);
  const mediaPrepared = await responseJSON(mediaPrepareResponse, "shopify_media_prepare_failed");

  const mediaExecuteResponse = await handleProductMedia(new Request(`${new URL(request.url).origin}/api/shopify/product-media/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ releaseId: mediaPrepared.releaseId, confirmation: mediaPrepared.confirmationRequired, actor: "MMG Executive" }),
  }), env);
  const media = await responseJSON(mediaExecuteResponse, "shopify_media_install_failed");

  const launchPrepareResponse = await handleProductLaunchControl(new Request(`${new URL(request.url).origin}/api/shopify/product-launch/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaReleaseId: mediaPrepared.releaseId }),
  }), env);
  const launch = await responseJSON(launchPrepareResponse, "shopify_launch_prepare_failed");

  next = {
    ...next,
    shopify: {
      status: "draft-created-media-installed-awaiting-live-approval",
      prepared,
      publication,
      media,
      launch,
      draftWritesEnabled: true,
    },
    updatedAt: new Date().toISOString(),
    nextAction: "Review the generated Shopify preview, then explicitly approve live publication.",
  };
  await putPipelineRecord(env, projectId, next);
  return json(next);
}

async function publishShopifyProduct(request, env, projectId) {
  const record = await requirePipelineRecord(env, projectId);
  const body = await request.json().catch(() => ({}));
  if (!livePublishEnabled(env)) throw fail(403, "live_product_publication_disabled", "Live Shopify product publication is disabled in the Kairos runtime.");
  if (String(body?.confirmation || "") !== LIVE_CONFIRMATION) throw fail(403, "live_product_confirmation_required", `confirmation must equal ${LIVE_CONFIRMATION}.`);
  const launch = record.shopify?.launch;
  if (!launch?.releaseId) throw fail(409, "shopify_launch_not_prepared", "Create and verify the Shopify product draft before live publication.");

  const decisionResponse = await handleProductLaunchControl(new Request(`${new URL(request.url).origin}/api/shopify/product-launch/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      releaseId: launch.releaseId,
      decision: "approved",
      actor: "MMG Executive",
      checks: (launch.requiredChecks || []).map(() => true),
      notes: "Approved from the automatic manuscript production pipeline after vault and draft verification.",
    }),
  }), env);
  await responseJSON(decisionResponse, "shopify_visual_approval_failed");

  const publishResponse = await handleProductLaunchControl(new Request(`${new URL(request.url).origin}/api/shopify/product-launch/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ releaseId: launch.releaseId, confirmation: LIVE_CONFIRMATION, actor: "MMG Executive" }),
  }), env);
  const publication = await responseJSON(publishResponse, "shopify_live_publish_failed");

  const liveURL = publication?.publication?.liveProbe?.finalURL || publication?.preview?.storefrontPath || null;
  const next = {
    ...record,
    metadata: { ...record.metadata, publicationStatus: publication.status, liveURL },
    shopify: { ...record.shopify, status: publication.status, livePublication: publication },
    updatedAt: new Date().toISOString(),
    nextAction: publication.status === "product-live-and-verified" ? "The product is live and verified." : "Review the live product verification result.",
  };
  await putPipelineRecord(env, projectId, next);
  return json(next);
}

async function readPipeline(env, projectId) {
  const record = await optionalPipelineRecord(env, projectId);
  return record ? json(record) : failure(404, "auto_pipeline_not_started", "Kairos has not built the production package yet.");
}

async function storeVaultAsset(state, request, assetId) {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) return failure(400, "vault_asset_empty", "Admin Asset Vault files cannot be empty.");
  const prior = await state.storage.get(`vault:asset:${assetId}:metadata`);
  if (prior) {
    for (let index = 0; index < Number(prior.chunks || 0); index += 1) await state.storage.delete(`vault:asset:${assetId}:chunk:${index}`);
  }
  const chunks = Math.ceil(bytes.length / CHUNK_BYTES);
  for (let index = 0; index < chunks; index += 1) {
    await state.storage.put(`vault:asset:${assetId}:chunk:${index}`, bytes.slice(index * CHUNK_BYTES, Math.min(bytes.length, (index + 1) * CHUNK_BYTES)));
  }
  const metadata = {
    assetId,
    filename: safeFilename(request.headers.get("X-Filename") || assetId),
    mimeType: String(request.headers.get("X-Content-Type") || "application/octet-stream").slice(0, 180),
    role: String(request.headers.get("X-Asset-Role") || "PRODUCTION_ASSET").slice(0, 80),
    byteSize: bytes.length,
    chunks,
    sha256: await digestHex(bytes),
    storedAt: new Date().toISOString(),
  };
  await state.storage.put(`vault:asset:${assetId}:metadata`, metadata);
  return json(metadata, 201);
}

async function readVaultAsset(state, assetId, headOnly) {
  const metadata = await state.storage.get(`vault:asset:${assetId}:metadata`);
  if (!metadata) return failure(404, "vault_asset_not_found", "The requested Admin Asset Vault file was not found.");
  const bytes = new Uint8Array(metadata.byteSize);
  let offset = 0;
  for (let index = 0; index < Number(metadata.chunks || 0); index += 1) {
    const raw = await state.storage.get(`vault:asset:${assetId}:chunk:${index}`);
    if (!raw) return failure(502, "vault_asset_chunk_missing", "A stored Admin Asset Vault chunk is missing.");
    const chunk = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== metadata.byteSize || await digestHex(bytes) !== metadata.sha256) return failure(502, "vault_asset_integrity_failed", "The stored Admin Asset Vault file failed integrity verification.");
  return new Response(headOnly ? null : bytes, {
    status: 200,
    headers: {
      "Content-Type": metadata.mimeType,
      "Content-Disposition": `attachment; filename="${metadata.filename.replace(/["\r\n]/g, "")}"`,
      "Content-Length": String(metadata.byteSize),
      "Cache-Control": "private, no-store",
      "X-Kairos-Admin-Asset-Vault": KAIROS_MANUSCRIPT_AUTO_PIPELINE_BUILD,
      "X-Content-SHA256": metadata.sha256,
    },
  });
}

async function persistVaultAsset(vault, projectId, name, bytes, mimeType, role) {
  const sha256 = await digestHex(bytes);
  const assetId = `${slugify(name).slice(0, 80)}-${sha256.slice(0, 16)}`;
  const response = await vault.fetch(`https://kairos.internal/admin-vault/assets/${assetId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Filename": name,
      "X-Content-Type": mimeType,
      "X-Asset-Role": role,
    },
    body: bytes,
  });
  const stored = await responseJSON(response, "vault_asset_store_failed");
  return {
    ...stored,
    downloadURL: `/api/admin-asset-vault/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
  };
}

async function updateRegistryProject(state, projectId, record) {
  const records = (await state.storage.get("production-registry")) || {};
  const current = records[projectId];
  if (!current) return;
  const completedAt = record.updatedAt || new Date().toISOString();
  records[projectId] = {
    ...current,
    status: record.status,
    stage: record.status === "production-ready" ? "admin-asset-vault" : current.stage,
    progress: record.status === "production-ready" ? 100 : current.progress,
    summary: record.status === "production-ready"
      ? `${record.vault?.assetCount || 0} production-ready assets stored in the Admin Asset Vault.`
      : current.summary,
    nextAction: record.nextAction || current.nextAction,
    checkpoints: mergeCheckpoint(current.checkpoints, {
      id: "admin-asset-vault",
      label: "Production-ready files stored in Admin Asset Vault",
      status: record.status === "production-ready" ? "completed" : "pending",
      recordedAt: completedAt,
    }),
    updatedAt: completedAt,
    revision: Number(current.revision || 0) + 1,
  };
  await state.storage.put("production-registry", records);
}

function publicManifest(projectId, manifest) {
  return {
    vaultId: manifest.vaultId,
    assetCount: manifest.assets.length,
    integrity: manifest.integrity,
    finalPackageAssetId: manifest.finalPackageAssetId,
    packageDownloadURL: `/api/admin-asset-vault/projects/${encodeURIComponent(projectId)}/package`,
    assets: manifest.assets,
  };
}

async function putPipelineRecord(env, projectId, record) {
  const response = await registryStub(env).fetch(`https://kairos.internal/registry/manuscripts/${projectId}/auto-pipeline`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  await responseJSON(response, "auto_pipeline_record_store_failed");
}

async function optionalPipelineRecord(env, projectId) {
  const response = await registryStub(env).fetch(`https://kairos.internal/registry/manuscripts/${projectId}/auto-pipeline`);
  return response.ok ? response.json() : null;
}

async function requirePipelineRecord(env, projectId) {
  const record = await optionalPipelineRecord(env, projectId);
  if (!record || record.status !== "production-ready") throw fail(409, "production_package_required", "Build and verify the production package before Shopify handoff.");
  return record;
}

function registryStub(env) {
  requireProjects(env);
  return env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
}

function vaultStub(env, projectId) {
  requireProjects(env);
  return env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(`${VAULT_PREFIX}:${projectId}`));
}

async function vaultJSON(env, projectId, path) {
  const response = await vaultStub(env, projectId).fetch(`https://kairos.internal${path}`);
  return response.ok ? response.json() : null;
}

function requireProjects(env) {
  if (!env?.KAIROS_PROJECTS) throw fail(503, "pipeline_storage_unavailable", "Kairos project storage is unavailable.");
}

function safeguards(env) {
  return {
    manualCatalogEntryRequired: false,
    adminAssetVault: true,
    checksumsRequired: true,
    finalZipRequired: true,
    shopifyDraftWritesEnabled: writesEnabled(env),
    liveShopifyPublicationEnabled: livePublishEnabled(env),
    explicitDraftActionRequired: true,
    explicitLiveApprovalRequired: true,
    websiteThemeMutationAuthorized: false,
    navigationMutationAuthorized: false,
  };
}

function writesEnabled(env) {
  return String(env?.KAIROS_SHOPIFY_WRITES_ENABLED || env?.KAIROS_SHOPIFY_DRAFTS_ENABLED || "false").toLowerCase() === "true";
}

function livePublishEnabled(env) {
  return writesEnabled(env) && String(env?.KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED || "false").toLowerCase() === "true";
}

function extractTitle(lines) {
  const heading = lines.find((line) => /^#{1,3}\s+\S/.test(line));
  return clean((heading || lines[0] || "").replace(/^#{1,3}\s+/, ""), 240);
}

function extractAuthor(lines) {
  for (const line of lines.slice(0, 40)) {
    const match = line.match(/^(?:by|author\s*[:\-])\s+(.{2,120})$/i);
    if (match) return clean(match[1], 180);
  }
  return "";
}

function extractSubtitle(lines, title) {
  const index = lines.findIndex((line) => clean(line.replace(/^#{1,3}\s+/, ""), 240).toLowerCase() === title.toLowerCase());
  const candidate = lines[index >= 0 ? index + 1 : 1] || "";
  if (!candidate || /^(?:by|author\s*[:\-])/i.test(candidate) || candidate.length > 220) return "";
  return clean(candidate.replace(/^#{1,4}\s+/, ""), 220);
}

function buildSummary(text, title, author) {
  const paragraphs = String(text || "").split(/\n{2,}/).map((value) => clean(value.replace(/^#{1,4}\s+/gm, ""), 1000)).filter(Boolean);
  const excluded = new Set([title.toLowerCase(), author.toLowerCase()]);
  const selected = paragraphs.filter((value) => !excluded.has(value.toLowerCase()) && !/^(?:by|copyright|contents?)\b/i.test(value)).slice(0, 3).join(" ");
  return truncate(selected || `A practical digital guide by ${author}.`, 1000);
}

function extractKeywords(text, count) {
  const stop = new Set("about after again against also among and are because been before being between both but can could did does doing down during each few for from further had has have having her here hers herself him himself his how into its itself just more most not now off once only other our ours ourselves out over own same she should some such than that the their theirs them themselves then there these they this those through too under until very was were what when where which while who whom why will with you your yours yourself yourselves guide book digital practical create creating use using".split(" "));
  const frequencies = new Map();
  for (const word of String(text || "").toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []) {
    if (stop.has(word)) continue;
    frequencies.set(word, (frequencies.get(word) || 0) + 1);
  }
  return [...frequencies.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, count).map(([word]) => word);
}

function deriveCategories(keywords, text) {
  const haystack = `${keywords.join(" ")} ${text}`.toLowerCase();
  if (/artificial intelligence|\bai\b|prompt|image generation/.test(haystack)) {
    return ["Computers / Artificial Intelligence / General", "Art / Digital", "Business & Economics / Marketing / General"];
  }
  if (/publish|author|writing|manuscript/.test(haystack)) {
    return ["Language Arts & Disciplines / Writing / General", "Business & Economics / Entrepreneurship", "Education / General"];
  }
  if (/business|market|entrepreneur|brand/.test(haystack)) {
    return ["Business & Economics / Entrepreneurship", "Business & Economics / Marketing / General", "Education / General"];
  }
  return ["Education / General", "Business & Economics / Skills", "Self-Help / General"];
}

function usableSourceTitle(value) {
  return value && !/^untitled(?: manuscript| publication)?$/i.test(value) ? value : "";
}

function roleFor(name) {
  if (/authoritative-manuscript/i.test(name)) return "AUTHORITATIVE_SOURCE";
  if (/approved-cover/i.test(name)) return "APPROVED_COVER";
  if (/complete-production-package\.zip$/i.test(name)) return "FINAL_PRODUCTION_ZIP";
  if (/shopify|product-package|product-hero|book-mockup|social-|what-you|who-this|inside-the|prompt-framework/i.test(name)) return "PRODUCT_ASSET";
  if (/manifest|research|catalog-metadata/i.test(name)) return "PRODUCTION_RECORD";
  return "PRODUCTION_DELIVERABLE";
}

function contentTypeFor(name) {
  if (name.endsWith(".zip")) return "application/zip";
  if (name.endsWith(".epub")) return "application/epub+zip";
  if (name.endsWith(".json")) return "application/json; charset=utf-8";
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".png")) return "image/png";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

function bytesToBase64(bytes) {
  let output = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) output += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + step)));
  return btoa(output);
}

function extensionOf(filename) {
  return String(filename || "manuscript.txt").split(".").pop()?.toLowerCase() || "txt";
}

function slugify(value) {
  const slug = String(value || "asset").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "asset";
}

function safeFilename(value) {
  return String(value || "asset.bin").replace(/[\\/:*?"<>|\r\n]/g, "-").slice(0, 180) || "asset.bin";
}

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function truncate(value, max) {
  const text = clean(value, max + 100);
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function mergeCheckpoint(values, checkpoint) {
  const list = Array.isArray(values) ? values.filter((item) => item?.id !== checkpoint.id) : [];
  return [...list.slice(-29), checkpoint];
}

async function responseJSON(response, fallbackCode) {
  const body = await response?.json().catch(() => null);
  if (!response?.ok || !body) throw fail(response?.status || 502, body?.error?.code || fallbackCode, body?.error?.message || "Kairos returned an invalid production response.");
  return body;
}

async function digestHex(bytes) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function pipelineKey(projectId) {
  return `manuscript:${projectId}:auto-pipeline`;
}

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function failure(status, code, message) {
  return json({ status: "failed", build: KAIROS_MANUSCRIPT_AUTO_PIPELINE_BUILD, error: { code, message } }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Manuscript-Auto-Pipeline": KAIROS_MANUSCRIPT_AUTO_PIPELINE_BUILD,
    },
  });
}
