import { getSiteAuditRuns, runSiteAudit } from "./site-audit-runner.js";

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["pass", "low"].includes(normalized)) return "badge good";
  if (["needs work", "medium", "high"].includes(normalized)) return "badge warning";
  if (["critical", "fail"].includes(normalized)) return "badge danger";
  return "badge";
}

function renderSiteAuditPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-site-audit-panel]")) return;

  const latest = getSiteAuditRuns()[0];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.siteAuditPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Executable Audit</p>
        <h3>Website Audit Runner</h3>
      </div>
      <span class="badge ${latest ? "warning" : ""}">${latest ? `${latest.score}%` : "Ready"}</span>
    </div>
    <div class="action-row">
      <button class="action-button" data-run-site-audit>Run Website Audit</button>
    </div>
    <div class="list" style="margin-top:16px;">
      ${latest ? latest.findings.map(item => `
        <div class="list-item">
          <div>
            <strong>${item.title}</strong>
            <p class="muted">${latest.createdAt}</p>
          </div>
          <span class="${badgeClass(item.status)}">${item.status}</span>
        </div>
      `).join("") : `<div class="list-item"><strong>No audit run yet</strong><span class="badge warning">Standby</span></div>`}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-run-site-audit]").addEventListener("click", () => {
    runSiteAudit();
    card.remove();
    renderSiteAuditPanel();
  });
}

const observer = new MutationObserver(() => renderSiteAuditPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderSiteAuditPanel();
});

window.addEventListener("kairos:auth", renderSiteAuditPanel);
