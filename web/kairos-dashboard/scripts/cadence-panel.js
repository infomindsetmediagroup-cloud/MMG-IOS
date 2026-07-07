import { getRoutineBoard, routineBoardMetrics } from "./routine-board.js";

function renderCadencePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-cadence-panel]")) return;

  const items = getRoutineBoard();
  const metrics = routineBoardMetrics();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.cadencePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Cadence</p><h3>Operations Cadence Board</h3></div>
      <span class="badge warning">${metrics.total} Items</span>
    </div>
    <div class="list">
      ${items.map(item => `<div class="list-item"><div><strong>${item.title}</strong><p class="muted">${item.lane} • ${item.cadence}</p></div><span class="badge warning">${item.status}</span></div>`).join("")}
    </div>
  `;
  view.appendChild(card);
}

const observer = new MutationObserver(() => renderCadencePanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderCadencePanel();
});
window.addEventListener("kairos:auth", renderCadencePanel);
