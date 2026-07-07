import { getResetScope, resetRuntimeState } from "./system-reset.js";

function badgeClass(status) {
  return status === "Stored" ? "badge warning" : "badge good";
}

function renderSystemResetPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-system-reset-panel]")) return;

  const scope = getResetScope();
  const stored = scope.filter(item => item.status === "Stored").length;
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.systemResetPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Maintenance</p>
        <h3>Runtime Reset Control</h3>
      </div>
      <span class="badge warning">${stored} Stored</span>
    </div>
    <p class="muted">Clears local browser runtime data only. Repository files and GitHub Pages deployment remain unchanged.</p>
    <div class="action-row">
      <button class="action-button" data-reset-runtime>Reset Local Runtime</button>
    </div>
    <div class="list" style="margin-top:16px;">
      ${scope.map(item => `
        <div class="list-item">
          <strong>${item.title}</strong>
          <span class="${badgeClass(item.status)}">${item.status}</span>
        </div>
      `).join("")}
    </div>
  `;
  view.appendChild(card);

  card.querySelector("[data-reset-runtime]").addEventListener("click", () => {
    resetRuntimeState();
    card.remove();
    renderSystemResetPanel();
  });
}

const observer = new MutationObserver(() => renderSystemResetPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderSystemResetPanel();
});

window.addEventListener("kairos:auth", renderSystemResetPanel);
