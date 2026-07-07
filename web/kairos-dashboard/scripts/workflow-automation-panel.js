import { automationMetrics, getAutomationRules, getAutomationRuns, runWorkflowAutomation, toggleAutomationRule } from "./workflow-automation-engine.js";

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character]));
}

function rowForRule(rule) {
  const status = rule.enabled ? "Enabled" : "Off";
  const badge = rule.enabled ? "badge good" : "badge";
  return `<div class="list-item"><div><strong>${escapeHTML(rule.id)} - ${escapeHTML(rule.name)}</strong><p class="muted">${escapeHTML(rule.type)}</p></div><div class="action-row" style="margin-top:0;"><span class="${badge}">${status}</span><button class="action-button" type="button" data-toggle-rule="${escapeHTML(rule.id)}">Toggle</button></div></div>`;
}

function rowForRun(run) {
  const badge = run.status === "Executed" ? "badge good" : "badge";
  return `<div class="list-item"><div><strong>${escapeHTML(run.id)}</strong><p class="muted">${escapeHTML(run.createdAt)} - ${escapeHTML(run.events?.length || 0)} events</p></div><span class="${badge}">${escapeHTML(run.status)}</span></div>`;
}

function renderWorkflowAutomationPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-workflow-automation-panel]")) return;

  const metrics = automationMetrics();
  const rules = getAutomationRules();
  const runs = getAutomationRuns();
  const rows = runs.length ? runs : [{ id: "AUTO-RUN-000", createdAt: "Pending", status: "Standby", events: [] }];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.workflowAutomationPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Automation</p><h3>Workflow Automation Engine</h3></div>
      <span class="badge good">${metrics.enabled} Enabled</span>
    </div>
    <section class="kpi-grid" style="margin-top:16px;">
      <article class="card kpi-card"><div class="card-header"><h3>Rules</h3><span class="badge">Total</span></div><p class="metric">${metrics.rules}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Enabled</h3><span class="badge good">On</span></div><p class="metric">${metrics.enabled}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Runs</h3><span class="badge warning">Auto</span></div><p class="metric">${metrics.runs}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Events</h3><span class="badge">Latest</span></div><p class="metric">${metrics.latestEvents}</p></article>
    </section>
    <div class="action-row"><button class="action-button" type="button" data-run-automation>Run Automation</button></div>
    <div class="workflow-automation-grid">
      <section class="workflow-automation-mini"><div class="card-header"><h3>Rules</h3><span class="badge">${rules.length}</span></div><div class="list">${rules.map(rowForRule).join("")}</div></section>
      <section class="workflow-automation-mini"><div class="card-header"><h3>Recent Runs</h3><span class="badge warning">${runs.length}</span></div><div class="list">${rows.slice(0, 6).map(rowForRun).join("")}</div></section>
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-run-automation]").addEventListener("click", () => {
    runWorkflowAutomation();
    refreshWorkflowAutomationPanel();
  });

  card.querySelectorAll("[data-toggle-rule]").forEach(button => {
    button.addEventListener("click", () => {
      toggleAutomationRule(button.dataset.toggleRule);
      refreshWorkflowAutomationPanel();
    });
  });
}

function refreshWorkflowAutomationPanel() {
  const existing = document.querySelector("[data-workflow-automation-panel]");
  if (existing) existing.remove();
  renderWorkflowAutomationPanel();
}

const observer = new MutationObserver(() => renderWorkflowAutomationPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderWorkflowAutomationPanel();
});
window.addEventListener("kairos:auth", renderWorkflowAutomationPanel);
window.addEventListener("kairos:workflow-automation-updated", refreshWorkflowAutomationPanel);
window.addEventListener("kairos:work-queue-updated", refreshWorkflowAutomationPanel);
