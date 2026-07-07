import { getNotifications, clearNotifications } from "./notifications.js";

function badgeClass(level) {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "success") return "badge good";
  if (normalized === "warning") return "badge warning";
  if (normalized === "danger") return "badge danger";
  return "badge";
}

function renderNotificationPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-notification-panel]")) return;

  const notifications = getNotifications();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.notificationPanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <h3>Notification Center</h3>
      <span class="badge warning">${notifications.length}</span>
    </div>
    <div class="list">
      ${(notifications.length ? notifications : [{ title: "No notifications", body: "Kairos has no current notices.", level: "Info", createdAt: "Runtime" }]).map(item => `
        <div class="list-item">
          <div>
            <strong>${item.title}</strong>
            <p class="muted">${item.body} • ${item.createdAt}</p>
          </div>
          <span class="${badgeClass(item.level)}">${item.level}</span>
        </div>
      `).join("")}
    </div>
    <div class="action-row">
      <button class="action-button" data-clear-notifications>Clear Notifications</button>
    </div>
  `;
  view.appendChild(card);

  card.querySelector("[data-clear-notifications]").addEventListener("click", () => {
    clearNotifications();
    card.remove();
    renderNotificationPanel();
  });
}

const observer = new MutationObserver(() => renderNotificationPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderNotificationPanel();
});

window.addEventListener("kairos:auth", renderNotificationPanel);
