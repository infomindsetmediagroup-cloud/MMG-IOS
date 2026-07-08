import { getRuntimeStore, advanceExecutionWork, clearExecutionPipeline } from "./runtime-store.js";
import { seedAllOperations, seedKairosPriorities, seedShopifyOperations, seedWebsiteOperations } from "./operations-seeder.js";
import { pushNotification } from "./notifications.js";

let isRendering = false;
let observerStarted = false;

function badgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (["ready", "completed"].includes(normalized)) return "badge good";
  if (["in progress", "queued"].includes(normalized)) return "badge warning";
  return "badge";
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
      <div><strong>No execution work queued</strong><p class="muted">Seed the queue or trigger dashboard commands to move work from Queued to In Progress, Ready, and Completed.</p></div>
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
      <button class="action-button" data-seed-all-operations="true">Seed All Ops</button>
      <button class="action-button" data-seed-kairos-priorities="true">Seed Kairos</button>
      <button class="action-button" data-seed-website-ops="true">Seed Website</button>
      <button class="action-button" data-seed-shopify-ops="true">Seed Shopify</button>
      <button class="action-button" data-clear-execution-pipeline="true">Clear Pipeline</button>
    </div>`;

  card.querySelectorAll("[data-advance-execution]").forEach(button => {
    button.addEventListener("click", () => {
      advanceExecutionWork(button.dataset.advanceExecution);
      pushNotification("Execution advanced", "Pipeline item moved to the next status.", "Success");
      renderPipeline();
    });
  });

  card.querySelector("[data-seed-all-operations]")?.addEventListener("click", () => {
    seedAllOperations();
    renderPipeline();
  });

  card.querySelector("[data-seed-kairos-priorities]")?.addEventListener("click", () => {
    seedKairosPriorities();
    renderPipeline();
  });

  card.querySelector("[data-seed-website-ops]")?.addEventListener("click", () => {
    seedWebsiteOperations();
    renderPipeline();
  });

  card.querySelector("[data-seed-shopify-ops]")?.addEventListener("click", () => {
    seedShopifyOperations();
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
