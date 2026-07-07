import { approvePageChange, getPageChangePackages, pageChangeMetrics } from "./page-change-packager.js";

function badgeClass(status) {
  return status === "Ready" ? "badge good" : "badge warning";
}

function renderPageChangePackagerPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-page-change-packager-panel]")) return;

  const items = getPageChangePackages();
  const metrics = pageChangeMetrics();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.pageChangePackagerPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Page Ops</p><h3>Page Change Packager</h3></div>
      <span class="badge good">${metrics.ready}/${metrics.total} Ready</span>
    </div>
    <div class="list">
      ${items.map(item => `
        <div class="list-item">
          <div><strong>${item.page}</strong><p class="muted">${item.change} • ${item.impact}</p></div>
          <div class="action-row" style="margin-top:0;"><span class="${badgeClass(item.status)}">${item.status}</span><button class="action-button" data-stage-page="${item.id}">Stage</button></div>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelectorAll("[data-stage-page]").forEach(button => {
    button.addEventListener("click", () => {
      approvePageChange(button.dataset.stagePage);
      card.remove();
      renderPageChangePackagerPanel();
    });
  });
}

const observer = new MutationObserver(() => renderPageChangePackagerPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderPageChangePackagerPanel();
});
window.addEventListener("kairos:auth", renderPageChangePackagerPanel);
