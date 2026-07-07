import { buildLaunchReadinessBoard } from "./launch-readiness-board.js";

function badgeClass(status) {
  return status === "Strong" || status === "Active" ? "badge good" : "badge warning";
}

function renderLaunchReadinessBoardPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-launch-readiness-board-panel]")) return;

  const items = buildLaunchReadinessBoard();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.launchReadinessBoardPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Launch</p><h3>Launch Readiness Board</h3></div>
      <span class="badge good">Live</span>
    </div>
    <section class="kpi-grid" style="margin-top:16px;">
      ${items.map(item => `
        <article class="card kpi-card">
          <div class="card-header"><h3>${item.title}</h3><span class="${badgeClass(item.status)}">${item.status}</span></div>
          <p class="metric">${item.value}</p>
        </article>
      `).join("")}
    </section>
  `;
  view.prepend(card);
}

const observer = new MutationObserver(() => renderLaunchReadinessBoardPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderLaunchReadinessBoardPanel();
});
window.addEventListener("kairos:auth", renderLaunchReadinessBoardPanel);
