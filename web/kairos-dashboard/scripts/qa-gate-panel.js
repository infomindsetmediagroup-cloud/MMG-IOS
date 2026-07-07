import { calculateQAGate } from "./qa-gate.js";

function badgeClass(value) {
  if (value === "Pass" || value >= 80) return "badge good";
  if (value === "Watch" || value >= 55) return "badge warning";
  return "badge danger";
}

function renderQAGatePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-qa-gate-panel]")) return;

  const gate = calculateQAGate();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.qaGatePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">QA</p><h3>Release QA Gate</h3></div>
      <span class="${badgeClass(gate.status)}">${gate.status}</span>
    </div>
    <p class="metric">${gate.score}%</p>
    <div class="list">
      <div class="list-item"><strong>System</strong><span class="${badgeClass(gate.system)}">${gate.system}%</span></div>
      <div class="list-item"><strong>Commerce</strong><span class="${badgeClass(gate.commerce)}">${gate.commerce}%</span></div>
      <div class="list-item"><strong>Work Queue</strong><span class="${badgeClass(gate.work)}">${gate.work}%</span></div>
      <div class="list-item"><strong>Outputs</strong><span class="${badgeClass(gate.outputs)}">${gate.outputs}%</span></div>
      <div class="list-item"><strong>Checked</strong><span class="badge">${gate.createdAt}</span></div>
    </div>
  `;
  view.prepend(card);
}

const observer = new MutationObserver(() => renderQAGatePanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderQAGatePanel();
});
window.addEventListener("kairos:auth", renderQAGatePanel);
