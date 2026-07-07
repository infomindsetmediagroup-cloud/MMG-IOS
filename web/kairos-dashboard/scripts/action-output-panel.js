import { actionOutputMetrics, buildActionOutputs } from "./action-output.js";

function badgeClass(status) {
  if (status === "Generated") return "badge good";
  if (status === "Waiting") return "badge warning";
  return "badge";
}

function renderActionOutputPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-action-output-panel]")) return;

  const outputs = buildActionOutputs();
  const metrics = actionOutputMetrics();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.actionOutputPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Outputs</p><h3>Action Output Center</h3></div>
      <span class="badge good">${metrics.generated}/${metrics.total}</span>
    </div>
    <div class="list">
      ${outputs.map(item => `
        <div class="list-item">
          <div><strong>${item.title}</strong><p class="muted">${item.source} • ${item.detail} • Work: ${item.relatedWork}</p></div>
          <span class="${badgeClass(item.status)}">${item.status}</span>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);
}

const observer = new MutationObserver(() => renderActionOutputPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderActionOutputPanel();
});
window.addEventListener("kairos:auth", renderActionOutputPanel);
