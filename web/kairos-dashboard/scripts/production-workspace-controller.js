const BUILD = "kairos-production-workspace-20260722-4";
const ACTIVE_KEY = "kairos.production.active-workspace";
const REGISTRY_CACHE_KEY = "kairos.production.registry-cache";
const PRODUCT_KEYS = ["kairos.complete-product.job", "kairos.product.publication", "kairos.product.media", "kairos.product.launch"];
const originalFetch = window.fetch.bind(window);
let durableProjects = [];
let registryReady = false;
let overlaySignalScheduled = false;
let lastOverlaySignature = "";

window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  captureProductionResponse(args[0], response.clone()).catch(() => {});
  return response;
};

window.addEventListener("kairos:production:open", event => {
  const workspace = String(event.detail?.workspace || "").trim();
  if (!["complete-product", "manuscript-studio"].includes(workspace)) return;
  sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ workspace, openedAt: new Date().toISOString(), build: BUILD }));
  openWorkspace(workspace);
  upsertWorkspaceRecord(workspace).catch(() => {});
});

window.addEventListener("kairos:production:resume", event => {
  const project = event.detail?.project;
  if (!project?.projectId) return;
  resumeProject(project).catch(error => dispatchError(project.projectType, error?.message || "Project recovery failed."));
});

window.addEventListener("kairos:production:close", () => sessionStorage.removeItem(ACTIVE_KEY));
window.addEventListener("storage", event => { if (event.key === ACTIVE_KEY && event.newValue) restoreActiveWorkspace(); });

function openWorkspace(workspace) {
  const selector = workspace === "complete-product" ? ".creation-engine-launch" : ".manuscript-launch";
  const launcher = document.querySelector(selector);
  if (!launcher) return dispatchError(workspace, "The requested production workspace is not available.");
  launcher.click();
}

async function resumeProject(project) {
  sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ workspace: project.activeWorkspace || project.projectType, projectId: project.projectId, openedAt: new Date().toISOString(), build: BUILD }));
  if (project.projectType === "complete-product" && project.sourceProjectId) {
    const response = await originalFetch(`/api/publishing/jobs/${encodeURIComponent(project.sourceProjectId)}`, { credentials: "include", cache: "no-store" });
    const job = await response.json();
    if (!response.ok) throw new Error(job?.error?.message || "The product project could not be restored.");
    sessionStorage.setItem("kairos.complete-product.job", JSON.stringify(job));
    window.dispatchEvent(new CustomEvent("kairos:complete-product:restore", { detail: { job, registryProject: project } }));
  }
  if (project.projectType === "manuscript-studio") {
    const response = await originalFetch(`/api/production-registry/manuscripts/${encodeURIComponent(project.projectId)}/source/text`, { credentials: "include", cache: "no-store" });
    const source = await response.json();
    if (!response.ok) throw new Error(source?.error?.message || "The manuscript source could not be restored.");
    window.dispatchEvent(new CustomEvent("kairos:manuscript:restore", { detail: { project, source: source.source, manuscript: source.manuscript } }));
  }
  openWorkspace(project.projectType === "manuscript-studio" ? "manuscript-studio" : "complete-product");
  window.dispatchEvent(new CustomEvent("kairos:production:state-changed", { detail: productionSummary() }));
}

function restoreActiveWorkspace() {
  const active = readJSON(ACTIVE_KEY);
  if (!active?.workspace) return;
  const alreadyOpen = active.workspace === "complete-product" ? document.querySelector("#complete-product-overlay") : document.querySelector("#manuscript-studio-overlay");
  if (!alreadyOpen) setTimeout(() => openWorkspace(active.workspace), 150);
}

async function captureProductionResponse(input, response) {
  const url = String(typeof input === "string" ? input : input?.url || "");
  if (!response.ok) return;
  if (/\/api\/(content\/generate|publishing\/jobs)$/.test(url)) {
    const job = await response.json();
    if (job?.projectId) {
      sessionStorage.setItem("kairos.complete-product.job", JSON.stringify(job));
      await upsertProject({ projectId: `product-${job.projectId}`, projectType: "complete-product", title: job.title || "Complete Product", status: job.status || "active", stage: job.stage || "production", progress: job.overallProgress || 0, activeWorkspace: "complete-product", sourceProjectId: job.projectId, summary: job.stageLabel || "Complete-product production is in progress.", nextAction: nextActionForJob(job), checkpoints: checkpointsForJob(job) });
    }
  }
  const jobMatch = url.match(/\/api\/publishing\/jobs\/([a-f0-9-]+)$/i);
  if (jobMatch) {
    const job = await response.json();
    if (job?.projectId) await upsertProject({ projectId: `product-${job.projectId}`, projectType: "complete-product", title: job.title || "Complete Product", status: job.status || "active", stage: job.stage || "production", progress: job.overallProgress || 0, activeWorkspace: "complete-product", sourceProjectId: job.projectId, summary: job.stageLabel || "Production project updated.", nextAction: nextActionForJob(job), checkpoints: checkpointsForJob(job) });
  }
  if (url.includes("/api/production-registry/manuscripts/") && url.includes("/source")) await refreshRegistry();
  if (url.includes("/api/manuscript/intake/advance")) {
    const record = await response.json();
    const active = readJSON(ACTIVE_KEY);
    const id = active?.projectId || `manuscript-${record.projectId || record.intakeId || crypto.randomUUID()}`;
    await upsertProject({ projectId: id, projectType: "manuscript-studio", title: record.title || record.source?.filename || "Manuscript Project", status: record.status || "production-intake-created", stage: record.stage || "production-intake", progress: record.overallProgress || 20, activeWorkspace: "manuscript-studio", sourceProjectId: record.projectId || null, summary: "Manuscript intake was validated and advanced into production.", nextAction: record.nextAction || "Continue the manuscript production workflow.", checkpoints: [{ id: "intake", label: "Source intake validated", status: "completed", recordedAt: new Date().toISOString() }] });
  }
  if (url.includes("/api/shopify/product-publication/") || url.includes("/api/shopify/product-media/") || url.includes("/api/shopify/product-launch/")) {
    const record = await response.json();
    const sourceId = record.projectId || record.source?.projectId || readJSON("kairos.complete-product.job")?.projectId;
    if (sourceId) await upsertProject({ projectId: `product-${sourceId}`, projectType: "complete-product", title: record.desired?.title || record.result?.title || readJSON("kairos.complete-product.job")?.title || "Complete Product", status: record.status || "active", stage: stageFromURL(url), progress: progressFromStage(stageFromURL(url)), activeWorkspace: "complete-product", sourceProjectId: sourceId, sourceReleaseId: record.releaseId || record.releaseID || null, summary: record.nextAction || "Shopify product production advanced.", nextAction: record.nextAction || "Continue the approved product workflow.", checkpoints: [{ id: stageFromURL(url), label: stageLabel(stageFromURL(url)), status: "completed", recordedAt: new Date().toISOString() }] });
  }
}

async function upsertWorkspaceRecord(workspace) {
  const active = readJSON(ACTIVE_KEY);
  if (active?.projectId) return;
  const id = `${workspace}-${crypto.randomUUID()}`;
  await upsertProject({ projectId: id, projectType: workspace, title: workspace === "complete-product" ? "New Complete Product" : "New Manuscript Project", status: "intake", stage: "intake", progress: 0, activeWorkspace: workspace, summary: "Production workspace opened.", nextAction: "Complete the project intake." });
  sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ workspace, projectId: id, openedAt: new Date().toISOString(), build: BUILD }));
}

async function upsertProject(project) {
  const response = await originalFetch("/api/production-registry/projects", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, body: JSON.stringify(project) });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "Production project could not be saved.");
  await refreshRegistry();
  return body.project;
}

async function refreshRegistry() {
  try {
    const response = await originalFetch("/api/production-registry/projects", { credentials: "include", cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Registry unavailable.");
    durableProjects = Array.isArray(body.projects) ? body.projects.filter(project => project.status !== "archived") : [];
    registryReady = true;
    sessionStorage.setItem(REGISTRY_CACHE_KEY, JSON.stringify(durableProjects));
  } catch {
    durableProjects = readJSON(REGISTRY_CACHE_KEY) || [];
    registryReady = false;
  }
  window.dispatchEvent(new CustomEvent("kairos:production:state-changed", { detail: productionSummary() }));
}

function productionSummary() {
  const active = readJSON(ACTIVE_KEY);
  const productState = PRODUCT_KEYS.map(key => readJSON(key)).find(Boolean) || null;
  const manuscriptReview = readJSON("mmg.manuscript.review");
  const manuscriptApproval = readJSON("mmg.manuscript.approved");
  return { build: BUILD, activeWorkspace: active?.workspace || null, activeProjectId: active?.projectId || null, product: productState, manuscript: manuscriptApproval || manuscriptReview || null, durableProjects, registryReady, resumable: Boolean(active?.workspace || productState || manuscriptReview || manuscriptApproval || durableProjects.length) };
}

window.KairosProductionWorkspace = Object.freeze({
  open(workspace) { window.dispatchEvent(new CustomEvent("kairos:production:open", { detail: { workspace } })); },
  resume(project) { window.dispatchEvent(new CustomEvent("kairos:production:resume", { detail: { project } })); },
  async archive(projectId) { await originalFetch(`/api/production-registry/projects/${encodeURIComponent(projectId)}`, { method: "DELETE", credentials: "include" }); await refreshRegistry(); },
  refresh: refreshRegistry,
  clear() { sessionStorage.removeItem(ACTIVE_KEY); PRODUCT_KEYS.forEach(key => sessionStorage.removeItem(key)); sessionStorage.removeItem("mmg.manuscript.review"); sessionStorage.removeItem("mmg.manuscript.approved"); window.dispatchEvent(new CustomEvent("kairos:production:state-changed", { detail: productionSummary() })); },
  summary: productionSummary,
});

function scheduleOverlayStateSignal() {
  if (overlaySignalScheduled) return;
  overlaySignalScheduled = true;
  queueMicrotask(() => {
    overlaySignalScheduled = false;
    const active = readJSON(ACTIVE_KEY);
    const isOpen = active?.workspace === "complete-product"
      ? Boolean(document.querySelector("#complete-product-overlay"))
      : active?.workspace === "manuscript-studio"
        ? Boolean(document.querySelector("#manuscript-studio-overlay"))
        : false;
    const signature = `${active?.workspace || "none"}:${active?.projectId || "none"}:${isOpen ? "open" : "closed"}`;
    if (signature === lastOverlaySignature) return;
    lastOverlaySignature = signature;
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed", { detail: productionSummary() }));
  });
}

const observer = new MutationObserver(scheduleOverlayStateSignal);
observer.observe(document.documentElement, { childList: true, subtree: true });

function nextActionForJob(job) { if (job.status === "completed") return "Review the completed package and continue to Shopify handoff."; if (job.status === "awaiting-cover-approval") return "Review and approve the cover proof."; if (job.status === "needs-attention") return "Resolve the reported production issue."; return job.stageLabel || "Resume production."; }
function checkpointsForJob(job) { return (job.stages || []).filter(item => item.status === "completed").map(item => ({ id: item.id || item.stage || item.label, label: item.label || item.stage || "Production stage", status: "completed", recordedAt: job.updatedAt || new Date().toISOString() })).slice(-20); }
function stageFromURL(url) { if (url.includes("product-launch")) return "storefront-release"; if (url.includes("product-media")) return "product-media"; return "shopify-product-draft"; }
function progressFromStage(stage) { return stage === "storefront-release" ? 100 : stage === "product-media" ? 92 : 84; }
function stageLabel(stage) { return stage === "storefront-release" ? "Storefront release control" : stage === "product-media" ? "Product media installed" : "Shopify product draft prepared"; }
function dispatchError(workspace, message) { window.dispatchEvent(new CustomEvent("kairos:production:error", { detail: { workspace, message } })); }
function readJSON(key) { try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; } }

window.addEventListener("DOMContentLoaded", () => { restoreActiveWorkspace(); refreshRegistry(); }, { once: true });
setTimeout(() => { restoreActiveWorkspace(); refreshRegistry(); }, 300);
