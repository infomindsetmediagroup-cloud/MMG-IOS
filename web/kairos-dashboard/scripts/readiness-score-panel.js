import { calculateReadinessScore, readinessStatus } from "./readiness-score.js";

function badgeClass(score) {
  if (score >= 85) return "badge good";
  if (score >= 60) return "badge warning";
  return "badge danger";
}

function renderReadinessScorePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-readiness-score-panel]")) return;

  const readiness = calculateReadinessScore();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.readinessScorePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Readiness</p><h3>Kairos Operational Readiness</h3></div>
      <span class="${badgeClass(readiness.score)}">${readinessStatus(readiness.score)}</span>
    </div>
    <p class="metric">${readiness.score}%</p>
    <div class="list">
      <div class="list-item"><strong>System Health</strong><span class="${badgeClass(readiness.health)}">${readiness.health}%</span></div>
      <div class="list-item"><strong>Panels</strong><span class="${badgeClass(readiness.panels)}">${readiness.panels}%</span></div>
      <div class="list-item"><strong>Tasks</strong><span class="${badgeClass(readiness.tasks)}">${readiness.tasks}%</span></div>
      <div class="list-item"><strong>Commands</strong><span class="${badgeClass(readiness.commands)}">${readiness.commands}%</span></div>
      <div class="list-item"><strong>Routines</strong><span class="${badgeClass(readiness.routines)}">${readiness.routines}%</span></div>
      <div class="list-item"><strong>Updated</strong><span class="badge">${readiness.createdAt}</span></div>
    </div>
  `;
  view.prepend(card);
}

const observer = new MutationObserver(() => renderReadinessScorePanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderReadinessScorePanel();
});
window.addEventListener("kairos:auth", renderReadinessScorePanel);
