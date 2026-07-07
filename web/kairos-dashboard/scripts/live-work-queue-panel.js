import { advanceWorkItem, filterLiveWorkQueue, liveWorkMetrics, moveWorkItem, setWorkItemPriority, updateWorkItemProgress } from "./live-work-queue.js";

const panelState = { status: "All", query: "" };

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

function renderProgress(value) {
  const progress = Math.max(0, Math.min(100, Number(value || 0)));
  return `<div class="progress-shell"><div class="progress-bar" style="width:${progress}%"></div></div>`;
}

function renderLiveWorkQueuePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-live-work-queue-panel]")) return;

  const items = filterLiveWorkQueue(panelState);
  const metrics = liveWorkMetrics();
  const statuses = ["All", "Queued", "Active", "Ready for Approval", "Complete"];
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.liveWorkQueuePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div><p class="eyebrow">Execution</p><h3>Live Work Queue</h3></div>
      <span class="badge warning">${metrics.high} High Priority</span>
    </div>
    <section class="kpi-grid" style="margin-top:16px;">
      <article class="card kpi-card"><div class="card-header"><h3>Total</h3><span class="badge">Queue</span></div><p class="metric">${metrics.total}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Queued</h3><span class="badge">Intake</span></div><p class="metric">${metrics.queued}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Approval</h3><span class="badge warning">Review</span></div><p class="metric">${metrics.approval}</p></article>
      <article class="card kpi-card"><div class="card-header"><h3>Complete</h3><span class="badge good">Done</span></div><p class="metric">${metrics.complete}</p></article>
    </section>
    <div class="queue-toolbar" style="margin-top:16px;">
      <input data-work-search placeholder="Search queue, dependency, lane, priority..." value="${escapeHTML(panelState.query)}">
      <div class="queue-filters">
        ${statuses.map(status => `<button class="action-button ${panelState.status === status ? "is-active" : ""}" data-work-filter="${status}" type="button">${status}</button>`).join("")}
      </div>
    </div>
    <div class="list" style="margin-top:16px;">
      ${(items.length ? items : [{ id: "EMPTY", title: "No matching work items", lane: "Queue", type: "Filter", impact: "Adjust search or status filter.", status: "Standby", priority: "Normal", progress: 0, due: "None", dependency: "None" }]).map(item => `
        <div class="list-item work-queue-item">
          <div>
            <strong>${escapeHTML(item.id)} • ${escapeHTML(item.title)}</strong>
            <p class="muted">${escapeHTML(item.lane)} • ${escapeHTML(item.type)} • Due: ${escapeHTML(item.due)} • Dependency: ${escapeHTML(item.dependency)}</p>
            <p class="muted">${escapeHTML(item.impact)}</p>
            ${renderProgress(item.progress)}
          </div>
          <div class="action-row work-queue-actions" style="margin-top:0;">
            <span class="${priorityClass(item.priority)}">${escapeHTML(item.priority || "Normal")}</span>
            <span class="${badgeClass(item.status)}">${escapeHTML(item.status)}</span>
            ${item.id === "EMPTY" ? "" : `
              <button class="action-button" data-move-work="up" data-work-id="${escapeHTML(item.id)}" type="button">Up</button>
              <button class="action-button" data-move-work="down" data-work-id="${escapeHTML(item.id)}" type="button">Down</button>
              <button class="action-button" data-priority-work="High" data-work-id="${escapeHTML(item.id)}" type="button">High</button>
              <button class="action-button" data-progress-work="20" data-work-id="${escapeHTML(item.id)}" type="button">+20%</button>
              <button class="action-button" data-advance-work="${escapeHTML(item.id)}" type="button">Advance</button>
            `}
          </div>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelector("[data-work-search]").addEventListener("input", event => {
    panelState.query = event.target.value;
    refreshLiveWorkQueuePanel();
  });

  card.querySelectorAll("[data-work-filter]").forEach(button => {
    button.addEventListener("click", () => {
      panelState.status = button.dataset.workFilter;
      refreshLiveWorkQueuePanel();
    });
  });

  card.querySelectorAll("[data-advance-work]").forEach(button => {
    button.addEventListener("click", () => {
      advanceWorkItem(button.dataset.advanceWork);
      refreshLiveWorkQueuePanel();
    });
  });

  card.querySelectorAll("[data-priority-work]").forEach(button => {
    button.addEventListener("click", () => {
      setWorkItemPriority(button.dataset.workId, button.dataset.priorityWork);
      refreshLiveWorkQueuePanel();
    });
  });

  card.querySelectorAll("[data-progress-work]").forEach(button => {
    button.addEventListener("click", () => {
      updateWorkItemProgress(button.dataset.workId, Number(button.dataset.progressWork));
      refreshLiveWorkQueuePanel();
    });
  });

  card.querySelectorAll("[data-move-work]").forEach(button => {
    button.addEventListener("click", () => {
      moveWorkItem(button.dataset.workId, button.dataset.moveWork);
      refreshLiveWorkQueuePanel();
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
