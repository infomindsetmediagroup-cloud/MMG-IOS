import { kairosState } from "./state.js";
import { getActionLog, recordAction } from "./runtime-actions.js";

const nav = document.querySelector("#module-nav");
const view = document.querySelector("#dashboard-view");
const title = document.querySelector("#page-title");
const mode = document.querySelector("#runtime-mode");

mode.textContent = kairosState.mode;

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["active", "ready", "live", "low", "protected", "completed"].includes(normalized)) return "badge good";
  if (["medium", "queued", "build", "open", "seeding", "planned"].includes(normalized)) return "badge warning";
  if (["critical", "blocked", "failed", "danger"].includes(normalized)) return "badge danger";
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
    <article class="card hero-panel full"><div class="card-header"><div><p class="eyebrow">Good evening, ${kairosState.operator}</p><h3>${kairosState.activeBatch}</h3></div><span class="badge good">Five-Direction OS</span></div><p class="metric">${kairosState.health}%</p><p class="muted">Kairos is consolidated into five parent operating directions. Each parent contains no more than five child nodes.</p><div class="action-row">${actionButton("Start Daily Ops", "Start Daily Ops", "Daily operations run queued.")}${actionButton("Run Priority Chain", "Run Priority Chain", "Priority chain workflow queued.")}</div></article>
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
    <article class="card full"><div class="card-header"><h3>${group.label} Child Nodes</h3><span class="badge">${group.nodes.length}/5</span></div><div class="list">${group.nodes.slice(0, 5).map(node => `<div class="list-item"><div><strong>${node}</strong><p class="muted">Child node under ${group.label}. Expands into specific workflows without adding new top-level panels.</p></div><span class="badge warning">Queued</span></div>`).join("")}</div></article>
    ${actionLogCard()}
  `;
  bindActions();
}

renderNav();
renderDashboard();
