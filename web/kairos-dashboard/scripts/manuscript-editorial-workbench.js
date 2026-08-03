const BUILD = "kairos-manuscript-editorial-workbench-ui-20260803-2-mobile-controls";
const ACTIVE_KEY = "kairos.production.active-workspace";
const CUSTOMER_DELIVERABLES = Object.freeze([
  ["customer-spec-sheet.pdf", "Customer specification sheet"],
  ["kdp-interior-6x9.pdf", "Print-ready 6 × 9 KDP interior"],
  ["digital-asset-edition-v2.pdf", "Customer digital edition"],
  ["cover-portrait-2048x3072.png", "Portrait cover image"],
  ["cover-thumbnail-2048x2048.png", "Square cover thumbnail"],
  ["README.txt", "Delivery and use instructions"],
]);

let state = {
  projectId: "",
  record: null,
  manuscript: "",
  busy: false,
  error: "",
};
let loadPromise = null;

async function enhance() {
  const setup = document.querySelector("#manuscript-project-setup");
  if (!setup) return;

  const projectId = activeProjectId();
  if (!projectId) return;

  const setupComplete = setup.textContent.includes("Production assignment")
    || setup.textContent.includes("assigned-to-production")
    || setup.textContent.includes("awaiting-customer-cover");
  if (!setupComplete) return;

  const existing = document.querySelector("#manuscript-editorial-workbench");
  if (existing?.dataset.projectId === projectId) return;
  existing?.remove();

  if (state.projectId !== projectId) {
    state = {
      projectId,
      record: null,
      manuscript: "",
      busy: false,
      error: "",
    };
    loadPromise = null;
  }

  const section = document.createElement("section");
  section.id = "manuscript-editorial-workbench";
  section.dataset.projectId = projectId;
  section.className = "manuscript-editorial-workbench";
  section.innerHTML = '<p class="eyebrow">Editorial production</p><h3>Loading Editorial Workbench…</h3>';
  setup.insertAdjacentElement("afterend", section);

  await ensureLoaded(projectId);
}

function ensureLoaded(projectId) {
  if (loadPromise && state.projectId === projectId) return loadPromise;
  loadPromise = load(projectId).finally(() => {
    if (state.projectId === projectId) loadPromise = null;
  });
  return loadPromise;
}

async function load(projectId) {
  state.busy = true;
  state.error = "";
  render(projectId);

  try {
    const response = await fetch(
      `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial`,
      { credentials: "include", cache: "no-store" },
    );
    const body = await response.json().catch(() => ({}));

    if (response.status === 404) {
      state.record = emptyEditorialRecord();
      await loadCurrentText(projectId, state.record.editorial);
      return;
    }

    if (!response.ok) {
      throw new Error(body?.error?.message || "Editorial workbench could not be loaded.");
    }

    state.record = body;
    if (!state.manuscript) await loadCurrentText(projectId, body.editorial);
  } catch (error) {
    state.error = error?.message || "Editorial workbench could not be loaded.";
  } finally {
    state.busy = false;
    render(projectId);
  }
}

function emptyEditorialRecord() {
  return {
    status: "editorial-in-progress",
    editorial: {
      status: "not-started",
      stage: "editorial-intake",
      currentVersionId: null,
      versions: [],
      review: null,
    },
  };
}

async function loadCurrentText(projectId, editorial) {
  const current = editorial?.finalVersionId || editorial?.review?.versionId || editorial?.currentVersionId;
  const url = current
    ? `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial/versions/${encodeURIComponent(current)}`
    : `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source/text`;
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || "The saved manuscript text could not be loaded for editorial review.");
  }
  state.manuscript = String(body.manuscript || "");
}

function render(projectId) {
  const section = document.querySelector("#manuscript-editorial-workbench");
  if (!section || section.dataset.projectId !== projectId) return;

  if (state.busy) {
    section.innerHTML = '<p class="eyebrow">Editorial production</p><h3>Loading Editorial Workbench…</h3><p class="manuscript-progress">Kairos is loading the saved editorial state once.</p>';
    return;
  }

  if (state.error) {
    section.innerHTML = `
      <p class="eyebrow">Editorial production</p>
      <h3>Editorial Workbench needs attention</h3>
      <p class="manuscript-error">${esc(state.error)}</p>
      <button type="button" class="secondary" data-editorial-retry>Retry</button>
    `;
    return;
  }

  const editorial = state.record?.editorial || emptyEditorialRecord().editorial;
  const versions = editorial.versions || [];
  const review = editorial.review || null;
  const reviewVersionId = editorial.finalVersionId || review?.versionId || editorial.currentVersionId;
  const reviewVersion = versions.find((version) => version.versionId === reviewVersionId) || null;
  const reviewLocked = Boolean(review) && [
    "awaiting-customer-review",
    "customer-approved",
    "ready-for-manufacturing",
  ].includes(editorial.status);
  section.innerHTML = `
    <p class="eyebrow">Editorial production</p>
    <h3>${esc(statusLabel(editorial.status))}</h3>
    <p>This is the governed editorial workspace. No automated editing is claimed; every saved version, customer decision, and manufacturing handoff is explicit and traceable.</p>
    <div class="manuscript-editorial-summary">
      <span><strong>${versions.length}</strong><small>versions</small></span>
      <span><strong>${esc(editorial.stage || "editorial-intake")}</strong><small>current stage</small></span>
      <span><strong>${esc(review?.status || "not prepared")}</strong><small>customer review</small></span>
    </div>
    ${reviewLocked ? "" : editorialEditorMarkup(versions)}
    ${review ? customerReviewMarkup(projectId, editorial, reviewVersion) : ""}
    ${versions.length ? `<div class="issue-list manuscript-version-list">${versions.slice().reverse().map((version) => `<article><b>${esc(version.label)}</b><p>${esc(version.passType)} · ${Number(version.wordCount || 0).toLocaleString()} words</p><small>${esc(version.actor)} · ${esc(formatDate(version.createdAt))}</small></article>`).join("")}</div>` : ""}
  `;

}

function handleEditorialAction(event) {
  const button = event.target instanceof Element
    ? event.target.closest("#manuscript-editorial-workbench button")
    : null;
  if (!button) return;

  const projectId = button.closest("#manuscript-editorial-workbench")?.dataset.projectId || activeProjectId();
  if (!projectId) return;

  const action = button.matches("[data-editorial-save]")
    ? () => saveVersion(button.closest("#manuscript-editorial-workbench"), projectId)
    : button.matches("[data-editorial-review]")
      ? () => prepareReview(projectId)
      : button.matches("[data-editorial-approve]")
        ? () => decision(projectId, "approved")
        : button.matches("[data-editorial-revise]")
          ? () => decision(projectId, "revision-requested")
          : button.matches("[data-editorial-finalize]")
            ? () => finalize(projectId)
            : button.matches("[data-editorial-produce]")
              ? () => produceDeliverable(projectId)
              : button.matches("[data-editorial-retry]")
                ? () => ensureLoaded(projectId)
                : null;
  if (!action) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void action();
}

function editorialEditorMarkup(versions) {
  return `
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
      ${versions.length ? '<button type="button" class="secondary" data-editorial-review>Prepare Customer Review</button>' : ""}
    </div>
  `;
}

function customerReviewMarkup(projectId, editorial, version) {
  const awaiting = editorial.status === "awaiting-customer-review";
  const approved = editorial.review?.decision === "approved" || editorial.status === "ready-for-manufacturing";
  const canProduce = awaiting || approved;
  const action = awaiting ? "Approve Review & Produce Deliverable Asset" : "Produce Deliverable Asset";
  const versionLabel = version?.label || "Approved editorial manuscript";
  const checksum = version?.checksum || "Checksum will be preserved at manufacturing";

  return `
    <section class="manuscript-customer-review" data-customer-review-package>
      <p class="eyebrow">Customer Review Package</p>
      <h4>Review the manuscript and approved cover</h4>
      <p>This proof is locked to <strong>${esc(versionLabel)}</strong>. Approval produces the governed customer ZIP; it does not publish anything externally.</p>
      <div class="manuscript-review-layout">
        <figure class="manuscript-review-cover">
          <img src="/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/setup/cover" alt="Approved customer cover" loading="eager">
          <figcaption>Approved customer cover</figcaption>
        </figure>
        <div class="manuscript-review-proof">
          <span><strong>${Number(version?.wordCount || 0).toLocaleString()}</strong><small>review words</small></span>
          <span><strong>${esc(editorial.review?.status || editorial.status)}</strong><small>review status</small></span>
          <span><strong>${esc(checksum)}</strong><small>version checksum</small></span>
        </div>
      </div>
      <label>Locked manuscript proof<textarea data-customer-review-manuscript readonly>${esc(state.manuscript)}</textarea></label>
      <h4>Customer deliverable: complete-production-package.zip</h4>
      <div class="issue-list manuscript-customer-deliverables">
        ${CUSTOMER_DELIVERABLES.map(([filename, label]) => `<article><b>${esc(filename)}</b><p>${esc(label)}</p></article>`).join("")}
      </div>
      <div class="manuscript-actions manuscript-review-actions">
        ${canProduce ? `<button type="button" class="primary" data-editorial-produce>${esc(action)}</button>` : ""}
        ${awaiting ? '<button type="button" class="secondary" data-editorial-revise>Request Revision</button>' : ""}
      </div>
      <p class="manuscript-note">The production action records approval when required, freezes this exact editorial version, manufactures the six customer files, and opens the package preview for final package approval.</p>
    </section>
  `;
}

async function saveVersion(section, projectId) {
  const manuscript = section.querySelector("[data-editorial-text]")?.value || "";
  if (manuscript.trim().length < 50) {
    fail(projectId, "Provide at least 50 characters for the editorial version.");
    return;
  }
  await run(projectId, `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial/versions`, {
    manuscript,
    passType: section.querySelector("[data-editorial-pass]")?.value || "copyedit",
    label: section.querySelector("[data-editorial-label]")?.value || "Editorial Version",
    notes: section.querySelector("[data-editorial-notes]")?.value || "",
    actor: "MMG Editorial Production",
  }, "editorial-version-saved");
  state.manuscript = manuscript;
}

async function prepareReview(projectId) {
  const currentVersionId = state.record?.editorial?.currentVersionId;
  if (!currentVersionId) {
    fail(projectId, "Save an editorial version before preparing customer review.");
    return;
  }
  await run(projectId, `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial/review`, {
    versionId: currentVersionId,
    actor: "MMG Editorial Production",
  }, "customer-review-prepared");
}

async function decision(projectId, value) {
  const note = window.prompt(value === "approved" ? "Approval note (optional)" : "Describe the requested revision") || "";
  await run(projectId, `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial/decision`, {
    decision: value,
    note,
    actor: "Executive",
  }, value === "approved" ? "customer-review-approved" : "customer-revision-requested");
}

async function finalize(projectId) {
  const currentVersionId = state.record?.editorial?.currentVersionId;
  await run(projectId, `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial/finalize`, {
    versionId: currentVersionId,
    actor: "MMG Editorial Production",
  }, "editorial-finalized");
}

async function produceDeliverable(projectId) {
  if (state.busy) return;
  state.busy = true;
  state.error = "";
  render(projectId);

  try {
    let editorial = state.record?.editorial || {};
    const reviewVersionId = editorial.review?.versionId || editorial.currentVersionId;
    if (!reviewVersionId) throw new Error("Prepare a customer review before producing the deliverable asset.");

    if (editorial.review?.decision !== "approved") {
      await postEditorial(projectId, "decision", {
        decision: "approved",
        note: "Customer review approved from the locked manuscript and cover proof.",
        actor: "Customer Review",
      });
      editorial = await refreshEditorial(projectId);
    }

    if (editorial.status !== "ready-for-manufacturing") {
      await postEditorial(projectId, "finalize", {
        versionId: editorial.review?.versionId || reviewVersionId,
        actor: "MMG Editorial Production",
      });
      editorial = await refreshEditorial(projectId);
    }

    await window.KairosProductionWorkspace?.refresh?.("editorial-finalized-for-deliverable");
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed", {
      detail: {
        reason: "editorial-finalized-for-deliverable",
        projectId,
        workspace: "manuscript-studio",
        build: BUILD,
      },
    }));

    if (!document.querySelector("#manuscript-auto-pipeline")) {
      const opened = await window.KairosManuscriptStageHandoff?.openProduction?.(null);
      if (opened?.status === "failed") throw new Error(opened.error || "Production controls could not open.");
    }

    const orchestrator = window.KairosManuscriptPipelineOrchestrator;
    if (!orchestrator?.ready || typeof orchestrator.manufacture !== "function") {
      throw new Error("The deliverable production engine is not ready. Reload Manuscript Studio and retry this action.");
    }
    const packageRecord = await orchestrator.manufacture();
    if (!packageRecord) {
      const snapshot = orchestrator.snapshot?.();
      throw new Error(snapshot?.lastError || "Kairos could not produce the deliverable package.");
    }
    document.querySelector("#manuscript-auto-pipeline")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    state.error = error?.message || "Kairos could not produce the deliverable package.";
  } finally {
    state.busy = false;
    render(projectId);
  }
}

async function postEditorial(projectId, action, payload) {
  const response = await fetch(
    `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial/${action}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      body: JSON.stringify(payload),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || "Editorial production action failed.");
  return body;
}

async function refreshEditorial(projectId) {
  const response = await fetch(
    `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial`,
    { credentials: "include", cache: "no-store" },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || "The saved editorial state could not be refreshed.");
  state.record = body;
  return body.editorial || {};
}

async function run(projectId, url, payload, reason) {
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
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || "Editorial production action failed.");

    const refresh = await fetch(
      `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial`,
      { credentials: "include", cache: "no-store" },
    );
    const refreshed = await refresh.json().catch(() => ({}));
    if (!refresh.ok) throw new Error(refreshed?.error?.message || "The saved editorial state could not be refreshed.");
    state.record = refreshed;

    await window.KairosProductionWorkspace?.refresh?.(reason);
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed", {
      detail: {
        reason,
        projectId,
        workspace: "manuscript-studio",
        build: BUILD,
      },
    }));
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

window.KairosEditorialWorkbenchController = Object.freeze({
  build: BUILD,
  ready: true,
  enhance,
});

document.addEventListener("click", handleEditorialAction, true);
const observer = new MutationObserver(() => {
  void enhance();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("kairos:production:state-changed", () => {
  void enhance();
});
void enhance();
