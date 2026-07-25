export const KAIROS_PASTED_MANUSCRIPT_SOURCE_BUILD = "kairos-pasted-manuscript-source-20260725-1";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const CHUNK_BYTES = 96 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

export async function handlePastedManuscriptSource(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/source-text$/i);
  if (!match) return null;
  if (request.method !== "POST") return json({ status: "failed", error: { code: "pasted_source_method_not_allowed", message: "This pasted-source method is not allowed." } }, 405);
  if (!env?.KAIROS_PROJECTS) return json({ status: "failed", error: { code: "pasted_source_storage_unavailable", message: "Kairos project storage is unavailable." } }, 503);
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
  return stub.fetch(new Request(`https://kairos.internal/registry/manuscripts/${match[1]}/source-text`, request));
}

export async function handlePastedManuscriptSourceObjectRequest(state, request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/source-text$/i);
  if (!match) return null;
  if (request.method !== "POST") return json({ status: "failed", error: { code: "pasted_source_method_not_allowed", message: "This pasted-source method is not allowed." } }, 405);
  try {
    const body = await request.json();
    return storePastedSource(state, match[1], body);
  } catch (error) {
    return json({ status: "failed", build: KAIROS_PASTED_MANUSCRIPT_SOURCE_BUILD, error: { code: error?.code || "pasted_source_failed", message: error?.message || "Pasted manuscript source storage failed." } }, Number(error?.status || 500));
  }
}

async function storePastedSource(state, projectId, body) {
  const manuscript = String(body?.manuscript || "").trim();
  const title = String(body?.title || "Untitled manuscript").trim().slice(0, 240);
  const filename = safeFilename(body?.filename || "manuscript.txt");
  const bytes = new TextEncoder().encode(manuscript);
  if (manuscript.length < 50) throw fail(400, "pasted_source_incomplete", "Provide at least 50 characters of manuscript text.");
  if (bytes.length > MAX_TEXT_BYTES) throw fail(413, "pasted_source_too_large", "The pasted manuscript exceeds the durable recovery limit.");

  const previous = await state.storage.get(metadataKey(projectId));
  await removeChunks(state, filePrefix(projectId), Number(previous?.fileChunks || 0));
  await removeChunks(state, textPrefix(projectId), Number(previous?.textChunks || 0));
  const fileChunks = await putChunks(state, filePrefix(projectId), bytes);
  const textChunks = await putChunks(state, textPrefix(projectId), bytes);
  const now = new Date().toISOString();
  const checksum = await digestHex(bytes);
  const metadata = {
    projectId,
    title,
    filename,
    contentType: "text/plain; charset=utf-8",
    format: "txt",
    size: bytes.length,
    pages: null,
    checksum,
    fileChunks,
    textChunks,
    textBytes: bytes.length,
    wordCount: (manuscript.match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length,
    storedAt: now,
    updatedAt: now,
    sourceDownloadURL: `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source/download`,
    extractedTextURL: `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source/text`,
    build: KAIROS_PASTED_MANUSCRIPT_SOURCE_BUILD,
  };
  await state.storage.put(metadataKey(projectId), metadata);
  await upsertRegistryRecord(state, metadata);
  return json({ status: "stored-and-verified", build: KAIROS_PASTED_MANUSCRIPT_SOURCE_BUILD, source: publicMetadata(metadata) }, 201);
}

async function upsertRegistryRecord(state, metadata) {
  const records = (await state.storage.get("production-registry")) || {};
  const current = records[metadata.projectId] || null;
  const checkpoints = Array.isArray(current?.checkpoints) ? current.checkpoints.filter(item => item?.id !== "durable-source") : [];
  records[metadata.projectId] = {
    ...(current || {}),
    projectId: metadata.projectId,
    projectType: "manuscript-studio",
    title: metadata.title,
    status: current?.status || "source-stored",
    stage: current?.stage || "source-intake",
    progress: Math.max(Number(current?.progress || 0), 10),
    activeWorkspace: "manuscript-studio",
    sourceProjectId: current?.sourceProjectId || null,
    sourceReleaseId: current?.sourceReleaseId || null,
    summary: "Original pasted manuscript text is stored in the Kairos project runtime.",
    nextAction: current?.nextAction || "Continue to production intake.",
    checkpoints: [...checkpoints.slice(-29), { id: "durable-source", label: "Original manuscript source stored", status: "completed", recordedAt: metadata.storedAt }],
    createdAt: current?.createdAt || metadata.storedAt,
    updatedAt: metadata.updatedAt,
    revision: Number(current?.revision || 0) + 1,
    ownerScope: "mmg-executive",
    externalInferenceAPI: false,
    sourceStored: true,
    source: publicMetadata(metadata),
  };
  await state.storage.put("production-registry", records);
}

async function putChunks(state, prefix, bytes) {
  const count = Math.ceil(bytes.length / CHUNK_BYTES);
  for (let index = 0; index < count; index += 1) await state.storage.put(`${prefix}${index}`, bytes.slice(index * CHUNK_BYTES, Math.min(bytes.length, (index + 1) * CHUNK_BYTES)));
  return count;
}
async function removeChunks(state, prefix, count) { for (let index = 0; index < count; index += 1) await state.storage.delete(`${prefix}${index}`); }
async function digestHex(bytes) { const digest = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function publicMetadata(metadata) { const { fileChunks, textChunks, ...value } = metadata; return value; }
function safeFilename(value) { return String(value || "manuscript.txt").replace(/[\\/:*?"<>|\r\n]/g, "-").slice(0, 180) || "manuscript.txt"; }
function metadataKey(id) { return `manuscript:${id}:metadata`; }
function filePrefix(id) { return `manuscript:${id}:file:`; }
function textPrefix(id) { return `manuscript:${id}:text:`; }
function fail(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Pasted-Manuscript-Source": KAIROS_PASTED_MANUSCRIPT_SOURCE_BUILD } }); }
