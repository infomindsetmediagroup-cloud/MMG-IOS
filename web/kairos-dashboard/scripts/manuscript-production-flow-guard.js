const BUILD = "kairos-manuscript-production-route-firewall-20260731-2";
const ACTIVE_KEY = "kairos.production.active-workspace";
const READY_STATUS = "ready-for-manufacturing";
const wiredButtons = new WeakSet();
let fallbackBusy = false;
let rewriteScheduled = false;

function activeProjectId() {
  try {
    const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
    return active?.workspace === "manuscript-studio" ? active.projectId || "" : "";
  } catch {
    return "";
  }
}

function scheduleRewrite() {
  if (rewriteScheduled) return;
  rewriteScheduled = true;
  queueMicrotask(() => {
    rewriteScheduled = false;
    rewriteStaleProductionMarkup();
  });
}

function rewriteStaleProductionMarkup() {
  const section = document.querySelector("#manuscript-auto-pipeline");
  if (!section) return;

  section.dataset.productionRouteFirewall = BUILD;

  for (const button of section.querySelectorAll("[data-start-production]")) {
    button.removeAttribute("data-start-production");
    button.setAttribute("data-start-local-production", "");
    button.textContent = "Start Local Production";

    if (!wiredButtons.has(button)) {
      wiredButtons.add(button);
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        void startCanonicalLocalProduction(button);
      });
    }
  }

  for (const heading of section.querySelectorAll("h3")) {
    if (/start a new production job/i.test(heading.textContent || "")) {
      heading.textContent = "Start Local Production";
    }
  }

  for (const paragraph of section.querySelectorAll("p")) {
    const text = paragraph.textContent || "";
    if (/close safari|continues in the backend|phone-independent|backend generation/i.test(text)) {
      paragraph.textContent = "Keep Safari open and in the foreground while the same-origin browser WebGPU runtime completes local production. Your saved manuscript, setup, cover, and editorial state remain recoverable.";
    }
  }
}

async function startCanonicalLocalProduction(button) {
  if (fallbackBusy) return;

  const controller = window.KairosManuscriptAutoPipelineController;
  if (controller?.executionMode === "browser-webgpu" && typeof controller.startLocalProduction === "function") {
    await controller.startLocalProduction();
    return;
  }

  const projectId = activeProjectId();
  if (!projectId) {
    showError("Kairos could not identify the active manuscript project.");
    return;
  }

  fallbackBusy = true;
  setButtonState(button, "Verifying production readiness…", true);

  try {
    const readiness = await readReadiness(projectId);
    if (!readiness.setupComplete) {
      throw new Error("Complete and save Project Setup before local production begins.");
    }
    if (!readiness.editorialReady) {
      throw new Error("Complete Editorial Workbench review and send the approved version to manufacturing first.");
    }

    const runtime = window.KairosLocalInference;
    if (!runtime?.ready || typeof runtime.run !== "function") {
      throw new Error("The same-origin WebGPU runtime is not ready. Reload Kairos and reopen this manuscript project.");
    }

    const result = await runtime.run({
      projectId,
      onProgress(message) {
        setButtonState(button, String(message || "Local production running…"), true);
      },
    });

    setButtonState(button, "Manufacturing the customer package…", true);
    const response = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline/run`, {
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

    window.dispatchEvent(new CustomEvent("kairos:production:state-changed"));
    window.KairosPublishingExperience?.enhance?.();
  } catch (error) {
    showError(error?.message || "Kairos could not complete local production.");
  } finally {
    fallbackBusy = false;
    setButtonState(button, "Start Local Production", false);
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
    throw new Error(editorial?.error?.message || "Kairos could not verify editorial approval.");
  }

  const setupStatus = setup?.setup?.status || setup?.status || "";
  const editorialStatus = editorial?.editorial?.status || editorial?.status || "";
  return {
    setupComplete: Boolean(setup?.setup || setupStatus) && ["assigned-to-production", "awaiting-customer-cover"].includes(setupStatus),
    editorialReady: editorialStatus === READY_STATUS,
  };
}

function setButtonState(button, label, disabled) {
  if (!(button instanceof HTMLButtonElement)) return;
  button.textContent = label;
  button.disabled = Boolean(disabled);
}

function showError(message) {
  const section = document.querySelector("#manuscript-auto-pipeline");
  if (!section) return;
  let node = section.querySelector("[data-production-route-firewall-error]");
  if (!node) {
    node = document.createElement("p");
    node.className = "manuscript-error";
    node.setAttribute("role", "alert");
    node.dataset.productionRouteFirewallError = "true";
    section.append(node);
  }
  node.textContent = String(message || "Kairos could not complete local production.");
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

window.addEventListener("click", event => {
  const staleButton = event.target instanceof Element
    ? event.target.closest("#manuscript-auto-pipeline [data-start-production]")
    : null;
  if (!staleButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  staleButton.removeAttribute("data-start-production");
  staleButton.setAttribute("data-start-local-production", "");
  staleButton.textContent = "Start Local Production";
  void startCanonicalLocalProduction(staleButton);
}, true);

new MutationObserver(scheduleRewrite).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

window.addEventListener("kairos:legacy-runtime:ready", scheduleRewrite);
window.addEventListener("kairos:production:state-changed", scheduleRewrite);

window.KairosManuscriptProductionFlowGuard = Object.freeze({
  build: BUILD,
  ready: true,
  mode: "stale-route-firewall",
  rewrite: scheduleRewrite,
  startLocalProduction: () => startCanonicalLocalProduction(document.querySelector("#manuscript-auto-pipeline [data-start-local-production]")),
});

scheduleRewrite();
