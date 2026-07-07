import { buildAgentDispatchPlan, getAgentDispatches, runAgentScheduler, schedulerMetrics } from "./agent-scheduler.js";

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character]));
}

function statusBadge(status) {
  return status === "Ready" ? "badge good" : status === "Waiting" ? "badge warning" : "badge";
}

function renderAgentSchedulerPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-agent-scheduler-panel]")) return;

  const metrics = schedulerMetrics();
  const plan = buildAgentDispatchPlan();
  const dispatches = getAgentDispatches();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.agentSchedulerPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Dispatch</p><h3>Agent Scheduler</h3></div>
      <span class="badge good">${metrics.ready} Ready</span>
    </div>
    <section class="kpi-grid" style="margin-top:16px;">
      <article class="card kpi-card"><div class="card-header"><h3>Dispatches</h3><span class="badge">Runs</span></div><p class="metric">${metrics.dispatches}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Latest</h3><span class="badge">Plan</span></div><p class="metric">${metrics.latest}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Ready</h3><span class="badge good">Go</span></div><p class="metric">${metrics.ready}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Waiting</h3><span class="badge warning">Deps</span></div><p class="metric">${metrics.waiting}</p></article>
    </section>
    <div class="action-row">
      <button class="action-button" type="button" data-run-agent-scheduler>Run Scheduler</button>
    </div>
    <div class="agent-scheduler-grid">
      <section class="agent-scheduler-mini">
        <div class="card-header"><h3>Current Dispatch Plan</h3><span class="badge">${plan.length}</span></div>
        <div class="list">${plan.map(item => `<div class="list-item"><div><strong>${escapeHTML(item.sequence)}. ${escapeHTML(item.workId)} • ${escapeHTML(item.title)}</strong><p class="muted">${escapeHTML(item.agentName)} • ${escapeHTML(item.lane)} • Score ${escapeHTML(item.score)}</p></div><span class="${statusBadge(item.status)}">${escapeHTML(item.status)}</span></div>`).join("")}</div>
      </section>
      <section class="agent-scheduler-mini">
        <div class="card-header"><h3>Recent Dispatches</h3><span class="badge warning">${dispatches.length}</span></div>
        <div class="list">${(dispatches.length ? dispatches : [{ id: "SCHED-000", runId: "None", createdAt: "Pending", plan: [] }]).slice(0, 6).map(item => `<div class="list-item"><div><strong>${escapeHTML(item.id)} • ${escapeHTML(item.runId)}</strong><p class="muted">${escapeHTML(item.createdAt)} • ${escapeHTML(item.plan?.length || 0)} planned</p></div><span class="badge">Saved</span></div>`).join("")}</div>
      </section>
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-run-agent-scheduler]").addEventListener("click", () => {
    runAgentScheduler();
    refreshAgentSchedulerPanel();
  });
}

function refreshAgentSchedulerPanel() {
  document.querySelector("[data-agent-scheduler-panel]")?.remove();
  renderAgentSchedulerPanel();
}

const observer = new MutationObserver(() => renderAgentSchedulerPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderAgentSchedulerPanel();
});
window.addEventListener("kairos:auth", renderAgentSchedulerPanel);
window.addEventListener("kairos:agent-scheduler-updated", refreshAgentSchedulerPanel);
window.addEventListener("kairos:work-queue-updated", refreshAgentSchedulerPanel);
window.addEventListener("kairos:dependency-graph-updated", refreshAgentSchedulerPanel);
