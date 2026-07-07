import { getProductionMetrics, getSlaStatus } from "./production-metrics-engine.js";

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character]));
}

function renderProductionMetricsPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-production-metrics-panel]")) return;

  const metrics = getProductionMetrics();
  const sla = getSlaStatus();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.productionMetricsPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Metrics</p><h3>Production Metrics</h3></div>
      <span class="badge good">${metrics.health}% Health</span>
    </div>
    <section class="kpi-grid" style="margin-top:16px;">
      <article class="card kpi-card"><div class="card-header"><h3>Pressure</h3><span class="badge warning">Load</span></div><p class="metric">${metrics.pressure}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Throughput</h3><span class="badge good">Done</span></div><p class="metric">${metrics.throughput}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Dispatch</h3><span class="badge">Runs</span></div><p class="metric">${metrics.dispatchCount}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Auto</h3><span class="badge">Runs</span></div><p class="metric">${metrics.automationRunsCount}</p></article>
    </section>
    <div class="production-metrics-grid">
      <section class="production-metrics-mini"><div class="card-header"><h3>SLA Status</h3><span class="badge">${sla.length}</span></div><div class="list">${sla.map(item => `<div class="list-item"><div><strong>${escapeHTML(item.label)}</strong><p class="muted">${escapeHTML(item.value)} ${escapeHTML(item.unit)} / target ${escapeHTML(item.target)}</p></div><span class="${item.status === "On Track" ? "badge good" : "badge warning"}">${escapeHTML(item.status)}</span></div>`).join("")}</div></section>
      <section class="production-metrics-mini"><div class="card-header"><h3>Bottlenecks</h3><span class="badge warning">${metrics.bottlenecks.length}</span></div><div class="list">${(metrics.bottlenecks.length ? metrics.bottlenecks : ["No bottlenecks detected"]).map(item => `<div class="list-item"><strong>${escapeHTML(item)}</strong><span class="${item === "No bottlenecks detected" ? "badge good" : "badge warning"}">${item === "No bottlenecks detected" ? "Clear" : "Watch"}</span></div>`).join("")}</div></section>
    </div>
  `;
  view.prepend(card);
}

function refreshProductionMetricsPanel() {
  const existing = document.querySelector("[data-production-metrics-panel]");
  if (existing) existing.remove();
  renderProductionMetricsPanel();
}

const observer = new MutationObserver(() => renderProductionMetricsPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderProductionMetricsPanel();
});
window.addEventListener("kairos:auth", renderProductionMetricsPanel);
window.addEventListener("kairos:work-queue-updated", refreshProductionMetricsPanel);
window.addEventListener("kairos:workflow-automation-updated", refreshProductionMetricsPanel);
window.addEventListener("kairos:agent-scheduler-updated", refreshProductionMetricsPanel);
window.addEventListener("kairos:approvals-updated", refreshProductionMetricsPanel);
window.addEventListener("kairos:dependency-graph-updated", refreshProductionMetricsPanel);
