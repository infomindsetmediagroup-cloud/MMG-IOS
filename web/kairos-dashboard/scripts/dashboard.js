import "./customer-portal-panel.js";
import { kairosState } from "./state.js";
import { getActionLog, recordAction } from "./runtime-actions.js";

const nav = document.querySelector("#module-nav");
const view = document.querySelector("#dashboard-view");
const title = document.querySelector("#page-title");
const mode = document.querySelector("#runtime-mode");
const brandDoctrine = kairosState.brandDoctrine || {};
const stewardshipDoctrine = kairosState.stewardshipDoctrine || {};
const modules = Array.isArray(kairosState.modules) ? kairosState.modules : [];
const coreGroups = Array.isArray(kairosState.coreGroups) ? kairosState.coreGroups : [];

if (mode) mode.textContent = kairosState.mode || "Operation";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["active", "ready", "live", "low", "protected", "completed"].includes(normalized)) return "badge good";
  if (["medium", "queued", "build", "open", "seeding", "planned", "standby"].includes(normalized)) return "badge warning";
  if (["critical", "blocked", "failed", "danger"].includes(normalized)) return "badge danger";
  return "badge";
}

function progress(value) {
  const numeric = Math.max(0, Math.min(100, Number(String(value).replace("%", "")) || 0));
  return `<div class="progress-shell"><div class="progress-bar" style="width:${numeric}%"></div></div>`;
}

function actionButton(label, action, detail = "Queued from dashboard") {
  return `<button class="action-button" data-action="${escapeHtml(action)}" data-detail="${escapeHtml(detail)}">${escapeHtml(label)}</button>`;
}

function safeList(items) {
  return Array.isArray(items) ? items : [];
}

function bindActions() {
  if (!view) return;
  view.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      recordAction(button.dataset.action, button.dataset.detail);
      renderModule(document.querySelector(".nav-button.active")?.dataset.module || "command");
    });
  });
}

function renderNav(active = "command") {
  if (!nav) return;
  nav.innerHTML = modules.map(module => `
    <button class="nav-button ${module.id === active ? "active" : ""}" data-module="${escapeHtml(module.id)}"><span class="nav-icon">${escapeHtml(module.icon)}</span>${escapeHtml(module.label)}</button>
  `).join("");
  nav.querySelectorAll("button").forEach(button => button.addEventListener("click", () => renderModule(button.dataset.module)));
}

function actionLogCard() {
  const log = getActionLog();
  const fallback = [{ action: "Awaiting command", detail: "Select a parent system and queue the next operational action.", status: "Standby", createdAt: "Kairos" }];
  return `<article class="card full"><div class="card-header"><h3>Command Log</h3><span class="badge good">${escapeHtml(log.length)}</span></div><div class="list">${(log.length ? log : fallback).slice(0, 5).map(item => `<div class="list-item"><div><strong>${escapeHtml(item.action)}</strong><p class="muted">${escapeHtml(item.detail)} • ${escapeHtml(item.createdAt)}</p></div><span class="${badgeClass(item.status)}">${escapeHtml(item.status)}</span></div>`).join("")}</div></article>`;
}

function brandDoctrineCard() {
  const messageSequence = safeList(brandDoctrine.messageSequence);
  return `<article class="card full" data-priority-card="decision">
    <div class="card-header"><div><p class="eyebrow">Customer Value Doctrine</p><h3>${escapeHtml(brandDoctrine.promise || "Your Knowledge Has Value.")}</h3></div><span class="badge good">Locked</span></div>
    <p class="metric">Discover. Build. Share.</p>
    <p class="muted">${escapeHtml(brandDoctrine.support || "Helping customers discover it, build it, and share it with the world.")}</p>
    <p class="muted">${escapeHtml(brandDoctrine.positioning || "Kairos organizes customer knowledge into practical assets and next actions.")}</p>
    <div class="list core-node-list">${messageSequence.map(step => `<div class="list-item"><strong>${escapeHtml(step)}</strong><span class="badge">Message Layer</span></div>`).join("")}</div>
    <div class="action-row">${actionButton("Queue Brand Work", "Queue Brand Work", "Customer value doctrine queued for website and product surfaces.")}${actionButton("Preserve Doctrine", "Preserve Doctrine", "Brand philosophy preserved as a Kairos operating standard.")}</div>
  </article>`;
}

function valuePathwaysCard() {
  const pathways = safeList(brandDoctrine.valuePathways);
  return `<article class="card full" data-priority-card="ready">
    <div class="card-header"><div><p class="eyebrow">Value Pathways</p><h3>Package knowledge into practical opportunities.</h3></div><span class="badge good">Active</span></div>
    <p class="muted">${escapeHtml(brandDoctrine.customerOutcome || "Help customers turn knowledge, skill, experience, and perspective into durable value.")}</p>
    <div class="list core-node-list">${pathways.map(path => `<div class="list-item"><div><strong>${escapeHtml(path.title)}</strong><p class="muted">${escapeHtml(path.detail)}</p></div><span class="badge good">Path</span></div>`).join("")}</div>
  </article>`;
}

function guardrailsCard() {
  const forbiddenTone = safeList(brandDoctrine.forbiddenTone);
  const approvedTone = safeList(brandDoctrine.approvedTone);
  return `<article class="card full" data-priority-card="protected">
    <div class="card-header"><div><p class="eyebrow">Messaging Guardrails</p><h3>Guidance over hype.</h3></div><span class="badge good">Protected</span></div>
    <div class="list core-node-list">${forbiddenTone.map(rule => `<div class="list-item"><strong>${escapeHtml(rule)}</strong><span class="badge warning">Avoid</span></div>`).join("")}</div>
    <div class="list core-node-list">${approvedTone.map(rule => `<div class="list-item"><strong>${escapeHtml(rule)}</strong><span class="badge good">Use</span></div>`).join("")}</div>
  </article>`;
}

function stewardshipCard() {
  return `<article class="card full" data-priority-card="ready">
    <div class="card-header"><div><p class="eyebrow">Guidance Layer</p><h3>Knowledge Stewardship</h3></div><span class="badge good">Active</span></div>
    <p class="muted">${escapeHtml(stewardshipDoctrine.role || "Kairos preserves context, organizes work, and recommends the next disciplined action.")}</p>
    <div class="list core-node-list">
      <div class="list-item"><div><strong>Preserve Context</strong><p class="muted">${escapeHtml(stewardshipDoctrine.assetModel || "Ideas and customer knowledge should become reusable assets.")}</p></div><span class="badge good">Core</span></div>
      <div class="list-item"><div><strong>Recommend Next Action</strong><p class="muted">${escapeHtml(stewardshipDoctrine.customerGuidanceRule || "Guide the customer toward one clear next step.")}</p></div><span class="badge warning">Runtime</span></div>
      <div class="list-item"><div><strong>Compound Assets</strong><p class="muted">${escapeHtml(stewardshipDoctrine.operatingRule || "Preserve, refine, and compound useful work over time.")}</p></div><span class="badge good">Doctrine</span></div>
    </div>
  </article>`;
}

function groupCard(group = {}) {
  const nodes = safeList(group.nodes);
  return `<article class="card core-card" data-core-group="${escapeHtml(group.id)}">
    <div class="card-header"><div><p class="eyebrow">${escapeHtml(group.label || "Kairos")}</p><h3>${escapeHtml(group.label || "Kairos")} System</h3></div><span class="${badgeClass(group.status)}">${escapeHtml(group.status || "Queued")}</span></div>
    <p class="metric">${escapeHtml(group.metric || "0%")}</p>
    <p class="muted">${escapeHtml(group.summary || "System details are queued for configuration.")}</p>
    ${progress(group.metric)}
    <div class="list core-node-list">${nodes.slice(0, 5).map(node => `<div class="list-item"><strong>${escapeHtml(node)}</strong><span class="badge">Node</span></div>`).join("")}</div>
    <div class="action-row">${actionButton("Open", `Open ${group.label || "Kairos"}`, `${group.label || "Kairos"} parent group opened.`)}${actionButton("Queue Work", `Queue ${group.label || "Kairos"} Work`, `${group.label || "Kairos"} work item queued.`)}</div>
  </article>`;
}

function renderDashboard() {
  if (!view) return;
  if (title) title.textContent = "Dashboard";
  view.innerHTML = `
    <article class="card hero-panel full"><div class="card-header"><div><p class="eyebrow">Good evening, ${escapeHtml(kairosState.operator || "Mike")}</p><h3>${escapeHtml(kairosState.activeBatch || "Kairos Runtime")}</h3></div><span class="badge good">Five-Direction OS</span></div><p class="metric">${escapeHtml(kairosState.health || 0)}%</p><p class="muted">Kairos is consolidated into five parent operating directions and now carries the MMG customer value doctrine into the runtime: ${escapeHtml(brandDoctrine.promise || "Your Knowledge Has Value.")}</p><div class="action-row">${actionButton("Start Daily Ops", "Start Daily Ops", "Daily operations run queued.")}${actionButton("Run Priority Chain", "Run Priority Chain", "Priority chain workflow queued.")}</div></article>
    ${brandDoctrineCard()}
    ${valuePathwaysCard()}
    ${coreGroups.map(groupCard).join("")}
    ${actionLogCard()}
  `;
  bindActions();
}

function renderModule(moduleId) {
  if (!view) return;
  renderNav(moduleId);
  const group = coreGroups.find(item => item.id === moduleId) || coreGroups[0] || {};
  const nodes = safeList(group.nodes);
  if (title) title.textContent = group.label || "Kairos";
  view.innerHTML = `
    <article class="card hero-panel full"><div class="card-header"><div><p class="eyebrow">Parent Direction</p><h3>${escapeHtml(group.label || "Kairos")} System</h3></div><span class="${badgeClass(group.status)}">${escapeHtml(group.status || "Queued")}</span></div><p class="metric">${escapeHtml(group.metric || "0%")}</p><p class="muted">${escapeHtml(group.summary || "System details are queued for configuration.")}</p>${progress(group.metric)}<div class="action-row">${actionButton(`Execute ${group.label || "Kairos"}`, `Execute ${group.label || "Kairos"}`, `${group.label || "Kairos"} execution queued.`)}${actionButton(`Validate ${group.label || "Kairos"}`, `Validate ${group.label || "Kairos"}`, `${group.label || "Kairos"} validation queued.`)}</div></article>
    ${stewardshipCard()}
    ${guardrailsCard()}
    <article class="card full"><div class="card-header"><h3>${escapeHtml(group.label || "Kairos")} Child Nodes</h3><span class="badge">${escapeHtml(nodes.length)}/5</span></div><div class="list">${nodes.slice(0, 5).map(node => `<div class="list-item"><div><strong>${escapeHtml(node)}</strong><p class="muted">Child node under ${escapeHtml(group.label || "Kairos")}. Expands into specific workflows without adding new top-level panels.</p></div><span class="badge warning">Queued</span></div>`).join("")}</div></article>
    ${actionLogCard()}
  `;
  bindActions();
}

function bootDashboard() {
  if (!view) return;
  renderNav();
  renderDashboard();
}

bootDashboard();
