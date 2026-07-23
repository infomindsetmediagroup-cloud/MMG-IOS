export const KAIROS_LOCAL_INFERENCE_BUILD = "kairos-local-inference-20260723-1";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const CHUNK_BYTES = 96 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const CONFIRMATION = "STORE LOCAL INFERENCE";

export async function handleLocalInference(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/local-inference$/i);
  if (!match) return null;
  if (!env?.KAIROS_PROJECTS) return json({ status: "failed", error: { code: "local_inference_storage_unavailable", message: "Kairos project storage is unavailable." } }, 503);
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
  return stub.fetch(new Request(`https://kairos.internal/registry/manuscripts/${match[1]}/local-inference`, request));
}

export async function handleLocalInferenceObjectRequest(state, request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/local-inference$/i);
  if (!match) return null;
  const projectId = match[1];

  try {
    if (request.method === "GET") return readRecord(state, projectId);
    if (request.method === "POST") return storeRecord(state, request, projectId);
    if (request.method === "DELETE") return restoreOriginal(state, projectId);
    return json({ status: "failed", error: { code: "local_inference_method_not_allowed", message: "This local inference method is not allowed." } }, 405);
  } catch (error) {
    return json({
      status: "failed",
      build: KAIROS_LOCAL_INFERENCE_BUILD,
      error: { code: error?.code || "local_inference_failed", message: error instanceof Error ? error.message : "Local inference storage failed." },
    }, Number(error?.status || 500));
  }
}

async function storeRecord(state, request, projectId) {
  const input = await request.json().catch(() => ({}));
  if (String(input?.confirmation || "") !== CONFIRMATION) throw fail(403, "local_inference_confirmation_required", `confirmation must equal ${CONFIRMATION}.`);
  const manuscript = normalizeText(input?.manuscript || "");
  const bytes = new TextEncoder().encode(manuscript);
  if (bytes.length < 500) throw fail(400, "local_inference_text_incomplete", "The locally generated manuscript must contain at least 500 bytes.");
  if (bytes.length > MAX_TEXT_BYTES) throw fail(413, "local_inference_text_too_large", "The locally generated manuscript exceeds the 2 MB project limit.");

  const metadataKey = `manuscript:${projectId}:metadata`;
  const metadata = await state.storage.get(metadataKey);
  if (!metadata) throw fail(409, "local_inference_source_required", "Store the authoritative manuscript source before local inference.");
  if (input?.sourceChecksum && metadata.checksum && String(input.sourceChecksum).toLowerCase() !== String(metadata.checksum).toLowerCase()) {
    throw fail(409, "local_inference_source_changed", "The authoritative manuscript changed after local inference began. Restart the production job.");
  }

  const backup = await state.storage.get(`manuscript:${projectId}:original-text:metadata`);
  if (!backup) await backupOriginalText(state, projectId, metadata);
  await removeChunks(state, `manuscript:${projectId}:text:`, Number(metadata.textChunks || 0));
  const textChunks = await putChunks(state, `manuscript:${projectId}:text:`, bytes);
  const sha256 = await digestHex(bytes);
  const now = new Date().toISOString();
  const localInference = {
    build: KAIROS_LOCAL_INFERENCE_BUILD,
    provider: "browser-webgpu",
    model: String(input?.model || "Kairos Local Model").slice(0, 180),
    sourceChecksum: metadata.checksum || null,
    outputSha256: sha256,
    wordCount: countWords(manuscript),
    characterCount: manuscript.length,
    generatedAt: now,
    noCost: true,
    externalPaidAPIUsed: false,
    cloudflareNeuronsUsed: 0,
  };
  await state.storage.put(metadataKey, {
    ...metadata,
    textChunks,
    textBytes: bytes.length,
    wordCount: localInference.wordCount,
    updatedAt: now,
    localInference,
  });
  await state.storage.put(`manuscript:${projectId}:local-inference`, localInference);
  return json({ status: "stored-and-verified", build: KAIROS_LOCAL_INFERENCE_BUILD, projectId, localInference }, 201);
}

async function readRecord(state, projectId) {
  const record = await state.storage.get(`manuscript:${projectId}:local-inference`);
  return record
    ? json({ status: "ready", build: KAIROS_LOCAL_INFERENCE_BUILD, projectId, localInference: record })
    : json({ status: "not-found", error: { code: "local_inference_not_found", message: "No locally inferred manuscript is stored for this project." } }, 404);
}

async function restoreOriginal(state, projectId) {
  const backupKey = `manuscript:${projectId}:original-text:metadata`;
  const backup = await state.storage.get(backupKey);
  const metadataKey = `manuscript:${projectId}:metadata`;
  const metadata = await state.storage.get(metadataKey);
  if (!backup || !metadata) throw fail(404, "local_inference_original_not_found", "The original extracted manuscript backup was not found.");
  await removeChunks(state, `manuscript:${projectId}:text:`, Number(metadata.textChunks || 0));
  const bytes = await getChunks(state, `manuscript:${projectId}:original-text:`, backup.chunks, backup.byteSize);
  const chunks = await putChunks(state, `manuscript:${projectId}:text:`, bytes);
  await state.storage.put(metadataKey, { ...metadata, textChunks: chunks, textBytes: bytes.length, wordCount: backup.wordCount, localInference: null, updatedAt: new Date().toISOString() });
  await state.storage.delete(`manuscript:${projectId}:local-inference`);
  return json({ status: "original-restored", build: KAIROS_LOCAL_INFERENCE_BUILD, projectId });
}

async function backupOriginalText(state, projectId, metadata) {
  const bytes = await getChunks(state, `manuscript:${projectId}:text:`, Number(metadata.textChunks || 0), Number(metadata.textBytes || 0));
  const chunks = await putChunks(state, `manuscript:${projectId}:original-text:`, bytes);
  await state.storage.put(`manuscript:${projectId}:original-text:metadata`, {
    chunks,
    byteSize: bytes.length,
    wordCount: Number(metadata.wordCount || countWords(new TextDecoder().decode(bytes))),
    sha256: await digestHex(bytes),
    backedUpAt: new Date().toISOString(),
  });
}

async function putChunks(state, prefix, bytes) {
  const count = Math.ceil(bytes.length / CHUNK_BYTES);
  for (let index = 0; index < count; index += 1) await state.storage.put(`${prefix}${index}`, bytes.slice(index * CHUNK_BYTES, Math.min(bytes.length, (index + 1) * CHUNK_BYTES)));
  return count;
}

async function getChunks(state, prefix, count, expectedLength) {
  const output = new Uint8Array(expectedLength);
  let offset = 0;
  for (let index = 0; index < Number(count || 0); index += 1) {
    const value = await state.storage.get(`${prefix}${index}`);
    if (!value) throw fail(502, "local_inference_chunk_missing", "A manuscript text chunk is missing.");
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    output.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== expectedLength) throw fail(502, "local_inference_length_mismatch", "The manuscript text failed integrity verification.");
  return output;
}

async function removeChunks(state, prefix, count) {
  for (let index = 0; index < Number(count || 0); index += 1) await state.storage.delete(`${prefix}${index}`);
}

function normalizeText(value) { return String(value || "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim(); }
function countWords(value) { return (String(value || "").match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length; }
async function digestHex(bytes) { const digest = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function fail(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Local-Inference": KAIROS_LOCAL_INFERENCE_BUILD } }); }
