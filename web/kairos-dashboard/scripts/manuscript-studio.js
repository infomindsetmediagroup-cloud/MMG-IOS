const BUILD = "manuscript-studio-flow-recovery-20260803-3";
const MAX_TEXT_CHARS = 600000;
const MAX_DOCX_BYTES = 15 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 400;
const FILE_CHUNK_BYTES = 512 * 1024;
const TEXT_CHUNK_BYTES = 128 * 1024;
const REQUEST_TIMEOUT_MS = 75 * 1000;
const CHUNK_RETRY_LIMIT = 3;
const TRANSIENT_SOURCE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const ACTIVE_KEY = "kairos.production.active-workspace";
const DRAFT_KEY = "kairos.manuscript-studio.recoverable-draft.v1";
const SETUP_SCRIPT = "manuscript-project-setup.js";
const SETUP_RELEASE = "manuscript-flow-recovery-20260803-3";
const SETUP_LOAD_TIMEOUT_MS = 15_000;
let setupLoadPromise = null;

const state = {
  open: false,
  working: false,
  extracting: false,
  storing: false,
  result: null,
  error: "",
  title: "",
  manuscript: "",
  source: null,
  sourceFile: null,
  sourceBytes: null,
  sourceSaveStatus: "idle",
  sourceSaveError: "",
  storageProgress: "",
  projectId: null,
  recoveryCount: 0,
  reviewingSource: false,
};

const LIBRARIES = {
  mammoth: ["https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm", "https://esm.sh/mammoth@1.8.0"],
  pdfjs: ["https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs", "https://esm.sh/pdfjs-dist@4.10.38/build/pdf.mjs"],
};

window.KairosManuscriptStudio = Object.freeze({
  build: BUILD,
  ready: true,
  chunkedSourceUpload: true,
  fileChunkBytes: FILE_CHUNK_BYTES,
  textChunkBytes: TEXT_CHUNK_BYTES,
  multipartSourceUpload: false,
});

window.addEventListener("kairos:manuscript:restore", event => {
  const detail = event.detail || {};
  state.projectId = detail.project?.projectId || detail.source?.projectId || null;
  state.title = detail.project?.title || detail.source?.title || "Untitled manuscript";
  state.manuscript = String(detail.manuscript || "");
  state.source = detail.source ? normalizeSource(detail.source) : null;
  state.sourceFile = null;
  state.sourceBytes = null;
  state.sourceSaveStatus = state.source?.stored ? "saved" : state.manuscript ? "restored" : "idle";
  state.sourceSaveError = "";
  state.storageProgress = "";
  state.result = null;
  state.reviewingSource = false;
  state.error = state.manuscript.length > MAX_TEXT_CHARS
    ? `This manuscript contains ${state.manuscript.length.toLocaleString()} characters. Manuscript Studio supports up to ${MAX_TEXT_CHARS.toLocaleString()} characters.`
    : state.manuscript && !state.source?.stored
      ? `Recovered ${state.manuscript.length.toLocaleString()} manuscript characters. Select the original manuscript file once to preserve it with verified chunk storage.`
      : "";
  state.open = true;
  persistDraft();
  render();
});

function mount() {
  restoreDraft();
  const button = document.createElement("button");
  button.className = "manuscript-launch";
  button.textContent = "Open Manuscript Studio";
  button.onclick = () => {
    state.open = true;
    state.projectId = state.projectId || activeProjectId();
    render();
  };
  document.body.appendChild(button);
  render();
}

function render() {
  document.querySelector("#manuscript-studio-overlay")?.remove();
  document.documentElement.classList.toggle("manuscript-studio-open", state.open);
  document.body.classList.toggle("manuscript-studio-open", state.open);
  if (!state.open) return;
  const overlay = document.createElement("div");
  overlay.id = "manuscript-studio-overlay";
  overlay.className = "manuscript-overlay";
  overlay.dataset.kairosManuscriptView = state.result ? "intake-receipt" : "intake-form";
  overlay.innerHTML = `<section class="manuscript-panel"><header><div><p class="eyebrow">Customer Portal · Publishing</p><h2>Manuscript Studio</h2><p>Upload a manuscript, preserve the original source, and advance it directly into MMG production intake.</p></div><button data-close aria-label="Close">×</button></header>${state.result ? resultView() : inputView()}</section>`;
  document.body.appendChild(overlay);
  if (state.result) {
    requestAnimationFrame(() => {
      overlay.scrollTop = 0;
      overlay.querySelector("[data-finish]")?.focus?.({ preventScroll: true });
      void hydrateProjectSetup(false);
    });
  }
  overlay.querySelector("[data-close]").onclick = () => {
    state.open = false;
    window.dispatchEvent(new CustomEvent("kairos:production:close"));
    render();
  };
  overlay.querySelector("[data-advance]")?.addEventListener("click", runIntake);
  overlay.querySelector("[data-file]")?.addEventListener("change", loadFile);
  overlay.querySelector("[data-retry-source]")?.addEventListener("click", retrySourceSave);
  overlay.querySelector("#ms-title")?.addEventListener("input", event => {
    state.title = event.target.value;
    persistDraft();
  });
  overlay.querySelector("#ms-body")?.addEventListener("input", event => {
    state.manuscript = event.target.value;
    persistDraft();
  });
  overlay.querySelector("[data-finish]")?.addEventListener("click", event => {
    void hydrateProjectSetup(true, event.currentTarget);
  });
  overlay.querySelector("[data-setup-load]")?.addEventListener("click", event => {
    void hydrateProjectSetup(true, event.currentTarget);
  });
}

function inputView() {
  const busy = state.working || state.extracting || state.storing;
  const recoveredSourceNeedsFile = Boolean(state.manuscript && state.source && !state.source.stored && !state.sourceBytes);
  const label = state.extracting
    ? "Extracting file…"
    : state.storing
      ? state.storageProgress || "Preserving source…"
      : state.working
        ? "Creating production intake…"
        : recoveredSourceNeedsFile
          ? "Select Original File to Continue"
          : "Continue to Production Intake";
  const source = sourceView();
  const retry = state.sourceBytes && state.sourceSaveStatus === "failed"
    ? `<button type="button" class="secondary" data-retry-source ${busy ? "disabled" : ""}>Retry verified chunk save</button>`
    : "";
  return `<div class="manuscript-grid"><label>Publication title<input id="ms-title" maxlength="200" value="${esc(state.title)}" placeholder="Book title"></label><label>Manuscript file<input data-file type="file" accept=".txt,.md,.rtf,.docx,.pdf,text/plain,text/markdown,application/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"></label></div>${source}<label>Extracted manuscript text<textarea id="ms-body" maxlength="${MAX_TEXT_CHARS}" placeholder="Paste text or load TXT, MD, RTF, DOCX, or a text-based PDF.">${esc(state.manuscript)}</textarea></label><p class="manuscript-note">Manuscript Studio accepts up to ${MAX_TEXT_CHARS.toLocaleString()} extracted characters. The original source and extracted text are stored through verified bounded chunks. Scanned or image-only PDFs are rejected because OCR is not enabled.</p>${busy ? `<p class="manuscript-progress">${esc(label)}</p>` : ""}${state.error ? `<p class="manuscript-error">${esc(state.error)}</p>` : ""}<div class="manuscript-actions">${retry}<button class="primary" data-advance ${busy || recoveredSourceNeedsFile ? "disabled" : ""}>${esc(label)}</button></div>`;
}

function sourceView() {
  if (!state.source) {
    if (!state.manuscript) return "";
    return `<p class="manuscript-source"><strong>Recovered manuscript:</strong> ${state.manuscript.length.toLocaleString()} characters retained · verified source storage pending</p>`;
  }
  const details = `${esc(state.source.name)} · ${esc(String(state.source.format || "txt").toUpperCase())} · ${formatBytes(state.source.size)}${state.source.pages ? ` · ${state.source.pages} pages` : ""}`;
  if (state.source.stored) {
    return `<p class="manuscript-source"><strong>Durable source:</strong> ${details} · stored and verified through chunks · ${state.manuscript.length.toLocaleString()} characters ready</p>`;
  }
  const status = state.sourceSaveStatus === "failed"
    ? state.sourceBytes
      ? "text and original source retained; verified chunk save can retry"
      : "text retained; select the original file to start a clean verified upload"
    : state.sourceSaveStatus === "saving"
      ? "preserving original source in verified chunks"
      : state.sourceBytes
        ? "text and original source retained; chunk storage pending"
        : "text retained; original file selection required";
  return `<p class="manuscript-source"><strong>Selected manuscript:</strong> ${details} · ${status} · ${state.manuscript.length.toLocaleString()} characters retained</p>`;
}

function resultView() {
  const r = state.result || {};
  const actions = Array.isArray(r.workflow?.requiredNextActions) && r.workflow.requiredNextActions.length
    ? r.workflow.requiredNextActions
    : ["Complete Project Setup"];
  const review = `
    <details class="manuscript-source-review" data-kairos-source-review>
      <summary class="secondary">Review Intake Source</summary>
      <div data-kairos-source-review-content>
        <p class="eyebrow">Accepted intake source</p>
        <h3>Review the preserved manuscript</h3>
        <p>This is the accepted source already stored for this project. Reviewing it does not restart intake or replace the production record.</p>
        <label>Preserved manuscript text<textarea readonly data-intake-source-review>${esc(state.manuscript)}</textarea></label>
      </div>
    </details>
  `;
  const setupShell = `
    <section id="manuscript-project-setup" class="manuscript-project-setup" data-kairos-project-setup-shell data-project-id="${esc(state.projectId || activeProjectId() || "")}" aria-live="polite">
      <p class="eyebrow">Next stage</p>
      <h3>Complete Project Setup</h3>
      <p data-kairos-setup-load-status>Loading the saved project and production-assignment form…</p>
      <button type="button" class="secondary" data-setup-load>Load Project Setup</button>
    </section>
  `;
  return `<div class="manuscript-result" data-kairos-intake-receipt><div class="manuscript-status"><span>Production intake created</span><strong>${esc(r.status || "production_intake")}</strong></div><h3>${esc(r.customerMessage || "Your manuscript has advanced into MMG production intake.")}</h3><p><strong>Project:</strong> ${esc(r.projectID || "—")} · <strong>Intake:</strong> ${esc(r.intakeID || "—")}</p><p><strong>Accepted source:</strong> ${Number(r.manuscript?.characterCount || state.manuscript.length).toLocaleString()} characters · ${Number(r.manuscript?.wordCount || 0).toLocaleString()} words</p><div class="manuscript-actions manuscript-intake-actions"><a class="primary" data-finish href="#manuscript-project-setup" role="button">Continue to Project Setup</a></div>${review}<div class="issue-list">${actions.map((item, index) => `<article><b>${index + 1}. ${esc(item)}</b><p>${index === 0 ? "This is the next required production step." : "Queued in the production setup sequence."}</p></article>`).join("")}</div><p class="manuscript-note">The original manuscript source remains stored in the durable production registry.</p>${setupShell}</div>`;
}

async function hydrateProjectSetup(scroll = false, trigger = null) {
  const section = document.querySelector("#manuscript-studio-overlay #manuscript-project-setup");
  if (!section) return null;

  const status = section.querySelector("[data-kairos-setup-load-status]");
  if (status) status.textContent = "Loading Project Setup…";
  if (trigger instanceof HTMLButtonElement) trigger.disabled = true;

  try {
    const controller = await ensureProjectSetupController();
    controller.enhance?.();
    await waitForSetupHydration(section);
    if (scroll) section.scrollIntoView({ behavior: "auto", block: "start" });
    section.querySelector("input,select,textarea,button")?.focus?.({ preventScroll: true });
    return section;
  } catch (error) {
    section.dataset.kairosProjectSetupLoadFailed = BUILD;
    if (status) status.textContent = error?.message || "Project Setup could not load.";
    if (trigger instanceof HTMLButtonElement) trigger.disabled = false;
    return null;
  }
}

function ensureProjectSetupController() {
  if (window.KairosManuscriptSetupController?.ready) {
    return Promise.resolve(window.KairosManuscriptSetupController);
  }
  if (setupLoadPromise) return setupLoadPromise;

  let script = document.querySelector(`script[data-kairos-project-setup-loader="${SETUP_SCRIPT}"]`);
  if (script?.dataset.kairosLoadState === "failed") {
    script.remove();
    script = null;
  }
  if (!script) {
    script = document.createElement("script");
    script.type = "module";
    script.src = new URL(`./scripts/${SETUP_SCRIPT}?v=${SETUP_RELEASE}`, document.baseURI).href;
    script.dataset.kairosProjectSetupLoader = SETUP_SCRIPT;
    script.dataset.kairosLoadState = "loading";
    document.body.append(script);
  }

  setupLoadPromise = new Promise((resolve, reject) => {
    let settled = false;
    let poll = 0;
    let timer = 0;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timer);
      script.removeEventListener("error", onError);
      if (error) {
        script.dataset.kairosLoadState = "failed";
        reject(error);
      } else {
        script.dataset.kairosLoadState = "ready";
        resolve(window.KairosManuscriptSetupController);
      }
    };
    const inspect = () => {
      if (window.KairosManuscriptSetupController?.ready) finish();
    };
    const onError = () => finish(new Error("Project Setup could not be downloaded."));
    script.addEventListener("error", onError, { once: true });
    poll = window.setInterval(inspect, 50);
    timer = window.setTimeout(() => finish(new Error("Project Setup did not become ready within 15 seconds.")), SETUP_LOAD_TIMEOUT_MS);
    inspect();
  }).finally(() => {
    setupLoadPromise = null;
  });

  return setupLoadPromise;
}

function waitForSetupHydration(section) {
  if (!section.hasAttribute("data-kairos-project-setup-shell")) return Promise.resolve(section);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      observer.disconnect();
      error ? reject(error) : resolve(section);
    };
    const observer = new MutationObserver(() => {
      if (!section.hasAttribute("data-kairos-project-setup-shell")) finish();
    });
    const timer = window.setTimeout(() => finish(new Error("Project Setup loaded but did not render its form.")), 8_000);
    observer.observe(section, { childList: true, subtree: true, attributes: true });
  });
}

async function loadFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const recoveredUnsavedSource = Boolean(state.manuscript && state.source && !state.source.stored && !state.sourceBytes);
  state.error = "";
  state.sourceSaveError = "";
  state.extracting = true;
  state.result = null;
  state.reviewingSource = false;
  state.storageProgress = "";
  render();
  try {
    const format = fileFormat(file);
    validateFile(file, format);
    const sourceBytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractFile(file, format, sourceBytes);
    const normalized = normalizeText(extracted.text);
    if (normalized.length < 50) {
      throw new Error(format === "pdf"
        ? "This PDF contains no usable selectable text. It may be scanned or image-only; OCR is not enabled."
        : "No usable manuscript text was found in this file.");
    }
    if (normalized.length > MAX_TEXT_CHARS) {
      throw new Error(`The extracted manuscript contains ${normalized.length.toLocaleString()} characters. Intake supports up to ${MAX_TEXT_CHARS.toLocaleString()} characters.`);
    }

    if (recoveredUnsavedSource) rotateProjectId("legacy-draft");
    state.manuscript = normalized;
    state.sourceFile = file;
    state.sourceBytes = sourceBytes;
    state.source = {
      projectId: state.projectId,
      name: file.name,
      filename: file.name,
      size: file.size,
      format,
      pages: extracted.pages || null,
      checksum: "",
      stored: false,
      uploadMode: "chunked-v1",
    };
    state.sourceSaveStatus = "extracted";
    if (!state.title) state.title = file.name.replace(/\.[^.]+$/, "");
    state.extracting = false;
    persistDraft();
    render();

    try {
      state.source.checksum = await checksumBytes(sourceBytes);
      persistDraft();
    } catch (error) {
      markSourceSaveFailure(error, "Checksum generation failed");
      return;
    }

    await saveSelectedSource();
  } catch (error) {
    state.error = error?.message || "Kairos could not extract this manuscript.";
  } finally {
    state.extracting = false;
    state.storing = false;
    state.storageProgress = "";
    persistDraft();
    render();
  }
}

async function retrySourceSave() {
  state.error = "";
  if (!state.sourceBytes || !state.sourceFile) {
    state.error = "The manuscript text is retained, but Safari no longer has the original file bytes. Select the original file once to begin a clean verified chunk upload.";
    render();
    return;
  }
  try {
    if (!state.source?.checksum) state.source.checksum = await checksumBytes(state.sourceBytes);
    await saveSelectedSource();
  } catch {
    // saveSelectedSource records the recoverable error.
  }
}

async function saveSelectedSource() {
  if (!state.sourceFile || !state.sourceBytes) throw new Error("Select the original manuscript file before retrying source storage.");
  state.storing = true;
  state.sourceSaveStatus = "saving";
  state.sourceSaveError = "";
  state.error = "";
  state.storageProgress = "Preparing verified source chunks…";
  persistDraft();
  render();
  try {
    await storeDurableSource();
    state.sourceSaveStatus = "saved";
    state.sourceSaveError = "";
    state.error = "";
    state.storageProgress = "";
    persistDraft();
  } catch (error) {
    markSourceSaveFailure(error, "Source storage failed");
    throw error;
  } finally {
    state.storing = false;
    state.storageProgress = "";
    persistDraft();
    render();
  }
}

function markSourceSaveFailure(error, label) {
  const message = error?.message || "The manuscript source could not be stored.";
  const retryInstruction = state.sourceBytes
    ? "The file bytes and extracted manuscript remain in memory; retry the verified chunk save."
    : "Select the original file once to begin a clean verified chunk upload.";
  state.sourceSaveStatus = "failed";
  state.sourceSaveError = message;
  state.error = `${label}. Your extracted manuscript is retained (${state.manuscript.length.toLocaleString()} characters). ${retryInstruction} ${message}`;
  persistDraft();
  render();
}

async function storeDurableSource() {
  const file = state.sourceFile;
  const fileBytes = state.sourceBytes;
  if (!file || !fileBytes) throw new Error("The original manuscript bytes are unavailable.");
  const textBytes = new TextEncoder().encode(state.manuscript);
  let projectAttempt = 1;
  while (projectAttempt <= 2) {
    try {
      const body = await storeChunkedBytes({
        fileBytes,
        textBytes,
        filename: safeUploadName(file.name),
        contentType: file.type || contentTypeForFormat(state.source?.format),
        format: state.source?.format || fileFormat(file),
        pages: state.source?.pages || null,
        checksum: state.source?.checksum || await checksumBytes(fileBytes),
      });
      applyStoredSource(body);
      return;
    } catch (error) {
      if (projectAttempt === 1 && TRANSIENT_SOURCE_STATUSES.has(Number(error?.status || 0))) {
        state.recoveryCount += 1;
        rotateProjectId(error.status || "transient");
        setStorageProgress("Starting a clean verified source transaction…");
        projectAttempt += 1;
        continue;
      }
      throw error;
    }
  }
}

async function storePastedText() {
  const textBytes = new TextEncoder().encode(state.manuscript);
  const filename = `${safeName(state.title || "manuscript")}.txt`;
  state.storing = true;
  state.sourceSaveStatus = "saving";
  state.sourceSaveError = "";
  state.error = "";
  state.storageProgress = "Preparing verified text chunks…";
  persistDraft();
  render();
  try {
    const body = await storeChunkedBytes({
      fileBytes: textBytes,
      textBytes,
      filename,
      contentType: "text/plain; charset=utf-8",
      format: "txt",
      pages: null,
      checksum: await checksumBytes(textBytes),
    });
    applyStoredSource(body);
    state.sourceSaveStatus = "saved";
    state.sourceSaveError = "";
    state.error = "";
    persistDraft();
  } catch (error) {
    markSourceSaveFailure(error, "Source storage failed");
    throw error;
  } finally {
    state.storing = false;
    state.storageProgress = "";
    persistDraft();
    render();
  }
}

async function storeChunkedBytes({ fileBytes, textBytes, filename, contentType, format, pages, checksum }) {
  const projectId = ensureProjectId();
  const uploadId = createUploadId();
  const fileChunks = Math.max(1, Math.ceil(fileBytes.length / FILE_CHUNK_BYTES));
  const textChunks = Math.max(1, Math.ceil(textBytes.length / TEXT_CHUNK_BYTES));
  const totalChunks = fileChunks + textChunks;

  setStorageProgress(`Preparing ${totalChunks} verified source chunks…`);
  const session = await requestJSON(sourcePath(projectId, "session"), {
    method: "POST",
    body: {
      uploadId,
      title: state.title || filename.replace(/\.[^.]+$/, "") || "Untitled manuscript",
      filename,
      contentType,
      format,
      size: fileBytes.length,
      textBytes: textBytes.length,
      fileChunks,
      textChunks,
      pages,
      checksum,
    },
    stage: "source session",
  });
  if (session?.upload?.uploadId !== uploadId) {
    throw storageFailure(409, "The source session returned an unexpected upload identifier.");
  }

  await uploadChunkSet(projectId, "file", fileBytes, FILE_CHUNK_BYTES, fileChunks, uploadId, 0, totalChunks);
  await uploadChunkSet(projectId, "text-chunk", textBytes, TEXT_CHUNK_BYTES, textChunks, uploadId, fileChunks, totalChunks);
  setStorageProgress("Verifying the complete source and extracted manuscript…");
  return requestJSON(sourcePath(projectId, "commit"), {
    method: "POST",
    headers: { "X-Kairos-Upload-Id": uploadId },
    body: { uploadId },
    stage: "source commit",
  });
}

async function uploadChunkSet(projectId, routeKind, bytes, chunkSize, count, uploadId, completedBefore, totalChunks) {
  const label = routeKind === "file" ? "source file" : "manuscript text";
  for (let index = 0; index < count; index += 1) {
    const start = index * chunkSize;
    const end = Math.min(bytes.length, start + chunkSize);
    const chunk = bytes.slice(start, end);
    const completed = completedBefore + index;
    const percent = Math.max(1, Math.round((completed / totalChunks) * 100));
    setStorageProgress(`Securing ${label} chunk ${index + 1} of ${count} (${percent}%)…`);
    await uploadChunkWithRetry(projectId, routeKind, index, chunk, uploadId);
  }
}

async function uploadChunkWithRetry(projectId, kind, index, chunk, uploadId) {
  let lastError = null;
  for (let attempt = 1; attempt <= CHUNK_RETRY_LIMIT; attempt += 1) {
    try {
      return await requestBinary(sourcePath(projectId, `${kind}/${index}`), chunk, {
        uploadId,
        attempt,
        stage: `${kind} chunk ${index + 1}`,
      });
    } catch (error) {
      lastError = error;
      if (!TRANSIENT_SOURCE_STATUSES.has(Number(error?.status || 0)) || attempt === CHUNK_RETRY_LIMIT) throw error;
      setStorageProgress(`Retrying ${kind === "file" ? "source" : "text"} chunk ${index + 1}…`);
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

function applyStoredSource(body) {
  if (!body?.source) throw new Error("The source-storage response did not include the stored manuscript record.");
  state.source = {
    ...normalizeSource(body.source),
    projectId: body.source.projectId || state.projectId,
    name: body.source.name || body.source.filename || state.sourceFile?.name || "manuscript",
    filename: body.source.filename || body.source.name || state.sourceFile?.name || "manuscript",
    stored: true,
    uploadMode: body.source.uploadMode || "chunked-v1",
  };
  state.projectId = state.source.projectId || state.projectId;
  window.dispatchEvent(new CustomEvent("kairos:production:state-changed"));
}

async function runIntake() {
  state.title = document.querySelector("#ms-title")?.value.trim() || "Untitled manuscript";
  state.manuscript = document.querySelector("#ms-body")?.value || state.manuscript || "";
  persistDraft();
  if (state.manuscript.trim().length < 50) {
    state.error = state.sourceSaveError
      ? `Your manuscript upload was retained, but its extracted text is unavailable. ${state.sourceSaveError}`
      : "Provide at least 50 characters of manuscript text.";
    render();
    return;
  }
  if (state.manuscript.length > MAX_TEXT_CHARS) {
    state.error = `This manuscript contains ${state.manuscript.length.toLocaleString()} characters. Manuscript Studio supports up to ${MAX_TEXT_CHARS.toLocaleString()} characters.`;
    render();
    return;
  }
  if (state.source && !state.source.stored && !state.sourceBytes) {
    state.error = "Select the original manuscript file once. Kairos retained the extracted text, but the previous failed upload did not retain browser file bytes.";
    render();
    return;
  }

  let stage = "source storage";
  state.error = "";
  try {
    if (!state.source?.stored) {
      if (state.sourceFile && state.sourceBytes) await saveSelectedSource();
      else await storePastedText();
    }
    if (!state.source?.stored) throw new Error("The manuscript source was not confirmed as stored.");

    stage = "production intake";
    state.working = true;
    render();
    const response = await fetch("/api/manuscript/intake/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ title: state.title, manuscript: state.manuscript, source: state.source }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || "The manuscript could not advance into production intake.");
    state.result = body;
    state.reviewingSource = false;
    stage = "registry update";
    await updateRegistry(body);
    persistDraft();
  } catch (error) {
    if (!state.error) state.error = `Kairos stopped during ${stage}: ${error?.message || "The manuscript could not advance into production intake."}`;
  } finally {
    state.working = false;
    persistDraft();
    render();
  }
}

async function updateRegistry(intake) {
  const projectId = ensureProjectId();
  const response = await fetch(`/api/production-registry/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
    body: JSON.stringify({
      title: state.title,
      status: "production_intake",
      stage: "project_setup",
      progress: 25,
      activeWorkspace: "manuscript-studio",
      sourceProjectId: intake.projectID || null,
      summary: intake.customerMessage || "Manuscript accepted into production intake.",
      nextAction: intake.workflow?.requiredNextActions?.[0] || "Continue project setup.",
      checkpoints: [
        { id: "durable-source", label: "Original manuscript source stored", status: "completed", recordedAt: state.source?.storedAt || new Date().toISOString() },
        { id: "production-intake", label: "Production intake created", status: "completed", recordedAt: new Date().toISOString() },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message || "The production registry could not be updated.");
  }
  window.KairosProductionWorkspace?.refresh?.();
}

function ensureProjectId() {
  if (state.projectId) return state.projectId;
  const active = readJSON(ACTIVE_KEY);
  state.projectId = active?.workspace === "manuscript-studio" && active.projectId
    ? active.projectId
    : createProjectId();
  writeActiveProject();
  persistDraft();
  return state.projectId;
}

function rotateProjectId(reason) {
  const previousProjectId = state.projectId || activeProjectId();
  state.projectId = createProjectId();
  if (state.source) state.source = { ...state.source, projectId: state.projectId, stored: false, uploadMode: "chunked-v1" };
  writeActiveProject({ recoveryFrom: previousProjectId, recoveryReason: String(reason || "source-recovery") });
  persistDraft();
  return state.projectId;
}

function createProjectId() {
  return `manuscript-studio-${createUUID()}`;
}

function createUploadId() {
  return `upload-${createUUID()}`;
}

function createUUID() {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function writeActiveProject(extra = {}) {
  sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({
    workspace: "manuscript-studio",
    projectId: state.projectId,
    openedAt: new Date().toISOString(),
    build: BUILD,
    ...extra,
  }));
}

function activeProjectId() {
  const active = readJSON(ACTIVE_KEY);
  return active?.workspace === "manuscript-studio" ? active.projectId || null : null;
}

function persistDraft() {
  if (!state.manuscript && !state.title && !state.source) return;
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      build: BUILD,
      title: state.title,
      manuscript: state.manuscript,
      source: state.source,
      sourceSaveStatus: state.sourceSaveStatus,
      sourceSaveError: state.sourceSaveError,
      projectId: state.projectId,
      savedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.warn("Kairos could not persist the recoverable manuscript draft.", error);
  }
}

function restoreDraft() {
  const draft = readJSON(DRAFT_KEY);
  if (!draft || typeof draft !== "object") return;
  const manuscript = String(draft.manuscript || "");
  if (manuscript.length > MAX_TEXT_CHARS) return;
  const source = draft.source ? normalizeSource(draft.source) : null;
  const legacyUnsaved = Boolean(manuscript && source && !source.stored && draft.build !== BUILD);
  state.title = String(draft.title || state.title || "");
  state.manuscript = manuscript;
  state.source = source;
  state.sourceFile = null;
  state.sourceBytes = null;
  state.sourceSaveStatus = source?.stored ? "saved" : manuscript ? "restored" : "idle";
  state.sourceSaveError = "";
  state.projectId = source?.stored ? draft.projectId || source.projectId || activeProjectId() : null;
  state.error = manuscript && !source?.stored
    ? `Recovered ${manuscript.length.toLocaleString()} manuscript characters. Select the original manuscript file once to preserve it with verified chunk storage.`
    : "";
  if (legacyUnsaved) {
    try { sessionStorage.removeItem(ACTIVE_KEY); } catch {}
  }
  persistDraft();
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); }
  catch { /* Session storage cleanup is best effort. */ }
}

function normalizeSource(value) {
  return {
    projectId: value.projectId || state.projectId,
    name: value.name || value.filename || "manuscript",
    filename: value.filename || value.name || "manuscript",
    size: Number(value.size || 0),
    format: value.format || "txt",
    pages: value.pages || null,
    checksum: value.checksum || "",
    stored: value.stored !== false,
    storedAt: value.storedAt || null,
    sourceDownloadURL: value.sourceDownloadURL || null,
    extractedTextURL: value.extractedTextURL || null,
    uploadMode: value.uploadMode || (value.stored !== false ? "legacy" : "chunked-v1"),
  };
}

function sourcePath(projectId, suffix) {
  return `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source/${suffix}?clientBuild=${encodeURIComponent(BUILD)}&recovery=${state.recoveryCount}`;
}

function setStorageProgress(message) {
  state.storageProgress = String(message || "");
  const node = document.querySelector("#manuscript-studio-overlay .manuscript-progress");
  if (node) node.textContent = state.storageProgress;
}

function fileFormat(file) {
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (name.endsWith(".rtf") || file.type === "application/rtf" || file.type === "text/rtf") return "rtf";
  if (name.endsWith(".md") || file.type === "text/markdown") return "md";
  if (name.endsWith(".txt") || file.type === "text/plain" || !file.type) return "txt";
  throw new Error("Supported manuscript formats are TXT, MD, RTF, DOCX, and PDF.");
}

function validateFile(file, format) {
  if (!file.size) throw new Error("The selected file is empty.");
  if (format === "docx" && file.size > MAX_DOCX_BYTES) throw new Error("DOCX files must be 15 MB or smaller.");
  if (format === "pdf" && file.size > MAX_PDF_BYTES) throw new Error("PDF files must be 20 MB or smaller.");
  if (!["docx", "pdf"].includes(format) && file.size > 5 * 1024 * 1024) throw new Error("Text manuscript files must be 5 MB or smaller.");
}

async function extractFile(file, format, sourceBytes) {
  if (format === "docx") return extractDocx(sourceBytes);
  if (format === "pdf") return extractPdf(sourceBytes);
  const raw = new TextDecoder("utf-8").decode(sourceBytes);
  return { text: format === "rtf" ? stripRtf(raw) : raw };
}

async function extractDocx(sourceBytes) {
  const existing = globalThis.KairosDocxExtractor || globalThis.__KAIROS_MAMMOTH_TEST_MODULE__;
  if (typeof existing?.extractRawText === "function") {
    const result = await existing.extractRawText({ arrayBuffer: sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength) });
    const fatal = (result?.messages || []).find(message => message?.type === "error");
    if (fatal) throw new Error(fatal.message || "The DOCX file could not be read.");
    return { text: result?.value || "" };
  }
  const mammoth = await importWithFallback(LIBRARIES.mammoth, "DOCX extraction service");
  const candidates = [mammoth, mammoth?.default, mammoth?.default?.default];
  const api = candidates.find(candidate => typeof candidate?.extractRawText === "function");
  if (!api) throw new Error("The DOCX extraction service did not expose extractRawText.");
  const result = await api.extractRawText({ arrayBuffer: sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength) });
  const warnings = (result.messages || []).filter(message => message.type === "error");
  if (warnings.length) throw new Error(warnings[0].message || "The DOCX file could not be read.");
  return { text: result.value || "" };
}

async function extractPdf(sourceBytes) {
  const pdfjs = await importWithFallback(LIBRARIES.pdfjs, "PDF extraction service");
  if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: sourceBytes, useWorkerFetch: true, isEvalSupported: false }).promise;
  } catch (error) {
    if (/password/i.test(String(error?.message || ""))) throw new Error("Password-protected PDFs are not supported.");
    throw new Error("The PDF is damaged, unsupported, or could not be opened.");
  }
  if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`PDF manuscripts are limited to ${MAX_PDF_PAGES} pages.`);
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent({ includeMarkedContent: false });
    pages.push(joinPdfItems(content.items || []));
    page.cleanup?.();
  }
  await pdf.destroy?.();
  return { text: pages.join("\n\n"), pages: pages.length };
}

function joinPdfItems(items) {
  let output = "";
  let previousY = null;
  for (const item of items) {
    if (!item || typeof item.str !== "string") continue;
    const y = Array.isArray(item.transform) ? item.transform[5] : null;
    if (previousY !== null && y !== null && Math.abs(y - previousY) > 4) output += "\n";
    else if (output && !output.endsWith("\n") && !/\s$/.test(output)) output += " ";
    output += item.str;
    previousY = y;
  }
  return output;
}

function stripRtf(value) {
  return String(value || "")
    .replace(/\\par[d]?\b/g, "\n")
    .replace(/\\tab\b/g, "\t")
    .replace(/\\'[0-9a-fA-F]{2}/g, match => String.fromCharCode(parseInt(match.slice(2), 16)))
    .replace(/\\u(-?\d+)\??/g, (_, number) => String.fromCharCode(Number(number) < 0 ? Number(number) + 65536 : Number(number)))
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function importWithFallback(urls, label) {
  let lastError;
  for (const url of urls) {
    try { return await import(url); }
    catch (error) { lastError = error; }
  }
  throw new Error(`${label} is temporarily unavailable.${lastError?.message ? ` (${lastError.message})` : ""}`);
}

async function checksumBytes(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digestInput = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function contentTypeForFormat(format) {
  if (format === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (format === "pdf") return "application/pdf";
  if (format === "rtf") return "application/rtf";
  if (format === "md") return "text/markdown; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function safeUploadName(value) {
  const raw = String(value || "manuscript").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim();
  return raw.slice(0, 180) || "manuscript";
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function safeName(value) {
  return String(value || "manuscript")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "manuscript";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function readJSON(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || "null"); }
  catch { return null; }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

mount();
