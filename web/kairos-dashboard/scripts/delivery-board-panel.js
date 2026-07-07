import { deliveryBoardMetrics, getDeliveryBoard, stageDeliveryItem } from "./delivery-board.js";

function badgeClass(status) {
  return status === "Staged" ? "badge good" : "badge warning";
}

function renderDeliveryBoardPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-delivery-board-panel]")) return;

  const items = getDeliveryBoard();
  const metrics = deliveryBoardMetrics();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.deliveryBoardPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Delivery Ops</p><h3>Delivery Board</h3></div>
      <span class="badge good">${metrics.staged}/${metrics.total} Staged</span>
    </div>
    <div class="list">
      ${items.map(item => `
        <div class="list-item">
          <div><strong>${item.title}</strong><p class="muted">${item.lane} • ${item.requirement}</p></div>
          <div class="action-row" style="margin-top:0;"><span class="${badgeClass(item.status)}">${item.status}</span><button class="action-button" data-stage-delivery="${item.id}">Stage</button></div>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelectorAll("[data-stage-delivery]").forEach(button => {
    button.addEventListener("click", () => {
      stageDeliveryItem(button.dataset.stageDelivery);
      card.remove();
      renderDeliveryBoardPanel();
    });
  });
}

const observer = new MutationObserver(() => renderDeliveryBoardPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderDeliveryBoardPanel();
});
window.addEventListener("kairos:auth", renderDeliveryBoardPanel);
