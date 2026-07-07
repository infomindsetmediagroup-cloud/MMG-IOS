import { addDependency, dependencyMetrics, getDependencyGraph, removeDependency } from "./task-dependency-graph.js";

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character]));
}

function renderTaskDependencyGraphPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-task-dependency-graph-panel]")) return;

  const graph = getDependencyGraph();
  const metrics = dependencyMetrics();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.taskDependencyGraphPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Dependencies</p><h3>Task Dependency Graph</h3></div>
      <span class="badge warning">${metrics.waiting} Waiting</span>
    </div>
    <section class="kpi-grid" style="margin-top:16px;">
      <article class="card kpi-card"><div class="card-header"><h3>Nodes</h3><span class="badge">Tasks</span></div><p class="metric">${metrics.nodes}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Edges</h3><span class="badge">Links</span></div><p class="metric">${metrics.edges}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Ready</h3><span class="badge good">Clear</span></div><p class="metric">${metrics.ready}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Missing</h3><span class="badge danger">Fix</span></div><p class="metric">${metrics.missing}</p></article>
    </section>
    <form class="dependency-form" data-dependency-form>
      <label>Prerequisite<select data-dependency-from>${graph.nodes.map(node => `<option value="${escapeHTML(node.id)}">${escapeHTML(node.id)} • ${escapeHTML(node.title)}</option>`).join("")}</select></label>
      <label>Dependent<select data-dependency-to>${graph.nodes.map(node => `<option value="${escapeHTML(node.id)}">${escapeHTML(node.id)} • ${escapeHTML(node.title)}</option>`).join("")}</select></label>
      <button class="action-button" type="submit">Add Link</button>
    </form>
    <div class="dependency-graph-grid">
      <section class="dependency-mini">
        <div class="card-header"><h3>Task Nodes</h3><span class="badge">${graph.nodes.length}</span></div>
        <div class="list">${graph.nodes.slice(0, 10).map(node => `<div class="list-item"><div><strong>${escapeHTML(node.id)} • ${escapeHTML(node.title)}</strong><p class="muted">${escapeHTML(node.lane)} • ${escapeHTML(node.status)} • ${escapeHTML(node.progress)}%</p></div><span class="badge">${escapeHTML(node.priority)}</span></div>`).join("")}</div>
      </section>
      <section class="dependency-mini">
        <div class="card-header"><h3>Dependency Links</h3><span class="badge warning">${graph.edges.length}</span></div>
        <div class="list">${(graph.edges.length ? graph.edges : [{ from: "None", to: "No links yet", valid: true, waiting: false, source: "Standby" }]).map(edge => `<div class="list-item"><div><strong>${escapeHTML(edge.from)} → ${escapeHTML(edge.to)}</strong><p class="muted">${escapeHTML(edge.source)} • ${edge.valid ? "Valid" : "Missing"} • ${edge.waiting ? "Waiting" : "Ready"}</p></div><div class="action-row" style="margin-top:0;"><span class="${edge.valid ? "badge" : "badge danger"}">${edge.valid ? "Valid" : "Missing"}</span>${edge.source === "operator" ? `<button class="action-button" type="button" data-remove-from="${escapeHTML(edge.from)}" data-remove-to="${escapeHTML(edge.to)}">Remove</button>` : ""}</div></div>`).join("")}</div>
      </section>
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-dependency-form]").addEventListener("submit", event => {
    event.preventDefault();
    addDependency(card.querySelector("[data-dependency-from]").value, card.querySelector("[data-dependency-to]").value);
    refreshTaskDependencyGraphPanel();
  });

  card.querySelectorAll("[data-remove-from]").forEach(button => {
    button.addEventListener("click", () => {
      removeDependency(button.dataset.removeFrom, button.dataset.removeTo);
      refreshTaskDependencyGraphPanel();
    });
  });
}

function refreshTaskDependencyGraphPanel() {
  document.querySelector("[data-task-dependency-graph-panel]")?.remove();
  renderTaskDependencyGraphPanel();
}

const observer = new MutationObserver(() => renderTaskDependencyGraphPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderTaskDependencyGraphPanel();
});
window.addEventListener("kairos:auth", renderTaskDependencyGraphPanel);
window.addEventListener("kairos:dependency-graph-updated", refreshTaskDependencyGraphPanel);
window.addEventListener("kairos:work-queue-updated", refreshTaskDependencyGraphPanel);
