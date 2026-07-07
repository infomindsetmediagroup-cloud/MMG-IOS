import { buildActivityTimeline } from "./activity-timeline.js";

function badgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (["saved", "success", "complete", "active"].includes(normalized)) return "badge good";
  if (["warning", "queued", "next", "pending", "info", "standby"].includes(normalized)) return "badge warning";
  if (["danger", "fail", "error", "rejected"].includes(normalized)) return "badge danger";
  return "badge";
}

function renderActivityTimelinePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-activity-timeline-panel]")) return;

  const events = buildActivityTimeline();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.activityTimelinePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Timeline</p>
        <h3>Activity Timeline</h3>
      </div>
      <span class="badge good">${events.length}</span>
    </div>
    <div class="list">
      ${(events.length ? events : [{ title: "No activity yet", detail: "Kairos timeline is waiting for runtime events.", type: "Timeline", status: "Standby", createdAt: "Runtime" }]).map(item => `
        <div class="list-item">
          <div>
            <strong>${item.title}</strong>
            <p class="muted">${item.type} • ${item.detail} • ${item.createdAt}</p>
          </div>
          <span class="${badgeClass(item.status)}">${item.status}</span>
        </div>
      `).join("")}
    </div>
  `;
  view.appendChild(card);
}

const observer = new MutationObserver(() => renderActivityTimelinePanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderActivityTimelinePanel();
});

window.addEventListener("kairos:auth", renderActivityTimelinePanel);
