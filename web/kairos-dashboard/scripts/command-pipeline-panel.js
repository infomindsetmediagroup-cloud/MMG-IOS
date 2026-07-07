import { commandPipelineMetrics, getCommandPipeline } from "./command-pipeline.js";

function badgeClass(status) {
  const value = String(status || "").toLowerCase();
  if (["complete", "queued"].includes(value)) return "badge good";
  if (["ready", "pending", "execution", "approval", "validation"].includes(value)) return "badge warning";
  return "badge";
}

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character]));
}

function renderCommandPipelinePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-command-pipeline-panel]")) return;

  const items = getCommandPipeline();
  const metrics = commandPipelineMetrics();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.commandPipelinePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Pipeline</p><h3>Command Pipeline</h3></div>
      <span class="badge good">${metrics.total} Total</span>
    </div>
    <section class="kpi-grid" style="margin-top:16px;">
      <article class="card kpi-card"><div class="card-header"><h3>Execution</h3><span class="badge warning">Stage</span></div><p class="metric">${metrics.execution}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Approval</h3><span class="badge warning">Gate</span></div><p class="metric">${metrics.approval}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Validation</h3><span class="badge">QA</span></div><p class="metric">${metrics.validation}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Total</h3><span class="badge good">Flow</span></div><p class="metric">${metrics.total}</p></article>
    </section>
    <div class="list" style="margin-top:16px;">
      ${(items.length ? items : [{ id: "PIPE-000", workId: "None", runId: "None", command: "No pipeline commands yet", stage: "Intake", status: "Standby", steps: [] }]).slice(0, 8).map(item => `
        <div class="list-item command-pipeline-item">
          <div>
            <strong>${escapeHTML(item.id)} • ${escapeHTML(item.workId)} • ${escapeHTML(item.runId)}</strong>
            <p class="muted">${escapeHTML(item.command)}</p>
            <p class="muted">${(item.steps || []).map(step => `${escapeHTML(step.label)}: ${escapeHTML(step.status)}`).join(" • ")}</p>
          </div>
          <div class="action-row" style="margin-top:0;">
            <span class="${badgeClass(item.stage)}">${escapeHTML(item.stage)}</span>
            <span class="${badgeClass(item.status)}">${escapeHTML(item.status)}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);
}

function refreshCommandPipelinePanel() {
  document.querySelector("[data-command-pipeline-panel]")?.remove();
  renderCommandPipelinePanel();
}

const observer = new MutationObserver(() => renderCommandPipelinePanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderCommandPipelinePanel();
});
window.addEventListener("kairos:auth", renderCommandPipelinePanel);
window.addEventListener("kairos:command-pipeline-updated", refreshCommandPipelinePanel);
