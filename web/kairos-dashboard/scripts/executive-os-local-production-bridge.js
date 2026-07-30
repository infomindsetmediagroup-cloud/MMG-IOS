const BUILD = "kairos-executive-local-production-bridge-20260730-1";
const ACTION_ROUTE = /^\/api\/workflows\/([^/]+)\/(approve|start-production)$/i;
const nativeFetch = globalThis.fetch.bind(globalThis);
let localRuntimePromise = null;

install();

function install() {
  if (globalThis.fetch?.__kairosLocalProductionBridge === true) return;
  const bridgedFetch = async function kairosLocalProductionFetch(input, init = {}) {
    const request = normalizeRequest(input, init);
    const match = request.url.pathname.match(ACTION_ROUTE);
    if (!match || request.method !== "POST" || request.url.origin !== globalThis.location.origin) {
      return nativeFetch(input, init);
    }
    const workflowId = decodeURIComponent(match[1]);
    const action = match[2].toLowerCase();
    if (action === "approve") return approveAndGenerateSource(input, init, workflowId);
    return generateAndReconcileProduction(input, init, workflowId);
  };
  try { Object.defineProperty(bridgedFetch, "__kairosLocalProductionBridge", { value: true }); }
  catch { bridgedFetch.__kairosLocalProductionBridge = true; }
  globalThis.fetch = bridgedFetch;
  globalThis.KairosLocalProductionBridge = Object.freeze({ ready: true, build: BUILD, provider: "browser-webgpu", externalPaidAPIUsed: false });
}

async function approveAndGenerateSource(input, init, workflowId) {
  setProgress("Approving the foundation…");
  const approvalResponse = await nativeFetch(input, init);
  const approvalBody = await readClone(approvalResponse);
  if (!approvalResponse.ok || approvalBody?.sourceRequired !== true) return approvalResponse;

  const workflow = approvalBody?.workflow || await readWorkflow(workflowId);
  const projectId = String(approvalBody?.agentProjectId || workflow?.agentProjectId || "").trim();
  if (!projectId) throw new Error("Kairos approved the foundation but did not return the local production project identifier.");
  const local = await loadLocalRuntime();
  await local.generateSource({
    projectId,
    title: workflow?.title || workflow?.objective?.title || "MMG Digital Asset",
    objective: objectiveText(workflow),
    onProgress: setProgress,
  });

  setProgress("Synchronizing the verified local source…");
  return nativeFetch(`/api/workflows/${encodeURIComponent(workflowId)}/prepare-source`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
    body: "{}",
  });
}

async function generateAndReconcileProduction(input, init, workflowId) {
  const workflow = await readWorkflow(workflowId);
  const projectId = String(workflow?.agentProjectId || "").trim();
  if (!projectId) throw new Error("Kairos could not identify the local manuscript project.");
  const local = await loadLocalRuntime();
  await local.run({ projectId, onProgress: setProgress });
  setProgress("Reconciling the verified local manuscript…");
  return nativeFetch(input, init);
}

async function readWorkflow(workflowId) {
  const response = await nativeFetch("/api/workflows", { credentials: "include", cache: "no-store", headers: { "X-MMG-Client-Build": BUILD } });
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body?.error?.message || "Kairos could not load the workflow for local production.");
  const workflow = (Array.isArray(body?.workflows) ? body.workflows : []).find((item) => workflowID(item) === workflowId);
  if (!workflow) throw new Error("The selected Kairos workflow is no longer available.");
  return workflow;
}

async function loadLocalRuntime() {
  if (!localRuntimePromise) {
    localRuntimePromise = import("./kairos-local-inference.js?v=local-only-20260730-1").then(() => {
      const runtime = globalThis.KairosLocalInference;
      if (!runtime?.ready || typeof runtime.generateSource !== "function" || typeof runtime.run !== "function") {
        throw new Error("Kairos local inference did not initialize correctly.");
      }
      return runtime;
    });
  }
  return localRuntimePromise;
}

function objectiveText(workflow) {
  const value = workflow?.objective;
  if (typeof value === "string") return value;
  return String(value?.summary || workflow?.summary || workflow?.title || "").trim();
}

function setProgress(message) {
  const text = String(message || "Kairos is producing locally…");
  const button = document.querySelector('[data-workflow-action][aria-busy="true"]');
  if (button) button.textContent = text;
  const explanation = document.querySelector("[data-workflow-dialog] .abos-action-section > p");
  if (explanation) explanation.textContent = text;
  globalThis.dispatchEvent(new CustomEvent("kairos:local-production:progress", { detail: { build: BUILD, message: text } }));
}

function normalizeRequest(input, init) {
  const raw = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
  return {
    url: new URL(raw || "", globalThis.location.href),
    method: String(init?.method || input?.method || "GET").toUpperCase(),
  };
}

function workflowID(item) { return String(item?.id || item?.workflowID || item?.workflowId || item?.runID || item?.runId || ""); }
async function readClone(response) { try { return await response.clone().json(); } catch { return {}; } }
async function readJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { throw new Error(`Kairos returned an unreadable response (HTTP ${response.status}).`); } }
