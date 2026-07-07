import { getCustomerPortalRuns, runCustomerPortalBuild } from "./customer-portal-runner.js";

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "ready") return "badge good";
  if (normalized === "needs setup") return "badge warning";
  return "badge";
}

function renderCustomerPortalPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-customer-portal-panel]")) return;

  const latest = getCustomerPortalRuns()[0];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.customerPortalPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Executable Customers</p>
        <h3>Customer Portal Runner</h3>
      </div>
      <span class="badge ${latest ? "warning" : ""}">${latest ? `${latest.score}%` : "Ready"}</span>
    </div>
    <div class="action-row">
      <button class="action-button" data-run-customer-portal>Map Customer Portal</button>
    </div>
    <div class="list" style="margin-top:16px;">
      ${latest ? latest.items.map(item => `
        <div class="list-item">
          <div>
            <strong>${item.title}</strong>
            <p class="muted">${item.lane} • ${latest.createdAt}</p>
          </div>
          <span class="${badgeClass(item.status)}">${item.status}</span>
        </div>
      `).join("") : `<div class="list-item"><strong>No customer portal run yet</strong><span class="badge warning">Standby</span></div>`}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-run-customer-portal]").addEventListener("click", () => {
    runCustomerPortalBuild();
    card.remove();
    renderCustomerPortalPanel();
  });
}

const observer = new MutationObserver(() => renderCustomerPortalPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderCustomerPortalPanel();
});

window.addEventListener("kairos:auth", renderCustomerPortalPanel);
