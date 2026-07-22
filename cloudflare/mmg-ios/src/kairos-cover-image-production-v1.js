const BUILD = "kairos-cover-image-production-20260722-1";
const PROJECT_KEY = "publishing:project";
const MAX_IMAGES_BINDING_BYTES = 20 * 1024 * 1024;
const RENDER_CONFIRMATION = "APPROVE_NO_CROP_NO_REDRAW_RENDER";
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

const OUTPUTS = [
  {
    kind: "STOREFRONT_PRIMARY_IMAGE",
    role: "PRIMARY_PRODUCT_IMAGE",
    filenameSuffix: "product-2048x3072.png",
    width: 2048,
    height: 3072,
  },
  {
    kind: "STOREFRONT_SOCIAL_IMAGE",
    role: "SOCIAL_SQUARE",
    filenameSuffix: "social-2048x2048.png",
    width: 2048,
    height: 2048,
  },
];

export async function handleCoverImageProduction(request, env) {
  const url = new URL(request.url);
  const mediaMatch = url.pathname.match(/^\/api\/kairos\/media\/([^/]+)\/([^/]+)$/);
  if (mediaMatch && request.method === "GET") {
    return serveSignedMedia(request, env, decodeURIComponent(mediaMatch[1]), decodeURIComponent(mediaMatch[2]));
  }

  const renderMatch = url.pathname.match(/^\/api\/kairos\/projects\/([^/]+)\/cover\/render$/);
  if (!renderMatch || request.method !== "POST") return null;

  const authFailure = authorize(request, env);
  if (authFailure) return authFailure;
  if (!env.KAIROS_PROJECTS) return error("publishing_storage_unavailable", "KAIROS_PROJECTS binding is unavailable.", 503);

  const projectId = decodeURIComponent(renderMatch[1]);
  const target = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(`publishing:${projectId}`));
  const internal = new Request(new URL(`/internal/publishing/projects/${encodeURIComponent(projectId)}/cover/render`, request.url), {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("Content-Type") || "application/json",
      "X-Kairos-Public-Origin": url.origin,
    },
    body: request.body,
  });
  return target.fetch(internal);
}

export async function handleCoverImageProductionObjectRequest(state, request, env = {}) {
  const url = new URL(request.url);
  const renderMatch = url.pathname.match(/^\/internal\/publishing\/projects\/([^/]+)\/cover\/render$/);
  if (renderMatch && request.method === "POST") {
    return renderCoverDerivatives(state, request, env);
  }

  const mediaMatch = url.pathname.match(/^\/internal\/publishing\/projects\/([^/]+)\/media\/([^/]+)$/);
  if (mediaMatch && request.method === "GET") {
    return readStoredMedia(state, decodeURIComponent(mediaMatch[2]));
  }
  return null;
}

export async function renderCoverDerivatives(state, request, env = {}) {
  const project = await state.storage.get(PROJECT_KEY);
  if (!project) return error("project_not_found", "Project not found.", 404);
  if (!env.IMAGES || typeof env.IMAGES.input !== "function" || typeof env.IMAGES.info !== "function") {
    return error("images_binding_unavailable", "Cloudflare Images binding is unavailable.", 503);
  }
  const signingSecret = String(env.KAIROS_MEDIA_SIGNING_SECRET || "").trim();
  if (!signingSecret) return error("media_signing_secret_unavailable", "KAIROS_MEDIA_SIGNING_SECRET is unavailable.", 503);

  const payload = await request.json().catch(() => ({}));
  if (payload.confirmation !== RENDER_CONFIRMATION) {
    return error("render_approval_required", `confirmation must equal ${RENDER_CONFIRMATION}.`, 409);
  }
  if (payload.croppingAllowed === true || payload.redrawingAllowed === true) {
    return error("cover_policy_violation", "Cropping and redrawing are prohibited.", 409);
  }

  const cover = project.sourceAssets.find((asset) => asset.role === "COVER_SOURCE");
  if (!cover) return error("cover_source_missing", "Cover source is required.", 409);
  if (cover.byteSize > MAX_IMAGES_BINDING_BYTES) {
    return error("cover_too_large_for_rendering", "Cover source exceeds the 20 MB Images binding input limit.", 413);
  }
  const source = normalizeBytes(await state.storage.get(cover.storageKey));
  if (!source?.byteLength) return error("cover_source_unavailable", "Cover source bytes are unavailable.", 409);

  let info;
  try {
    info = await env.IMAGES.info(streamFromBytes(source));
  } catch (caught) {
    return error("cover_decode_failed", caught instanceof Error ? caught.message : "Cover image could not be decoded.", 422);
  }
  if (!info?.width || !info?.height) return error("cover_dimensions_unavailable", "Cover dimensions could not be determined.", 422);

  const background = normalizeBackground(payload.background || "#ffffff");
  const generatedAt = new Date().toISOString();
  const ttlSeconds = clampTTL(payload.ttlSeconds);
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const publicOrigin = String(request.headers.get("X-Kairos-Public-Origin") || env.MMG_STOREFRONT_ORIGIN || "").replace(/\/$/, "");
  if (!/^https:\/\//.test(publicOrigin)) return error("public_origin_invalid", "A secure public origin is required.", 503);

  const handle = slugify(project.metadata?.title || project.metadata?.workingTitle || "digital-product");
  const artifacts = [];
  for (const output of OUTPUTS) {
    const response = (
      await env.IMAGES.input(streamFromBytes(source))
        .transform({ width: output.width, height: output.height, fit: "pad", background })
        .output({ format: "image/png", anim: false })
    ).response();
    if (!response.ok) return error("cover_render_failed", `Images binding returned HTTP ${response.status}.`, 502);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength) return error("cover_render_empty", `${output.role} render was empty.`, 502);
    const artifact = await storeImageArtifact(state, project.id, output, `${handle}-${output.filenameSuffix}`, bytes, {
      sourceAssetId: cover.id,
      sourceSha256: cover.sha256,
      sourceWidth: info.width,
      sourceHeight: info.height,
      fit: "pad",
      background,
      croppingAllowed: false,
      redrawingAllowed: false,
      generatedAt,
    });
    const signature = await signMedia(signingSecret, project.id, artifact.id, expires);
    artifact.signedStagingUrl = `${publicOrigin}/api/kairos/media/${encodeURIComponent(project.id)}/${encodeURIComponent(artifact.id)}?expires=${expires}&sig=${signature}`;
    artifact.signedUrlExpiresAt = new Date(expires * 1000).toISOString();
    artifacts.push(artifact);
  }

  const updated = {
    ...project,
    artifacts: [
      ...project.artifacts.filter((artifact) => !OUTPUTS.some((output) => output.kind === artifact.kind)),
      ...artifacts,
    ],
    coverProduction: {
      status: "COMPLETED",
      build: BUILD,
      approvedAt: generatedAt,
      generatedAt,
      sourceAssetId: cover.id,
      sourceSha256: cover.sha256,
      sourceDimensions: { width: info.width, height: info.height },
      policy: { fit: "pad", croppingAllowed: false, redrawingAllowed: false, background },
      artifactIds: artifacts.map((artifact) => artifact.id),
    },
    updatedAt: generatedAt,
  };
  await state.storage.put(PROJECT_KEY, updated);
  return json({ status: "completed", build: BUILD, project: updated, artifacts: artifacts.map(publicArtifact), safeguards: safeguards() });
}

async function serveSignedMedia(request, env, projectId, artifactId) {
  if (!env.KAIROS_PROJECTS) return error("publishing_storage_unavailable", "KAIROS_PROJECTS binding is unavailable.", 503);
  const secret = String(env.KAIROS_MEDIA_SIGNING_SECRET || "").trim();
  if (!secret) return error("media_signing_secret_unavailable", "Media signing is unavailable.", 503);
  const url = new URL(request.url);
  const expires = Number(url.searchParams.get("expires"));
  const signature = String(url.searchParams.get("sig") || "");
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return error("media_url_expired", "Media URL has expired.", 403);
  const expected = await signMedia(secret, projectId, artifactId, expires);
  if (!timingSafeEqual(signature, expected)) return error("media_signature_invalid", "Media signature is invalid.", 403);
  const target = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(`publishing:${projectId}`));
  return target.fetch(new Request(new URL(`/internal/publishing/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(artifactId)}`, request.url), { method: "GET" }));
}

async function readStoredMedia(state, artifactId) {
  const project = await state.storage.get(PROJECT_KEY);
  if (!project) return error("project_not_found", "Project not found.", 404);
  const artifact = project.artifacts.find((item) => item.id === artifactId && OUTPUTS.some((output) => output.kind === item.kind));
  if (!artifact) return error("media_not_found", "Rendered media artifact not found.", 404);
  const bytes = normalizeBytes(await state.storage.get(artifact.storageKey));
  if (!bytes?.byteLength) return error("media_unavailable", "Rendered media bytes are unavailable.", 404);
  const checksum = await digestHex(bytes);
  if (checksum !== artifact.sha256) return error("media_checksum_failed", "Rendered media checksum verification failed.", 500);
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": artifact.mimeType,
      "Content-Length": String(bytes.byteLength),
      "ETag": `\"${artifact.sha256}\"`,
      "Cache-Control": "private, max-age=300, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Kairos-Media-Sha256": artifact.sha256,
    },
  });
}

async function storeImageArtifact(state, projectId, output, filename, bytes, metadata) {
  const id = crypto.randomUUID();
  const storageKey = `publishing:artifact:${id}`;
  const artifact = {
    id,
    projectId,
    kind: output.kind,
    role: output.role,
    filename,
    mimeType: "image/png",
    byteSize: bytes.byteLength,
    sha256: await digestHex(bytes),
    storageKey,
    width: output.width,
    height: output.height,
    createdAt: metadata.generatedAt,
    build: BUILD,
    transformation: metadata,
  };
  await state.storage.put(storageKey, bytes);
  return artifact;
}

async function signMedia(secret, projectId, artifactId, expires) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const value = `${projectId}:${artifactId}:${expires}`;
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64url(new Uint8Array(signature));
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

function streamFromBytes(bytes) {
  return new Blob([bytes]).stream();
}
function normalizeBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}
function normalizeBackground(value) {
  const color = String(value || "#ffffff").trim().toLowerCase();
  if (!/^#[a-f0-9]{6}$/.test(color)) throw new Error("background must be a six-digit hex color");
  return color;
}
function clampTTL(value) {
  const seconds = Number(value || DEFAULT_TTL_SECONDS);
  return Math.max(900, Math.min(30 * 24 * 60 * 60, Number.isFinite(seconds) ? Math.floor(seconds) : DEFAULT_TTL_SECONDS));
}
function slugify(value) {
  return String(value || "digital-product").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "digital-product";
}
function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function publicArtifact(artifact) {
  const { storageKey, ...safe } = artifact;
  return safe;
}
function safeguards() {
  return { croppingAllowed: false, redrawingAllowed: false, fit: "pad", liveShopifyMutationAuthorized: false, shopifyTargetStatus: "DRAFT" };
}
function authorize(request, env) {
  const required = String(env.KAIROS_API_TOKEN || "").trim();
  if (!required) return null;
  return request.headers.get("Authorization") === `Bearer ${required}` ? null : error("unauthorized", "Valid Kairos bearer authorization is required.", 401);
}
function error(code, message, status) {
  return json({ status: "failed", build: BUILD, error: { code, message }, safeguards: safeguards() }, status);
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Cover-Production": BUILD } });
}
