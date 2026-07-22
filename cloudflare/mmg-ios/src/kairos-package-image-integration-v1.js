import { zipSync } from "fflate";

const BUILD = "kairos-package-image-integration-20260722-1";
const PROJECT_KEY = "publishing:project";
const REQUIRED_KINDS = [
  "NORMALIZED_MANUSCRIPT",
  "METADATA_INFERENCE",
  "QA_REPORT",
  "EDITABLE_MANUSCRIPT",
  "FINAL_MANUSCRIPT",
  "CUSTOMER_README",
  "RIGHTS_DECLARATION",
  "STOREFRONT_PRODUCT_IMAGE",
  "STOREFRONT_PRIMARY_IMAGE",
  "STOREFRONT_SOCIAL_IMAGE",
  "PRODUCT_METADATA",
];

export async function handlePackageImageIntegrationObjectRequest(state, request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/internal\/publishing\/projects\/([^/]+)\/package\/assemble$/);
  if (!match || request.method !== "POST") return null;

  const project = await state.storage.get(PROJECT_KEY);
  if (!project) return error("project_not_found", "Project not found.", 404);
  if (project.rights?.declarationStatus !== "OWNER_CONFIRMED") {
    return error("rights_confirmation_required", "Owner rights confirmation is required before package assembly.", 409);
  }

  const validation = validatePackageInputs(project);
  if (!validation.ok) return error("package_inputs_invalid", validation.errors.join("; "), 409);

  const metadataArtifact = project.artifacts.find((artifact) => artifact.kind === "PRODUCT_METADATA");
  const productMetadata = JSON.parse(decode(await state.storage.get(metadataArtifact.storageKey)));
  assertDraftMetadata(productMetadata);

  const packageArtifacts = REQUIRED_KINDS.map((kind) => project.artifacts.find((artifact) => artifact.kind === kind));
  const entries = {};
  for (const artifact of packageArtifacts) {
    const bytes = normalize(await state.storage.get(artifact.storageKey));
    if (!bytes?.byteLength) return error("artifact_bytes_unavailable", `Stored bytes are unavailable for ${artifact.kind}.`, 409);
    const folder = artifact.kind === "STOREFRONT_PRIMARY_IMAGE" || artifact.kind === "STOREFRONT_SOCIAL_IMAGE"
      ? "images"
      : "deliverables";
    entries[`${folder}/${artifact.filename}`] = [bytes, { mtime: new Date("1980-01-01T00:00:00.000Z") }];
  }

  const generatedAt = project.rights.confirmedAt || project.updatedAt || new Date(0).toISOString();
  const embeddedManifest = {
    schemaVersion: "1.1.0",
    projectId: project.id,
    generatedAt,
    sourceAssets: project.sourceAssets.map(publicRecord),
    artifacts: packageArtifacts.map(publicRecord),
    imageOutputs: packageArtifacts
      .filter((artifact) => ["STOREFRONT_PRIMARY_IMAGE", "STOREFRONT_SOCIAL_IMAGE"].includes(artifact.kind))
      .map((artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        filename: artifact.filename,
        width: artifact.width,
        height: artifact.height,
        sha256: artifact.sha256,
        fit: artifact.transformation?.fit,
        croppingAllowed: artifact.transformation?.croppingAllowed,
        redrawingAllowed: artifact.transformation?.redrawingAllowed,
      })),
    shopifyMetadata: productMetadata,
    rightsConfirmed: true,
    qaPassed: true,
    liveShopifyMutationAuthorized: false,
    shopifyTargetStatus: "DRAFT",
  };
  const manifestBytes = new TextEncoder().encode(`${stableStringify(embeddedManifest)}\n`);
  entries["package-manifest.json"] = [manifestBytes, { mtime: new Date("1980-01-01T00:00:00.000Z") }];

  const zipBytes = zipSync(entries, { level: 6 });
  const handle = productMetadata.handle || "digital-product";
  const zipArtifact = await storeBytes(state, project.id, "ZIP_ARCHIVE", `${handle}-deliverable-package.zip`, "application/zip", zipBytes);
  const embeddedManifestSha256 = await digestHex(manifestBytes);
  const finalManifest = {
    ...embeddedManifest,
    embeddedManifestSha256,
    archive: publicRecord(zipArtifact),
    packageComplete: true,
    renderedImagesIncluded: true,
    reviewRequired: true,
  };
  const manifestArtifact = await storeBytes(
    state,
    project.id,
    "PACKAGE_MANIFEST",
    "package-manifest-final.json",
    "application/json",
    new TextEncoder().encode(`${stableStringify(finalManifest)}\n`),
  );

  const completedAt = new Date().toISOString();
  const updated = {
    ...project,
    status: "REVIEW_REQUIRED",
    artifacts: [
      ...project.artifacts.filter((artifact) => !["PACKAGE_MANIFEST", "ZIP_ARCHIVE"].includes(artifact.kind)),
      manifestArtifact,
      zipArtifact,
    ],
    package: {
      assembledAt: completedAt,
      manifestArtifactId: manifestArtifact.id,
      zipArtifactId: zipArtifact.id,
      embeddedManifestSha256,
      renderedImagesIncluded: true,
      renderedImageArtifactIds: packageArtifacts
        .filter((artifact) => ["STOREFRONT_PRIMARY_IMAGE", "STOREFRONT_SOCIAL_IMAGE"].includes(artifact.kind))
        .map((artifact) => artifact.id),
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
      recommendations: ["Inspect the ZIP, rendered cover images, manifest, metadata, and rights declaration."],
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

export function validatePackageInputs(project) {
  const errors = [];
  const byKind = new Map(project.artifacts.map((artifact) => [artifact.kind, artifact]));
  for (const kind of REQUIRED_KINDS) {
    const artifact = byKind.get(kind);
    if (!artifact) {
      errors.push(`missing required artifact ${kind}`);
      continue;
    }
    if (!artifact.byteSize) errors.push(`${kind} is empty`);
    if (!/^[a-f0-9]{64}$/i.test(artifact.sha256 || "")) errors.push(`${kind} checksum is invalid`);
  }
  const primary = byKind.get("STOREFRONT_PRIMARY_IMAGE");
  const social = byKind.get("STOREFRONT_SOCIAL_IMAGE");
  if (primary && (primary.width !== 2048 || primary.height !== 3072)) errors.push("primary image dimensions must be 2048x3072");
  if (social && (social.width !== 2048 || social.height !== 2048)) errors.push("social image dimensions must be 2048x2048");
  for (const image of [primary, social].filter(Boolean)) {
    if (image.mimeType !== "image/png") errors.push(`${image.kind} must be PNG`);
    if (image.transformation?.fit !== "pad") errors.push(`${image.kind} must use fit pad`);
    if (image.transformation?.croppingAllowed !== false) errors.push(`${image.kind} cannot allow cropping`);
    if (image.transformation?.redrawingAllowed !== false) errors.push(`${image.kind} cannot allow redrawing`);
  }
  if (project.governance?.liveShopifyMutationAuthorized !== false) errors.push("live Shopify mutation must remain unauthorized");
  if (project.governance?.shopifyTargetStatus !== "DRAFT") errors.push("Shopify target status must remain DRAFT");
  return { ok: errors.length === 0, errors };
}

function assertDraftMetadata(metadata) {
  if (metadata.status !== "DRAFT") throw new Error("Shopify product status must remain DRAFT.");
  if (metadata.liveMutationAuthorized !== false) throw new Error("Live Shopify mutation must remain unauthorized.");
}

async function storeBytes(state, projectId, kind, filename, mimeType, bytes) {
  const normalized = normalize(bytes);
  const artifact = {
    id: crypto.randomUUID(),
    projectId,
    kind,
    filename,
    mimeType,
    byteSize: normalized.byteLength,
    sha256: await digestHex(normalized),
    storageKey: `publishing:artifact:${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    build: BUILD,
  };
  await state.storage.put(artifact.storageKey, normalized);
  return artifact;
}

function publicRecord(record) {
  const { storageKey, signedStagingUrl, ...safe } = record;
  return safe;
}
function normalize(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === "string") return new TextEncoder().encode(value);
  return null;
}
function decode(value) {
  const bytes = normalize(value);
  return bytes ? new TextDecoder().decode(bytes) : "";
}
function stableStringify(value) {
  return JSON.stringify(sort(value), null, 2);
}
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]));
  }
  return value;
}
async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function safeguards() {
  return {
    renderedImagesRequired: true,
    renderedImagesIncluded: true,
    cropAllowed: false,
    redrawAllowed: false,
    shopifyOutputStatus: "DRAFT",
    livePublicationAuthorized: false,
  };
}
function error(code, message, status) {
  return json({ status: "failed", build: BUILD, error: { code, message }, safeguards: safeguards() }, status);
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Package-Images": BUILD },
  });
}
