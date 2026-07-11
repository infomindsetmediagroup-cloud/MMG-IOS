import {
  commandCenters,
  getCommandCenterStore,
  nextRunnableWork,
  recordCompletedKnowledge,
  resetCommandCenterStore,
  unlockDependents,
  updateWorkItem,
} from "./executive-command-center-store.js";

const runtimeBaseURL = "https://mmg-ios.vercel.app";
const nav = document.querySelector("#module-nav");
const view = document.querySelector("#dashboard-view");
const title = document.querySelector("#page-title");
const mode = document.querySelector("#runtime-mode");

let activeCenter = "home";
let diagnosticsOpen = false;
let runtimeHealth = { ready: false, storefront: false, checkedAt: "Not checked" };

mode.textContent = "Execution Mode";

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function statusClass(status) {
  if (["Completed", "Ready"].includes(status)) return "badge good";
  if (["Needs Attention", "Failed"].includes(status)) return "badge danger";
  if (["Ready for Approval", "Queued", "Paused"].includes(status)) return "badge warning";
  return "badge";
}

function progressFor(item) {
  const defaults = { "Ready for Approval": 0, Queued: 0, Starting: 10, Working: 50, Finalizing: 90, Completed: 100, "Needs Attention": item.progress || 0 };
  return Number.isFinite(Number(item.progress)) ? Number(item.progress) : defaults[item.status] || 0;
}

function renderNav() {
  nav.innerHTML = `
    <button class="nav-button ${activeCenter === "home" ? "active" : ""}" data-center="home"><span class="nav-icon">⌂</span>Command Center</button>
    ${commandCenters.map(center => `<button class="nav-button ${activeCenter === center.id ? "active" : ""}" data-center="${center.id}"><span class="nav-icon">${center.icon}</span>${center.title}</button>`).join("")}
    <button class="nav-button diagnostics-nav ${diagnosticsOpen ? "active" : ""}" data-diagnostics><span class="nav-icon">⋯</span>Diagnostics</button>`;
  nav.querySelectorAll("[data-center]").forEach(button => button.addEventListener("click", () => {
    activeCenter = button.dataset.center;
    diagnosticsOpen = false;
    render();
  }));
  nav.querySelector("[data-diagnostics]")?.addEventListener("click", () => {
    diagnosticsOpen = !diagnosticsOpen;
    render();
  });
}

function pipelineCounts(items) {
  return {
    approval: items.filter(item => item.status === "Ready for Approval").length,
    queued: items.filter(item => item.status === "Queued").length,
    working: items.filter(item => ["Starting", "Working", "Finalizing"].includes(item.status)).length,
    attention: items.filter(item => ["Needs Attention", "Failed", "Paused"].includes(item.status)).length,
    completed: items.filter(item => item.status === "Completed").length,
  };
}

function movementStrip(items) {
  const counts = pipelineCounts(items);
  return `<div class="movement-strip full">
    <div><strong>${counts.approval}</strong><span>Approval</span></div>
    <div><strong>${counts.queued}</strong><span>Queued</span></div>
    <div><strong class="working-value">${counts.working}</strong><span>Working</span></div>
    <div><strong class="attention-value">${counts.attention}</strong><span>Attention</span></div>
    <div><strong class="complete-value">${counts.completed}</strong><span>Completed</span></div>
  </div>`;
}

function livingHeader(items) {
  const counts = pipelineCounts(items);
  const headline = counts.working ? `Kairos is working on ${counts.working} approved action${counts.working === 1 ? "" : "s"}.` : "Kairos is ready for your next objective.";
  return `<article class="card living-header full">
    <div class="living-orb ${runtimeHealth.ready ? "ready" : "attention"}" aria-hidden="true"><span></span></div>
    <div><p class="eyebrow">Live Operating Status</p><h3>${headline}</h3><p class="muted">${runtimeHealth.ready ? "Production runtime connected." : "Production runtime requires attention."} Live storefront inspection ${runtimeHealth.storefront ? "is connected" : "requires attention"}.</p></div>
    <span class="${runtimeHealth.ready ? "badge good" : "badge danger"}">${runtimeHealth.ready ? "Runtime Ready" : "Check Runtime"}</span>
  </article>`;
}

function parentCard(center, store) {
  const items = center.id === "knowledge" ? [] : store.work.filter(item => item.center === center.id);
  const counts = pipelineCounts(items);
  const runnable = center.id === "knowledge" ? null : nextRunnableWork(center.id);
  const status = center.id === "knowledge" ? `${store.knowledge.length} preserved` : counts.working ? `${counts.working} working` : counts.approval ? `${counts.approval} approval` : counts.attention ? `${counts.attention} attention` : counts.queued ? `${counts.queued} queued` : "Ready";
  return `<article class="parent-card" data-parent-center="${center.id}">
    <span class="parent-icon">${center.icon}</span>
    <strong>${center.title}</strong>
    <p>${center.detail}</p>
    <span class="parent-status">${status}</span>
    <div class="action-row">
      <button class="action-button" data-open-center="${center.id}">Open Center</button>
      ${runnable ? `<button class="action-button primary" data-run-center="${center.id}">Run Next</button>` : ""}
    </div>
  </article>`;
}

function renderHome(store) {
  title.textContent = "Command Center";
  view.innerHTML = `${livingHeader(store.work)}${movementStrip(store.work)}<section class="parent-grid full" aria-label="Command Centers">${commandCenters.map(center => parentCard(center, store)).join("")}</section>${diagnosticsOpen ? diagnosticsCard(store) : ""}`;
}

function actionControls(item) {
  if (item.status === "Ready for Approval") return `<button class="action-button primary" data-approve-execute="${item.id}">Approve & Execute</button>`;
  if (["Needs Attention", "Failed", "Paused"].includes(item.status) && item.actionType) return `<button class="action-button" data-retry-action="${item.id}">Retry</button>`;
  if (item.status === "Queued" && item.actionType && !item.dependency) return `<button class="action-button primary" data-activate-action="${item.id}">Activate & Execute</button>`;
  return "";
}

function workRow(item) {
  const progress = progressFor(item);
  const dependencyText = item.dependency && item.status === "Queued" ? `<p class="dependency">Waiting on ${escapeHTML(item.dependency)}</p>` : "";
  return `<article class="pipeline-item" data-work-id="${item.id}">
    <div class="pipeline-item-header"><div><span class="work-id">${escapeHTML(item.id)}</span><h4>${escapeHTML(item.title)}</h4></div><span class="${statusClass(item.status)}">${escapeHTML(item.status)}</span></div>
    <p class="muted">${escapeHTML(item.objective)}</p>
    ${dependencyText}
    ${progress > 0 ? `<div class="progress-shell"><div class="progress-bar ${["Starting", "Working", "Finalizing"].includes(item.status) ? "live-progress" : ""}" style="width:${progress}%"></div></div><small>${progress}% • ${escapeHTML(item.updatedAt)}</small>` : `<small>${escapeHTML(item.updatedAt)}</small>`}
    ${item.error ? `<p class="execution-error">${escapeHTML(item.error)}</p>` : ""}
    <div class="action-row">${actionControls(item)}</div>
  </article>`;
}

function pipelineSection(label, items, emptyText) {
  return `<section class="pipeline-section full"><header><h3>${label}</h3><span class="badge">${items.length}</span></header>${items.length ? `<div class="pipeline-list">${items.map(workRow).join("")}</div>` : `<p class="empty-state">${emptyText}</p>`}</section>`;
}

function knowledgeSection(store) {
  const records = store.knowledge;
  return `<section class="pipeline-section full"><header><div><p class="eyebrow">Institutional Memory</p><h3>Knowledge Vault</h3></div><span class="badge good">${records.length} preserved</span></header>${records.length ? `<div class="pipeline-list">${records.map(record => `<article class="pipeline-item"><div class="pipeline-item-header"><div><span class="work-id">${escapeHTML(record.workItemId || "KNOWLEDGE")}</span><h4>${escapeHTML(record.title)}</h4></div><span class="badge good">Preserved</span></div><p class="muted">Completed ${new Date(record.completedAt).toLocaleString()}</p><details><summary>Completion evidence</summary><pre>${escapeHTML(JSON.stringify(record.evidence, null, 2))}</pre></details></article>`).join("")}</div>` : `<p class="empty-state">Completed work and verified evidence will appear here automatically.</p>`}</section>`;
}

function centerHeader(center, items) {
  const runnable = nextRunnableWork(center.id);
  return `<article class="card center-header full"><div><p class="eyebrow">Parent Command Center</p><h3>${center.title}</h3><p class="muted">${center.detail}</p><div class="action-row">${runnable ? `<button class="action-button primary" data-run-center="${center.id}">Run Next Center Action</button>` : ""}<button class="action-button" data-return-home>Return to Main Control Panel</button></div></div>${movementStrip(items)}</article>`;
}

function renderCenter(store, center) {
  title.textContent = center.title;
  if (center.id === "knowledge") {
    view.innerHTML = `${centerHeader(center, [])}${knowledgeSection(store)}${diagnosticsOpen ? diagnosticsCard(store) : ""}`;
    return;
  }
  const items = store.work.filter(item => item.center === center.id);
  view.innerHTML = `${centerHeader(center, items)}${pipelineSection("Ready for Approval", items.filter(item => item.status === "Ready for Approval"), "Nothing is waiting for your approval.")}${pipelineSection("Queued", items.filter(item => item.status === "Queued"), "No approved work is waiting to start.")}${pipelineSection("Working", items.filter(item => ["Starting", "Working", "Finalizing"].includes(item.status)), "Kairos has no active work in this center.")}${pipelineSection("Needs Attention", items.filter(item => ["Needs Attention", "Failed", "Paused"].includes(item.status)), "No blockers require your attention.")}${pipelineSection("Completed", items.filter(item => item.status === "Completed"), "Completed work will appear here with evidence and finish time.")}${diagnosticsOpen ? diagnosticsCard(store) : ""}`;
}

function diagnosticsCard(store) {
  return `<details class="card diagnostics-card full" open><summary>Technical diagnostics</summary><div class="diagnostics-grid"><div><span>Runtime</span><strong>${runtimeHealth.ready ? "Ready" : "Unavailable"}</strong></div><div><span>Storefront inspection</span><strong>${runtimeHealth.storefront ? "Connected" : "Unavailable"}</strong></div><div><span>Last check</span><strong>${escapeHTML(runtimeHealth.checkedAt)}</strong></div><div><span>Operating graph</span><strong>${store.work.length} work items · ${store.knowledge.length} records</strong></div></div><button class="action-button danger-button" data-reset-command-center>Reset local dashboard state</button></details>`;
}

function executeWork(id) {
  const store = getCommandCenterStore();
  const item = store.work.find(entry => entry.id === id);
  if (!item?.actionType) return;
  updateWorkItem(id, { status: "Starting", progress: 10, error: "", updatedAt: "Approval recorded; routing through Kairos" });
  window.dispatchEvent(new CustomEvent("kairos:execute-approved-action", { detail: { id, center: item.center, actionType: item.actionType, objective: item.objective } }));
}

function runCenter(centerId) {
  const item = nextRunnableWork(centerId);
  if (!item) {
    activeCenter = centerId;
    render();
    return;
  }
  activeCenter = centerId;
  executeWork(item.id);
}

function bindActions() {
  view.querySelectorAll("[data-open-center]").forEach(button => button.addEventListener("click", () => { activeCenter = button.dataset.openCenter; render(); }));
  view.querySelectorAll("[data-run-center]").forEach(button => button.addEventListener("click", () => runCenter(button.dataset.runCenter)));
  view.querySelector("[data-return-home]")?.addEventListener("click", () => { activeCenter = "home"; render(); });
  view.querySelectorAll("[data-approve-execute]").forEach(button => button.addEventListener("click", () => executeWork(button.dataset.approveExecute)));
  view.querySelectorAll("[data-retry-action]").forEach(button => button.addEventListener("click", () => executeWork(button.dataset.retryAction)));
  view.querySelectorAll("[data-activate-action]").forEach(button => button.addEventListener("click", () => executeWork(button.dataset.activateAction)));
  view.querySelector("[data-reset-command-center]")?.addEventListener("click", () => { resetCommandCenterStore(); activeCenter = "home"; render(); });
}

function render() {
  const store = getCommandCenterStore();
  renderNav();
  if (activeCenter === "home") renderHome(store);
  else renderCenter(store, commandCenters.find(center => center.id === activeCenter) || commandCenters[0]);
  bindActions();
}

async function refreshHealth() {
  try {
    const response = await fetch(`${runtimeBaseURL}/api/health`, { headers: { Accept: "application/json" }, cache: "no-store" });
    const body = await response.json();
    const ready = response.ok && (body.status === "ready" || body.status === "ok");
    runtimeHealth = { ready, storefront: ready, checkedAt: new Date().toLocaleTimeString() };
    updateWorkItem("SYS-001", ready ? { status: "Completed", progress: 100, error: "", updatedAt: `Verified ${runtimeHealth.checkedAt}` } : { status: "Needs Attention", progress: 50, updatedAt: "Runtime health check failed" });
  } catch {
    runtimeHealth = { ready: false, storefront: false, checkedAt: new Date().toLocaleTimeString() };
    updateWorkItem("SYS-001", { status: "Needs Attention", progress: 50, updatedAt: "Runtime unreachable" });
  }
  render();
}

window.addEventListener("kairos:command-center-updated", render);
window.addEventListener("kairos:approved-action-status", event => {
  const { id, status, progress, error, result } = event.detail || {};
  if (!id) return;
  const store = getCommandCenterStore();
  const work = store.work.find(item => item.id === id);
  if (!work) return;
  updateWorkItem(id, { status, progress, error: error || "", evidence: result || null, updatedAt: new Date().toLocaleString() });
  if (status === "Completed" && result) {
    recordCompletedKnowledge(work, result);
    unlockDependents(id);
  }
});

render();
refreshHealth();
