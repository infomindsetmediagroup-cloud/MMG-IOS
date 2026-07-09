import { kairosState } from "./state.js";
import { getActionLog, recordAction } from "./runtime-actions.js";

const nav = document.querySelector("#module-nav");
const view = document.querySelector("#dashboard-view");
const title = document.querySelector("#page-title");
const mode = document.querySelector("#runtime-mode");
const brandDoctrine = kairosState.brandDoctrine;
const stewardshipDoctrine = kairosState.stewardshipDoctrine;

mode.textContent = kairosState.mode;

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["active", "ready", "live", "low", "protected", "completed", "green"].includes(normalized)) return "badge good";
  if (["medium", "queued", "build", "open", "seeding", "planned", "hold", "open pr", "batch"].includes(normalized)) return "badge warning";
  if (["critical", "blocked", "failed", "danger", "red"].includes(normalized)) return "badge danger";
  return "badge";
}

function progress(value) {
  const numeric = Number(String(value).replace("%", "")) || 0;
  return `<div class="progress-shell"><div class="progress-bar" style="width:${numeric}%"></div></div>`;
}

function actionButton(label, action, detail = "Queued from dashboard") {
  return `<button class="action-button" data-action="${action}" data-detail="${detail}">${label}</button>`;
}

function bindActions() {
  view.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      recordAction(button.dataset.action, button.dataset.detail);
      renderModule(document.querySelector(".nav-button.active")?.dataset.module || "command");
    });
  });
}

function renderNav(active = "command") {
  nav.innerHTML = kairosState.modules.map(module => `
    <button class="nav-button ${module.id === active ? "active" : ""}" data-module="${module.id}"><span class="nav-icon">${module.icon}</span>${module.label}</button>
  `).join("");
  nav.querySelectorAll("button").forEach(button => button.addEventListener("click", () => renderModule(button.dataset.module)));
}

function actionLogCard() {
  const log = getActionLog();
  return `<article class="card full"><div class="card-header"><h3>Command Log</h3><span class="badge good">${log.length}</span></div><div class="list">${(log.length ? log : [{ action: "Awaiting command", detail: "Select a parent system and queue the next operational action.", status: "Standby", createdAt: "Kairos" }]).slice(0, 5).map(item => `<div class="list-item"><div><strong>${item.action}</strong><p class="muted">${item.detail} • ${item.createdAt}</p></div><span class="${badgeClass(item.status)}">${item.status}</span></div>`).join("")}</div></article>`;
}

function currentStatusCard() {
  const status = kairosState.currentStatus;
  return `<article class="card hero-panel full" data-priority-card="decision">
    <div class="card-header"><div><p class="eyebrow">Current Operational Status</p><h3>${status.headline}</h3></div><span class="badge good">Main Green</span></div>
    <p class="metric">${kairosState.readiness}%</p>
    <p class="muted">${status.summary}</p>
    <div class="list core-node-list">
      <div class="list-item"><div><strong>Main Branch</strong><p class="muted">${status.validationGate}</p></div><span class="${badgeClass(status.mainBranch)}">${status.mainBranch}</span></div>
      <div class="list-item"><div><strong>Active PR</strong><p class="muted">${status.activePr}</p></div><span class="badge warning">Hold</span></div>
      <div class="list-item"><div><strong>Actions Policy</strong><p class="muted">${status.actionsPolicy}</p></div><span class="badge good">Batch</span></div>
      <div class="list-item"><div><strong>Dashboard Visibility</strong><p class="muted">${status.visibleDashboard}</p></div><span class="badge good">Updated</span></div>
    </div>
    <div class="action-row">${actionButton("Record Status Check", "Record Status Check", "Dashboard current status reviewed by operator.")}${actionButton("Queue Next Batch", "Queue Next Batch", "Next batch queued without running GitHub Actions yet.")}</div>
  </article>`;
}

function readinessCard(item) {
  return `<article class="card core-card" data-priority-card="active">
    <div class="card-header"><div><p class="eyebrow">${item.label}</p><h3>${item.value}</h3></div><span class="${badgeClass(item.status)}">${item.status}</span></div>
    <p class="metric">${item.complete}%</p>
    <p class="muted">${item.detail}</p>
    ${progress(item.complete)}
  </article>`;
}

function milestoneCard() {
  return `<article class="card full" data-priority-card="ready">
    <div class="card-header"><div><p class="eyebrow">Live Milestones</p><h3>What changed in the repo right now</h3></div><span class="badge good">Synced</span></div>
    <div class="list core-node-list">${kairosState.liveMilestones.map(item => `<div class="list-item"><strong>${item}</strong><span class="badge good">Done</span></div>`).join("")}</div>
  </article>`;
}

function nextBatchCard() {
  return `<article class="card full" data-priority-card="critical">
    <div class="card-header"><div><p class="eyebrow">Next Batch</p><h3>Do not burn Actions minutes until this batch is worth validating.</h3></div><span class="badge warning">Hold CI</span></div>
    <div class="list core-node-list">${kairosState.nextBatch.map(item => `<div class="list-item"><div><strong>${item.title}</strong><p class="muted">${item.lane}</p></div><span class="${badgeClass(item.status)}">${item.status}</span></div>`).join("")}</div>
  </article>`;
}

function brandDoctrineCard() {
  return `<article class="card full" data-priority-card="decision">
    <div class="card-header"><div><p class="eyebrow">Customer Value Doctrine</p><h3>${brandDoctrine.promise}</h3></div><span class="badge good">Locked</span></div>
    <p class="metric">Discover. Build. Share.</p>
    <p class="muted">${brandDoctrine.support}</p>
    <p class="muted">${brandDoctrine.positioning}</p>
    <div class="list core-node-list">${brandDoctrine.messageSequence.map(step => `<div class="list-item"><strong>${step}</strong><span class="badge">Message Layer</span></div>`).join("")}</div>
    <div class="action-row">${actionButton("Queue Brand Work", "Queue Brand Work", "Customer value doctrine queued for website and product surfaces.")}${actionButton("Preserve Doctrine", "Preserve Doctrine", "Brand philosophy preserved as a Kairos operating standard.")}</div>
  </article>`;
}

function valuePathwaysCard() {
  return `<article class="card full" data-priority-card="ready">
    <div class="card-header"><div><p class="eyebrow">Value Pathways</p><h3>Package knowledge into practical opportunities.</h3></div><span class="badge good">Active</span></div>
    <p class="muted">${brandDoctrine.customerOutcome}</p>
    <div class="list core-node-list">${brandDoctrine.valuePathways.map(path => `<div class="list-item"><div><strong>${path.title}</strong><p class="muted">${path.detail}</p></div><span class="badge good">Path</span></div>`).join("")}</div>
  </article>`;
}

function guardrailsCard() {
  return `<article class="card full" data-priority-card="protected">
    <div class="card-header"><div><p class="eyebrow">Messaging Guardrails</p><h3>Guidance over hype.</h3></div><span class="badge good">Protected</span></div>
    <div class="list core-node-list">${brandDoctrine.forbiddenTone.map(rule => `<div class="list-item"><strong>${rule}</strong><span class="badge warning">Avoid</span></div>`).join("")}</div>
    <div class="list core-node-list">${brandDoctrine.approvedTone.map(rule => `<div class="list-item"><strong>${rule}</strong><span class="badge good">Use</span></div>`).join("")}</div>
  </article>`;
}

function stewardshipCard(group) {
  return `<article class="card full" data-priority-card="ready">
    <div class="card-header"><div><p class="eyebrow">Guidance Layer</p><h3>Knowledge Stewardship</h3></div><span class="badge good">Active</span></div>
    <p class="muted">${stewardshipDoctrine.role}</p>
    <div class="list core-node-list">
      <div class="list-item"><div><strong>Preserve Context</strong><p class="muted">${stewardshipDoctrine.assetModel}</p></div><span class="badge good">Core</span></div>
      <div class="list-item"><div><strong>Recommend Next Action</strong><p class="muted">${stewardshipDoctrine.customerGuidanceRule}</p></div><span class="badge warning">Runtime</span></div>
      <div class="list-item"><div><strong>Compound Assets</strong><p class="muted">${stewardshipDoctrine.operatingRule}</p></div><span class="badge good">Doctrine</span></div>
    </div>
  </article>`;
}

function groupCard(group) {
  return `<article class="card core-card" data-core-group="${group.id}">
    <div class="card-header"><div><p class="eyebrow">${group.label}</p><h3>${group.label} System</h3></div><span class="${badgeClass(group.status)}">${group.status}</span></div>
    <p class="metric">${group.metric}</p>
    <p class="muted">${group.summary}</p>
    ${progress(group.metric)}
    <div class="list core-node-list">${group.nodes.slice(0, 5).map(node => `<div class="list-item"><strong>${node}</strong><span class="badge">Node</span></div>`).join("")}</div>
    <div class="action-row">${actionButton("Open", `Open ${group.label}`, `${group.label} parent group opened.`)}${actionButton("Queue Work", `Queue ${group.label} Work`, `${group.label} work item queued.`)}</div>
  </article>`;
}

function renderDashboard() {
  title.textContent = "Dashboard";
  view.innerHTML = `
    ${currentStatusCard()}
    <article class="card hero-panel full"><div class="card-header"><div><p class="eyebrow">Good morning, ${kairosState.operator} • Updated ${kairosState.lastUpdated}</p><h3>${kairosState.activeBatch}</h3></div><span class="badge good">Operational Visibility</span></div><p class="metric">${kairosState.health}%</p><p class="muted">Kairos is in production hardening. The visible dashboard now tracks the same green-state progress as the native iOS repository while we batch future work to conserve GitHub Actions minutes.</p><div class="action-row">${actionButton("Start Daily Ops", "Start Daily Ops", "Daily operations run queued.")}${actionButton("Run Priority Chain", "Run Priority Chain", "Priority chain workflow queued.")}</div></article>
    ${kairosState.operationalReadiness.map(readinessCard).join("")}
    ${milestoneCard()}
    ${nextBatchCard()}
    ${brandDoctrineCard()}
    ${valuePathwaysCard()}
    ${kairosState.coreGroups.map(groupCard).join("")}
    ${actionLogCard()}
  `;
  bindActions();
}

function renderModule(moduleId) {
  renderNav(moduleId);
  const group = kairosState.coreGroups.find(item => item.id === moduleId) || kairosState.coreGroups[0];
  title.textContent = group.label;
  view.innerHTML = `
    <article class="card hero-panel full"><div class="card-header"><div><p class="eyebrow">Parent Direction</p><h3>${group.label} System</h3></div><span class="${badgeClass(group.status)}">${group.status}</span></div><p class="metric">${group.metric}</p><p class="muted">${group.summary}</p>${progress(group.metric)}<div class="action-row">${actionButton(`Execute ${group.label}`, `Execute ${group.label}`, `${group.label} execution queued.`)}${actionButton(`Validate ${group.label}`, `Validate ${group.label}`, `${group.label} validation queued.`)}</div></article>
    ${stewardshipCard(group)}
    ${guardrailsCard()}
    <article class="card full"><div class="card-header"><h3>${group.label} Child Nodes</h3><span class="badge">${group.nodes.length}/5</span></div><div class="list">${group.nodes.slice(0, 5).map(node => `<div class="list-item"><div><strong>${node}</strong><p class="muted">Child node under ${group.label}. Expands into specific workflows without adding new top-level panels.</p></div><span class="badge warning">Queued</span></div>`).join("")}</div></article>
    ${nextBatchCard()}
    ${actionLogCard()}
  `;
  bindActions();
}

renderNav();
renderDashboard();