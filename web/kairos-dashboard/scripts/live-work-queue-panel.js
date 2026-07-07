import { advanceWorkItem, getLiveWorkQueue, liveWorkMetrics } from "./live-work-queue.js";

function badgeClass(status) {
  if (status === "Complete") return "badge good";
  if (status === "Active" || status === "Ready for Approval") return "badge warning";
  return "badge";
}

function priorityClass(priority) {
  return priority === "High" ? "badge warning" : "badge";
}

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;"
  }[character]));
}

function renderLiveWorkQueuePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-live-work-queue-panel]")) return;

  const items = getLiveWorkQueue();
  const metrics = liveWorkMetrics();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.liveWorkQueuePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Execution</p><h3>Live Work Queue</h3></div>
      <span class="badge warning">${metrics.active} Active</span>
    </div>
    <section class="kpi-grid" style="margin-top:16px;">
      <article class="card kpi-card"><div class="card-header"><h3>Total</h3><span class="badge">Queue</span></div><p class="metric">${metrics.total}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Queued</h3><span class="badge">Intake</span></div><p class="metric">${metrics.queued}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Approval</h3><span class="badge warning">Review</span></div><p class="metric">${metrics.approval}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Complete</h3><span class="badge good">Done</span></div><p class="metric">${metrics.complete}</p></article>
    </section>
    <div class="list" style="margin-top:16px;">
      ${items.map(item => `
        <div class="list-item">
          <div>
            <strong>${escapeHTML(item.title)}</strong>
            <p class="muted">${escapeHTML(item.lane)} • ${escapeHTML(item.type)} • ${escapeHTML(item.impact)}</p>
          </div>
          <div class="action-row" style="margin-top:0;">
            <span class="${priorityClass(item.priority)}">${escapeHTML(item.priority || "Normal")}</span>
            <span class="${badgeClass(item.status)}">${escapeHTML(item.status)}</span>
            <button class="action-button" data-advance-work="${escapeHTML(item.id)}">Advance</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelectorAll("[data-advance-work]").forEach(button => {
    button.addEventListener("click", () => {
      advanceWorkItem(button.dataset.advanceWork);
      card.remove();
      renderLiveWorkQueuePanel();
    });
  });
}

function refreshLiveWorkQueuePanel() {
  document.querySelector("[data-live-work-queue-panel]")?.remove();
  renderLiveWorkQueuePanel();
}

const observer = new MutationObserver(() => renderLiveWorkQueuePanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderLiveWorkQueuePanel();
});
window.addEventListener("kairos:auth", renderLiveWorkQueuePanel);
window.addEventListener("kairos:work-queue-updated", refreshLiveWorkQueuePanel);
