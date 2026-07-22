const BUILD = "kairos-manuscript-project-setup-ui-20260722-2";
const ACTIVE_KEY = "kairos.production.active-workspace";
const COVER_LIMIT = 8 * 1024 * 1024;
const COVER_TIMEOUT_MS = 90_000;
const SETUP_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 12_000;

let busy = false;
let phase = "";
let error = "";
let record = null;
let draft = null;
let operationId = "";
const checkedProjects = new Set();

function enhance() {
  const result = document.querySelector("#manuscript-studio-overlay .manuscript-result");
  if (!result || result.querySelector("#manuscript-project-setup")) return;
  const projectId = activeProjectId();
  if (!projectId) return;

  const section = document.createElement("section");
  section.id = "manuscript-project-setup";
  section.className = "manuscript-project-setup";
  section.innerHTML = view(projectId);
  result.appendChild(section);
  bind(section, projectId);

  if (!busy && !record && !checkedProjects.has(projectId)) {
    checkedProjects.add(projectId);
    resumeExisting(projectId);
  }
}

function view() {
  if (busy) {
    return `
      <p class="eyebrow">Project setup</p>
      <h3>${esc(phase || "Saving production assignment…")}</h3>
      <p class="manuscript-progress">Kairos is completing one bounded step at a time. This screen will not wait indefinitely.</p>
      <p class="manuscript-note">Operation: ${esc(operationId || "starting")}</p>
      <button class="secondary" data-setup-status>Check saved status</button>
    `;
  }

  if (record) {
    return `
      <p class="eyebrow">Production assignment</p>
      <h3>${esc(record.setup?.status || record.status)}</h3>
      <p>${esc(record.nextAction || "Project setup completed.")}</p>
      <div class="issue-list">${(record.setup?.assignments || []).map((assignment) => `
        <article><b>${esc(assignment.department)}</b><p>${esc(assignment.role)}</p><small>${esc(assignment.status)}</small></article>
      `).join("")}</div>
      <div class="issue-list">${(record.setup?.milestones || []).map((milestone) => `
        <article><b>${esc(milestone.label)}</b><p>${esc(milestone.status)}</p></article>
      `).join("")}</div>
      <p class="manuscript-note">The project is stored in the durable production registry and can be resumed across sessions and devices.</p>
    `;
  }

  const value = draft || {};
  return `
    <p class="eyebrow">Next stage</p>
    <h3>Complete Project Setup</h3>
    <p>Confirm publication metadata, choose the approved service, upload the customer-supplied cover, and assign the project into production.</p>
    <div class="manuscript-grid">
      <label>Author name<input data-setup-author maxlength="160" value="${esc(value.authorName || "")}" placeholder="Author name"></label>
      <label>Publication title<input data-setup-title maxlength="240" value="${esc(value.publicationTitle || currentTitle())}" placeholder="Publication title"></label>
    </div>
    <div class="manuscript-grid">
      <label>Publishing service<select data-setup-service>
        <option value="">Select service</option>
        ${serviceOption("manuscript-correction", "Manuscript Correction", value.service)}
        ${serviceOption("editorial-production", "Editorial Production", value.service)}
        ${serviceOption("complete-publishing-package", "Complete Publishing Package", value.service)}
        ${serviceOption("digital-edition-production", "Digital Edition Production", value.service)}
      </select></label>
      <label>Edition<select data-setup-edition>
        ${option("multi-format", "Multi-format", value.edition || "multi-format")}
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
    <label>Customer-supplied cover<input data-setup-cover type="file" accept="image/png,image/jpeg"><small>PNG or JPEG, up to 8 MB. The cover uploads as its own resumable step.</small></label>
    <label>Production notes<textarea data-setup-notes maxlength="4000" placeholder="Special instructions, deadlines, edition notes, or customer requirements.">${esc(value.notes || "")}</textarea></label>
    ${error ? `<p class="manuscript-error">${esc(error)}</p>` : ""}
    <button class="primary" data-setup-submit>${value.coverStored ? "Retry Assignment Save" : "Save Setup & Assign Production"}</button>
    <button class="secondary" data-setup-status>Check saved status</button>
  `;
}

function bind(section, projectId) {
  section.querySelector("[data-setup-submit]")?.addEventListener("click", () => submit(section, projectId));
  section.querySelector("[data-setup-status]")?.addEventListener("click", () => recover(projectId, true));
}

async function submit(section, projectId) {
  if (busy) return;

  const nextDraft = snapshot(section);
  const validation = validate(nextDraft);
  if (validation) return fail(validation);

  draft = nextDraft;
  operationId = newOperationId();
  busy = true;
  error = "";
  phase = draft.cover && !draft.coverStored ? "Uploading customer cover…" : "Saving production assignment…";
  refresh();

  try {
    if (draft.cover && !draft.coverStored) {
      await uploadCover(projectId, draft.cover, operationId);
      draft.coverStored = true;
      phase = "Saving production assignment…";
      refresh();
    }

    const body = await requestJSON(
      `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/setup`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-MMG-Client-Build": BUILD,
          "X-Kairos-Operation-Id": operationId,
          "X-Kairos-Idempotency-Key": operationId,
        },
        body: JSON.stringify({
          authorName: draft.authorName,
          publicationTitle: draft.publicationTitle,
          service: draft.service,
          edition: draft.edition,
          trimSize: draft.trimSize,
          isbnStatus: draft.isbnStatus,
          notes: draft.notes,
          operationId,
        }),
      },
      SETUP_TIMEOUT_MS,
    );

    record = body;
    draft = null;
    window.KairosProductionWorkspace?.refresh?.();
  } catch (caught) {
    phase = "Checking whether the assignment was saved…";
    refresh();
    const recovered = await recover(projectId, false);
    if (!recovered) {
      error = userMessage(caught);
    }
  } finally {
    busy = false;
    phase = "";
    refresh();
  }
}

async function uploadCover(projectId, file, currentOperationId) {
  await requestJSON(
    `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/setup/cover`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": file.type,
        "X-Filename": file.name || "customer-cover.png",
        "X-MMG-Client-Build": BUILD,
        "X-Kairos-Operation-Id": currentOperationId,
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
    if (response.status === 404) return;
    const body = await parseJSON(response);
    if (response.ok && body?.setup) {
      record = body;
      refresh();
    }
  } catch {
    // Initial recovery is best-effort and must never block the form.
  }
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
      record = body;
      draft = null;
      error = "";
      window.KairosProductionWorkspace?.refresh?.();
      if (showFailure) refresh();
      return true;
    }
    if (showFailure) {
      error = body?.operation?.status === "working"
        ? "Kairos is still completing the saved operation. Wait a moment and check again."
        : body?.error?.message || "No saved production assignment was found yet.";
      refresh();
    }
  } catch (caught) {
    if (showFailure) {
      error = userMessage(caught);
      refresh();
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
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (caught) {
    if (controller.signal.aborted) {
      throw new Error("Kairos did not respond in time. The app checked durable storage so you can safely retry without duplicating the assignment.");
    }
    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Kairos returned an unreadable response (HTTP ${response.status}).`);
  }
}

function snapshot(section) {
  return {
    authorName: section.querySelector("[data-setup-author]")?.value.trim() || "",
    publicationTitle: section.querySelector("[data-setup-title]")?.value.trim() || "",
    service: section.querySelector("[data-setup-service]")?.value || "",
    edition: section.querySelector("[data-setup-edition]")?.value || "multi-format",
    trimSize: section.querySelector("[data-setup-trim]")?.value || "6x9",
    isbnStatus: section.querySelector("[data-setup-isbn]")?.value || "not-decided",
    notes: section.querySelector("[data-setup-notes]")?.value || "",
    cover: section.querySelector("[data-setup-cover]")?.files?.[0] || draft?.cover || null,
    coverStored: Boolean(draft?.coverStored),
  };
}

function validate(value) {
  if (!value.authorName) return "Enter the author name.";
  if (!value.publicationTitle) return "Enter the publication title.";
  if (!value.service) return "Select the approved publishing service.";
  if (value.cover) {
    if (!["image/png", "image/jpeg"].includes(value.cover.type)) return "Upload the customer cover as PNG or JPEG.";
    if (value.cover.size > COVER_LIMIT) return "Customer cover files must be 8 MB or smaller.";
  }
  return "";
}

function serviceOption(value, label, selected) {
  return option(value, label, selected);
}

function option(value, label, selected) {
  return `<option value="${esc(value)}"${selected === value ? " selected" : ""}>${esc(label)}</option>`;
}

function newOperationId() {
  return globalThis.crypto?.randomUUID?.() || `setup-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function userMessage(caught) {
  return caught?.message || "Project setup failed. Check saved status, then retry.";
}

function refresh() {
  document.querySelector("#manuscript-project-setup")?.remove();
  enhance();
}

function fail(message) {
  error = message;
  refresh();
}

function activeProjectId() {
  try {
    const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
    return active?.workspace === "manuscript-studio" ? active.projectId || null : null;
  } catch {
    return null;
  }
}

function currentTitle() {
  return document.querySelector("#manuscript-studio-overlay .manuscript-result h3")?.textContent?.trim() || "";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

window.KairosManuscriptProjectSetup = Object.freeze({
  build: BUILD,
  mode: "two-phase-resumable",
  checkStatus: () => {
    const projectId = activeProjectId();
    return projectId ? recover(projectId, true) : Promise.resolve(false);
  },
});

new MutationObserver(enhance).observe(document.documentElement, { childList: true, subtree: true });
enhance();
