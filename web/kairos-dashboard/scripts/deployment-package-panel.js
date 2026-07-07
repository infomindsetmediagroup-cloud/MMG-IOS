import { createDeploymentPackage, deploymentPackageMetrics, getDeploymentPackages } from "./deployment-package.js";

function badgeClass(status) {
  return status === "Ready" ? "badge good" : "badge warning";
}

function renderDeploymentPackagePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-deployment-package-panel]")) return;

  const packages = getDeploymentPackages();
  const metrics = deploymentPackageMetrics();
  const latest = packages[0];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.deploymentPackagePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Deployment</p><h3>Deployment Package Center</h3></div>
      <span class="badge good">${metrics.ready}/${metrics.total}</span>
    </div>
    <div class="action-row"><button class="action-button" data-create-deployment>Create Package</button></div>
    <div class="list" style="margin-top:16px;">
      ${(packages.length ? packages : [{ title: "No deployment package", status: "Hold", qaScore: 0, createdAt: "Pending" }]).map(item => `
        <div class="list-item">
          <div><strong>${item.title}</strong><p class="muted">QA ${item.qaScore}% • ${item.createdAt}</p></div>
          <span class="${badgeClass(item.status)}">${item.status}</span>
        </div>
      `).join("")}
      ${latest?.nextActions?.length ? latest.nextActions.slice(0, 3).map(item => `<div class="list-item"><div><strong>${item.title}</strong><p class="muted">${item.lane} • ${item.detail}</p></div><span class="badge warning">${item.priority}</span></div>`).join("") : ""}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-create-deployment]").addEventListener("click", () => {
    createDeploymentPackage();
    card.remove();
    renderDeploymentPackagePanel();
  });
}

const observer = new MutationObserver(() => renderDeploymentPackagePanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderDeploymentPackagePanel();
});
window.addEventListener("kairos:auth", renderDeploymentPackagePanel);
