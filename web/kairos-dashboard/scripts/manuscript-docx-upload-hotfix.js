const BUILD = "manuscript-docx-upload-hotfix-20260730-3-chunked-source";
const PREVIOUS_BUILD = "manuscript-docx-upload-hotfix-20260730-2-source-recovery";
const ACTIVE_KEY = "kairos.production.active-workspace";
const MAX_TEXT_CHARS = 600000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const FILE_CHUNK_BYTES = 512 * 1024;
const TEXT_CHUNK_BYTES = 128 * 1024;
const REQUEST_TIMEOUT_MS = 75 * 1000;
const CHUNK_RETRY_LIMIT = 3;
const TRANSIENT_SOURCE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAMMOTH_URLS = [
  "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm",
  "https://esm.sh/mammoth@1.8.0",
];

const pending = {
  file: null,
  fileBytes: null,
  manuscript: "",
  title: "",
  projectId: null,
  source: null,
  saving: false,
  recoveryCount: 0,
  uploadId: null,
};

document.addEventListener("change", interceptDocxSelection, true);
document.addEventListener("click", interceptPendingAdvance, true);

window.KairosManuscriptDocxHotfix = Object.freeze({
  build: BUILD,
  previousBuild: PREVIOUS_BUILD,
  ready: true,
  sourceRecovery: true,
  chunkedSourceUpload: true,
  fileChunkBytes: FILE_CHUNK_BYTES,
  textChunkBytes: TEXT_CHUNK_BYTES,
});

async function interceptDocxSelection(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches("[data-file]")) return;
  const file = input.files?.[0];
  if (!file || !isDocx(file)) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  pending.file = file;
  pending.fileBytes = null;
  pending.manuscript = "";
  pending.title = currentTitle(file);
  pending.projectId = ensureProjectId();
  pending.source = null;
  pending.recoveryCount = 0;
  pending.uploadId = null;

  setBusy(true, "Extracting DOCX manuscript…");
  clearError();

  try {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`The DOCX file is ${formatBytes(file.size)}. Source storage supports files up to ${formatBytes(MAX_FILE_BYTES)}.`);
    }

    const sourceBuffer = await file.arrayBuffer();
    pending.fileBytes = new Uint8Array(sourceBuffer);
    const extractor = await loadMammothExtractor();
    const result = await extractor({ arrayBuffer: sourceBuffer.slice(0) });
    const fatal = (result?.messages || []).find(message => message?.type === "error");
    if (fatal) throw new Error(fatal.message || "The DOCX file could not be read.");

    const manuscript = normalizeText(result?.value || "");
    if (manuscript.length < 50) throw new Error("No usable manuscript text was found in this DOCX file.");
    if (manuscript.length > MAX_TEXT_CHARS) {
      throw new Error(`The extracted manuscript contains ${manuscript.length.toLocaleString()} characters. Intake supports up to ${MAX_TEXT_CHARS.toLocaleString()} characters.`);
    }

    pending.manuscript = manuscript;
    pending.source = {
      projectId: pending.projectId,
      name: file.name,
      filename: file.name,
      size: file.size,
      format: "docx",
      checksum: "",
      stored: false,
      uploadMode: "chunked-v1",
    };

    restoreIntoStudio(pending.source);
    setBusy(true, "Securing manuscript source in verified chunks…");
    await persistPendingDocx();
  } catch (error) {
    showError(error?.message || "Kairos could not extract or store this DOCX manuscript.");
  } finally {
    setBusy(false);
  }
}

async function interceptPendingAdvance(event) {
  const button = event.target instanceof Element ? event.target.closest("[data-advance]") : null;
  if (!button || !pending.file || !pending.manuscript || pending.source?.stored) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  setBusy(true, "Resuming verified chunk storage…");
  clearError();
  try {
    await persistPendingDocx();
    requestAnimationFrame(() => document.querySelector("[data-advance]")?.click());
  } catch (error) {
    showError(`Source storage failed. Your extracted manuscript remains retained (${pending.manuscript.length.toLocaleString()} characters). ${error?.message || "The original DOCX could not be stored."}`);
  } finally {
    setBusy(false);
  }
}

async function persistPendingDocx() {
  if (pending.saving) return;
  if (!pending.file || !pending.fileBytes || !pending.manuscript || !pending.projectId) {
    throw new Error("Select the DOCX manuscript again before retrying source storage.");
  }

  pending.saving = true;
  try {
    if (!pending.source?.checksum) {
      pending.source.checksum = await checksumBytes(pending.fileBytes);
    }

    let projectAttempt = 1;
    while (projectAttempt <= 2) {
      try {
        const stored = await storeChunkedSource();
        applyStoredSource(stored);
        return;
      } catch (error) {
        if (projectAttempt === 1 && TRANSIENT_SOURCE_STATUSES.has(Number(error?.status || 0))) {
          pending.recoveryCount += 1;
          rotateProjectId(error.status);
          setStatus("Starting a clean chunked source transaction…");
          projectAttempt += 1;
          continue;
        }
        throw error;
      }
    }
  } finally {
    pending.saving = false;
  }
}

async function storeChunkedSource() {
  const textBytes = new TextEncoder().encode(pending.manuscript);
  const fileChunks = Math.ceil(pending.fileBytes.length / FILE_CHUNK_BYTES);
  const textChunks = Math.ceil(textBytes.length / TEXT_CHUNK_BYTES);
  const uploadId = createUploadId();
  pending.uploadId = uploadId;

  setStatus(`Preparing ${fileChunks + textChunks} verified source chunks…`);
  const session = await requestJSON(sourcePath("session"), {
    method: "POST",
    body: {
      uploadId,
      title: pending.title || "Untitled manuscript",
      filename: safeUploadName(pending.file.name),
      contentType: pending.file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      format: "docx",
      size: pending.fileBytes.length,
      textBytes: textBytes.length,
      fileChunks,
      textChunks,
      pages: null,
      checksum: pending.source.checksum,
    },
    stage: "source session",
  });

  if (session?.upload?.uploadId !== uploadId) {
    throw storageFailure(409, "The source session returned an unexpected upload identifier.");
  }

  await uploadChunkSet("file", pending.fileBytes, FILE_CHUNK_BYTES, fileChunks, uploadId, 0, fileChunks + textChunks);
  await uploadChunkSet("text-chunk", textBytes, TEXT_CHUNK_BYTES, textChunks, uploadId, fileChunks, fileChunks + textChunks);

  setStatus("Verifying the complete DOCX and extracted manuscript…");
  return requestJSON(sourcePath("commit"), {
    method: "POST",
    headers: { "X-Kairos-Upload-Id": uploadId },
    body: { uploadId },
    stage: "source commit",
  });
}

async function uploadChunkSet(routeKind, bytes, chunkSize, count, uploadId, completedBefore, totalChunks) {
  const label = routeKind === "file" ? "DOCX" : "manuscript text";
  for (let index = 0; index < count; index += 1) {
    const start = index * chunkSize;
    const end = Math.min(bytes.length, start + chunkSize);
    const chunk = bytes.slice(start, end);
    const completed = completedBefore + index;
    const percent = Math.max(1, Math.round((completed / totalChunks) * 100));
    setStatus(`Securing ${label} chunk ${index + 1} of ${count} (${percent}%)…`);
    await uploadChunkWithRetry(routeKind, index, chunk, uploadId);
  }
}

async function uploadChunkWithRetry(kind, index, chunk, uploadId) {
  let lastError = null;
  for (let attempt = 1; attempt <= CHUNK_RETRY_LIMIT; attempt += 1) {
    try {
      return await requestBinary(sourcePath(`${kind}/${index}`), chunk, {
        uploadId,
        attempt,
        stage: `${kind} chunk ${index + 1}`,
      });
    } catch (error) {
      lastError = error;
      if (!TRANSIENT_SOURCE_STATUSES.has(Number(error?.status || 0)) || attempt === CHUNK_RETRY_LIMIT) throw error;
      await delay(350 * attempt);
    }
  }
  throw lastError || new Error("The source chunk could not be stored.");
}

async function requestJSON(path, { method, body, headers = {}, stage }) {
  const response = await governedFetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-MMG-Client-Build": BUILD,
      "X-Kairos-Source-Stage": stage,
      ...headers,
    },
    body: JSON.stringify(body || {}),
  });
  return parseStorageResponse(response, stage);
}

async function requestBinary(path, bytes, { uploadId, attempt, stage }) {
  const response = await governedFetch(path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-MMG-Client-Build": BUILD,
      "X-Kairos-Upload-Id": uploadId,
      "X-Kairos-Chunk-Length": String(bytes.length),
      "X-Kairos-Chunk-Attempt": String(attempt),
      "X-Kairos-Source-Stage": stage,
    },
    body: bytes,
  });
  return parseStorageResponse(response, stage);
}

async function governedFetch(path, init) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(path, {
      ...init,
      credentials: "include",
      cache: "no-store",
      signal: controller?.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw storageFailure(504, `The source request exceeded ${Math.round(REQUEST_TIMEOUT_MS / 1000)} seconds. The manuscript remains retained.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseStorageResponse(response, stage) {
  const rawBody = await response.text();
  let body = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch {}
  if (!response.ok) throw sourceStorageError(response, body, rawBody, stage);
  return body;
}

function applyStoredSource(body) {
  if (!body?.source) throw new Error("The source-storage response did not include the stored manuscript record.");
  pending.source = {
    ...body.source,
    projectId: body.source.projectId || pending.projectId,
    name: body.source.name || body.source.filename || pending.file.name,
    filename: body.source.filename || body.source.name || pending.file.name,
    size: Number(body.source.size || pending.file.size),
    format: body.source.format || "docx",
    checksum: body.source.checksum || pending.source.checksum,
    stored: true,
    uploadMode: body.source.uploadMode || "chunked-v1",
  };
  restoreIntoStudio(pending.source);
  clearError();
  setStatus("Original DOCX and manuscript text stored and verified.");
}

function sourceStorageError(response, body, rawBody, stage) {
  const serverMessage = body?.error?.message || body?.message || "";
  const serverBuild = response.headers.get("x-kairos-manuscript-source") || response.headers.get("x-kairos-registry") || "";
  const ray = response.headers.get("cf-ray") || "";
  const evidence = [stage && `stage ${stage}`, serverBuild && `build ${serverBuild}`, ray && `ray ${ray}`].filter(Boolean).join(", ");
  const fallback = `The manuscript source could not be stored (HTTP ${response.status}${evidence ? `; ${evidence}` : ""}).`;
  const rawMessage = !serverMessage && rawBody && rawBody.length < 500 ? rawBody.trim() : "";
  return storageFailure(response.status, serverMessage || rawMessage || fallback, { ray, stage, build: serverBuild });
}

function storageFailure(status, message, evidence = {}) {
  return Object.assign(new Error(message), { status: Number(status || 500), evidence });
}

function sourcePath(suffix) {
  return `/api/production-registry/manuscripts/${encodeURIComponent(pending.projectId)}/source/${suffix}?clientBuild=${encodeURIComponent(BUILD)}&recovery=${pending.recoveryCount}`;
}

function rotateProjectId(status) {
  const previousProjectId = pending.projectId;
  const projectId = createProjectId();
  pending.projectId = projectId;
  pending.uploadId = null;
  pending.source = {
    ...(pending.source || {}),
    projectId,
    stored: false,
    uploadMode: "chunked-v1",
  };
  sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({
    workspace: "manuscript-studio",
    projectId,
    openedAt: new Date().toISOString(),
    build: BUILD,
    recoveryFrom: previousProjectId,
    recoveryStatus: Number(status || 0),
  }));
  restoreIntoStudio(pending.source);
}

async function loadMammothExtractor() {
  const injected = globalThis.__KAIROS_MAMMOTH_TEST_MODULE__;
  if (injected) return resolveMammothExtractor(injected);

  let lastError = null;
  for (const url of MAMMOTH_URLS) {
    try {
      const namespace = await import(url);
      return resolveMammothExtractor(namespace);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`DOCX extraction service could not load. ${lastError?.message || "Try again when the connection is stable."}`);
}

function resolveMammothExtractor(namespace) {
  const candidates = [namespace, namespace?.default, namespace?.default?.default];
  for (const candidate of candidates) {
    if (typeof candidate?.extractRawText === "function") return candidate.extractRawText.bind(candidate);
  }
  throw new Error("DOCX extraction service loaded without the required extractRawText function.");
}

function restoreIntoStudio(source) {
  window.dispatchEvent(new CustomEvent("kairos:manuscript:restore", {
    detail: {
      project: { projectId: pending.projectId, title: pending.title },
      manuscript: pending.manuscript,
      source,
    },
  }));
}

function ensureProjectId() {
  const active = readJSON(ACTIVE_KEY);
  if (active?.workspace === "manuscript-studio" && active.projectId) return active.projectId;
  const id = createProjectId();
  sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({
    workspace: "manuscript-studio",
    projectId: id,
    openedAt: new Date().toISOString(),
    build: BUILD,
  }));
  return id;
}

function createProjectId() {
  return `manuscript-studio-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function createUploadId() {
  return `upload-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function currentTitle(file) {
  return document.querySelector("#ms-title")?.value.trim()
    || String(file.name || "Untitled manuscript").replace(/\.[^.]+$/, "")
    || "Untitled manuscript";
}

function isDocx(file) {
  const name = String(file.name || "").toLowerCase();
  return name.endsWith(".docx")
    || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

async function checksumBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function safeUploadName(value) {
  const cleaned = String(value || "manuscript.docx")
    .normalize("NFKD")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "manuscript.docx";
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setBusy(busy, message = "") {
  const input = document.querySelector("[data-file]");
  const advance = document.querySelector("[data-advance]");
  if (input) input.disabled = Boolean(busy);
  if (advance) advance.disabled = Boolean(busy);
  if (message) setStatus(message);
  else document.querySelector("[data-docx-hotfix-status]")?.remove();
}

function setStatus(message) {
  const actions = document.querySelector(".manuscript-actions");
  if (!actions) return;
  let status = document.querySelector("[data-docx-hotfix-status]");
  if (!status) {
    status = document.createElement("p");
    status.dataset.docxHotfixStatus = "true";
    status.className = "manuscript-progress";
    actions.before(status);
  }
  status.textContent = message;
}

function showError(message) {
  const actions = document.querySelector(".manuscript-actions");
  if (!actions) return;
  let error = document.querySelector("[data-docx-hotfix-error]");
  if (!error) {
    error = document.createElement("p");
    error.dataset.docxHotfixError = "true";
    error.className = "manuscript-error";
    actions.before(error);
  }
  error.textContent = message;
}

function clearError() {
  document.querySelector("[data-docx-hotfix-error]")?.remove();
}

function readJSON(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
