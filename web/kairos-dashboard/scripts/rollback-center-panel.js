import { createRollbackPlan, getRollbackPlans, rollbackMetrics } from "./rollback-center.js";

function badgeClass(status) {
  return status === "Ready" ? "badge good" : "badge warning";
}

function renderRollbackCenterPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-rollback-center-panel]")) return;

  const plans = getRollbackPlans();
  const metrics = rollbackMetrics();
  const latest = plans[0];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.rollbackCenterPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Safety</p><h3>Rollback Center</h3></div>
      <span class="badge good">${metrics.ready}/${metrics.total}</span>
    </div>
    <div class="action-row"><button class="action-button" data-create-rollback>Create Rollback Plan</button></div>
    <div class="list" style="margin-top:16px;">
      ${(latest ? [latest] : [{ title: "No rollback plan", status: "Hold", deploymentStatus: "Pending", verifierStatus: "Pending", baselineStatus: "Pending", createdAt: "Pending", steps: [] }]).map(item => `
        <div class="list-item"><strong>${item.title}</strong><span class="${badgeClass(item.status)}">${item.status}</span></div>
        <div class="list-item"><strong>Deployment</strong><span class="badge">${item.deploymentStatus}</span></div>
        <div class="list-item"><strong>Verifier</strong><span class="badge">${item.verifierStatus}</span></div>
        <div class="list-item"><strong>Baseline</strong><span class="${badgeClass(item.status)}">${item.baselineStatus}</span></div>
        ${item.steps.map(step => `<div class="list-item"><strong>${step}</strong><span class="badge">Step</span></div>`).join("")}
      `).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-create-rollback]").addEventListener("click", () => {
    createRollbackPlan();
    card.remove();
    renderRollbackCenterPanel();
  });
}

const observer = new MutationObserver(() => renderRollbackCenterPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderRollbackCenterPanel();
});
window.addEventListener("kairos:auth", renderRollbackCenterPanel);
