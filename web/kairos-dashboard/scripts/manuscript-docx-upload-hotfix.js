const BUILD = "manuscript-docx-upload-hotfix-20260730-1";
const ACTIVE_KEY = "kairos.production.active-workspace";
const MAX_TEXT_CHARS = 600000;
const MAMMOTH_URLS = [
  "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm",
  "https://esm.sh/mammoth@1.8.0",
];

const pending = {
  file: null,
  manuscript: "",
  title: "",
  projectId: null,
  source: null,
  saving: false,
};

document.addEventListener("change", interceptDocxSelection, true);
document.addEventListener("click", interceptPendingAdvance, true);

window.KairosManuscriptDocxHotfix = Object.freeze({
  build: BUILD,
  ready: true,
});

async function interceptDocxSelection(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches("[data-file]")) return;
  const file = input.files?.[0];
  if (!file || !isDocx(file)) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  pending.file = file;
  pending.manuscript = "";
  pending.title = currentTitle(file);
  pending.projectId = ensureProjectId();
  pending.source = null;

  setBusy(true, "Extracting DOCX manuscript…");
  clearError();

  try {
    const extractor = await loadMammothExtractor();
    const result = await extractor({ arrayBuffer: await file.arrayBuffer() });
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
    };

    restoreIntoStudio(pending.source);
    setBusy(true, "Preserving original DOCX source…");
    await persistPendingDocx();
  } catch (error) {
    showError(error?.message || "Kairos could not extract this DOCX manuscript.");
  } finally {
    setBusy(false);
  }
}

async function interceptPendingAdvance(event) {
  const button = event.target instanceof Element ? event.target.closest("[data-advance]") : null;
  if (!button || !pending.file || !pending.manuscript || pending.source?.stored) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  setBusy(true, "Retrying original DOCX source save…");
  clearError();
  try {
    await persistPendingDocx();
    requestAnimationFrame(() => document.querySelector("[data-advance]")?.click());
  } catch (error) {
    showError(`Source storage failed. Your extracted manuscript is retained (${pending.manuscript.length.toLocaleString()} characters). Tap Continue to retry. ${error?.message || "The original DOCX could not be stored."}`);
  } finally {
    setBusy(false);
  }
}

async function persistPendingDocx() {
  if (pending.saving) return;
  if (!pending.file || !pending.manuscript || !pending.projectId) {
    throw new Error("Select the DOCX manuscript again before retrying source storage.");
  }

  pending.saving = true;
  try {
    if (!pending.source?.checksum) {
      pending.source.checksum = await checksumFile(pending.file);
    }

    const form = new FormData();
    form.append("file", pending.file, safeUploadName(pending.file.name));
    form.append("extractedText", pending.manuscript);
    form.append("title", pending.title || "Untitled manuscript");
    form.append("format", "docx");
    form.append("pages", "");
    form.append("checksum", pending.source.checksum);

    const response = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(pending.projectId)}/source`, {
      method: "POST",
      credentials: "include",
      headers: { "X-MMG-Client-Build": BUILD },
      body: form,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || `The manuscript source could not be stored (HTTP ${response.status}).`);
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
    };
    restoreIntoStudio(pending.source);
    clearError();
  } finally {
    pending.saving = false;
  }
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
    if (typeof candidate?.extractRawText === "function") {
      return candidate.extractRawText.bind(candidate);
    }
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
  const id = `manuscript-studio-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({
    workspace: "manuscript-studio",
    projectId: id,
    openedAt: new Date().toISOString(),
    build: BUILD,
  }));
  return id;
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

async function checksumFile(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
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
