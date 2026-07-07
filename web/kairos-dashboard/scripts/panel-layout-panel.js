import { applyPanelLayoutControls, collapseAllPanels, expandAllPanels, getHiddenPanels } from "./panel-layout.js";

function renderPanelLayoutPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-panel-layout-panel]")) return;

  const count = getHiddenPanels().length;
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.panelLayoutPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Layout</p>
        <h3>Panel Layout Controls</h3>
      </div>
      <span class="badge warning">${count} Collapsed</span>
    </div>
    <p class="muted">Collapse departments to keep the dashboard short. Jumping to a collapsed section automatically expands the destination.</p>
    <div class="action-row" style="margin-top:16px;">
      <button class="action-button" data-collapse-all-panels>Collapse All</button>
      <button class="action-button" data-expand-all-panels>Expand All</button>
    </div>
  `;
  view.prepend(card);
  applyPanelLayoutControls();

  card.querySelector("[data-collapse-all-panels]").addEventListener("click", () => {
    collapseAllPanels();
    card.remove();
    renderPanelLayoutPanel();
  });

  card.querySelector("[data-expand-all-panels]").addEventListener("click", () => {
    expandAllPanels();
    card.remove();
    renderPanelLayoutPanel();
  });
}

function refreshPanelLayoutPanel() {
  const existing = document.querySelector("[data-panel-layout-panel]");
  if (existing) existing.remove();
  renderPanelLayoutPanel();
  applyPanelLayoutControls();
}

const observer = new MutationObserver(() => {
  renderPanelLayoutPanel();
  applyPanelLayoutControls();
});

window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderPanelLayoutPanel();
  applyPanelLayoutControls();
});

window.addEventListener("kairos:auth", () => {
  renderPanelLayoutPanel();
  applyPanelLayoutControls();
});

window.addEventListener("kairos:panel-layout-updated", refreshPanelLayoutPanel);
