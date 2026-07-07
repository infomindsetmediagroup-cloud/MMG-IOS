import { getProductLaunchPackages, productLaunchMetrics, stageProductLaunch } from "./product-launch-packager.js";

function badgeClass(status) {
  return status === "Staged" ? "badge good" : "badge warning";
}

function renderProductLaunchPackagerPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-product-launch-packager-panel]")) return;

  const items = getProductLaunchPackages();
  const metrics = productLaunchMetrics();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.productLaunchPackagerPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Product Ops</p><h3>Product Launch Packager</h3></div>
      <span class="badge good">${metrics.staged}/${metrics.total} Staged</span>
    </div>
    <div class="list">
      ${items.map(item => `
        <div class="list-item">
          <div><strong>${item.title}</strong><p class="muted">${item.format} • ${item.price} • ${item.requirement}</p></div>
          <div class="action-row" style="margin-top:0;"><span class="${badgeClass(item.status)}">${item.status}</span><button class="action-button" data-stage-product="${item.id}">Stage</button></div>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelectorAll("[data-stage-product]").forEach(button => {
    button.addEventListener("click", () => {
      stageProductLaunch(button.dataset.stageProduct);
      card.remove();
      renderProductLaunchPackagerPanel();
    });
  });
}

const observer = new MutationObserver(() => renderProductLaunchPackagerPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderProductLaunchPackagerPanel();
});
window.addEventListener("kairos:auth", renderProductLaunchPackagerPanel);
