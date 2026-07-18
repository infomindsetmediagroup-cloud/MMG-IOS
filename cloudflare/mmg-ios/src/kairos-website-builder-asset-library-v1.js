export const KAIROS_WEBSITE_BUILDER_ASSET_LIBRARY_BUILD = "kairos-website-builder-asset-library-20260717-1";

const ROOT = "/website-builder-assets";
const META_PREFIX = "builder-asset:meta:";
const CHUNK_PREFIX = "builder-asset:chunk:";
const CHUNK_BYTES = 64 * 1024;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_LIBRARY_BYTES = 40 * 1024 * 1024;
const MAX_ASSETS = 120;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a", "audio/m4a"]);

export async function handleWebsiteBuilderAssetObjectRequest(state, request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(ROOT)) return null;

  if (request.method === "GET" && url.pathname === ROOT) return listAssets(state);
  if (request.method === "POST" && url.pathname === ROOT) return createAsset(state, request);

  const contentMatch = url.pathname.match(/^\/website-builder-assets\/([a-f0-9-]+)\/content$/i);
  if (request.method === "GET" && contentMatch) return readAssetContent(state, contentMatch[1]);

  const assetMatch = url.pathname.match(/^\/website-builder-assets\/([a-f0-9-]+)$/i);
  if (request.method === "GET" && assetMatch) return readAsset(state, assetMatch[1]);
  if (request.method === "DELETE" && assetMatch) return deleteAsset(state, request, assetMatch[1]);

  return json({ status: "not-found", build: KAIROS_WEBSITE_BUILDER_ASSET_LIBRARY_BUILD }, 404);
}

async function listAssets(state) {
  const rows = await state.storage.list({ prefix: META_PREFIX });
  const assets = [...rows.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return json({
    status: "completed",
    build: KAIROS_WEBSITE_BUILDER_ASSET_LIBRARY_BUILD,
    assets: assets.map(publicAsset),
    usage: {
      assetCount: assets.length,
      bytes: assets.reduce((sum, asset) => sum + Number(asset.bytes || 0), 0),
      maxAssets: MAX_ASSETS,
      maxBytes: MAX_LIBRARY_BYTES,
    },
  });
}

async function createAsset(state, request) {
  const payload = await safeJSON(request);
  const name = clean(payload?.name, 180) || "Website asset";
  const alt = clean(payload?.alt, 400);
  const tags = normalizeTags(payload?.tags);
  const remoteURL = normalizeRemoteURL(payload?.remoteURL);
  const data = clean(payload?.dataBase64, 12_000_000).replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  const mimeType = clean(payload?.mimeType, 120).toLowerCase();
  const kind = normalizeKind(payload?.kind, mimeType);
  const typeSet = kind === "image" ? ALLOWED_IMAGE_TYPES : ALLOWED_AUDIO_TYPES;

  if (!remoteURL && !data) return failure(400, "asset_source_required", "Upload an image or audio file, or provide an approved HTTPS asset URL.");
  if (data && !typeSet.has(mimeType)) return failure(400, "asset_type_invalid", `Unsupported ${kind} type.`);

  const existing = [...(await state.storage.list({ prefix: META_PREFIX })).values()];
  if (existing.length >= MAX_ASSETS) return failure(409, "asset_library_full", "The Website Builder Asset Library reached its 120-asset limit.");

  let bytes = new Uint8Array();
  if (data) {
    try { bytes = decodeBase64(data); }
    catch { return failure(400, "asset_data_invalid", "The uploaded asset data could not be decoded."); }
    if (!bytes.length || bytes.length > MAX_ASSET_BYTES) return failure(413, "asset_size_invalid", "Each Website Builder asset must be between 1 byte and 8 MB.");
    const currentBytes = existing.reduce((sum, asset) => sum + Number(asset.bytes || 0), 0);
    if (currentBytes + bytes.length > MAX_LIBRARY_BYTES) return failure(413, "asset_library_size_limit", "The Website Builder Asset Library reached its 40 MB governed storage limit.");
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const chunks = bytes.length ? Math.ceil(bytes.length / CHUNK_BYTES) : 0;
  for (let index = 0; index < chunks; index += 1) {
    await state.storage.put(`${CHUNK_PREFIX}${id}:${index}`, bytes.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES));
  }

  const asset = {
    id,
    name,
    kind,
    mimeType: remoteURL ? clean(payload?.mimeType, 120).toLowerCase() : mimeType,
    alt,
    tags,
    remoteURL,
    bytes: bytes.length,
    chunks,
    createdAt: now,
    updatedAt: now,
    source: remoteURL ? "approved-remote-url" : "durable-object-upload",
  };
  await state.storage.put(`${META_PREFIX}${id}`, asset);
  return json({ status: "completed", build: KAIROS_WEBSITE_BUILDER_ASSET_LIBRARY_BUILD, asset: publicAsset(asset) }, 201);
}

async function readAsset(state, id) {
  const asset = await state.storage.get(`${META_PREFIX}${id}`);
  return asset
    ? json({ status: "completed", build: KAIROS_WEBSITE_BUILDER_ASSET_LIBRARY_BUILD, asset: publicAsset(asset) })
    : json({ status: "not-found", build: KAIROS_WEBSITE_BUILDER_ASSET_LIBRARY_BUILD }, 404);
}

async function readAssetContent(state, id) {
  const asset = await state.storage.get(`${META_PREFIX}${id}`);
  if (!asset) return json({ status: "not-found", build: KAIROS_WEBSITE_BUILDER_ASSET_LIBRARY_BUILD }, 404);
  if (asset.remoteURL) return Response.redirect(asset.remoteURL, 302);
  const chunks = [];
  for (let index = 0; index < Number(asset.chunks || 0); index += 1) {
    const chunk = await state.storage.get(`${CHUNK_PREFIX}${id}:${index}`);
    if (!(chunk instanceof Uint8Array)) return failure(409, "asset_chunk_missing", "The stored Website Builder asset is incomplete.");
    chunks.push(chunk);
  }
  const bytes = joinChunks(chunks, Number(asset.bytes || 0));
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-MMG-Asset-Library": KAIROS_WEBSITE_BUILDER_ASSET_LIBRARY_BUILD,
    },
  });
}

async function deleteAsset(state, request, id) {
  const payload = await safeJSON(request);
  if (payload?.confirmation !== "DELETE_KAIROS_WEBSITE_ASSET") return failure(403, "asset_delete_confirmation_required", "Confirm the governed Website Builder asset deletion.");
  const asset = await state.storage.get(`${META_PREFIX}${id}`);
  if (!asset) return json({ status: "not-found", build: KAIROS_WEBSITE_BUILDER_ASSET_LIBRARY_BUILD }, 404);
  const keys = [`${META_PREFIX}${id}`];
  for (let index = 0; index < Number(asset.chunks || 0); index += 1) keys.push(`${CHUNK_PREFIX}${id}:${index}`);
  await state.storage.delete(keys);
  return json({ status: "completed", build: KAIROS_WEBSITE_BUILDER_ASSET_LIBRARY_BUILD, deletedAssetID: id });
}

function publicAsset(asset) {
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType,
    alt: asset.alt,
    tags: asset.tags,
    remoteURL: asset.remoteURL || "",
    bytes: Number(asset.bytes || 0),
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    source: asset.source,
  };
}

function normalizeKind(value, mimeType) {
  const declared = clean(value, 20).toLowerCase();
  if (["image", "audio"].includes(declared)) return declared;
  return String(mimeType || "").startsWith("audio/") ? "audio" : "image";
}

function normalizeTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map(item => clean(item, 60).toLowerCase()).filter(Boolean))].slice(0, 16);
}

function normalizeRemoteURL(value) {
  const raw = clean(value, 2000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch { return ""; }
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function joinChunks(chunks, totalBytes) {
  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function clean(value, max) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
async function safeJSON(request) { try { return await request.json(); } catch { return {}; } }
function failure(status, code, message) { return json({ status: status >= 500 ? "failed" : "needs-attention", build: KAIROS_WEBSITE_BUILDER_ASSET_LIBRARY_BUILD, error: { code, message } }, status); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Asset-Library": KAIROS_WEBSITE_BUILDER_ASSET_LIBRARY_BUILD, "X-Content-Type-Options": "nosniff" } }); }
