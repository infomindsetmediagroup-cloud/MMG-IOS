import { buildExecutionBrief } from "./execution-brief.js";

function renderExecutionBriefPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-execution-brief-panel]")) return;

  const brief = buildExecutionBrief();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.executionBriefPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Brief</p><h3>${brief.title}</h3></div>
      <span class="badge good">${brief.status}</span>
    </div>
    <div class="list">
      ${brief.summary.map(item => `<div class="list-item"><strong>${item}</strong><span class="badge">Summary</span></div>`).join("")}
      <div class="list-item"><strong>Generated</strong><span class="badge">${brief.generatedAt}</span></div>
    </div>
    <div class="list" style="margin-top:16px;">
      ${brief.nextActions.map(item => `<div class="list-item"><div><strong>${item.title}</strong><p class="muted">${item.lane} • ${item.detail}</p></div><span class="badge ${item.priority === "P1" ? "good" : "warning"}">${item.priority}</span></div>`).join("")}
    </div>
  `;
  view.prepend(card);
}

const observer = new MutationObserver(() => renderExecutionBriefPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderExecutionBriefPanel();
});
window.addEventListener("kairos:auth", renderExecutionBriefPanel);
