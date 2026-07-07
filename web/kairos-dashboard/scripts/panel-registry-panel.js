import { getPanelRegistry, panelRegistryMetrics } from "./panel-registry.js";

function renderPanelRegistryPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-panel-registry]")) return;

  const panels = getPanelRegistry();
  const metrics = panelRegistryMetrics();
  const groups = [...new Set(panels.map(panel => panel.group))];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.panelRegistry = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Registry</p>
        <h3>Dashboard Panel Registry</h3>
      </div>
      <span class="badge good">${metrics.active}/${metrics.total} Active</span>
    </div>
    <div class="list">
      ${groups.map(group => {
        const count = panels.filter(panel => panel.group === group).length;
        return `<div class="list-item"><strong>${group}</strong><span class="badge">${count}</span></div>`;
      }).join("")}
    </div>
  `;
  view.appendChild(card);
}

const observer = new MutationObserver(() => renderPanelRegistryPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderPanelRegistryPanel();
});

window.addEventListener("kairos:auth", renderPanelRegistryPanel);
