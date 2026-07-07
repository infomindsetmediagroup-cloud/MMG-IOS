import { importRuntimePayload, readImportFile } from "./import-center.js";
import { pushNotification } from "./notifications.js";

function renderImportPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-import-panel]")) return;

  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.importPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Import</p>
        <h3>Runtime Restore Center</h3>
      </div>
      <span class="badge warning">JSON</span>
    </div>
    <p class="muted">Restore a Kairos runtime export into this browser session.</p>
    <form class="auth-form" data-import-form style="margin-top:16px;">
      <input type="file" accept="application/json,.json" data-import-file>
      <button class="action-button" type="submit">Import Runtime</button>
    </form>
    <div class="list" data-import-results style="margin-top:16px;">
      <div class="list-item"><strong>Awaiting runtime file</strong><span class="badge warning">Standby</span></div>
    </div>
  `;
  view.appendChild(card);

  const form = card.querySelector("[data-import-form]");
  const fileInput = card.querySelector("[data-import-file]");
  const results = card.querySelector("[data-import-results]");

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) {
      results.innerHTML = `<div class="list-item"><strong>No file selected</strong><span class="badge danger">Error</span></div>`;
      return;
    }

    try {
      const payload = await readImportFile(file);
      importRuntimePayload(payload);
      results.innerHTML = `<div class="list-item"><strong>${file.name}</strong><span class="badge good">Imported</span></div>`;
    } catch (error) {
      pushNotification("Runtime import failed", error.message || "Invalid JSON file.", "Danger");
      results.innerHTML = `<div class="list-item"><strong>Import failed</strong><span class="badge danger">Error</span></div>`;
    }
  });
}

const observer = new MutationObserver(() => renderImportPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderImportPanel();
});

window.addEventListener("kairos:auth", renderImportPanel);
