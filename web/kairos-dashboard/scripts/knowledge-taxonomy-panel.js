import { getKnowledgeTaxonomyRuns, runKnowledgeTaxonomyBuild } from "./knowledge-taxonomy-runner.js";

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "ready") return "badge good";
  if (normalized === "needs setup") return "badge warning";
  return "badge";
}

function renderKnowledgeTaxonomyPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-knowledge-taxonomy-panel]")) return;

  const latest = getKnowledgeTaxonomyRuns()[0];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.knowledgeTaxonomyPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Executable Knowledge</p>
        <h3>Knowledge Taxonomy Runner</h3>
      </div>
      <span class="badge ${latest ? "warning" : ""}">${latest ? `${latest.score}%` : "Ready"}</span>
    </div>
    <div class="action-row">
      <button class="action-button" data-run-knowledge-taxonomy>Create Knowledge Module</button>
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
      `).join("") : `<div class="list-item"><strong>No taxonomy build run yet</strong><span class="badge warning">Standby</span></div>`}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-run-knowledge-taxonomy]").addEventListener("click", () => {
    runKnowledgeTaxonomyBuild();
    card.remove();
    renderKnowledgeTaxonomyPanel();
  });
}

const observer = new MutationObserver(() => renderKnowledgeTaxonomyPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderKnowledgeTaxonomyPanel();
});

window.addEventListener("kairos:auth", renderKnowledgeTaxonomyPanel);
