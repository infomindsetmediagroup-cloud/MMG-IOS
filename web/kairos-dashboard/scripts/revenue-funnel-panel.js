import { getRevenueFunnelRuns, runRevenueFunnelBuild } from "./revenue-funnel-runner.js";

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["ready", "low"].includes(normalized)) return "badge good";
  if (["needs setup", "medium", "high"].includes(normalized)) return "badge warning";
  return "badge";
}

function renderRevenueFunnelPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-revenue-funnel-panel]")) return;

  const latest = getRevenueFunnelRuns()[0];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.revenueFunnelPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Executable Revenue</p>
        <h3>Revenue Funnel Runner</h3>
      </div>
      <span class="badge ${latest ? "warning" : ""}">${latest ? `${latest.score}%` : "Ready"}</span>
    </div>
    <div class="action-row">
      <button class="action-button" data-run-revenue-funnel>Create Capture Funnel</button>
    </div>
    <div class="list" style="margin-top:16px;">
      ${latest ? latest.findings.map(item => `
        <div class="list-item">
          <div>
            <strong>${item.title}</strong>
            <p class="muted">${item.impact} • ${latest.createdAt}</p>
          </div>
          <span class="${badgeClass(item.status)}">${item.status}</span>
        </div>
      `).join("") : `<div class="list-item"><strong>No revenue funnel run yet</strong><span class="badge warning">Standby</span></div>`}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-run-revenue-funnel]").addEventListener("click", () => {
    runRevenueFunnelBuild();
    card.remove();
    renderRevenueFunnelPanel();
  });
}

const observer = new MutationObserver(() => renderRevenueFunnelPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderRevenueFunnelPanel();
});

window.addEventListener("kairos:auth", renderRevenueFunnelPanel);
