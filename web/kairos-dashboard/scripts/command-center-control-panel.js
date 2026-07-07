import { getApprovalQueue, approvalMetrics, decideApproval } from "./approval-workflow.js";
import { getDashboardAnalytics, dashboardHealthScore } from "./dashboard-analytics.js";
import { getDependencyGraph, dependencyMetrics } from "./task-dependency-graph.js";
import { createExecutionRun, getExecutionRuns, orchestratorMetrics } from "./execution-orchestrator.js";
import { getExecutionHistory, recordExecutionHistory } from "./execution-history.js";
import { getOperatorDashboardSnapshot, operatorPriorities } from "./operator-dashboard.js";

function badgeClass(status) {
  const value = String(status || "").toLowerCase();
  if (["approved", "clear", "ready", "complete", "success"].includes(value)) return "badge good";
  if (["pending approval", "review", "active", "planned", "fix"].includes(value)) return "badge warning";
  if (["blocked", "needs changes", "failed"].includes(value)) return "badge danger";
  return "badge";
}

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character]));
}

function renderCommandCenterControlPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-command-center-control-panel]")) return;

  const analytics = getDashboardAnalytics();
  const health = dashboardHealthScore();
  const approvals = getApprovalQueue().slice(0, 4);
  const approvalStats = approvalMetrics();
  const graph = getDependencyGraph();
  const graphStats = dependencyMetrics();
  const runs = getExecutionRuns().slice(0, 3);
  const runStats = orchestratorMetrics();
  const history = getExecutionHistory().slice(0, 4);
  const operator = getOperatorDashboardSnapshot();
  const priorities = operatorPriorities();

  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.commandCenterControlPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Command Center</p><h3>Execution Intelligence Layer</h3></div>
      <span class="badge good">${health}% Health</span>
    </div>
    <section class="kpi-grid" style="margin-top:16px;">
      <article class="card kpi-card"><div class="card-header"><h3>Pressure</h3><span class="badge warning">Live</span></div><p class="metric">${analytics.pressure}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Throughput</h3><span class="badge good">Done</span></div><p class="metric">${analytics.throughput}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Approvals</h3><span class="badge warning">Open</span></div><p class="metric">${approvalStats.pending}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Blocked</h3><span class="badge danger">Deps</span></div><p class="metric">${graphStats.missing + runStats.blockedItems}</p></article>
    </section>
    <div class="action-row">
      <button class="action-button" type="button" data-create-execution-run>Create Execution Run</button>
      <button class="action-button" type="button" data-record-operator-check>Record Operator Check</button>
    </div>
    <div class="command-center-grid">
      <section class="command-center-mini">
        <div class="card-header"><h3>Operator Priorities</h3><span class="badge">${operator.health}%</span></div>
        <div class="list">${priorities.map(item => `<div class="list-item"><div><strong>${escapeHTML(item.label)}</strong><p class="muted">Current value: ${escapeHTML(item.value)}</p></div><span class="${badgeClass(item.status)}">${escapeHTML(item.status)}</span></div>`).join("")}</div>
      </section>
      <section class="command-center-mini">
        <div class="card-header"><h3>Approvals</h3><span class="badge warning">${approvalStats.pending}</span></div>
        <div class="list">${(approvals.length ? approvals : [{ id: "APP-000", title: "No approval items", status: "Clear", decision: "Clear" }]).map(item => `<div class="list-item"><div><strong>${escapeHTML(item.title)}</strong><p class="muted">${escapeHTML(item.id)} • ${escapeHTML(item.workId || "No work item")}</p></div><div class="action-row" style="margin-top:0;"><span class="${badgeClass(item.status)}">${escapeHTML(item.status)}</span>${item.status === "Pending Approval" ? `<button class="action-button" data-approval-id="${escapeHTML(item.id)}" data-approval-decision="Approved">Approve</button><button class="action-button" data-approval-id="${escapeHTML(item.id)}" data-approval-decision="Needs Changes">Changes</button>` : ""}</div></div>`).join("")}</div>
      </section>
      <section class="command-center-mini">
        <div class="card-header"><h3>Dependency Graph</h3><span class="badge">${graph.edges.length}</span></div>
        <div class="list">${(graph.edges.length ? graph.edges : [{ from: "None", to: "No dependencies", valid: true }]).slice(0, 5).map(edge => `<div class="list-item"><div><strong>${escapeHTML(edge.from)} → ${escapeHTML(edge.to)}</strong><p class="muted">Dependency link</p></div><span class="${edge.valid ? "badge good" : "badge danger"}">${edge.valid ? "Valid" : "Missing"}</span></div>`).join("")}</div>
      </section>
      <section class="command-center-mini">
        <div class="card-header"><h3>Execution Runs</h3><span class="badge warning">${runs.length}</span></div>
        <div class="list">${(runs.length ? runs : [{ id: "RUN-000", label: "No execution run", status: "Standby", items: [] }]).map(run => `<div class="list-item"><div><strong>${escapeHTML(run.id)} • ${escapeHTML(run.label)}</strong><p class="muted">${escapeHTML(run.items?.length || 0)} items • ${escapeHTML(run.createdAt || "Pending")}</p></div><span class="${badgeClass(run.status)}">${escapeHTML(run.status)}</span></div>`).join("")}</div>
      </section>
      <section class="command-center-mini full-mini">
        <div class="card-header"><h3>Execution History</h3><span class="badge">${history.length}</span></div>
        <div class="list">${(history.length ? history : [{ action: "No history yet", detail: "Create a run or record an operator check.", status: "Standby", createdAt: "Pending" }]).map(item => `<div class="list-item"><div><strong>${escapeHTML(item.action)}</strong><p class="muted">${escapeHTML(item.detail)} • ${escapeHTML(item.createdAt)}</p></div><span class="${badgeClass(item.status)}">${escapeHTML(item.status)}</span></div>`).join("")}</div>
      </section>
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-create-execution-run]").addEventListener("click", () => {
    const run = createExecutionRun("Command Center dashboard run");
    recordExecutionHistory("Execution run created", run.id, "Planned");
    refreshCommandCenterControlPanel();
  });
  card.querySelector("[data-record-operator-check]").addEventListener("click", () => {
    recordExecutionHistory("Operator check", "Command Center reviewed by operator.", "Logged");
    refreshCommandCenterControlPanel();
  });
  card.querySelectorAll("[data-approval-id]").forEach(button => {
    button.addEventListener("click", () => {
      decideApproval(button.dataset.approvalId, button.dataset.approvalDecision);
      recordExecutionHistory("Approval decision", button.dataset.approvalId + " " + button.dataset.approvalDecision, button.dataset.approvalDecision);
      refreshCommandCenterControlPanel();
    });
  });
}

function refreshCommandCenterControlPanel() {
  document.querySelector("[data-command-center-control-panel]")?.remove();
  renderCommandCenterControlPanel();
}

const observer = new MutationObserver(() => renderCommandCenterControlPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderCommandCenterControlPanel();
});
window.addEventListener("kairos:auth", renderCommandCenterControlPanel);
window.addEventListener("kairos:work-queue-updated", refreshCommandCenterControlPanel);
window.addEventListener("kairos:approvals-updated", refreshCommandCenterControlPanel);
window.addEventListener("kairos:orchestrator-updated", refreshCommandCenterControlPanel);
window.addEventListener("kairos:execution-history-updated", refreshCommandCenterControlPanel);
