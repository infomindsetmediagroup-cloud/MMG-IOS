import { getMilestoneRuns, runMilestoneValidation } from "./milestone-runner.js";

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "pass") return "badge good";
  if (normalized === "queued") return "badge warning";
  if (normalized === "fail") return "badge danger";
  return "badge";
}

function renderMilestonePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-milestone-panel]")) return;

  const latest = getMilestoneRuns()[0];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.milestonePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Validation</p>
        <h3>Phase 1 Milestone Runner</h3>
      </div>
      <span class="badge ${latest ? "good" : "warning"}">${latest ? `${latest.score}%` : "Ready"}</span>
    </div>
    <div class="action-row">
      <button class="action-button" data-run-milestone>Validate Milestone</button>
    </div>
    <div class="list" style="margin-top:16px;">
      ${latest ? latest.checks.map(item => `
        <div class="list-item">
          <div>
            <strong>${item.title}</strong>
            <p class="muted">${item.lane} • ${latest.createdAt}</p>
          </div>
          <span class="${badgeClass(item.status)}">${item.status}</span>
        </div>
      `).join("") : `<div class="list-item"><strong>No milestone validation run yet</strong><span class="badge warning">Standby</span></div>`}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-run-milestone]").addEventListener("click", () => {
    runMilestoneValidation();
    card.remove();
    renderMilestonePanel();
  });
}

const observer = new MutationObserver(() => renderMilestonePanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderMilestonePanel();
});

window.addEventListener("kairos:auth", renderMilestonePanel);
