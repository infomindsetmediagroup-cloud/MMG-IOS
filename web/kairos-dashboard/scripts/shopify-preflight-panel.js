import { getShopifyPreflightRuns, runShopifyPreflight } from "./shopify-preflight-runner.js";

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["ready", "low"].includes(normalized)) return "badge good";
  if (["needs work", "medium", "high"].includes(normalized)) return "badge warning";
  if (["critical"].includes(normalized)) return "badge danger";
  return "badge";
}

function renderShopifyPreflightPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-shopify-preflight-panel]")) return;

  const latest = getShopifyPreflightRuns()[0];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.shopifyPreflightPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Executable Commerce</p>
        <h3>Shopify Preflight Runner</h3>
      </div>
      <span class="badge ${latest ? "warning" : ""}">${latest ? `${latest.score}%` : "Ready"}</span>
    </div>
    <div class="action-row">
      <button class="action-button" data-run-shopify-preflight>Prepare Shopify Queue</button>
    </div>
    <div class="list" style="margin-top:16px;">
      ${latest ? latest.findings.map(item => `
        <div class="list-item">
          <div>
            <strong>${item.title}</strong>
            <p class="muted">${item.severity} • ${latest.createdAt}</p>
          </div>
          <span class="${badgeClass(item.status)}">${item.status}</span>
        </div>
      `).join("") : `<div class="list-item"><strong>No Shopify preflight run yet</strong><span class="badge warning">Standby</span></div>`}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-run-shopify-preflight]").addEventListener("click", () => {
    runShopifyPreflight();
    card.remove();
    renderShopifyPreflightPanel();
  });
}

const observer = new MutationObserver(() => renderShopifyPreflightPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderShopifyPreflightPanel();
});

window.addEventListener("kairos:auth", renderShopifyPreflightPanel);
