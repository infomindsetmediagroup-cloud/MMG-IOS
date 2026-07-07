import { applyPanelLayoutControls, getHiddenPanels } from "./panel-layout.js";

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
      <span class="badge warning">${count} Minimized</span>
    </div>
    <p class="muted">Use panel controls to reduce page length while keeping modules available.</p>
  `;
  view.prepend(card);
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
