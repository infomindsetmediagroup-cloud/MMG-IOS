import { diagnostics, diagnosticsMetrics } from "./diagnostics.js";

function badgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "pass") return "badge good";
  if (normalized === "queued") return "badge warning";
  if (normalized === "fail") return "badge danger";
  return "badge";
}

function renderDiagnosticsPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-diagnostics-panel]")) return;

  const metrics = diagnosticsMetrics();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.diagnosticsPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Diagnostics</p>
        <h3>Dashboard Validation</h3>
      </div>
      <span class="badge good">${metrics.passed}/${metrics.total} Pass</span>
    </div>
    <div class="list">
      ${diagnostics.checks.map(item => `
        <div class="list-item">
          <div>
            <strong>${item.title}</strong>
            <p class="muted">${item.detail}</p>
          </div>
          <span class="${badgeClass(item.status)}">${item.status}</span>
        </div>
      `).join("")}
    </div>
  `;
  view.appendChild(card);
}

const observer = new MutationObserver(() => renderDiagnosticsPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderDiagnosticsPanel();
});

window.addEventListener("kairos:auth", renderDiagnosticsPanel);
