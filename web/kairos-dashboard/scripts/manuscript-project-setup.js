const BUILD = "kairos-manuscript-project-setup-ui-20260805-5-canonical-cover-normalization";
const ACTIVE_KEY = "kairos.production.active-workspace";
const COVER_LIMIT = 8 * 1024 * 1024;
const COVER_TIMEOUT_MS = 90_000;
const SETUP_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 12_000;
const PORTRAIT_WIDTH = 2048;
const PORTRAIT_HEIGHT = 3072;

const state = {
  initialized: false,
  mountScheduled: false,
  busy: false,
  phase: "",
  error: "",
  record: null,
  draft: null,
  operationId: "",
  checkedProjects: new Set(),
};

function init() {
  if (state.initialized) return;
  state.initialized = true;
  document.addEventListener("click", handleClick, true);
  window.addEventListener("kairos:manuscript:restore", scheduleEnhance);
  window.addEventListener("kairos:production:state-changed", scheduleEnhance);
  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.KairosManuscriptSetupController = Object.freeze({
    build: BUILD,
    ready: true,
    canonicalCover: `${PORTRAIT_WIDTH}x${PORTRAIT_HEIGHT}-png`,
    enhance: scheduleEnhance,
    getState: () => ({
      busy: state.busy,
      phase: state.phase,
      error: state.error,
      operationId: state.operationId,
      hasRecord: Boolean(state.record),
      hasDraft: Boolean(state.draft),
    }),
  });
  scheduleEnhance();
}

function scheduleEnhance() {
  if (state.mountScheduled) return;
  state.mountScheduled = true;
  queueMicrotask(() => {
    state.mountScheduled = false;
    enhance();
  });
}

function enhance() {
  const result = document.querySelector("#manuscript-studio-overlay .manuscript-result");
  const projectId = activeProjectId();
  if (!result || !projectId) return;
  let section = result.querySelector("#manuscript-project-setup");
  const needsHydration = Boolean(section?.hasAttribute("data-kairos-project-setup-shell"));
  const isNew = !section;
  const projectChanged = section?.dataset.projectId && section.dataset.projectId !== projectId;
  if (projectChanged) {
    section.remove();
    section = null;
    resetProjectState();
  }
  if (!section) {
    section = document.createElement("section");
    section.id = "manuscript-project-setup";
    section.className = "manuscript-project-setup";
    section.dataset.projectId = projectId;
    section.dataset.controllerBuild = BUILD;
    result.appendChild(section);
  }
  section.dataset.projectId = projectId;
  section.dataset.controllerBuild = BUILD;
  section.removeAttribute("data-kairos-project-setup-shell");
  section.removeAttribute("data-kairos-project-setup-load-failed");
  if (isNew || projectChanged || needsHydration) render(section);
  if ((isNew || projectChanged) && !state.busy && !state.record && !state.checkedProjects.has(projectId)) {
    state.checkedProjects.add(projectId);
    void resumeExisting(projectId);
  }
}

function resetProjectState() {
  state.busy = false;
  state.phase = "";
  state.error = "";
  state.record = null;
  state.draft = null;
  state.operationId = "";
}

function render(section = currentSection()) {
  if (!section) {
    scheduleEnhance();
    return;
  }
  section.setAttribute("aria-busy", state.busy ? "true" : "false");
  section.innerHTML = view();
}

function view() {
  if (state.busy) {
    return `
      <p class="eyebrow">Project setup</p>
      <h3>${esc(state.phase || "Saving production assignment…")}</h3>
      <p class="manuscript-progress">Kairos is completing one bounded step at a time.</p>
      <p class="manuscript-note">Operation: ${esc(state.operationId || "starting")}</p>
      <button type="button" class="secondary" data-setup-status>Check saved status</button>
    `;
  }

  if (state.record) {
    const cover = state.record.setup?.cover;
    return `
      <p class="eyebrow">Production assignment</p>
      <h3>${esc(state.record.setup?.status || state.record.status || "assigned-to-production")}</h3>
      <p>${esc(state.record.nextAction || "Project setup completed.")}</p>
      ${cover ? `<p class="manuscript-note">Canonical cover stored: ${esc(cover.filename || "approved-cover.png")} · ${esc(String(cover.size || 0))} bytes</p>` : ""}
      <div class="issue-list">${(state.record.setup?.assignments || []).map((assignment) => `
        <article><b>${esc(assignment.department)}</b><p>${esc(assignment.role)}</p><small>${esc(assignment.status)}</small></article>
      `).join("")}</div>
      <div class="issue-list">${(state.record.setup?.milestones || []).map((milestone) => `
        <article><b>${esc(milestone.label)}</b><p>${esc(milestone.status)}</p></article>
      `).join("")}</div>
      <p class="manuscript-note">The project is stored in the durable production registry and can be resumed across sessions and devices.</p>
    `;
  }

  const value = state.draft || {};
  return `
    <p class="eyebrow">Next stage</p>
    <h3>Complete Project Setup</h3>
    <p>Confirm publication metadata, choose the approved service, upload the approved cover, and assign the project into production.</p>
    <div class="manuscript-grid">
      <label>Author name<input data-setup-author maxlength="160" value="${esc(value.authorName || "")}" placeholder="Author name"></label>
      <label>Publication title<input data-setup-title maxlength="240" value="${esc(value.publicationTitle || currentTitle())}" placeholder="Publication title"></label>
    </div>
    <div class="manuscript-grid">
      <label>Publishing service<select data-setup-service>
        <option value="">Select service</option>
        ${option("manuscript-correction", "Manuscript Correction", value.service)}
        ${option("editorial-production", "Editorial Production", value.service)}
        ${option("complete-publishing-package", "Complete Publishing Package", value.service)}
        ${option("digital-edition-production", "Digital Edition Production", value.service)}
      </select></label>
      <label>Edition<select data-setup-edition>
        ${option("multi-format", "Digital Asset Edition V2 + KDP", value.edition || "multi-format")}
        ${option("ebook", "eBook", value.edition)}
        ${option("paperback", "Paperback", value.edition)}
        ${option("hardcover", "Hardcover", value.edition)}
        ${option("digital-pdf", "Digital PDF", value.edition)}
      </select></label>
    </div>
    <div class="manuscript-grid">
      <label>Trim size<input data-setup-trim value="${esc(value.trimSize || "6x9")}" maxlength="40"></label>
      <label>ISBN status<select data-setup-isbn>
        ${option("not-decided", "Not decided", value.isbnStatus || "not-decided")}
        ${option("customer-supplied", "Customer supplied", value.isbnStatus)}
        ${option("kdp-free", "KDP free ISBN", value.isbnStatus)}
        ${option("not-required", "Not required", value.isbnStatus)}
      </select></label>
    </div>
    <label>Approved cover<input data-setup-cover type="file" accept="image/png,image/jpeg"><small>PNG or JPEG. Kairos normalizes the full cover to the canonical 2048 × 3072 PNG without destructive cropping.</small></label>
    <label>Production notes<textarea data-setup-notes maxlength="4000" placeholder="Special instructions, deadlines, edition notes, or customer requirements.">${esc(value.notes || "")}</textarea></label>
    ${state.error ? `<p class="manuscript-error" role="alert">${esc(state.error)}</p>` : ""}
    <div class="manuscript-actions">
      <button type="button" class="primary" data-setup-submit>${value.coverStored ? "Retry Assignment Save" : "Save Setup & Assign Production"}</button>
      <button type="button" class="secondary" data-setup-status>Check saved status</button>
    </div>
  `;
}

function handleClick(event) {
  const button = event.target instanceof Element
    ? event.target.closest("[data-setup-submit], [data-setup-status]")
    : null;
  if (!button || !button.closest("#manuscript-project-setup")) return;
  event.preventDefault();
  const section = button.closest("#manuscript-project-setup");
  const projectId = section?.dataset.projectId || activeProjectId();
  if (!section || !projectId) {
    state.error = "Kairos could not identify the active manuscript project. Reopen Manuscript Studio and try again.";
    render(section);
    return;
  }
  if (button.matches("[data-setup-submit]")) void submit(section, projectId);
  else void recover(projectId, true);
}

async function submit(section, projectId) {
  if (state.busy) return;
  const nextDraft = snapshot(section);
  const validation = validate(nextDraft);
  if (validation) {
    state.error = validation;
    state.draft = nextDraft;
    render(section);
    return;
  }

  state.draft = nextDraft;
  state.operationId = newOperationId();
  state.busy = true;
  state.error = "";
  state.phase = state.draft.cover && !state.draft.coverStored
    ? "Normalizing the approved cover to 2048 × 3072 PNG…"
    : "Saving production assignment…";
  render(section);

  try {
    if (state.draft.cover && !state.draft.coverStored) {
      const canonical = await normalizePortraitCover(state.draft.cover, state.draft.publicationTitle);
      if (canonical.size > COVER_LIMIT) {
        throw new Error("The normalized PNG exceeds the 8 MB cover limit. Use a cleaner source image with less embedded noise or transparency.");
      }
      state.phase = "Uploading the canonical approved cover…";
      render();
      await uploadCover(projectId, canonical, state.operationId);
      state.draft.coverStored = true;
      state.phase = "Saving production assignment…";
      render();
    }

    const body = await requestJSON(
      `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/setup`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-MMG-Client-Build": BUILD,
          "X-Kairos-Operation-Id": state.operationId,
          "X-Kairos-Idempotency-Key": state.operationId,
        },
        body: JSON.stringify({
          authorName: state.draft.authorName,
          publicationTitle: state.draft.publicationTitle,
          service: state.draft.service,
          edition: state.draft.edition,
          trimSize: "6x9",
          isbnStatus: state.draft.isbnStatus,
          notes: canonicalNotes(state.draft.notes),
          operationId: state.operationId,
        }),
      },
      SETUP_TIMEOUT_MS,
    );

    state.record = body;
    state.draft = null;
    state.error = "";
    window.KairosProductionWorkspace?.refresh?.();
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed"));
  } catch (caught) {
    state.phase = "Checking whether the assignment was saved…";
    render();
    const recovered = await recover(projectId, false);
    if (!recovered) state.error = userMessage(caught);
  } finally {
    state.busy = false;
    state.phase = "";
    render();
  }
}

function canonicalNotes(notes) {
  const standard = "MMG canonical package: Digital Asset Edition V2; minimum 100-page KDP interior; exact six-file customer ZIP; Canva excluded; approved cover normalized to 2048x3072 PNG.";
  return [standard, String(notes || "").trim()].filter(Boolean).join("\n\n").slice(0, 4000);
}

async function normalizePortraitCover(file, publicationTitle) {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = PORTRAIT_WIDTH;
  canvas.height = PORTRAIT_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false, colorSpace: "srgb" });
  if (!context) throw new Error("This browser could not initialize the cover normalization canvas.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#000000";
  context.fillRect(0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
  const scale = Math.min(PORTRAIT_WIDTH / image.naturalWidth, PORTRAIT_HEIGHT / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (PORTRAIT_WIDTH - width) / 2, (PORTRAIT_HEIGHT - height) / 2, width, height);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The canonical PNG cover could not be encoded.")), "image/png");
  });
  const filename = `${filenameStem(publicationTitle)}_Cover-Portrait_2048x3072.png`;
  return new File([blob], filename, { type: "image/png", lastModified: Date.now() });
}

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("The approved cover image has invalid dimensions.");
    return image;
  } finally {
    queueMicrotask(() => URL.revokeObjectURL(url));
  }
}

function filenameStem(title) {
  return String(title || "Untitled")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("-") || "Untitled";
}

async function uploadCover(projectId, file, operationId) {
  await requestJSON(
    `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/setup/cover`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "image/png",
        "X-Filename": file.name || "approved-cover-2048x3072.png",
        "X-MMG-Client-Build": BUILD,
        "X-Kairos-Operation-Id": operationId,
        "X-MMG-Cover-Standard": "2048x3072-png-contain",
      },
      body: file,
    },
    COVER_TIMEOUT_MS,
  );
}

async function resumeExisting(projectId) {
  try {
    const response = await fetchWithTimeout(
      `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/setup`,
      { method: "GET", credentials: "include", headers: { "X-MMG-Client-Build": BUILD } },
      STATUS_TIMEOUT_MS,
    );
    if (response.status === 404) return false;
    const body = await parseJSON(response);
    if (response.ok && body?.setup) {
      state.record = body;
      state.draft = null;
      state.error = "";
      render();
      return true;
    }
  } catch {}
  return false;
}

async function recover(projectId, showFailure) {
  try {
    const response = await fetchWithTimeout(
      `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/setup`,
      { method: "GET", credentials: "include", headers: { "X-MMG-Client-Build": BUILD } },
      STATUS_TIMEOUT_MS,
    );
    const body = await parseJSON(response);
    if (response.ok && body?.setup) {
      state.record = body;
      state.draft = null;
      state.error = "";
      window.KairosProductionWorkspace?.refresh?.();
      render();
      return true;
    }
    if (showFailure) {
      state.error = body?.operation?.status === "working"
        ? "Kairos is still completing the saved operation. Wait a moment and check again."
        : body?.error?.message || "No saved production assignment was found yet.";
      render();
    }
  } catch (caught) {
    if (showFailure) {
      state.error = userMessage(caught);
      render();
    }
  }
  return false;
}

async function requestJSON(url, init, timeoutMs) {
  const response = await fetchWithTimeout(url, init, timeoutMs);
  const body = await parseJSON(response);
  if (!response.ok) throw new Error(body?.error?.message || `Kairos returned HTTP ${response.status}.`);
  return body;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (caught) {
    if (controller.signal.aborted) throw new Error("Kairos did not respond in time. Check saved status, then retry safely.");
    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw new Error(`Kairos returned an unreadable response (HTTP ${response.status}).`); }
}

function snapshot(section) {
  return {
    authorName: section.querySelector("[data-setup-author]")?.value.trim() || "",
    publicationTitle: section.querySelector("[data-setup-title]")?.value.trim() || "",
    service: section.querySelector("[data-setup-service]")?.value || "",
    edition: section.querySelector("[data-setup-edition]")?.value || "multi-format",
    trimSize: "6x9",
    isbnStatus: section.querySelector("[data-setup-isbn]")?.value || "not-decided",
    notes: section.querySelector("[data-setup-notes]")?.value || "",
    cover: section.querySelector("[data-setup-cover]")?.files?.[0] || state.draft?.cover || null,
    coverStored: Boolean(state.draft?.coverStored),
  };
}

function validate(value) {
  if (!value.authorName) return "Enter the author name.";
  if (!value.publicationTitle) return "Enter the publication title.";
  if (!value.service) return "Select the approved publishing service.";
  if (value.cover) {
    if (!["image/png", "image/jpeg"].includes(value.cover.type)) return "Upload the approved cover as PNG or JPEG.";
    if (value.cover.size > COVER_LIMIT) return "Source cover files must be 8 MB or smaller.";
  }
  return "";
}

function currentSection() { return document.querySelector("#manuscript-project-setup"); }
function activeProjectId() {
  const active = readJSON(sessionStorage.getItem(ACTIVE_KEY));
  return active?.workspace === "manuscript-studio" ? active.projectId || null : null;
}
function currentTitle() { return document.querySelector("#manuscript-studio-overlay .manuscript-result > h3")?.textContent?.trim() || ""; }
function readJSON(value) { try { return JSON.parse(value || "null"); } catch { return null; } }
function option(value, label, selected) { return `<option value="${esc(value)}"${selected === value ? " selected" : ""}>${esc(label)}</option>`; }
function newOperationId() { return globalThis.crypto?.randomUUID?.() || `setup-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function userMessage(caught) { return caught?.message || "Project setup failed. Check saved status, then retry."; }
function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
