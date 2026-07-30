const BUILD = "kairos-manuscript-source-20260730-2-chunked-upload";
const LEGACY_FILE_CHUNK_BYTES = 96 * 1024;
const LEGACY_TEXT_CHUNK_BYTES = 96 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_CHUNK_BYTES = 768 * 1024;
const MAX_FILE_CHUNKS = 256;
const MAX_TEXT_CHUNKS = 32;

export async function handleManuscriptSourceObjectRequest(state, request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/source(?:\/(download|text|session|commit|file\/(\d+)|text-chunk\/(\d+)))?$/i);
  if (!match) return null;

  const projectId = match[1];
  const action = match[2] || "metadata";
  const fileIndex = match[3] == null ? null : Number(match[3]);
  const textIndex = match[4] == null ? null : Number(match[4]);

  try {
    if (request.method === "POST" && action === "metadata") return storeLegacySource(state, request, projectId);
    if (request.method === "POST" && action === "session") return beginChunkedUpload(state, request, projectId);
    if (request.method === "PUT" && fileIndex != null) return storeUploadChunk(state, request, projectId, "file", fileIndex);
    if (request.method === "PUT" && textIndex != null) return storeUploadChunk(state, request, projectId, "text", textIndex);
    if (request.method === "POST" && action === "commit") return commitChunkedUpload(state, request, projectId);
    if (request.method === "GET" && action === "metadata") return readMetadata(state, projectId);
    if (request.method === "GET" && action === "download") return downloadSource(state, projectId);
    if (request.method === "GET" && action === "text") return readExtractedText(state, projectId);
    if (request.method === "DELETE" && action === "metadata") return deleteSource(state, projectId);
    return json({ status: "not-found", error: { code: "manuscript_source_route_not_found", message: "Manuscript source route not found." } }, 404);
  } catch (error) {
    return json({
      status: "failed",
      build: BUILD,
      error: {
        code: error?.code || "manuscript_source_failed",
        message: error instanceof Error ? error.message : "Manuscript source storage failed.",
        retriable: Boolean(error?.retriable),
      },
    }, Number(error?.status || 500));
  }
}

async function storeLegacySource(state, request, projectId) {
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
  await removeUploadSession(state, projectId);

  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  const fileStoragePrefix = filePrefix(projectId);
  const textStoragePrefix = textPrefix(projectId);
  const fileChunks = await putChunks(state, fileStoragePrefix, sourceBytes, LEGACY_FILE_CHUNK_BYTES);
  const textChunks = await putChunks(state, textStoragePrefix, textBytes, LEGACY_TEXT_CHUNK_BYTES);
  const metadata = buildMetadata({
    projectId,
    title,
    filename: file.name || `manuscript.${format}`,
    contentType: String(file.type || mimeFor(format)),
    format,
    size: sourceBytes.length,
    pages,
    checksum,
    fileChunks,
    textChunks,
    textBytes: textBytes.length,
    wordCount: countWords(extractedText),
    fileStoragePrefix,
    textStoragePrefix,
    uploadMode: "legacy-multipart",
  });

  await finalizeMetadata(state, metadata);
  return json({ status: "stored-and-verified", build: BUILD, source: publicMetadata(metadata) }, 201);
}

async function beginChunkedUpload(state, request, projectId) {
  const body = await request.json().catch(() => ({}));
  const size = positiveInteger(body?.size, "manuscript_file_size_invalid", "A valid manuscript source size is required.");
  const textBytes = positiveInteger(body?.textBytes, "manuscript_text_size_invalid", "A valid extracted manuscript size is required.");
  const fileChunks = positiveInteger(body?.fileChunks, "manuscript_file_chunks_invalid", "A valid manuscript file chunk count is required.");
  const textChunks = positiveInteger(body?.textChunks, "manuscript_text_chunks_invalid", "A valid manuscript text chunk count is required.");

  if (size > MAX_FILE_BYTES) throw fail(413, "manuscript_file_too_large", "Manuscript source files must be 20 MB or smaller.");
  if (textBytes > MAX_TEXT_BYTES) throw fail(413, "manuscript_text_too_large", "The extracted manuscript text exceeds the durable recovery limit.");
  if (fileChunks > MAX_FILE_CHUNKS) throw fail(413, "manuscript_file_chunks_exceeded", "The manuscript source requires too many upload chunks.");
  if (textChunks > MAX_TEXT_CHUNKS) throw fail(413, "manuscript_text_chunks_exceeded", "The extracted manuscript requires too many upload chunks.");

  await removeExistingChunks(state, projectId);
  await removeUploadSession(state, projectId);
  await state.storage.delete(metadataKey(projectId));

  const uploadId = String(body?.uploadId || crypto.randomUUID()).replace(/[^a-z0-9-]/gi, "").slice(0, 96);
  if (uploadId.length < 8) throw fail(400, "manuscript_upload_id_invalid", "A valid manuscript upload identifier is required.");

  const session = {
    uploadId,
    projectId,
    title: String(body?.title || "Untitled Manuscript").trim().slice(0, 240),
    filename: safeFilename(body?.filename || "manuscript.docx"),
    contentType: String(body?.contentType || mimeFor(body?.format || "docx")).slice(0, 160),
    format: String(body?.format || extensionOf(body?.filename || "docx")).toLowerCase().slice(0, 16),
    size,
    textBytes,
    fileChunks,
    textChunks,
    pages: finiteOrNull(body?.pages),
    checksum: String(body?.checksum || "").trim().slice(0, 128),
    receivedFileChunks: [],
    receivedTextChunks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    build: BUILD,
  };

  await state.storage.put(uploadSessionKey(projectId), session);
  return json({
    status: "upload-session-ready",
    build: BUILD,
    upload: publicUploadSession(session),
    limits: { maxChunkBytes: MAX_UPLOAD_CHUNK_BYTES },
  }, 201);
}

async function storeUploadChunk(state, request, projectId, kind, index) {
  const session = await requireUploadSession(state, projectId, request);
  const expected = kind === "file" ? session.fileChunks : session.textChunks;
  if (!Number.isInteger(index) || index < 0 || index >= expected) {
    throw fail(400, "manuscript_chunk_index_invalid", `The ${kind} chunk index is invalid.`);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) throw fail(400, "manuscript_chunk_empty", `The ${kind} chunk is empty.`);
  if (bytes.length > MAX_UPLOAD_CHUNK_BYTES) throw fail(413, "manuscript_chunk_too_large", `Each ${kind} chunk must be ${MAX_UPLOAD_CHUNK_BYTES} bytes or smaller.`);

  await state.storage.put(uploadChunkKey(projectId, session.uploadId, kind, index), bytes);
  const field = kind === "file" ? "receivedFileChunks" : "receivedTextChunks";
  const received = new Set(Array.isArray(session[field]) ? session[field] : []);
  received.add(index);
  session[field] = [...received].sort((a, b) => a - b);
  session.updatedAt = new Date().toISOString();
  await state.storage.put(uploadSessionKey(projectId), session);

  return json({
    status: "chunk-stored",
    build: BUILD,
    uploadId: session.uploadId,
    kind,
    index,
    bytes: bytes.length,
    received: session[field].length,
    expected,
  }, 201);
}

async function commitChunkedUpload(state, request, projectId) {
  const session = await requireUploadSession(state, projectId, request);
  const fileVerification = await verifyUploadChunks(state, projectId, session, "file", session.fileChunks, session.size);
  const textVerification = await verifyUploadChunks(state, projectId, session, "text", session.textChunks, session.textBytes, true);
  const text = new TextDecoder().decode(textVerification.bytes);
  if (!text.trim()) throw fail(400, "manuscript_text_required", "Extracted manuscript text is required for durable recovery.");

  const metadata = buildMetadata({
    projectId,
    title: session.title,
    filename: session.filename,
    contentType: session.contentType,
    format: session.format,
    size: session.size,
    pages: session.pages,
    checksum: session.checksum,
    fileChunks: session.fileChunks,
    textChunks: session.textChunks,
    textBytes: session.textBytes,
    wordCount: countWords(text),
    fileStoragePrefix: uploadChunkPrefix(projectId, session.uploadId, "file"),
    textStoragePrefix: uploadChunkPrefix(projectId, session.uploadId, "text"),
    uploadMode: "chunked-v1",
    uploadId: session.uploadId,
  });

  await finalizeMetadata(state, metadata);
  await state.storage.delete(uploadSessionKey(projectId));

  return json({
    status: "stored-and-verified",
    build: BUILD,
    verification: {
      fileBytes: fileVerification.total,
      textBytes: textVerification.total,
      fileChunks: session.fileChunks,
      textChunks: session.textChunks,
    },
    source: publicMetadata(metadata),
  }, 201);
}

async function readMetadata(state, projectId) {
  const metadata = await state.storage.get(metadataKey(projectId));
  return metadata
    ? json({ status: "ready", build: BUILD, source: publicMetadata(metadata) })
    : json({ status: "not-found", error: { code: "manuscript_source_not_found", message: "The durable manuscript source was not found." } }, 404);
}

async function downloadSource(state, projectId) {
  const metadata = await requireMetadata(state, projectId);
  const bytes = await getChunks(state, metadata.fileStoragePrefix || filePrefix(projectId), metadata.fileChunks, metadata.size);
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
  const bytes = await getChunks(state, metadata.textStoragePrefix || textPrefix(projectId), metadata.textChunks, metadata.textBytes);
  const text = new TextDecoder().decode(bytes);
  return json({ status: "ready", build: BUILD, source: publicMetadata(metadata), manuscript: text });
}

async function deleteSource(state, projectId) {
  const metadata = await state.storage.get(metadataKey(projectId));
  const session = await state.storage.get(uploadSessionKey(projectId));
  if (!metadata && !session) return json({ status: "not-found", error: { code: "manuscript_source_not_found", message: "The durable manuscript source was not found." } }, 404);
  await removeExistingChunks(state, projectId);
  await removeUploadSession(state, projectId);
  await state.storage.delete(metadataKey(projectId));
  const records = (await state.storage.get("production-registry")) || {};
  if (records[projectId]) {
    records[projectId] = { ...records[projectId], sourceStored: false, source: null, status: "source-removed", updatedAt: new Date().toISOString(), revision: Number(records[projectId].revision || 0) + 1 };
    await state.storage.put("production-registry", records);
  }
  return json({ status: "deleted", build: BUILD, projectId });
}

function buildMetadata(input) {
  const now = new Date().toISOString();
  return {
    projectId: input.projectId,
    title: input.title,
    filename: safeFilename(input.filename),
    contentType: input.contentType,
    format: input.format,
    size: input.size,
    pages: input.pages,
    checksum: input.checksum,
    fileChunks: input.fileChunks,
    textChunks: input.textChunks,
    textBytes: input.textBytes,
    wordCount: input.wordCount,
    fileStoragePrefix: input.fileStoragePrefix,
    textStoragePrefix: input.textStoragePrefix,
    uploadMode: input.uploadMode,
    uploadId: input.uploadId || null,
    storedAt: now,
    updatedAt: now,
    sourceDownloadURL: `/api/production-registry/manuscripts/${encodeURIComponent(input.projectId)}/source/download`,
    extractedTextURL: `/api/production-registry/manuscripts/${encodeURIComponent(input.projectId)}/source/text`,
    build: BUILD,
  };
}

async function finalizeMetadata(state, metadata) {
  await state.storage.put(metadataKey(metadata.projectId), metadata);
  await upsertRegistryRecord(state, metadata);
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

async function verifyUploadChunks(state, projectId, session, kind, count, expectedLength, includeBytes = false) {
  let total = 0;
  const output = includeBytes ? new Uint8Array(expectedLength) : null;
  for (let index = 0; index < count; index += 1) {
    const value = await state.storage.get(uploadChunkKey(projectId, session.uploadId, kind, index));
    if (!value) throw fail(409, "manuscript_upload_chunk_missing", `The ${kind} upload is missing chunk ${index + 1} of ${count}.`, true);
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    if (total + chunk.length > expectedLength) throw fail(409, "manuscript_upload_length_mismatch", `The ${kind} upload exceeded its declared length.`, true);
    if (output) output.set(chunk, total);
    total += chunk.length;
  }
  if (total !== expectedLength) throw fail(409, "manuscript_upload_length_mismatch", `The ${kind} upload did not pass length verification.`, true);
  return { total, bytes: output };
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
  const fileStoragePrefix = metadata.fileStoragePrefix || filePrefix(projectId);
  const textStoragePrefix = metadata.textStoragePrefix || textPrefix(projectId);
  for (let index = 0; index < Number(metadata.fileChunks || 0); index += 1) await state.storage.delete(`${fileStoragePrefix}${index}`);
  for (let index = 0; index < Number(metadata.textChunks || 0); index += 1) await state.storage.delete(`${textStoragePrefix}${index}`);
}

async function removeUploadSession(state, projectId) {
  const session = await state.storage.get(uploadSessionKey(projectId));
  if (!session) return;
  for (let index = 0; index < Number(session.fileChunks || 0); index += 1) await state.storage.delete(uploadChunkKey(projectId, session.uploadId, "file", index));
  for (let index = 0; index < Number(session.textChunks || 0); index += 1) await state.storage.delete(uploadChunkKey(projectId, session.uploadId, "text", index));
  await state.storage.delete(uploadSessionKey(projectId));
}

async function requireMetadata(state, projectId) {
  const metadata = await state.storage.get(metadataKey(projectId));
  if (!metadata) throw fail(404, "manuscript_source_not_found", "The durable manuscript source was not found.");
  return metadata;
}

async function requireUploadSession(state, projectId, request) {
  const session = await state.storage.get(uploadSessionKey(projectId));
  if (!session) throw fail(409, "manuscript_upload_session_missing", "The manuscript upload session is missing. Start a new chunked upload.", true);
  const uploadId = String(request.headers.get("x-kairos-upload-id") || "").trim();
  if (!uploadId || uploadId !== session.uploadId) throw fail(409, "manuscript_upload_session_mismatch", "The manuscript upload session does not match the active project upload.", true);
  return session;
}

function publicMetadata(metadata) {
  const { fileChunks, textChunks, fileStoragePrefix, textStoragePrefix, uploadId, ...publicValue } = metadata;
  return publicValue;
}
function publicUploadSession(session) {
  return {
    uploadId: session.uploadId,
    projectId: session.projectId,
    filename: session.filename,
    size: session.size,
    textBytes: session.textBytes,
    fileChunks: session.fileChunks,
    textChunks: session.textChunks,
    createdAt: session.createdAt,
  };
}
function mergeCheckpoint(values, checkpoint) {
  const list = Array.isArray(values) ? values.filter(item => item?.id !== checkpoint.id) : [];
  return [...list.slice(-29), checkpoint];
}
function positiveInteger(value, code, message) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw fail(400, code, message);
  return number;
}
function countWords(value) { return (String(value || "").match(/\b[\w’'-]+\b/g) || []).length; }
function metadataKey(id) { return `manuscript:${id}:metadata`; }
function uploadSessionKey(id) { return `manuscript:${id}:upload-session`; }
function uploadChunkPrefix(id, uploadId, kind) { return `manuscript:${id}:upload:${uploadId}:${kind}:`; }
function uploadChunkKey(id, uploadId, kind, index) { return `${uploadChunkPrefix(id, uploadId, kind)}${index}`; }
function filePrefix(id) { return `manuscript:${id}:file:`; }
function textPrefix(id) { return `manuscript:${id}:text:`; }
function finiteOrNull(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
function extensionOf(name) { return String(name || "").split(".").pop()?.toLowerCase() || "txt"; }
function safeFilename(value) { return String(value || "manuscript.txt").replace(/[\\/:*?\"<>|\r\n]/g, "-").slice(0, 180) || "manuscript.txt"; }
function mimeFor(format) { return ({ pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", rtf: "application/rtf", md: "text/markdown", txt: "text/plain" })[String(format || "").toLowerCase()] || "application/octet-stream"; }
function fail(status, code, message, retriable = false) { return Object.assign(new Error(message), { status, code, retriable }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Manuscript-Source": BUILD } }); }
