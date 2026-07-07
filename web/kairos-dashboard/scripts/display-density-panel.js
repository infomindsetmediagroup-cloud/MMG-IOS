import { getDisplayDensity, getDisplayDensityOptions, initializeDisplayDensity, setDisplayDensity } from "./display-density.js";

function renderDisplayDensityPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-display-density-panel]")) return;

  const current = getDisplayDensity();
  const options = getDisplayDensityOptions();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.displayDensityPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Display</p>
        <h3>Density Control</h3>
      </div>
      <span class="badge good">${current}</span>
    </div>
    <div class="list">
      ${options.map(option => `
        <div class="list-item">
          <div>
            <strong>${option.label}</strong>
            <p class="muted">${option.detail}</p>
          </div>
          <button class="action-button" data-density="${option.id}">${option.id === current ? "Active" : "Set"}</button>
        </div>
      `).join("")}
    </div>
  `;
  view.appendChild(card);

  card.querySelectorAll("[data-density]").forEach(button => {
    button.addEventListener("click", () => {
      setDisplayDensity(button.dataset.density);
      card.remove();
      renderDisplayDensityPanel();
    });
  });
}

const observer = new MutationObserver(() => renderDisplayDensityPanel());
window.addEventListener("DOMContentLoaded", () => {
  initializeDisplayDensity();
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderDisplayDensityPanel();
});

window.addEventListener("kairos:auth", renderDisplayDensityPanel);
