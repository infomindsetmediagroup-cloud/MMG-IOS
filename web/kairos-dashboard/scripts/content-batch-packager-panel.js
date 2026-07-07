import { contentBatchMetrics, getContentBatchPackages, stageContentBatch } from "./content-batch-packager.js";

function badgeClass(status) {
  return status === "Staged" ? "badge good" : "badge warning";
}

function renderContentBatchPackagerPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-content-batch-packager-panel]")) return;

  const items = getContentBatchPackages();
  const metrics = contentBatchMetrics();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.contentBatchPackagerPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Content Ops</p><h3>Content Batch Packager</h3></div>
      <span class="badge good">${metrics.staged}/${metrics.total} Staged</span>
    </div>
    <div class="list">
      ${items.map(item => `
        <div class="list-item">
          <div><strong>${item.title}</strong><p class="muted">${item.category} • ${item.output}</p></div>
          <div class="action-row" style="margin-top:0;"><span class="${badgeClass(item.status)}">${item.status}</span><button class="action-button" data-stage-content="${item.id}">Stage</button></div>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelectorAll("[data-stage-content]").forEach(button => {
    button.addEventListener("click", () => {
      stageContentBatch(button.dataset.stageContent);
      card.remove();
      renderContentBatchPackagerPanel();
    });
  });
}

const observer = new MutationObserver(() => renderContentBatchPackagerPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderContentBatchPackagerPanel();
});
window.addEventListener("kairos:auth", renderContentBatchPackagerPanel);
