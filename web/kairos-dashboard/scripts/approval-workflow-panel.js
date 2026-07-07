import { approvalMetrics, decideApproval, getApprovalPolicy, getApprovalQueue, resetApprovalDecision, updateApprovalPolicy } from "./approval-workflow.js";

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character]));
}

function badgeClass(value) {
  const text = String(value || "").toLowerCase();
  if (text === "approved" || text === "clear") return "badge good";
  if (text === "pending approval" || text === "high") return "badge warning";
  if (text === "needs changes") return "badge danger";
  return "badge";
}

function renderApprovalWorkflowPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-approval-workflow-panel]")) return;

  const approvals = getApprovalQueue();
  const metrics = approvalMetrics();
  const policy = getApprovalPolicy();
  const rows = approvals.length ? approvals : [{ id: "APP-000", workId: "None", title: "No approval items", lane: "Command Center", priority: "Normal", gate: "Standby", status: "Clear", approver: policy.approver, notes: "Advance work items to approval when ready." }];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.approvalWorkflowPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Approval</p><h3>Approval Workflow</h3></div>
      <span class="badge warning">${metrics.pending} Pending</span>
    </div>
    <section class="kpi-grid" style="margin-top:16px;">
      <article class="card kpi-card"><div class="card-header"><h3>Total</h3><span class="badge">Queue</span></div><p class="metric">${metrics.total}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Pending</h3><span class="badge warning">Gate</span></div><p class="metric">${metrics.pending}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Approved</h3><span class="badge good">Go</span></div><p class="metric">${metrics.approved}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Changes</h3><span class="badge danger">Fix</span></div><p class="metric">${metrics.changes}</p></article>
    </section>
    <section class="approval-policy-card">
      <div class="card-header"><h3>Approval Policy</h3><span class="badge">${escapeHTML(policy.approver)}</span></div>
      <form class="approval-policy-form" data-approval-policy-form>
        <label>Approver<input data-approval-approver value="${escapeHTML(policy.approver)}"></label>
        <label>Window<input data-approval-window value="${escapeHTML(policy.approvalWindow)}"></label>
        <button class="action-button" type="submit">Save Policy</button>
      </form>
      <p class="muted">High-impact work and items ready for approval route into this operator gate.</p>
    </section>
    <div class="list" style="margin-top:16px;">
      ${rows.map(item => `
        <div class="list-item approval-workflow-item">
          <div>
            <strong>${escapeHTML(item.id)} • ${escapeHTML(item.title)}</strong>
            <p class="muted">${escapeHTML(item.workId)} • ${escapeHTML(item.lane)} • ${escapeHTML(item.gate)} • Approver: ${escapeHTML(item.approver)}</p>
            <p class="muted">${escapeHTML(item.notes)}</p>
          </div>
          <div class="action-row" style="margin-top:0;">
            <span class="${badgeClass(item.priority)}">${escapeHTML(item.priority)}</span>
            <span class="${badgeClass(item.status)}">${escapeHTML(item.status)}</span>
            ${item.workId !== "None" ? `<button class="action-button" type="button" data-approval-id="${escapeHTML(item.id)}" data-decision="Approved">Approve</button><button class="action-button" type="button" data-approval-id="${escapeHTML(item.id)}" data-decision="Needs Changes">Changes</button><button class="action-button" type="button" data-reset-approval="${escapeHTML(item.id)}">Reset</button>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-approval-policy-form]").addEventListener("submit", event => {
    event.preventDefault();
    updateApprovalPolicy({
      approver: card.querySelector("[data-approval-approver]").value.trim() || "Mike",
      approvalWindow: card.querySelector("[data-approval-window]").value.trim() || "Operator-controlled"
    });
    refreshApprovalWorkflowPanel();
  });

  card.querySelectorAll("[data-approval-id]").forEach(button => {
    button.addEventListener("click", () => {
      decideApproval(button.dataset.approvalId, button.dataset.decision);
      refreshApprovalWorkflowPanel();
    });
  });

  card.querySelectorAll("[data-reset-approval]").forEach(button => {
    button.addEventListener("click", () => {
      resetApprovalDecision(button.dataset.resetApproval);
      refreshApprovalWorkflowPanel();
    });
  });
}

function refreshApprovalWorkflowPanel() {
  document.querySelector("[data-approval-workflow-panel]")?.remove();
  renderApprovalWorkflowPanel();
}

const observer = new MutationObserver(() => renderApprovalWorkflowPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderApprovalWorkflowPanel();
});
window.addEventListener("kairos:auth", renderApprovalWorkflowPanel);
window.addEventListener("kairos:approvals-updated", refreshApprovalWorkflowPanel);
window.addEventListener("kairos:approval-policy-updated", refreshApprovalWorkflowPanel);
window.addEventListener("kairos:work-queue-updated", refreshApprovalWorkflowPanel);
