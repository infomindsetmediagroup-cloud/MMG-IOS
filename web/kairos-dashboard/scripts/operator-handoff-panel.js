import { createOperatorHandoff, getOperatorHandoffs, operatorHandoffMetrics } from "./operator-handoff.js";

function badgeClass(status) {
  return status === "Ready" ? "badge good" : "badge warning";
}

function renderOperatorHandoffPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-operator-handoff-panel]")) return;

  const handoffs = getOperatorHandoffs();
  const metrics = operatorHandoffMetrics();
  const latest = handoffs[0];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.operatorHandoffPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Handoff</p><h3>Operator Handoff Package</h3></div>
      <span class="badge good">${metrics.ready}/${metrics.total}</span>
    </div>
    <div class="action-row"><button class="action-button" data-create-handoff>Create Handoff</button></div>
    <div class="list" style="margin-top:16px;">
      ${(latest ? [latest] : [{ title: "No handoff package", status: "Review", deploymentStatus: "Pending", verifierStatus: "Pending", rollbackStatus: "Pending", nextActions: [] }]).map(item => `
        <div class="list-item"><strong>${item.title}</strong><span class="${badgeClass(item.status)}">${item.status}</span></div>
        <div class="list-item"><strong>Deployment</strong><span class="badge">${item.deploymentStatus}</span></div>
        <div class="list-item"><strong>Verifier</strong><span class="badge">${item.verifierStatus}</span></div>
        <div class="list-item"><strong>Rollback</strong><span class="badge">${item.rollbackStatus}</span></div>
        ${item.nextActions.map(action => `<div class="list-item"><div><strong>${action.title}</strong><p class="muted">${action.lane} • ${action.detail}</p></div><span class="badge warning">${action.priority}</span></div>`).join("")}
      `).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-create-handoff]").addEventListener("click", () => {
    createOperatorHandoff();
    card.remove();
    renderOperatorHandoffPanel();
  });
}

const observer = new MutationObserver(() => renderOperatorHandoffPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderOperatorHandoffPanel();
});
window.addEventListener("kairos:auth", renderOperatorHandoffPanel);
