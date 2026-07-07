import { getVaultBuilderRuns, runVaultBuilder } from "./vault-builder-runner.js";

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "ready") return "badge good";
  if (normalized === "needs setup") return "badge warning";
  return "badge";
}

function renderVaultBuilderPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-vault-builder-panel]")) return;

  const latest = getVaultBuilderRuns()[0];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.vaultBuilderPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Executable Vault</p>
        <h3>Free Vault Builder Runner</h3>
      </div>
      <span class="badge ${latest ? "warning" : ""}">${latest ? `${latest.score}%` : "Ready"}</span>
    </div>
    <div class="action-row">
      <button class="action-button" data-run-vault-builder>Build Free Vault</button>
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
      `).join("") : `<div class="list-item"><strong>No vault build run yet</strong><span class="badge warning">Standby</span></div>`}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-run-vault-builder]").addEventListener("click", () => {
    runVaultBuilder();
    card.remove();
    renderVaultBuilderPanel();
  });
}

const observer = new MutationObserver(() => renderVaultBuilderPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderVaultBuilderPanel();
});

window.addEventListener("kairos:auth", renderVaultBuilderPanel);
