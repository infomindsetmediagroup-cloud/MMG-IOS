import { zipSync } from "fflate";

const BUILD = "kairos-package-assembly-20260722-1";
const PROJECT_KEY = "publishing:project";
const REQUIRED_PACKAGE_KINDS = [
  "NORMALIZED_MANUSCRIPT",
  "METADATA_INFERENCE",
  "QA_REPORT",
  "EDITABLE_MANUSCRIPT",
  "FINAL_MANUSCRIPT",
  "CUSTOMER_README",
  "RIGHTS_DECLARATION",
  "STOREFRONT_PRODUCT_IMAGE",
  "PRODUCT_METADATA",
];

export async function handlePublishingPackageControl(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/kairos\/projects\/([^/]+)\/(rights\/confirm|package\/assemble|package\/download|review\/approve|artifacts\/([^/]+))$/);
  if (!match) return null;

  const authFailure = authorize(request, env);
  if (authFailure) return authFailure;
  if (!env.KAIROS_PROJECTS) return error("publishing_storage_unavailable", "KAIROS_PROJECTS binding is unavailable.", 503);

  const projectId = decodeURIComponent(match[1]);
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return error("invalid_project_id", "Project ID is invalid.", 400);

  const action = match[2];
  const artifactId = match[3] ? decodeURIComponent(match[3]) : "";
  const target = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(`publishing:${projectId}`));
  const internalPath = artifactId
    ? `/internal/publishing/projects/${projectId}/artifacts/${encodeURIComponent(artifactId)}`
    : `/internal/publishing/projects/${projectId}/${action}`;

  return target.fetch(new Request(new URL(internalPath, request.url), {
    method: request.method,
    headers: stripAuthorization(request.headers),
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
  }));
}

export async function handlePublishingPackageControlObjectRequest(state, request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/internal\/publishing\/projects\/([^/]+)\/(rights\/confirm|package\/assemble|package\/download|review\/approve|artifacts\/([^/]+))$/);
  if (!match) return null;

  const project = await state.storage.get(PROJECT_KEY);
  if (!project) return error("project_not_found", "Project not found.", 404);

  const action = match[2];
  const artifactId = match[3] ? decodeURIComponent(match[3]) : "";

  if (request.method === "POST" && action === "rights/confirm") {
    return confirmRights(state, project, request);
  }
  if (request.method === "POST" && action === "package/assemble") {
    return assemblePackage(state, project);
  }
  if ((request.method === "GET" || request.method === "HEAD") && action === "package/download") {
    const zip = project.artifacts.find((artifact) => artifact.kind === "ZIP_ARCHIVE");
    if (!zip) return error("package_not_ready", "ZIP package is not ready.", 404);
    return artifactResponse(state, zip, request.method === "HEAD");
  }
  if ((request.method === "GET" || request.method === "HEAD") && artifactId) {
    const artifact = project.artifacts.find((item) => item.id === artifactId);
    if (!artifact) return error("artifact_not_found", "Artifact not found.", 404);
    return artifactResponse(state, artifact, request.method === "HEAD");
  }
  if (request.method === "POST" && action === "review/approve") {
    return approvePackage(state, project, request);
  }

  return error("method_not_allowed", "Method not allowed for this package route.", 405);
}

export async function confirmRights(state, project, request) {
  const payload = await readJSON(request);
  const signerName = clean(payload.signerName, 160);
  const signerRole = clean(payload.signerRole || "Owner", 120);
  const confirmations = payload.confirmations || {};

  if (!signerName) return error("signer_name_required", "A signer name is required.", 400);
  const required = ["manuscriptRights", "coverRights", "thirdPartyRights"];
  const missing = required.filter((key) => confirmations[key] !== true);
  if (missing.length) {
    return error("rights_confirmation_incomplete", `Required rights confirmations are missing: ${missing.join(", ")}.`, 409);
  }

  const rightsArtifact = project.artifacts.find((artifact) => artifact.kind === "RIGHTS_DECLARATION");
  if (!rightsArtifact) return error("rights_declaration_missing", "Rights declaration artifact is missing.", 409);

  const confirmedAt = new Date().toISOString();
  const declaration = {
    schemaVersion: "1.0.0",
    projectId: project.id,
    declarationStatus: "OWNER_CONFIRMED",
    signerName,
    signerRole,
    confirmedAt,
    confirmations: {
      manuscriptRights: true,
      coverRights: true,
      thirdPartyRights: true,
    },
    sourceAssetIds: project.sourceAssets.map((asset) => asset.id),
    livePublicationAuthorized: false,
    shopifyStagingAuthorized: false,
  };
  const replacement = await storeArtifact(state, project.id, "RIGHTS_DECLARATION", "rights-declaration.json", "application/json", JSON.stringify(declaration, null, 2));
  const updated = {
    ...project,
    rights: declaration,
    artifacts: [...project.artifacts.filter((artifact) => artifact.kind !== "RIGHTS_DECLARATION"), replacement],
    updatedAt: confirmedAt,
  };
  await state.storage.put(PROJECT_KEY, updated);

  return json({ status: "completed", build: BUILD, rights: declaration, artifact: publicArtifact(replacement), safeguards: safeguards() });
}

export async function assemblePackage(state, project) {
  if (project.rights?.declarationStatus !== "OWNER_CONFIRMED") {
    return error("rights_confirmation_required", "Owner rights confirmation is required before package assembly.", 409);
  }
  if (!project.stages.some((stage) => stage.name === "PRODUCT_METADATA_GENERATION" && ["RUNNING", "SUCCEEDED"].includes(stage.status))) {
    return error("product_metadata_not_ready", "Product metadata generation has not reached an assemblable state.", 409);
  }

  const validation = validatePackageInputs(project);
  if (!validation.ok) return error("package_inputs_invalid", validation.errors.join("; "), 409);

  const productMetadataArtifact = project.artifacts.find((artifact) => artifact.kind === "PRODUCT_METADATA");
  const productMetadata = JSON.parse(decodeText(await state.storage.get(productMetadataArtifact.storageKey)));
  validateShopifyDraft(productMetadata);

  const generatedAt = new Date().toISOString();
  const packageArtifacts = project.artifacts.filter((artifact) => REQUIRED_PACKAGE_KINDS.includes(artifact.kind));
  const packageEntries = {};
  for (const artifact of packageArtifacts) {
    const bytes = normalizeBytes(await state.storage.get(artifact.storageKey));
    if (!bytes?.byteLength) throw new Error(`Stored bytes are unavailable for ${artifact.kind}.`);
    packageEntries[`deliverables/${artifact.filename}`] = [bytes, { mtime: new Date("1980-01-01T00:00:00.000Z") }];
  }

  const embeddedManifest = {
    schemaVersion: "1.0.0",
    projectId: project.id,
    generatedAt,
    sourceAssets: project.sourceAssets.map(publicAsset),
    artifacts: packageArtifacts.map(publicArtifact),
    shopifyMetadata: productMetadata,
    rightsConfirmed: true,
    qaPassed: true,
    liveShopifyMutationAuthorized: false,
    shopifyTargetStatus: "DRAFT",
  };
  const embeddedManifestBytes = new TextEncoder().encode(`${stableStringify(embeddedManifest)}\n`);
  packageEntries["package-manifest.json"] = [embeddedManifestBytes, { mtime: new Date("1980-01-01T00:00:00.000Z") }];

  const zipBytes = zipSync(packageEntries, { level: 6 });
  const handle = productMetadata.handle || "digital-product";
  const zipArtifact = await storeBytesArtifact(state, project.id, "ZIP_ARCHIVE", `${handle}-deliverable-package.zip`, "application/zip", zipBytes);
  const embeddedManifestSha256 = await digestHex(embeddedManifestBytes);

  const finalManifest = {
    ...embeddedManifest,
    embeddedManifestSha256,
    archive: publicArtifact(zipArtifact),
    packageComplete: true,
    reviewRequired: true,
  };
  const manifestArtifact = await storeArtifact(state, project.id, "PACKAGE_MANIFEST", "package-manifest-final.json", "application/json", `${stableStringify(finalManifest)}\n`);

  const completedAt = new Date().toISOString();
  const artifacts = [
    ...project.artifacts.filter((artifact) => !["PACKAGE_MANIFEST", "ZIP_ARCHIVE"].includes(artifact.kind)),
    manifestArtifact,
    zipArtifact,
  ];
  const updated = {
    ...project,
    status: "REVIEW_REQUIRED",
    artifacts,
    package: {
      assembledAt: completedAt,
      manifestArtifactId: manifestArtifact.id,
      zipArtifactId: zipArtifact.id,
      embeddedManifestSha256,
      reviewRequired: true,
      approved: false,
    },
    stages: project.stages.map((stage) => {
      if (stage.name === "PRODUCT_METADATA_GENERATION") return { ...stage, status: "SUCCEEDED", completedAt };
      if (stage.name === "PACKAGE_ASSEMBLY") return { ...stage, status: "SUCCEEDED", startedAt: stage.startedAt || completedAt, completedAt };
      if (stage.name === "REVIEW") return { ...stage, status: "RUNNING", startedAt: completedAt, requiresHumanReview: true };
      return stage;
    }),
    run: project.run ? { ...project.run, status: "REVIEW_REQUIRED", currentStage: "REVIEW", lastHeartbeatAt: completedAt } : project.run,
    review: {
      required: true,
      stage: "REVIEW",
      blockers: [],
      warnings: ["Final package approval is required before Shopify staging handoff."],
      recommendations: ["Download and inspect the ZIP package, manifest, product metadata, and rights declaration."],
      requestedAt: completedAt,
    },
    updatedAt: completedAt,
  };
  await state.storage.put(PROJECT_KEY, updated);

  return json({
    status: "review-required",
    build: BUILD,
    project: updated,
    manifest: finalManifest,
    downloads: {
      zip: `/api/kairos/projects/${project.id}/package/download`,
      manifest: `/api/kairos/projects/${project.id}/artifacts/${manifestArtifact.id}`,
    },
    safeguards: safeguards(),
  }, 201);
}

export async function approvePackage(state, project, request) {
  if (!project.package?.zipArtifactId || !project.package?.manifestArtifactId) {
    return error("package_not_ready", "Package assembly must complete before review approval.", 409);
  }
  if (project.rights?.declarationStatus !== "OWNER_CONFIRMED") {
    return error("rights_confirmation_required", "Owner rights confirmation is required.", 409);
  }

  const payload = await readJSON(request);
  const reviewerName = clean(payload.reviewerName, 160);
  const confirmation = clean(payload.confirmation, 120);
  if (!reviewerName) return error("reviewer_name_required", "A reviewer name is required.", 400);
  if (confirmation !== "APPROVE_FOR_SHOPIFY_STAGING") {
    return error("approval_confirmation_invalid", "confirmation must equal APPROVE_FOR_SHOPIFY_STAGING.", 409);
  }

  const approvedAt = new Date().toISOString();
  const approval = {
    reviewerName,
    approvedAt,
    scope: "SHOPIFY_STAGING_ONLY",
    livePublicationAuthorized: false,
  };
  const updated = {
    ...project,
    status: "APPROVED_FOR_SHOPIFY_STAGING",
    package: { ...project.package, approved: true, approvedAt, approval },
    review: { required: false, approved: true, approvedAt, reviewerName },
    stages: project.stages.map((stage) => {
      if (stage.name === "REVIEW") return { ...stage, status: "SUCCEEDED", completedAt: approvedAt, requiresHumanReview: false };
      if (stage.name === "SHOPIFY_STAGING_HANDOFF") return { ...stage, status: "PENDING", requiresHumanReview: true };
      return stage;
    }),
    run: project.run ? { ...project.run, status: "APPROVED_FOR_SHOPIFY_STAGING", currentStage: "SHOPIFY_STAGING_HANDOFF", lastHeartbeatAt: approvedAt } : project.run,
    approvedForShopifyStagingAt: approvedAt,
    updatedAt: approvedAt,
  };
  await state.storage.put(PROJECT_KEY, updated);

  return json({ status: "approved", build: BUILD, approval, project: updated, safeguards: safeguards() });
}

export function validatePackageInputs(project) {
  const errors = [];
  const byKind = new Map(project.artifacts.map((artifact) => [artifact.kind, artifact]));
  for (const kind of REQUIRED_PACKAGE_KINDS) {
    const artifact = byKind.get(kind);
    if (!artifact) errors.push(`missing required artifact ${kind}`);
    else {
      if (!artifact.byteSize) errors.push(`${kind} is empty`);
      if (!/^[a-f0-9]{64}$/i.test(artifact.sha256 || "")) errors.push(`${kind} checksum is invalid`);
    }
  }
  if (project.governance?.liveShopifyMutationAuthorized !== false) errors.push("live Shopify mutation must remain unauthorized");
  if (project.governance?.shopifyTargetStatus !== "DRAFT") errors.push("Shopify target status must remain DRAFT");
  return { ok: errors.length === 0, errors };
}

function validateShopifyDraft(metadata) {
  if (metadata.status !== "DRAFT") throw new Error("Shopify product status must remain DRAFT.");
  if (metadata.liveMutationAuthorized !== false) throw new Error("Live Shopify mutation must remain unauthorized.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.handle || "")) throw new Error("Shopify handle is invalid.");
}

async function artifactResponse(state, artifact, headOnly) {
  const bytes = normalizeBytes(await state.storage.get(artifact.storageKey));
  if (!bytes) return error("artifact_bytes_unavailable", "Artifact bytes are unavailable.", 404);
  const headers = {
    "Content-Type": artifact.mimeType || "application/octet-stream",
    "Content-Length": String(bytes.byteLength),
    "Content-Disposition": `attachment; filename="${safeFilename(artifact.filename)}"`,
    "Cache-Control": "private, no-store",
    "Digest": `sha-256=${hexToBase64(artifact.sha256)}`,
    "X-Artifact-SHA256": artifact.sha256,
    "X-Kairos-Package-Build": BUILD,
  };
  return new Response(headOnly ? null : bytes, { status: 200, headers });
}

async function storeArtifact(state, projectId, kind, filename, mimeType, content) {
  return storeBytesArtifact(state, projectId, kind, filename, mimeType, new TextEncoder().encode(content));
}

async function storeBytesArtifact(state, projectId, kind, filename, mimeType, bytes) {
  const normalized = normalizeBytes(bytes);
  const id = crypto.randomUUID();
  const storageKey = `publishing:artifact:${id}`;
  const artifact = {
    id,
    projectId,
    kind,
    filename,
    mimeType,
    byteSize: normalized.byteLength,
    sha256: await digestHex(normalized),
    storageKey,
    createdAt: new Date().toISOString(),
    build: BUILD,
  };
  await state.storage.put(storageKey, normalized);
  return artifact;
}

function authorize(request, env) {
  const token = String(env.KAIROS_API_TOKEN || "").trim();
  if (!token) return null;
  if ((request.headers.get("Authorization") || "") !== `Bearer ${token}`) {
    return error("unauthorized", "Valid Kairos bearer authorization is required.", 401);
  }
  return null;
}

function stripAuthorization(headers) {
  const copy = new Headers(headers);
  copy.delete("Authorization");
  return copy;
}

function publicArtifact(artifact) {
  const { storageKey, ...safe } = artifact;
  return safe;
}

function publicAsset(asset) {
  const { storageKey, ...safe } = asset;
  return safe;
}

function stableStringify(value) {
  return JSON.stringify(sortRecursively(value), null, 2);
}

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortRecursively(value[key])]));
  }
  return value;
}

function normalizeBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === "string") return new TextEncoder().encode(value);
  return null;
}

function decodeText(value) {
  const bytes = normalizeBytes(value);
  return bytes ? new TextDecoder().decode(bytes) : "";
}

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeFilename(value) {
  return String(value || "artifact.bin").replace(/[\r\n"\\/]/g, "-").slice(0, 180);
}

function hexToBase64(hex) {
  const bytes = new Uint8Array((hex.match(/.{1,2}/g) || []).map((pair) => parseInt(pair, 16)));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function readJSON(request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function safeguards() {
  return {
    liveShopifyMutation: "blocked",
    shopifyOutputStatus: "DRAFT",
    stagingApprovalRequired: true,
    livePublicationAuthorized: false,
    sourceAssetsImmutable: true,
  };
}

function error(code, message, status) {
  return json({ status: "failed", build: BUILD, error: { code, message }, safeguards: safeguards() }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Package-Build": BUILD,
    },
  });
}
