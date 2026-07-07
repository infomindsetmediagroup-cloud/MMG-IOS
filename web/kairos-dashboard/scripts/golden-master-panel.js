import { createGoldenMaster, getGoldenMaster, clearGoldenMaster } from "./golden-master.js";

function renderGoldenMasterPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-golden-master-panel]")) return;

  const goldenMaster = getGoldenMaster();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.goldenMasterPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Baseline</p>
        <h3>Golden Master Control</h3>
      </div>
      <span class="badge ${goldenMaster ? "good" : "warning"}">${goldenMaster ? "Saved" : "Ready"}</span>
    </div>
    <div class="list">
      <div class="list-item"><strong>Status</strong><span class="badge ${goldenMaster ? "good" : "warning"}">${goldenMaster ? "Golden Master saved" : "No Golden Master saved"}</span></div>
      <div class="list-item"><strong>Created</strong><span class="badge">${goldenMaster?.createdAt || "Pending"}</span></div>
      <div class="list-item"><strong>Actions</strong><span class="badge">${goldenMaster?.payload?.actions?.length || 0}</span></div>
      <div class="list-item"><strong>Tasks</strong><span class="badge warning">${goldenMaster?.payload?.tasks?.length || 0}</span></div>
    </div>
    <div class="action-row">
      <button class="action-button" data-create-golden-master>Create Golden Master</button>
      <button class="action-button" data-clear-golden-master>Clear</button>
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-create-golden-master]").addEventListener("click", () => {
    createGoldenMaster();
    card.remove();
    renderGoldenMasterPanel();
  });

  card.querySelector("[data-clear-golden-master]").addEventListener("click", () => {
    clearGoldenMaster();
    card.remove();
    renderGoldenMasterPanel();
  });
}

const observer = new MutationObserver(() => renderGoldenMasterPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderGoldenMasterPanel();
});

window.addEventListener("kairos:auth", renderGoldenMasterPanel);
