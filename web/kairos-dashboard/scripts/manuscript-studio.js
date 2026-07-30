const BUILD = "manuscript-studio-docx-export-resolution-20260730-1";
const MAX_TEXT_CHARS = 600000;
const MAX_DOCX_BYTES = 15 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 400;
const ACTIVE_KEY = "kairos.production.active-workspace";
const DRAFT_KEY = "kairos.manuscript-studio.recoverable-draft.v1";
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
  sourceSaveStatus: "idle",
  sourceSaveError: "",
  projectId: null,
};

const LIBRARIES = {
  mammoth: ["https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm", "https://esm.sh/mammoth@1.8.0"],
  pdfjs: ["https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs", "https://esm.sh/pdfjs-dist@4.10.38/build/pdf.mjs"],
};

window.addEventListener("kairos:manuscript:restore", event => {
  const detail = event.detail || {};
  state.projectId = detail.project?.projectId || detail.source?.projectId || null;
  state.title = detail.project?.title || detail.source?.title || "Untitled manuscript";
  state.manuscript = String(detail.manuscript || "");
  state.source = detail.source ? normalizeSource(detail.source) : null;
  state.sourceFile = null;
  state.sourceSaveStatus = state.source?.stored ? "saved" : state.manuscript ? "restored" : "idle";
  state.sourceSaveError = "";
  state.result = null;
  state.error = state.manuscript.length > MAX_TEXT_CHARS
    ? `This manuscript contains ${state.manuscript.length.toLocaleString()} characters. Manuscript Studio supports up to ${MAX_TEXT_CHARS.toLocaleString()} characters.`
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
  if (!state.open) return;
  const overlay = document.createElement("div");
  overlay.id = "manuscript-studio-overlay";
  overlay.className = "manuscript-overlay";
  overlay.innerHTML = `<section class="manuscript-panel"><header><div><p class="eyebrow">Customer Portal · Publishing</p><h2>Manuscript Studio</h2><p>Upload a manuscript, preserve the original source, and advance it directly into MMG production intake.</p></div><button data-close aria-label="Close">×</button></header>${state.result ? resultView() : inputView()}</section>`;
  document.body.appendChild(overlay);
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
  overlay.querySelector("[data-edit]")?.addEventListener("click", () => {
    state.result = null;
    render();
  });
  overlay.querySelector("[data-finish]")?.addEventListener("click", () => {
    clearDraft();
    state.open = false;
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed"));
    render();
  });
}

function inputView() {
  const busy = state.working || state.extracting || state.storing;
  const label = state.extracting
    ? "Extracting file…"
    : state.storing
      ? "Preserving source…"
      : state.working
        ? "Creating production intake…"
        : "Continue to Production Intake";
  const source = sourceView();
  const retry = state.sourceFile && state.sourceSaveStatus === "failed"
    ? `<button type="button" class="secondary" data-retry-source ${busy ? "disabled" : ""}>Retry source save</button>`
    : "";
  return `<div class="manuscript-grid"><label>Publication title<input id="ms-title" maxlength="200" value="${esc(state.title)}" placeholder="Book title"></label><label>Manuscript file<input data-file type="file" accept=".txt,.md,.rtf,.docx,.pdf,text/plain,text/markdown,application/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"></label></div>${source}<label>Extracted manuscript text<textarea id="ms-body" maxlength="${MAX_TEXT_CHARS}" placeholder="Paste text or load TXT, MD, RTF, DOCX, or a text-based PDF.">${esc(state.manuscript)}</textarea></label><p class="manuscript-note">Manuscript Studio accepts up to ${MAX_TEXT_CHARS.toLocaleString()} extracted characters. The original source and extracted text are preserved in the Kairos project runtime for cross-session and cross-device recovery. Scanned or image-only PDFs are rejected because OCR is not enabled.</p>${busy ? `<p class="manuscript-progress">${label}</p>` : ""}${state.error ? `<p class="manuscript-error">${esc(state.error)}</p>` : ""}<div class="manuscript-actions">${retry}<button class="primary" data-advance ${busy ? "disabled" : ""}>${label}</button></div>`;
}

function sourceView() {
  if (!state.source) {
    if (!state.manuscript) return "";
    return `<p class="manuscript-source"><strong>Recovered manuscript:</strong> ${state.manuscript.length.toLocaleString()} characters retained in this Safari session · source storage pending</p>`;
  }
  const details = `${esc(state.source.name)} · ${esc(String(state.source.format || "txt").toUpperCase())} · ${formatBytes(state.source.size)}${state.source.pages ? ` · ${state.source.pages} pages` : ""}`;
  if (state.source.stored) {
    return `<p class="manuscript-source"><strong>Durable source:</strong> ${details} · stored and verified · ${state.manuscript.length.toLocaleString()} characters ready</p>`;
  }
  const status = state.sourceSaveStatus === "failed"
    ? "text extracted and retained; source save failed"
    : state.sourceSaveStatus === "saving"
      ? "preserving original source"
      : "text extracted and retained; source storage pending";
  return `<p class="manuscript-source"><strong>Selected manuscript:</strong> ${details} · ${status} · ${state.manuscript.length.toLocaleString()} characters retained</p>`;
}

function resultView() {
  const r = state.result || {};
  const actions = r.workflow?.requiredNextActions || [];
  return `<div class="manuscript-result"><div class="manuscript-status"><span>Production intake created</span><strong>${esc(r.status || "production_intake")}</strong></div><h3>${esc(r.customerMessage || "Your manuscript has advanced into MMG production intake.")}</h3><p><strong>Project:</strong> ${esc(r.projectID || "—")} · <strong>Intake:</strong> ${esc(r.intakeID || "—")}</p><p><strong>Accepted source:</strong> ${Number(r.manuscript?.characterCount || state.manuscript.length).toLocaleString()} characters · ${Number(r.manuscript?.wordCount || 0).toLocaleString()} words</p><div class="issue-list">${actions.map((item, index) => `<article><b>${index + 1}. ${esc(item)}</b><p>${index === 0 ? "This is the next required production step." : "Queued in the production setup sequence."}</p></article>`).join("")}</div><p class="manuscript-note">The original manuscript source remains stored in the durable production registry. This workflow does not stop at a file download.</p><div class="manuscript-actions"><button class="primary" data-finish>Return to Production Center</button><button class="secondary" data-edit>Review Intake Source</button></div></div>`;
}

async function loadFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  state.error = "";
  state.sourceSaveError = "";
  state.extracting = true;
  state.result = null;
  render();
  try {
    const format = fileFormat(file);
    validateFile(file, format);
    const extracted = await extractFile(file, format);
    const normalized = normalizeText(extracted.text);
    if (normalized.length < 50) {
      throw new Error(format === "pdf"
        ? "This PDF contains no usable selectable text. It may be scanned or image-only; OCR is not enabled."
        : "No usable manuscript text was found in this file.");
    }
    if (normalized.length > MAX_TEXT_CHARS) {
      throw new Error(`The extracted manuscript contains ${normalized.length.toLocaleString()} characters. Intake supports up to ${MAX_TEXT_CHARS.toLocaleString()} characters.`);
    }

    state.manuscript = normalized;
    state.sourceFile = file;
    state.source = {
      name: file.name,
      size: file.size,
      format,
      pages: extracted.pages || null,
      checksum: "",
      stored: false,
    };
    state.sourceSaveStatus = "extracted";
    if (!state.title) state.title = file.name.replace(/\.[^.]+$/, "");
    state.extracting = false;
    persistDraft();
    render();

    try {
      state.source.checksum = await fileChecksum(file);
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
    persistDraft();
    render();
  }
}

async function retrySourceSave() {
  state.error = "";
  if (!state.sourceFile) {
    state.error = "The manuscript text is retained, but Safari no longer has the original file. Select the file again to preserve the original source.";
    render();
    return;
  }
  try {
    if (!state.source?.checksum) {
      state.source.checksum = await fileChecksum(state.sourceFile);
    }
    await saveSelectedSource();
  } catch {
    // saveSelectedSource records the recoverable error.
  }
}

async function saveSelectedSource() {
  const file = state.sourceFile;
  if (!file) throw new Error("Select the original manuscript file before retrying source storage.");
  state.storing = true;
  state.sourceSaveStatus = "saving";
  state.sourceSaveError = "";
  state.error = "";
  persistDraft();
  render();
  try {
    await storeDurableSource(file);
    state.sourceSaveStatus = "saved";
    state.sourceSaveError = "";
    state.error = "";
    persistDraft();
  } catch (error) {
    markSourceSaveFailure(error, "Source storage failed");
    throw error;
  } finally {
    state.storing = false;
    persistDraft();
    render();
  }
}

function markSourceSaveFailure(error, label) {
  const message = error?.message || "The manuscript source could not be stored.";
  state.sourceSaveStatus = "failed";
  state.sourceSaveError = message;
  state.error = `${label}. Your extracted manuscript is retained (${state.manuscript.length.toLocaleString()} characters). Retry the source save without uploading the file again. ${message}`;
  persistDraft();
  render();
}

async function storeDurableSource(file) {
  const projectId = ensureProjectId();
  const form = new FormData();
  form.append("file", file, safeUploadName(file.name));
  form.append("extractedText", state.manuscript);
  form.append("title", state.title || file.name.replace(/\.[^.]+$/, "") || "Untitled manuscript");
  form.append("format", state.source?.format || fileFormat(file));
  form.append("pages", String(state.source?.pages || ""));
  form.append("checksum", state.source?.checksum || "");
  const response = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source`, {
    method: "POST",
    credentials: "include",
    headers: { "X-MMG-Client-Build": BUILD },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `The manuscript source could not be stored (HTTP ${response.status}).`);
  if (!body?.source) throw new Error("The source-storage response did not include the stored manuscript record.");
  state.source = { ...normalizeSource(body.source), stored: true };
  window.dispatchEvent(new CustomEvent("kairos:production:state-changed"));
}

async function storePastedText() {
  const projectId = ensureProjectId();
  const filename = `${safeName(state.title || "manuscript")}.txt`;
  state.storing = true;
  state.sourceSaveStatus = "saving";
  persistDraft();
  render();
  try {
    const response = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source-text`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      body: JSON.stringify({ title: state.title, manuscript: state.manuscript, filename }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || `The extracted manuscript source could not be stored (HTTP ${response.status}).`);
    if (!body?.source) throw new Error("The source-storage response did not include the stored manuscript record.");
    state.source = { ...normalizeSource(body.source), stored: true };
    state.sourceSaveStatus = "saved";
    state.sourceSaveError = "";
    state.error = "";
    persistDraft();
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed"));
  } catch (error) {
    markSourceSaveFailure(error, "Source storage failed");
    throw error;
  } finally {
    state.storing = false;
    persistDraft();
    render();
  }
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

  let stage = "source storage";
  state.error = "";
  try {
    if (!state.source?.stored) {
      if (state.sourceFile) await saveSelectedSource();
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
      body: JSON.stringify({ title: state.title, manuscript: state.manuscript, source: state.source }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || "The manuscript could not advance into production intake.");
    state.result = body;
    stage = "registry update";
    await updateRegistry(body);
    persistDraft();
  } catch (error) {
    if (!state.error) {
      state.error = `Kairos stopped during ${stage}: ${error?.message || "The manuscript could not advance into production intake."}`;
    }
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
        {
          id: "durable-source",
          label: "Original manuscript source stored",
          status: "completed",
          recordedAt: state.source?.storedAt || new Date().toISOString(),
        },
        {
          id: "production-intake",
          label: "Production intake created",
          status: "completed",
          recordedAt: new Date().toISOString(),
        },
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
    : `manuscript-studio-${crypto.randomUUID()}`;
  sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({
    workspace: "manuscript-studio",
    projectId: state.projectId,
    openedAt: new Date().toISOString(),
    build: BUILD,
  }));
  persistDraft();
  return state.projectId;
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
  state.title = String(draft.title || state.title || "");
  state.manuscript = manuscript;
  state.source = draft.source ? { ...draft.source, stored: Boolean(draft.source.stored) } : null;
  state.sourceSaveStatus = state.source?.stored ? "saved" : manuscript ? "restored" : "idle";
  state.sourceSaveError = String(draft.sourceSaveError || "");
  state.projectId = draft.projectId || state.projectId || activeProjectId();
  if (manuscript && !state.source?.stored) {
    state.error = `Recovered ${manuscript.length.toLocaleString()} manuscript characters from this Safari session. Continue to retry durable source storage.`;
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Session storage cleanup is best effort.
  }
}

function normalizeSource(value) {
  return {
    projectId: value.projectId || state.projectId,
    name: value.name || value.filename || "manuscript",
    size: Number(value.size || 0),
    format: value.format || "txt",
    pages: value.pages || null,
    checksum: value.checksum || "",
    stored: value.stored !== false,
    storedAt: value.storedAt || null,
    sourceDownloadURL: value.sourceDownloadURL || null,
    extractedTextURL: value.extractedTextURL || null,
  };
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

async function extractFile(file, format) {
  if (format === "docx") return extractDocx(file);
  if (format === "pdf") return extractPdf(file);
  const raw = await file.text();
  return { text: format === "rtf" ? stripRtf(raw) : raw };
}

async function extractDocx(file) {
  const mammoth = await importWithFallback(LIBRARIES.mammoth, "DOCX extraction service");
  const extractRawText = resolveMammothExtractRawText(mammoth);
  const result = await extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const warnings = (result.messages || []).filter(message => message.type === "error");
  if (warnings.length) throw new Error(warnings[0].message || "The DOCX file could not be read.");
  return { text: result.value || "" };
}

function resolveMammothExtractRawText(moduleNamespace) {
  const candidates = [
    moduleNamespace,
    moduleNamespace?.default,
    moduleNamespace?.default?.default,
  ];
  for (const candidate of candidates) {
    if (typeof candidate?.extractRawText === "function") {
      return candidate.extractRawText.bind(candidate);
    }
  }
  throw new Error("DOCX extraction service loaded without a usable extractRawText function.");
}

async function extractPdf(file) {
  const pdfjs = await importWithFallback(LIBRARIES.pdfjs, "PDF extraction service");
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";
  }
  let pdf;
  try {
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useWorkerFetch: true,
      isEvalSupported: false,
    }).promise;
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
    try {
      return await import(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${label} is temporarily unavailable.${lastError?.message ? ` (${lastError.message})` : ""}`);
}

async function fileChecksum(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
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
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

mount();
