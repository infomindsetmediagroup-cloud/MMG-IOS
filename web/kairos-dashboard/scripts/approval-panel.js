import { getApprovals, seedApprovalQueue, setApprovalStatus } from "./approval-center.js";

function badgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return "badge good";
  if (normalized === "rejected") return "badge danger";
  return "badge warning";
}

function renderApprovalPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view) return;

  view.querySelector("[data-approval-panel]")?.remove();
  seedApprovalQueue();
  const approvals = getApprovals();
  const pending = approvals.filter(item => item.status === "Pending").length;
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.approvalPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Approval Center</p>
        <h3>Human Approval Queue</h3>
      </div>
      <span class="badge warning">${pending} Pending</span>
    </div>
    <div class="list">
      ${approvals.map(item => `
        <div class="list-item">
          <div>
            <strong>${item.title}</strong>
            <p class="muted">${item.source} • ${item.updatedAt || item.createdAt}${item.relatedWorkId ? " • Linked execution item" : ""}</p>
          </div>
          <div class="action-row compact">
            <span class="${badgeClass(item.status)}">${item.status}</span>
            <button class="action-button small" data-approve="${item.id}">Approve</button>
            <button class="action-button small" data-reject="${item.id}">Reject</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelectorAll("[data-approve]").forEach(button => {
    button.addEventListener("click", () => {
      setApprovalStatus(button.dataset.approve, "Approved");
      renderApprovalPanel();
    });
  });

  card.querySelectorAll("[data-reject]").forEach(button => {
    button.addEventListener("click", () => {
      setApprovalStatus(button.dataset.reject, "Rejected");
      renderApprovalPanel();
    });
  });
}

const observer = new MutationObserver(() => {
  const view = document.querySelector("#dashboard-view");
  if (view && !view.querySelector("[data-approval-panel]")) renderApprovalPanel();
});

window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderApprovalPanel();
});

window.addEventListener("kairos:auth", renderApprovalPanel);
window.addEventListener("kairos:rendered", renderApprovalPanel);
