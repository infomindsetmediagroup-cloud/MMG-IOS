import { getBundleBuilderRuns, runBundleBuilder } from "./bundle-builder-runner.js";

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "ready") return "badge good";
  if (normalized === "needs setup") return "badge warning";
  return "badge";
}

function renderBundleBuilderPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-bundle-builder-panel]")) return;

  const latest = getBundleBuilderRuns()[0];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.bundleBuilderPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Executable Bundle</p>
        <h3>Bundle Builder Runner</h3>
      </div>
      <span class="badge ${latest ? "warning" : ""}">${latest ? `${latest.score}%` : "Ready"}</span>
    </div>
    <div class="action-row">
      <button class="action-button" data-run-bundle-builder>Package Next Bundle</button>
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
      `).join("") : `<div class="list-item"><strong>No bundle build run yet</strong><span class="badge warning">Standby</span></div>`}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-run-bundle-builder]").addEventListener("click", () => {
    runBundleBuilder();
    card.remove();
    renderBundleBuilderPanel();
  });
}

const observer = new MutationObserver(() => renderBundleBuilderPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderBundleBuilderPanel();
});

window.addEventListener("kairos:auth", renderBundleBuilderPanel);
