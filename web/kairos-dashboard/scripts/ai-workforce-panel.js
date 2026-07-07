import { advanceAssignment, boostAssignment, getWorkforceAgents, getWorkforceAssignments, orchestrateWorkforce, workforceMetrics } from "./ai-workforce-orchestrator.js";

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character]));
}

function badgeClass(value) {
  const text = String(value || "").toLowerCase();
  if (["assigned", "in progress", "high"].includes(text)) return "badge warning";
  if (["complete", "ready", "clear"].includes(text)) return "badge good";
  return "badge";
}

function renderAIWorkforcePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-ai-workforce-panel]")) return;

  const assignments = getWorkforceAssignments();
  const agents = getWorkforceAgents();
  const metrics = workforceMetrics();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.aiWorkforcePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">AI Workforce</p><h3>Workforce Orchestrator</h3></div>
      <span class="badge warning">${metrics.total} Assigned</span>
    </div>
    <section class="kpi-grid" style="margin-top:16px;">
      <article class="card kpi-card"><div class="card-header"><h3>Agents</h3><span class="badge good">Ready</span></div><p class="metric">${metrics.agents}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Assigned</h3><span class="badge warning">Queue</span></div><p class="metric">${metrics.assigned}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Active</h3><span class="badge warning">Work</span></div><p class="metric">${metrics.active}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>High</h3><span class="badge warning">Priority</span></div><p class="metric">${metrics.high}</p></article>
    </section>
    <div class="action-row">
      <button class="action-button" type="button" data-orchestrate-workforce>Orchestrate Workforce</button>
    </div>
    <div class="ai-workforce-grid">
      <section class="ai-workforce-mini">
        <div class="card-header"><h3>Agents</h3><span class="badge">${agents.length}</span></div>
        <div class="list">${agents.map(agent => `<div class="list-item"><div><strong>${escapeHTML(agent.name)}</strong><p class="muted">${escapeHTML(agent.lane)} • ${escapeHTML(agent.specialty)}</p></div><span class="badge good">Ready</span></div>`).join("")}</div>
      </section>
      <section class="ai-workforce-mini">
        <div class="card-header"><h3>Assignments</h3><span class="badge warning">${assignments.length}</span></div>
        <div class="list">${(assignments.length ? assignments : [{ id: "ASSIGN-000", workId: "None", title: "No workforce assignments yet", agentName: "Kairos", lane: "Operations", status: "Standby", priority: "Normal" }]).map(item => `
          <div class="list-item">
            <div><strong>${escapeHTML(item.id)} • ${escapeHTML(item.title)}</strong><p class="muted">${escapeHTML(item.agentName)} • ${escapeHTML(item.lane)} • ${escapeHTML(item.workId)}</p></div>
            <div class="action-row" style="margin-top:0;">
              <span class="${badgeClass(item.status)}">${escapeHTML(item.status)}</span>
              <span class="${badgeClass(item.priority)}">${escapeHTML(item.priority)}</span>
              ${item.workId !== "None" ? `<button class="action-button" type="button" data-boost-work="${escapeHTML(item.workId)}">Boost</button><button class="action-button" type="button" data-advance-assignment="${escapeHTML(item.workId)}">Advance</button>` : ""}
            </div>
          </div>
        `).join("")}</div>
      </section>
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-orchestrate-workforce]").addEventListener("click", () => {
    orchestrateWorkforce();
    refreshAIWorkforcePanel();
  });

  card.querySelectorAll("[data-boost-work]").forEach(button => {
    button.addEventListener("click", () => {
      boostAssignment(button.dataset.boostWork);
      refreshAIWorkforcePanel();
    });
  });

  card.querySelectorAll("[data-advance-assignment]").forEach(button => {
    button.addEventListener("click", () => {
      advanceAssignment(button.dataset.advanceAssignment);
      refreshAIWorkforcePanel();
    });
  });
}

function refreshAIWorkforcePanel() {
  document.querySelector("[data-ai-workforce-panel]")?.remove();
  renderAIWorkforcePanel();
}

const observer = new MutationObserver(() => renderAIWorkforcePanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderAIWorkforcePanel();
});
window.addEventListener("kairos:auth", renderAIWorkforcePanel);
window.addEventListener("kairos:ai-workforce-updated", refreshAIWorkforcePanel);
window.addEventListener("kairos:work-queue-updated", refreshAIWorkforcePanel);
