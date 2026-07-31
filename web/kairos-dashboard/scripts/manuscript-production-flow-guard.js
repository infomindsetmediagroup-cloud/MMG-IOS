const BUILD = "kairos-manuscript-production-flow-guard-20260731-1";
const ACTIVE_KEY = "kairos.production.active-workspace";
const READY_STATUS = "ready-for-manufacturing";
const SYNC_DELAY_MS = 80;
const RENDER_SETTLE_MS = 250;

const state = {
  projectId: "",
  busy: false,
  phase: "",
  error: "",
  syncing: false,
  syncTimer: null,
  renderedAt: 0,
};

function activeProjectId() {
  try {
    const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
    return active?.workspace === "manuscript-studio" ? active.projectId || "" : "";
  } catch {
    return "";
  }
}

function scheduleSync() {
  if (Date.now() - state.renderedAt < RENDER_SETTLE_MS) return;
  clearTimeout(state.syncTimer);
  state.syncTimer = setTimeout(() => void sync(), SYNC_DELAY_MS);
}

async function sync() {
  fixPersistentReturn();
  if (state.syncing || state.busy) return;

  const section = document.querySelector("#manuscript-auto-pipeline");
  const projectId = activeProjectId();
  if (!section || !projectId) return;

  state.syncing = true;
  state.projectId = projectId;

  try {
    const packageResponse = await fetch(autoPipelineEndpoint(projectId), {
      credentials: "include",
      cache: "no-store",
      headers: { "X-MMG-Client-Build": BUILD },
    });

    if (packageResponse.ok) {
      reveal(section);
      return;
    }

    if (packageResponse.status !== 404) {
      const packageBody = await readJSON(packageResponse);
      renderBlocked(section, packageBody?.error?.message || "Kairos could not verify the current production package.");
      return;
    }

    const readiness = await readReadiness(projectId);
    if (!readiness.setupComplete || !readiness.editorialReady) {
      conceal(section);
      return;
    }

    renderLocalStart(section, readiness);
  } catch (error) {
    renderBlocked(section, error?.message || "Kairos could not verify the production sequence.");
  } finally {
    state.syncing = false;
  }
}

async function readReadiness(projectId) {
  const [setupResponse, editorialResponse] = await Promise.all([
    fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/setup`, {
      credentials: "include",
      cache: "no-store",
      headers: { "X-MMG-Client-Build": BUILD },
    }),
    fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/editorial`, {
      credentials: "include",
      cache: "no-store",
      headers: { "X-MMG-Client-Build": BUILD },
    }),
  ]);

  const setup = setupResponse.status === 404 ? {} : await readJSON(setupResponse);
  const editorial = editorialResponse.status === 404 ? {} : await readJSON(editorialResponse);

  if (!setupResponse.ok && setupResponse.status !== 404) {
    throw new Error(setup?.error?.message || "Kairos could not verify project setup.");
  }
  if (!editorialResponse.ok && editorialResponse.status !== 404) {
    throw new Error(editorial?.error?.message || "Kairos could not verify editorial readiness.");
  }

  const setupStatus = setup?.setup?.status || setup?.status || "";
  const editorialStatus = editorial?.editorial?.status || "";
  return {
    setupComplete: Boolean(setup?.setup) && ["assigned-to-production", "awaiting-customer-cover"].includes(setupStatus),
    editorialReady: editorialStatus === READY_STATUS,
    setupStatus,
    editorialStatus,
  };
}

function conceal(section) {
  section.hidden = true;
  section.setAttribute("aria-hidden", "true");
  section.style.display = "none";
}

function reveal(section) {
  section.hidden = false;
  section.removeAttribute("aria-hidden");
  section.style.removeProperty("display");
}

function renderLocalStart(section, readiness) {
  reveal(section);
  section.dataset.flowGuardBuild = BUILD;
  section.setAttribute("aria-busy", state.busy ? "true" : "false");
  section.innerHTML = `
    <ol class="publishing-stepper" aria-label="Publishing progress">
      <li class="complete"><span>1</span>Intake</li>
      <li class="complete"><span>2</span>Setup</li>
      <li class="complete"><span>3</span>Editorial</li>
      <li class="active"><span>4</span>Local Production</li>
      <li><span>5</span>Package Review</li>
    </ol>
    <p class="eyebrow">Manufacturing handoff</p>
    <h3>${esc(state.busy ? state.phase || "Kairos is producing locally…" : "Start Local Production")}</h3>
    <p>The approved editorial manuscript is ready. Kairos will run through the same-origin browser WebGPU runtime, store the verified result, manufacture the customer package, and stop for review.</p>
    <div class="issue-list">
      <article><b>Project setup</b><p>${esc(readiness.setupStatus || "assigned-to-production")}</p></article>
      <article><b>Editorial gate</b><p>${esc(readiness.editorialStatus || READY_STATUS)}</p></article>
      <article><b>Inference runtime</b><p>Same-origin browser WebGPU · no paid external provider</p></article>
      <article><b>Browser requirement</b><p>Keep Safari open and in the foreground until local production finishes</p></article>
    </div>
    ${state.busy ? `<p class="manuscript-progress">${esc(state.phase || "Kairos is producing locally…")}</p>` : ""}
    ${state.error ? `<p class="manuscript-error" role="alert">${esc(state.error)}</p>` : ""}
    <button type="button" class="primary" data-start-local-production ${state.busy ? "disabled" : ""}>
      ${state.busy ? "Local Production Running…" : "Start Local Production"}
    </button>
    <p class="manuscript-note">Do not close Safari during this step. The manuscript, setup, cover, and editorial state are already stored and remain recoverable if local inference stops.</p>
  `;
  state.renderedAt = Date.now();
}

function renderBlocked(section, message) {
  reveal(section);
  section.dataset.flowGuardBuild = BUILD;
  section.innerHTML = `
    <p class="eyebrow">Production sequence</p>
    <h3>Production readiness needs attention</h3>
    <p class="manuscript-error" role="alert">${esc(message)}</p>
    <button type="button" class="secondary" data-production-flow-retry>Check Production Readiness</button>
  `;
  state.renderedAt = Date.now();
}

async function startLocalProduction() {
  if (state.busy) return;
  const section = document.querySelector("#manuscript-auto-pipeline");
  const projectId = activeProjectId();
  if (!section || !projectId) return;

  state.busy = true;
  state.error = "";
  state.phase = "Verifying setup and editorial approval…";

  try {
    const readiness = await readReadiness(projectId);
    if (!readiness.setupComplete) {
      throw new Error("Complete and save project setup before production begins.");
    }
    if (!readiness.editorialReady) {
      throw new Error("Complete the Editorial Workbench review and send the approved version to manufacturing first.");
    }

    renderLocalStart(section, readiness);

    const runtime = window.KairosLocalInference;
    if (!runtime?.ready || typeof runtime.run !== "function") {
      throw new Error("The same-origin WebGPU runtime is not ready. Reload Kairos and reopen the manuscript project.");
    }

    const result = await runtime.run({
      projectId,
      onProgress(message) {
        state.phase = String(message || "Kairos is producing locally…");
        renderLocalStart(section, readiness);
      },
    });

    state.phase = "Manufacturing the complete customer package…";
    renderLocalStart(section, readiness);

    const response = await fetch(`${autoPipelineEndpoint(projectId)}/run`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-MMG-Client-Build": BUILD,
      },
      body: JSON.stringify({
        localInferenceBuild: result?.build || runtime.build || "same-origin-webllm",
        localInferenceModel: result?.model || runtime.getModel?.() || "browser-webgpu",
      }),
    });
    const body = await readJSON(response);
    if (!response.ok) {
      throw new Error(body?.error?.message || `Kairos returned HTTP ${response.status} while manufacturing the package.`);
    }

    state.phase = "Production package created. Loading review…";
    renderLocalStart(section, readiness);

    section.remove();
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed"));
    window.KairosPublishingExperience?.enhance?.();
    setTimeout(scheduleSync, RENDER_SETTLE_MS);
  } catch (error) {
    state.error = normalizeError(error);
    const readiness = await readReadiness(projectId).catch(() => ({
      setupComplete: true,
      editorialReady: true,
      setupStatus: "assigned-to-production",
      editorialStatus: READY_STATUS,
    }));
    renderLocalStart(section, readiness);
  } finally {
    state.busy = false;
  }
}

function fixPersistentReturn() {
  const current = document.querySelector("[data-kairos-persistent-return]");
  if (!current || current.dataset.flowGuardFixed === "true") return;

  const button = current.cloneNode(true);
  button.dataset.flowGuardFixed = "true";
  current.replaceWith(button);
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = `${window.location.origin}${window.location.pathname}`;
    history.replaceState(null, "", target);
    window.location.reload();
  }, true);
}

function normalizeError(error) {
  const message = String(error?.message || error || "Kairos could not complete local production.");
  if (/legacy backend generation route is disabled/i.test(message)) {
    return "The retired backend route was blocked. Kairos has switched this project to the required same-origin WebGPU production path.";
  }
  return message;
}

function autoPipelineEndpoint(projectId) {
  return `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline`;
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Kairos returned an unreadable response (HTTP ${response.status}).`);
  }
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

document.addEventListener("click", event => {
  const target = event.target instanceof Element
    ? event.target.closest("[data-start-local-production], [data-production-flow-retry]")
    : null;
  if (!target) return;

  if (target.matches("[data-start-local-production]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void startLocalProduction();
    return;
  }

  if (target.matches("[data-production-flow-retry]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    scheduleSync();
  }
}, true);

window.addEventListener("kairos:production:state-changed", scheduleSync);
window.addEventListener("kairos:legacy-runtime:ready", scheduleSync);
window.addEventListener("popstate", scheduleSync);

new MutationObserver(scheduleSync).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

window.KairosManuscriptProductionFlowGuard = Object.freeze({
  build: BUILD,
  ready: true,
  sync: scheduleSync,
  getState: () => ({
    projectId: state.projectId,
    busy: state.busy,
    phase: state.phase,
    error: state.error,
  }),
});

scheduleSync();
