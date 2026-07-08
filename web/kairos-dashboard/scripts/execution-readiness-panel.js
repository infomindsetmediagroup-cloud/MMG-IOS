import { getExecutionReadiness } from "./execution-readiness-engine.js";

function badgeClass(value) {
  return value ? "badge good" : "badge warning";
}

function renderExecutionReadiness() {
  const root = document.querySelector("#dashboard-view");
  if (!root || root.querySelector("[data-execution-readiness-panel]")) return;

  const readiness = getExecutionReadiness();
  const rows = [
    ["Pipeline Items", readiness.total, readiness.total > 0],
    ["Active", readiness.active, readiness.active > 0],
    ["Ready", readiness.readyCount, readiness.readyCount > 0],
    ["Completed", readiness.completed, readiness.completed > 0],
    ["Source Coverage", readiness.seededSources.join(", ") || "None", readiness.missingSources.length === 0],
    ["Priority Coverage", readiness.hasPriorityCoverage ? "Covered" : "Open", readiness.hasPriorityCoverage]
  ];

  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.executionReadinessPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Readiness</p>
        <h3>Execution Readiness</h3>
      </div>
      <span class="${badgeClass(readiness.ready)}">${readiness.ready ? "Ready" : "Review"}</span>
    </div>
    <div class="list">
      ${rows.map(row => `<div class="list-item"><div><strong>${row[0]}</strong><p class="muted">${row[1]}</p></div><span class="${badgeClass(row[2])}">${row[2] ? "Done" : "Open"}</span></div>`).join("")}
    </div>
    <p class="muted" style="margin-top:12px;">${readiness.next} • ${readiness.updated}</p>`;
  root.appendChild(card);
}

document.addEventListener("DOMContentLoaded", renderExecutionReadiness);
document.addEventListener("kairos:rendered", renderExecutionReadiness);
