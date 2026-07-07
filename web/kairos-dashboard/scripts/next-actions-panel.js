import { buildNextActions } from "./next-actions.js";

function badgeClass(priority) {
  return priority === "P1" ? "badge good" : "badge warning";
}

function renderNextActionsPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-next-actions-panel]")) return;

  const actions = buildNextActions();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.nextActionsPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Priority</p><h3>Next Best Actions</h3></div>
      <span class="badge good">${actions.length} Actions</span>
    </div>
    <div class="list">
      ${(actions.length ? actions : [{ title: "No priority actions", detail: "Kairos has no immediate action recommendation.", priority: "P2", lane: "System" }]).map(item => `
        <div class="list-item">
          <div><strong>${item.title}</strong><p class="muted">${item.lane} • ${item.detail}</p></div>
          <span class="${badgeClass(item.priority)}">${item.priority}</span>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);
}

const observer = new MutationObserver(() => renderNextActionsPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderNextActionsPanel();
});
window.addEventListener("kairos:auth", renderNextActionsPanel);
