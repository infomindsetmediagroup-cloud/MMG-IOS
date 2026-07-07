import { buildOperatorBriefing } from "./operator-briefing.js";

function badgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (["active", "saved", "clear"].includes(normalized)) return "badge good";
  if (["review", "monitor", "standby", "pending"].includes(normalized)) return "badge warning";
  return "badge";
}

function renderOperatorPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-operator-panel]")) return;

  const briefing = buildOperatorBriefing();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.operatorPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Operator Briefing</p>
        <h3>${briefing.headline}</h3>
      </div>
      <span class="badge good">Live</span>
    </div>
    <p class="muted">${briefing.summary}</p>
    <section class="kpi-grid" style="margin-top:16px;">
      ${briefing.metrics.map(item => `
        <article class="card kpi-card">
          <div class="card-header"><h3>${item.title}</h3><span class="${badgeClass(item.status)}">${item.status}</span></div>
          <p class="metric">${item.value}</p>
        </article>
      `).join("")}
    </section>
    <div class="list" style="margin-top:16px;">
      ${briefing.nextMoves.map(item => `<div class="list-item"><strong>${item}</strong><span class="badge warning">Next</span></div>`).join("")}
    </div>
  `;
  view.prepend(card);
}

const observer = new MutationObserver(() => renderOperatorPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderOperatorPanel();
});

window.addEventListener("kairos:auth", renderOperatorPanel);
