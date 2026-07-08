import { kairosState } from "./state.js";
import { getRuntimeStore, advanceExecutionWork, clearExecutionPipeline, queueExecutionWork, setExecutionWorkStatus } from "./runtime-store.js";
import { pushNotification } from "./notifications.js";

let isRendering = false;
let observerStarted = false;

function badgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (["ready", "completed"].includes(normalized)) return "badge good";
  if (["in progress", "queued"].includes(normalized)) return "badge warning";
  return "badge";
}

function seedCurrentPriorities() {
  const store = getRuntimeStore();
  const existingTitles = new Set((store.executionPipeline || []).map(item => item.title));
  kairosState.priorities
    .filter(priority => !existingTitles.has(priority.title))
    .forEach(priority => {
      const work = queueExecutionWork(priority.title, priority.lane, `Priority ${priority.priority}`);
      setExecutionWorkStatus(work.id, priority.status === "Active" ? "In Progress" : "Queued");
    });
  pushNotification("Priorities seeded", "Current Kairos priorities were added to the execution pipeline.", "Success");
}

function renderPipeline() {
  const root = document.querySelector("#dashboard-view");
  if (!root || isRendering) return;
  isRendering = true;

  let card = root.querySelector("[data-execution-pipeline-panel]");
  if (!card) {
    card = document.createElement("article");
    card.className = "card full";
    card.dataset.executionPipelinePanel = "true";
    root.appendChild(card);
  }

  const store = getRuntimeStore();
  const items = store.executionPipeline || [];
  const rows = items.length ? items.map(item => `
    <div class="list-item">
      <div>
        <strong>${item.title}</strong>
        <p class="muted">${item.source} • ${item.detail} • ${item.updatedAt || item.createdAt}</p>
      </div>
      <div class="action-row compact">
        <span class="${badgeClass(item.status)}">${item.status}</span>
        <button class="action-button small" data-advance-execution="${item.id}">Advance</button>
      </div>
    </div>`).join("") : `
    <div class="list-item">
      <div><strong>No execution work queued</strong><p class="muted">Dashboard commands will appear here and move from Queued to In Progress, Ready, and Completed.</p></div>
      <span class="badge">Standby</span>
    </div>`;

  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Execution Pipeline</p>
        <h3>Operational Work Queue</h3>
      </div>
      <span class="badge success">${items.length} Items</span>
    </div>
    <div class="list">${rows}</div>
    <div class="action-row">
      <button class="action-button" data-seed-execution-pipeline="true">Seed Current Priorities</button>
      <button class="action-button" data-clear-execution-pipeline="true">Clear Pipeline</button>
    </div>`;

  card.querySelectorAll("[data-advance-execution]").forEach(button => {
    button.addEventListener("click", () => {
      advanceExecutionWork(button.dataset.advanceExecution);
      pushNotification("Execution advanced", "Pipeline item moved to the next status.", "Success");
      renderPipeline();
    });
  });

  card.querySelector("[data-seed-execution-pipeline]")?.addEventListener("click", () => {
    seedCurrentPriorities();
    renderPipeline();
  });

  card.querySelector("[data-clear-execution-pipeline]")?.addEventListener("click", () => {
    clearExecutionPipeline();
    pushNotification("Execution pipeline cleared", "Operational work queue reset for the next batch.", "Warning");
    renderPipeline();
  });

  isRendering = false;
}

function startPipelineObserver() {
  const root = document.querySelector("#dashboard-view");
  if (!root || observerStarted) return;
  observerStarted = true;
  const observer = new MutationObserver(() => {
    if (!root.querySelector("[data-execution-pipeline-panel]")) renderPipeline();
  });
  observer.observe(root, { childList: true });
}

document.addEventListener("DOMContentLoaded", () => {
  renderPipeline();
  startPipelineObserver();
});
document.addEventListener("kairos:rendered", renderPipeline);
