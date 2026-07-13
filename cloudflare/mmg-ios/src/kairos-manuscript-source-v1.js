const BUILD = "kairos-manuscript-source-20260713-1";
const FILE_CHUNK_BYTES = 96 * 1024;
const TEXT_CHUNK_BYTES = 96 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

export async function handleManuscriptSourceObjectRequest(state, request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/source(?:\/(download|text))?$/i);
  if (!match) return null;

  const projectId = match[1];
  const action = match[2] || "metadata";

  try {
    if (request.method === "POST" && action === "metadata") return storeSource(state, request, projectId);
    if (request.method === "GET" && action === "metadata") return readMetadata(state, projectId);
    if (request.method === "GET" && action === "download") return downloadSource(state, projectId);
    if (request.method === "GET" && action === "text") return readExtractedText(state, projectId);
    if (request.method === "DELETE" && action === "metadata") return deleteSource(state, projectId);
    return json({ status: "not-found", error: { code: "manuscript_source_route_not_found", message: "Manuscript source route not found." } }, 404);
  } catch (error) {
    return json({ status: "failed", build: BUILD, error: { code: error?.code || "manuscript_source_failed", message: error instanceof Error ? error.message : "Manuscript source storage failed." } }, Number(error?.status || 500));
  }
}

async function storeSource(state, request, projectId) {
  const form = await request.formData();
  const file = form.get("file");
  const extractedText = String(form.get("extractedText") || "");
  const title = String(form.get("title") || "Untitled Manuscript").trim().slice(0, 240);
  const format = String(form.get("format") || extensionOf(file?.name || "txt")).toLowerCase().slice(0, 16);
  const pages = finiteOrNull(form.get("pages"));
  const checksum = String(form.get("checksum") || "").trim().slice(0, 128);

  if (!(file instanceof File)) throw fail(400, "manuscript_file_required", "A manuscript source file is required.");
  if (!file.size) throw fail(400, "manuscript_file_empty", "The manuscript source file is empty.");
  if (file.size > MAX_FILE_BYTES) throw fail(413, "manuscript_file_too_large", "Manuscript source files must be 20 MB or smaller.");

  const textBytes = new TextEncoder().encode(extractedText);
  if (!textBytes.length) throw fail(400, "manuscript_text_required", "Extracted manuscript text is required for durable recovery.");
  if (textBytes.length > MAX_TEXT_BYTES) throw fail(413, "manuscript_text_too_large", "The extracted manuscript text exceeds the durable recovery limit.");

  await removeExistingChunks(state, projectId);

  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  const fileChunks = await putChunks(state, filePrefix(projectId), sourceBytes, FILE_CHUNK_BYTES);
  const textChunks = await putChunks(state, textPrefix(projectId), textBytes, TEXT_CHUNK_BYTES);
  const now = new Date().toISOString();
  const metadata = {
    projectId,
    title,
    filename: safeFilename(file.name || `manuscript.${format}`),
    contentType: String(file.type || mimeFor(format)),
    format,
    size: sourceBytes.length,
    pages,
    checksum,
    fileChunks,
    textChunks,
    textBytes: textBytes.length,
    wordCount: (extractedText.match(/\b[\w’'-]+\b/g) || []).length,
    storedAt: now,
    updatedAt: now,
    sourceDownloadURL: `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source/download`,
    extractedTextURL: `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source/text`,
    build: BUILD,
  };

  await state.storage.put(metadataKey(projectId), metadata);
  await upsertRegistryRecord(state, metadata);
  return json({ status: "stored-and-verified", build: BUILD, source: publicMetadata(metadata) }, 201);
}

async function readMetadata(state, projectId) {
  const metadata = await state.storage.get(metadataKey(projectId));
  return metadata
    ? json({ status: "ready", build: BUILD, source: publicMetadata(metadata) })
    : json({ status: "not-found", error: { code: "manuscript_source_not_found", message: "The durable manuscript source was not found." } }, 404);
}

async function downloadSource(state, projectId) {
  const metadata = await requireMetadata(state, projectId);
  const bytes = await getChunks(state, filePrefix(projectId), metadata.fileChunks, metadata.size);
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${metadata.filename.replace(/[\"\r\n]/g, "")}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Kairos-Manuscript-Source": BUILD,
    },
  });
}

async function readExtractedText(state, projectId) {
  const metadata = await requireMetadata(state, projectId);
  const bytes = await getChunks(state, textPrefix(projectId), metadata.textChunks, metadata.textBytes);
  const text = new TextDecoder().decode(bytes);
  return json({ status: "ready", build: BUILD, source: publicMetadata(metadata), manuscript: text });
}

async function deleteSource(state, projectId) {
  const metadata = await state.storage.get(metadataKey(projectId));
  if (!metadata) return json({ status: "not-found", error: { code: "manuscript_source_not_found", message: "The durable manuscript source was not found." } }, 404);
  await removeExistingChunks(state, projectId);
  await state.storage.delete(metadataKey(projectId));
  const records = (await state.storage.get("production-registry")) || {};
  if (records[projectId]) {
    records[projectId] = { ...records[projectId], sourceStored: false, source: null, status: "source-removed", updatedAt: new Date().toISOString(), revision: Number(records[projectId].revision || 0) + 1 };
    await state.storage.put("production-registry", records);
  }
  return json({ status: "deleted", build: BUILD, projectId });
}

async function upsertRegistryRecord(state, metadata) {
  const records = (await state.storage.get("production-registry")) || {};
  const current = records[metadata.projectId] || null;
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
    summary: "Original manuscript source and extracted text are stored in the Kairos project runtime.",
    nextAction: current?.nextAction || "Resume Manuscript Studio and continue to editorial review or production intake.",
    checkpoints: mergeCheckpoint(current?.checkpoints, { id: "durable-source", label: "Original manuscript source stored", status: "completed", recordedAt: metadata.storedAt }),
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

async function putChunks(state, prefix, bytes, chunkSize) {
  const count = Math.ceil(bytes.length / chunkSize);
  for (let index = 0; index < count; index += 1) {
    await state.storage.put(`${prefix}${index}`, bytes.slice(index * chunkSize, Math.min(bytes.length, (index + 1) * chunkSize)));
  }
  return count;
}

async function getChunks(state, prefix, count, expectedLength) {
  const output = new Uint8Array(expectedLength);
  let offset = 0;
  for (let index = 0; index < Number(count || 0); index += 1) {
    const value = await state.storage.get(`${prefix}${index}`);
    if (!value) throw fail(502, "manuscript_source_chunk_missing", "A stored manuscript source chunk is missing.");
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    output.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== expectedLength) throw fail(502, "manuscript_source_length_mismatch", "The stored manuscript source did not pass integrity verification.");
  return output;
}

async function removeExistingChunks(state, projectId) {
  const metadata = await state.storage.get(metadataKey(projectId));
  if (!metadata) return;
  for (let index = 0; index < Number(metadata.fileChunks || 0); index += 1) await state.storage.delete(`${filePrefix(projectId)}${index}`);
  for (let index = 0; index < Number(metadata.textChunks || 0); index += 1) await state.storage.delete(`${textPrefix(projectId)}${index}`);
}

async function requireMetadata(state, projectId) {
  const metadata = await state.storage.get(metadataKey(projectId));
  if (!metadata) throw fail(404, "manuscript_source_not_found", "The durable manuscript source was not found.");
  return metadata;
}

function publicMetadata(metadata) {
  const { fileChunks, textChunks, ...publicValue } = metadata;
  return publicValue;
}
function mergeCheckpoint(values, checkpoint) {
  const list = Array.isArray(values) ? values.filter(item => item?.id !== checkpoint.id) : [];
  return [...list.slice(-29), checkpoint];
}
function metadataKey(id) { return `manuscript:${id}:metadata`; }
function filePrefix(id) { return `manuscript:${id}:file:`; }
function textPrefix(id) { return `manuscript:${id}:text:`; }
function finiteOrNull(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
function extensionOf(name) { return String(name || "").split(".").pop()?.toLowerCase() || "txt"; }
function safeFilename(value) { return String(value || "manuscript.txt").replace(/[\\/:*?\"<>|\r\n]/g, "-").slice(0, 180) || "manuscript.txt"; }
function mimeFor(format) { return ({ pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", rtf: "application/rtf", md: "text/markdown", txt: "text/plain" })[format] || "application/octet-stream"; }
function fail(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Manuscript-Source": BUILD } }); }
