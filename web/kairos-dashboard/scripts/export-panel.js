import { buildExportPayload, downloadRuntimeExport } from "./export-center.js";
import { pushNotification } from "./notifications.js";

function renderExportPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-export-panel]")) return;

  const payload = buildExportPayload();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.exportPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Export</p>
        <h3>Runtime Export Center</h3>
      </div>
      <span class="badge good">JSON</span>
    </div>
    <div class="list">
      <div class="list-item"><strong>Actions</strong><span class="badge">${payload.actions.length}</span></div>
      <div class="list-item"><strong>Notifications</strong><span class="badge">${payload.notifications.length}</span></div>
      <div class="list-item"><strong>Tasks</strong><span class="badge warning">${payload.tasks.length}</span></div>
      <div class="list-item"><strong>Approvals</strong><span class="badge warning">${payload.approvals.length}</span></div>
      <div class="list-item"><strong>Snapshots</strong><span class="badge">${(payload.runtime.snapshots || []).length}</span></div>
    </div>
    <div class="action-row">
      <button class="action-button" data-export-runtime>Download Runtime Export</button>
    </div>
  `;
  view.appendChild(card);

  card.querySelector("[data-export-runtime]").addEventListener("click", () => {
    downloadRuntimeExport();
    pushNotification("Runtime export downloaded", "Kairos browser runtime exported as JSON.", "Success");
    card.remove();
    renderExportPanel();
  });
}

const observer = new MutationObserver(() => renderExportPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderExportPanel();
});

window.addEventListener("kairos:auth", renderExportPanel);
