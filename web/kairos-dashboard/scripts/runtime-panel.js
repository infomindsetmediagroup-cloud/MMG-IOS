import { getRuntimeStore, createRuntimeSnapshot } from "./runtime-store.js";

function renderRuntimePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-runtime-panel]")) return;

  const store = getRuntimeStore();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.runtimePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <h3>Runtime Store</h3>
      <span class="badge good">Persistent</span>
    </div>
    <div class="list">
      <div class="list-item"><strong>Operator</strong><span class="badge good">${store.operator || "Mike"}</span></div>
      <div class="list-item"><strong>Saved Approvals</strong><span class="badge warning">${(store.approvals || []).length}</span></div>
      <div class="list-item"><strong>Snapshots</strong><span class="badge">${(store.snapshots || []).length}</span></div>
      <div class="list-item"><strong>Last Saved</strong><span class="badge">${store.lastSavedAt || "Pending"}</span></div>
    </div>
    <div class="action-row">
      <button class="action-button" data-runtime-snapshot>Save Runtime Snapshot</button>
    </div>
  `;
  view.appendChild(card);

  card.querySelector("[data-runtime-snapshot]").addEventListener("click", () => {
    createRuntimeSnapshot("Manual Runtime Snapshot", { source: "Runtime Panel" });
    card.remove();
    renderRuntimePanel();
  });
}

const observer = new MutationObserver(() => renderRuntimePanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderRuntimePanel();
});

window.addEventListener("kairos:auth", renderRuntimePanel);
