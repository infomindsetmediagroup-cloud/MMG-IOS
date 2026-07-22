const BUILD = "kairos-manuscript-editorial-workbench-ui-20260722-2";
const ACTIVE_KEY = "kairos.production.active-workspace";
const state = {
  record: null,
  manuscript: "",
  busy: false,
  error: "",
  mountScheduled: false,
  loadingProjectId: "",
};

function scheduleEnhance() {
  if (state.mountScheduled) return;
  state.mountScheduled = true;
  queueMicrotask(() => {
    state.mountScheduled = false;
    void enhance();
  });
}

async function enhance() {
  const setup = document.querySelector("#manuscript-studio-overlay #manuscript-project-setup");
  if (!setup) return;

  const projectId = activeProjectId();
  if (!projectId) return;

  const setupComplete = setup.textContent.includes("Production assignment")
    || setup.textContent.includes("assigned-to-production")
    || setup.textContent.includes("awaiting-customer-cover");
  if (!setupComplete) return;

  const existing = document.querySelector("#manuscript-studio-overlay #manuscript-editorial-workbench");
  if (existing?.dataset.projectId === projectId) return;
  if (existing) existing.remove();
  if (state.loadingProjectId === projectId) return;

  const section = document.createElement("section");
  section.id = "manuscript-editorial-workbench";
  section.className = "manuscript-editorial-workbench";
  section.dataset.projectId = projectId;
  section.dataset.controllerBuild = BUILD;
  section.innerHTML = `<p class="eyebrow">Editorial production</p><h3>Loading Editorial Workbench…</h3>`;
  setup.insertAdjacentElement("afterend", section);

  state.loadingProjectId = projectId;
  try {
    await load(projectId);
  } finally {
    if (state.loadingProjectId === projectId) state.loadingProjectId = "";
  }
}

async function load(projectId) {
  state.busy = true;
  state.error = "";
  render(projectId);
  try {
    const response = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial`, {
      credentials: "include",
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Editorial workbench could not be loaded.");
    state.record = body;
    if (!state.manuscript) await loadCurrentText(projectId, body.editorial);
  } catch (error) {
    state.error = error?.message || "Editorial workbench could not be loaded.";
  } finally {
    state.busy = false;
    render(projectId);
  }
}

async function loadCurrentText(projectId, editorial) {
  const current = editorial?.currentVersionId;
  const url = current
    ? `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial/versions/${encodeURIComponent(current)}`
    : `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source/text`;
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const body = await response.json();
  if (response.ok) state.manuscript = String(body.manuscript || "");
}

function render(projectId) {
  const section = document.querySelector("#manuscript-studio-overlay #manuscript-editorial-workbench");
  if (!section || section.dataset.projectId !== projectId) return;

  if (state.busy) {
    section.innerHTML = `<p class="eyebrow">Editorial production</p><h3>Saving production work…</h3><p class="manuscript-progress">Kairos is preserving the version, milestone, and approval record.</p>`;
    return;
  }

  if (state.error) {
    section.innerHTML = `<p class="eyebrow">Editorial production</p><h3>Editorial Workbench needs attention</h3><p class="manuscript-error">${esc(state.error)}</p><button type="button" class="secondary" data-editorial-retry>Retry</button>`;
    section.querySelector("[data-editorial-retry]")?.addEventListener("click", () => load(projectId));
    return;
  }

  const editorial = state.record?.editorial || {};
  const versions = editorial.versions || [];
  const review = editorial.review || null;
  section.innerHTML = `
    <p class="eyebrow">Editorial production</p>
    <h3>${esc(statusLabel(editorial.status))}</h3>
    <p>This is the governed editorial workspace. No automated editing is claimed; every saved version, customer decision, and manufacturing handoff is explicit and traceable.</p>
    <div class="manuscript-editorial-summary">
      <span><strong>${versions.length}</strong><small>versions</small></span>
      <span><strong>${esc(editorial.stage || "editorial-intake")}</strong><small>current stage</small></span>
      <span><strong>${esc(review?.status || "not prepared")}</strong><small>customer review</small></span>
    </div>
    <div class="manuscript-grid">
      <label>Editorial pass<select data-editorial-pass>
        <option value="structural">Structural edit</option>
        <option value="copyedit">Copyedit</option>
        <option value="proofread">Proofread</option>
        <option value="customer-revision">Customer revision</option>
        <option value="final">Final editorial version</option>
      </select></label>
      <label>Version label<input data-editorial-label maxlength="180" value="${esc(`Editorial Version ${versions.length + 1}`)}"></label>
    </div>
    <label>Editorial manuscript<textarea data-editorial-text maxlength="2000000">${esc(state.manuscript)}</textarea></label>
    <label>Production notes<textarea data-editorial-notes maxlength="4000" placeholder="Record corrections, unresolved questions, style decisions, and production notes."></textarea></label>
    <div class="manuscript-actions">
      <button type="button" class="primary" data-editorial-save>Save Version</button>
      ${versions.length ? `<button type="button" class="secondary" data-editorial-review>Prepare Customer Review</button>` : ""}
      ${review?.status === "awaiting-customer-review" ? `<button type="button" class="secondary" data-editorial-approve>Record Approval</button><button type="button" class="secondary" data-editorial-revise>Request Revision</button>` : ""}
      ${review?.decision === "approved" ? `<button type="button" class="primary" data-editorial-finalize>Send to Manufacturing</button>` : ""}
    </div>
    ${versions.length ? `<div class="issue-list manuscript-version-list">${versions.slice().reverse().map((version) => `<article><b>${esc(version.label)}</b><p>${esc(version.passType)} · ${Number(version.wordCount || 0).toLocaleString()} words</p><small>${esc(version.actor)} · ${esc(formatDate(version.createdAt))}</small></article>`).join("")}</div>` : ""}
  `;

  section.querySelector("[data-editorial-save]")?.addEventListener("click", () => saveVersion(section, projectId));
  section.querySelector("[data-editorial-review]")?.addEventListener("click", () => prepareReview(projectId));
  section.querySelector("[data-editorial-approve]")?.addEventListener("click", () => decision(projectId, "approved"));
  section.querySelector("[data-editorial-revise]")?.addEventListener("click", () => decision(projectId, "revision-requested"));
  section.querySelector("[data-editorial-finalize]")?.addEventListener("click", () => finalize(projectId));
}

async function saveVersion(section, projectId) {
  const manuscript = section.querySelector("[data-editorial-text]")?.value || "";
  if (manuscript.trim().length < 50) return fail(projectId, "Provide at least 50 characters for the editorial version.");
  await run(projectId, `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial/versions`, {
    manuscript,
    passType: section.querySelector("[data-editorial-pass]")?.value || "copyedit",
    label: section.querySelector("[data-editorial-label]")?.value || "Editorial Version",
    notes: section.querySelector("[data-editorial-notes]")?.value || "",
    actor: "MMG Editorial Production",
  });
  state.manuscript = manuscript;
}

async function prepareReview(projectId) {
  const currentVersionId = state.record?.editorial?.currentVersionId;
  if (!currentVersionId) return fail(projectId, "Save an editorial version before preparing customer review.");
  await run(projectId, `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial/review`, {
    versionId: currentVersionId,
    actor: "MMG Editorial Production",
  });
}

async function decision(projectId, value) {
  const note = window.prompt(value === "approved" ? "Approval note (optional)" : "Describe the requested revision") || "";
  await run(projectId, `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial/decision`, {
    decision: value,
    note,
    actor: "Executive",
  });
}

async function finalize(projectId) {
  const currentVersionId = state.record?.editorial?.currentVersionId;
  await run(projectId, `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial/finalize`, {
    versionId: currentVersionId,
    actor: "MMG Editorial Production",
  });
}

async function run(projectId, url, payload) {
  state.busy = true;
  state.error = "";
  render(projectId);
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Editorial production action failed.");
    await window.KairosProductionWorkspace?.refresh?.();
    const refresh = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial`, {
      credentials: "include",
      cache: "no-store",
    });
    state.record = await refresh.json();
  } catch (error) {
    state.error = error?.message || "Editorial production action failed.";
  } finally {
    state.busy = false;
    render(projectId);
  }
}

function fail(projectId, message) {
  state.error = message;
  render(projectId);
}

function activeProjectId() {
  try {
    const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
    return active?.workspace === "manuscript-studio" ? active.projectId || null : null;
  } catch {
    return null;
  }
}

function statusLabel(value) {
  return ({
    "not-started": "Editorial Workbench",
    "editorial-in-progress": "Editorial production in progress",
    "awaiting-customer-review": "Awaiting customer review",
    "customer-approved": "Customer approved",
    "revision-requested": "Revision requested",
    "ready-for-manufacturing": "Ready for manufacturing",
  })[value] || "Editorial Workbench";
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value || "");
  }
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

const observer = new MutationObserver(scheduleEnhance);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("kairos:production:state-changed", scheduleEnhance);
window.addEventListener("kairos:manuscript:restore", scheduleEnhance);
scheduleEnhance();
