import { calculateSystemHealth, saveSystemHealth, getSavedSystemHealth } from "./health-orchestrator.js";
import { pushNotification } from "./notifications.js";

function badgeClass(score) {
  if (score >= 85) return "badge good";
  if (score >= 60) return "badge warning";
  return "badge danger";
}

function renderHealthOrchestratorPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-health-orchestrator-panel]")) return;

  const health = getSavedSystemHealth() || calculateSystemHealth();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.healthOrchestratorPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">System Health</p>
        <h3>Health Orchestrator</h3>
      </div>
      <span class="${badgeClass(health.score)}">${health.score}%</span>
    </div>
    <div class="list">
      <div class="list-item"><strong>Diagnostics</strong><span class="${badgeClass(health.diagnosticScore)}">${health.diagnosticScore}%</span></div>
      <div class="list-item"><strong>Panel Registry</strong><span class="${badgeClass(health.registryScore)}">${health.registryScore}%</span></div>
      <div class="list-item"><strong>Task Activation</strong><span class="${badgeClass(health.taskScore)}">${health.taskScore}%</span></div>
      <div class="list-item"><strong>Continuity</strong><span class="${badgeClass(health.continuityScore)}">${health.continuityScore}%</span></div>
      <div class="list-item"><strong>Commands</strong><span class="${badgeClass(health.commandScore)}">${health.commandScore}%</span></div>
      <div class="list-item"><strong>Notifications</strong><span class="${badgeClass(health.notificationScore)}">${health.notificationScore}%</span></div>
      <div class="list-item"><strong>Last Calculated</strong><span class="badge">${health.createdAt}</span></div>
    </div>
    <div class="action-row">
      <button class="action-button" data-save-health>Recalculate Health</button>
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-save-health]").addEventListener("click", () => {
    const next = saveSystemHealth();
    pushNotification("System health recalculated", `Kairos health score: ${next.score}%.`, next.score >= 85 ? "Success" : "Warning");
    card.remove();
    renderHealthOrchestratorPanel();
  });
}

const observer = new MutationObserver(() => renderHealthOrchestratorPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderHealthOrchestratorPanel();
});

window.addEventListener("kairos:auth", renderHealthOrchestratorPanel);
