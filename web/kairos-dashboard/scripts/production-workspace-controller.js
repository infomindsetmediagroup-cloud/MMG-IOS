const BUILD = "kairos-production-workspace-20260731-4-post-intake";
const ACTIVE_KEY = "kairos.production.active-workspace";
const REGISTRY_CACHE_KEY = "kairos.production.registry-cache";
const PRODUCT_KEYS = ["kairos.complete-product.job", "kairos.product.publication", "kairos.product.media", "kairos.product.launch"];
const RESUMABLE_MANUSCRIPT_STATUSES = new Set([
  "production_intake",
  "assigned-to-production",
  "ready-for-editorial",
  "editorial-in-progress",
  "awaiting-customer-review",
  "customer-approved",
  "ready-for-manufacturing",
  "manufacturing",
  "quality-review",
  "packaged",
  "delivered",
]);
const RESUMABLE_MANUSCRIPT_STAGES = new Set([
  "project_setup",
  "editorial",
  "editorial-intake",
  "customer-review",
  "proofread",
  "manufacturing-handoff",
  "manufacturing",
  "quality-review",
  "packaged",
  "delivered",
]);
const originalFetch = window.fetch.bind(window);
let durableProjects = [];
let registryReady = false;
let lastWorkspaceVisibility = "";
let started = false;
let workspaceOpenPromise = null;

window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  captureProductionResponse(args[0], response.clone()).catch(error => {
    console.warn("[kairos-production-workspace] response capture failed", {
      build: BUILD,
      message: error?.message || String(error),
    });
  });
  return response;
};

window.addEventListener("kairos:production:open", event => {
  const workspace = String(event.detail?.workspace || "").trim();
  if (!["complete-product", "manuscript-studio"].includes(workspace)) return;
  void openOrResumeWorkspace(workspace);
});

window.addEventListener("kairos:production:resume", event => {
  const project = event.detail?.project;
  if (!project?.projectId) return;
  resumeProject(project).catch(error => dispatchError(project.projectType, error?.message || "Project recovery failed."));
});

// The Content card must enter through the durable production registry instead
// of the direct-open fallback, which creates an unrelated blank workspace.
document.addEventListener("click", event => {
  const button = event.target instanceof Element
    ? event.target.closest('[data-child="manuscript-studio"]')
    : null;
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void openOrResumeWorkspace("manuscript-studio");
}, true);

window.addEventListener("kairos:production:close", () => {
  sessionStorage.removeItem(ACTIVE_KEY);
  dispatchWorkspaceVisibility("explicit-close");
});
window.addEventListener("storage", event => { if (event.key === ACTIVE_KEY && event.newValue) restoreActiveWorkspace(); });

async function openOrResumeWorkspace(workspace) {
  if (workspaceOpenPromise) return workspaceOpenPromise;

  workspaceOpenPromise = (async () => {
    if (workspace === "manuscript-studio") {
      if (!registryReady) await refreshRegistry("manuscript-open-preflight");
      const active = readJSON(ACTIVE_KEY);
      const project = selectResumableManuscript(active?.projectId || null);
      if (project) return resumeProject(project);
    }

    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({
      workspace,
      openedAt: new Date().toISOString(),
      build: BUILD,
    }));
    openWorkspace(workspace);
    await upsertWorkspaceRecord(workspace);
    return { status: "new-workspace", workspace, build: BUILD };
  })().catch(error => {
    dispatchError(workspace, error?.message || "The production workspace could not open.");
    return { status: "failed", workspace, error: error?.message || String(error), build: BUILD };
  }).finally(() => {
    workspaceOpenPromise = null;
  });

  return workspaceOpenPromise;
}

function selectResumableManuscript(activeProjectId = null) {
  const manuscripts = durableProjects.filter(isResumableManuscript);
  if (activeProjectId) {
    const active = manuscripts.find(project => project.projectId === activeProjectId);
    if (active) return active;
  }
  return manuscripts[0] || null;
}

function isResumableManuscript(project) {
  if (project?.projectType !== "manuscript-studio" || project.status === "archived") return false;
  const status = String(project.status || "").toLowerCase();
  const stage = String(project.stage || "").toLowerCase();
  return RESUMABLE_MANUSCRIPT_STATUSES.has(status) || RESUMABLE_MANUSCRIPT_STAGES.has(stage);
}

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
    const source = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(source?.error?.message || "The manuscript source could not be restored.");
    window.dispatchEvent(new CustomEvent("kairos:manuscript:restore", { detail: { project, source: source.source, manuscript: source.manuscript } }));
    openWorkspace("manuscript-studio");
    await renderResumedManuscriptReceipt(project, source);
  } else {
    openWorkspace("complete-product");
  }
  dispatchStateChanged("project-restored", project.projectId);
  return { status: "project-restored", projectId: project.projectId, projectType: project.projectType, build: BUILD };
}

async function renderResumedManuscriptReceipt(project, source) {
  const overlay = await waitForElement("#manuscript-studio-overlay", 6_000);
  const panel = overlay?.querySelector(".manuscript-panel");
  if (!panel) throw new Error("The saved manuscript opened, but its production workspace did not render.");

  [...panel.children].forEach(child => {
    if (child.tagName !== "HEADER") child.remove();
  });

  const manuscript = String(source?.manuscript || "");
  const sourceRecord = source?.source || {};
  const result = document.createElement("div");
  result.className = "manuscript-result";
  result.dataset.kairosIntakeReceipt = "restored-from-production-registry";
  result.innerHTML = `
    <div class="manuscript-status">
      <span>Saved manuscript project</span>
      <strong>${escapeHTML(project.status || "production_intake")}</strong>
    </div>
    <h3>${escapeHTML(project.summary || "The saved manuscript project is connected and ready to resume.")}</h3>
    <p><strong>Project:</strong> ${escapeHTML(project.projectId)} · <strong>Stage:</strong> ${escapeHTML(project.stage || "project_setup")}</p>
    <p><strong>Accepted source:</strong> ${manuscript.length.toLocaleString()} characters · ${countWords(manuscript).toLocaleString()} words</p>
    <details class="manuscript-source-review" data-kairos-source-review>
      <summary class="secondary">Review Intake Source</summary>
      <div data-kairos-source-review-content>
        <p class="eyebrow">Accepted intake source</p>
        <h3>Review the preserved manuscript</h3>
        <p>This is the authoritative source stored for the connected production project.</p>
        <label>Preserved manuscript text<textarea readonly data-intake-source-review>${escapeHTML(manuscript)}</textarea></label>
      </div>
    </details>
    <div class="issue-list">
      <article><b>${escapeHTML(project.nextAction || "Continue the saved production workflow.")}</b><p>This project was restored from the durable production registry.</p></article>
    </div>
    <p class="manuscript-note">Source: ${escapeHTML(sourceRecord.filename || sourceRecord.name || "stored manuscript")} · the dashboard and dedicated manuscript route now use the same project record.</p>
    <section id="manuscript-project-setup" class="manuscript-project-setup" data-kairos-project-setup-shell data-project-id="${escapeHTML(project.projectId)}" aria-live="polite">
      <p class="eyebrow">Saved production stage</p>
      <h3>Loading Project Setup…</h3>
      <p data-kairos-setup-load-status>Kairos is restoring the saved assignment and editorial handoff.</p>
    </section>
  `;
  panel.append(result);
  overlay.dataset.kairosManuscriptView = "intake-receipt";

  window.KairosManuscriptSetupController?.enhance?.();
  window.KairosManuscriptReceiptContinuationRecovery?.recover?.();
  result.scrollIntoView({ behavior: "auto", block: "start" });
}

function waitForElement(selector, timeoutMs) {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      observer.disconnect();
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) finish(element);
    });
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  });
}

function restoreActiveWorkspace() {
  const active = readJSON(ACTIVE_KEY);
  if (!active?.workspace) return;
  const alreadyOpen = active.workspace === "complete-product" ? document.querySelector("#complete-product-overlay") : document.querySelector("#manuscript-studio-overlay");
  if (!alreadyOpen) setTimeout(() => { void openOrResumeWorkspace(active.workspace); }, 150);
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
  if (url.includes("/api/production-registry/manuscripts/") && url.includes("/source")) await refreshRegistry("manuscript-source-updated");

  // Manuscript Studio exclusively owns the intake-to-registry transition.
  // The fetch interceptor must not issue a second project upsert or registry refresh.

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
  await refreshRegistry("project-upserted", project.projectId);
  return body.project;
}

async function refreshRegistry(reason = "registry-refreshed", projectId = null) {
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
  dispatchStateChanged(reason, projectId);
}

function dispatchStateChanged(reason, projectId = null) {
  const summary = productionSummary();
  window.dispatchEvent(new CustomEvent("kairos:production:state-changed", {
    detail: {
      ...summary,
      reason,
      projectId: projectId || summary.activeProjectId || null,
    },
  }));
}

function dispatchWorkspaceVisibility(reason = "overlay-transition") {
  const active = readJSON(ACTIVE_KEY);
  const workspace = active?.workspace || "";
  const projectId = active?.projectId || "";
  const selector = workspace === "complete-product"
    ? "#complete-product-overlay"
    : workspace === "manuscript-studio"
      ? "#manuscript-studio-overlay"
      : "";
  const open = Boolean(selector && document.querySelector(selector));
  const signature = `${workspace}:${projectId}:${open}`;
  if (signature === lastWorkspaceVisibility) return;
  lastWorkspaceVisibility = signature;
  window.dispatchEvent(new CustomEvent("kairos:production:workspace-visibility", {
    detail: { workspace, projectId, open, reason, build: BUILD },
  }));
}

function productionSummary() {
  const active = readJSON(ACTIVE_KEY);
  const productState = PRODUCT_KEYS.map(key => readJSON(key)).find(Boolean) || null;
  const manuscriptReview = readJSON("mmg.manuscript.review");
  const manuscriptApproval = readJSON("mmg.manuscript.approved");
  return { build: BUILD, activeWorkspace: active?.workspace || null, activeProjectId: active?.projectId || null, product: productState, manuscript: manuscriptApproval || manuscriptReview || null, durableProjects, registryReady, resumable: Boolean(active?.workspace || productState || manuscriptReview || manuscriptApproval || durableProjects.length) };
}

window.KairosProductionWorkspace = Object.freeze({
  open(workspace) { return openOrResumeWorkspace(workspace); },
  resume(project) { return resumeProject(project); },
  async archive(projectId) { await originalFetch(`/api/production-registry/projects/${encodeURIComponent(projectId)}`, { method: "DELETE", credentials: "include" }); await refreshRegistry("project-archived", projectId); },
  refresh(reason = "manual-refresh") { return refreshRegistry(reason); },
  clear() { sessionStorage.removeItem(ACTIVE_KEY); PRODUCT_KEYS.forEach(key => sessionStorage.removeItem(key)); sessionStorage.removeItem("mmg.manuscript.review"); sessionStorage.removeItem("mmg.manuscript.approved"); dispatchStateChanged("workspace-cleared"); },
  summary: productionSummary,
});

const observer = new MutationObserver(() => dispatchWorkspaceVisibility());
observer.observe(document.documentElement, { childList: true, subtree: true });

function start() {
  if (started) return;
  started = true;
  restoreActiveWorkspace();
  refreshRegistry("runtime-started");
  dispatchWorkspaceVisibility("runtime-started");
}

function countWords(value) { return String(value || "").trim() ? String(value).trim().split(/\s+/).length : 0; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function nextActionForJob(job) { if (job.status === "completed") return "Review the completed package and continue to Shopify handoff."; if (job.status === "awaiting-cover-approval") return "Review and approve the cover proof."; if (job.status === "needs-attention") return "Resolve the reported production issue."; return job.stageLabel || "Resume production."; }
function checkpointsForJob(job) { return (job.stages || []).filter(item => item.status === "completed").map(item => ({ id: item.id || item.stage || item.label, label: item.label || item.stage || "Production stage", status: "completed", recordedAt: job.updatedAt || new Date().toISOString() })).slice(-20); }
function stageFromURL(url) { if (url.includes("product-launch")) return "storefront-release"; if (url.includes("product-media")) return "product-media"; return "shopify-product-draft"; }
function progressFromStage(stage) { return stage === "storefront-release" ? 100 : stage === "product-media" ? 92 : 84; }
function stageLabel(stage) { return stage === "storefront-release" ? "Storefront release control" : stage === "product-media" ? "Product media installed" : "Shopify product draft prepared"; }
function dispatchError(workspace, message) { window.dispatchEvent(new CustomEvent("kairos:production:error", { detail: { workspace, message } })); }
function readJSON(key) { try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; } }

if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start, { once: true });
else start();
setTimeout(start, 300);
