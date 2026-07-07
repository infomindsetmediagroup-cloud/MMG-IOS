import { getOfflineQueue, queueOfflineCommand, replayOfflineQueue, clearOfflineQueue } from "./offline-queue.js";

function badgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "replayed") return "badge good";
  if (normalized === "pending") return "badge warning";
  return "badge";
}

function renderOfflineQueuePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-offline-queue-panel]")) return;

  const queue = getOfflineQueue();
  const pending = queue.filter(item => item.status !== "Replayed").length;
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.offlineQueuePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Offline</p>
        <h3>Offline Command Queue</h3>
      </div>
      <span class="badge warning">${pending} Pending</span>
    </div>
    <div class="action-row">
      <button class="action-button" data-queue-offline>Queue Test Command</button>
      <button class="action-button" data-replay-offline>Replay Queue</button>
      <button class="action-button" data-clear-offline>Clear Queue</button>
    </div>
    <div class="list" style="margin-top:16px;">
      ${(queue.length ? queue : [{ title: "No offline commands", detail: "Commands queued offline will appear here.", status: "Standby", createdAt: "Runtime" }]).map(item => `
        <div class="list-item">
          <div>
            <strong>${item.title}</strong>
            <p class="muted">${item.detail} • ${item.createdAt}</p>
          </div>
          <span class="${badgeClass(item.status)}">${item.status}</span>
        </div>
      `).join("")}
    </div>
  `;
  view.appendChild(card);

  card.querySelector("[data-queue-offline]").addEventListener("click", () => {
    queueOfflineCommand("Offline Test Command", "Queued from Offline Command Queue panel.");
    card.remove();
    renderOfflineQueuePanel();
  });

  card.querySelector("[data-replay-offline]").addEventListener("click", () => {
    replayOfflineQueue();
    card.remove();
    renderOfflineQueuePanel();
  });

  card.querySelector("[data-clear-offline]").addEventListener("click", () => {
    clearOfflineQueue();
    card.remove();
    renderOfflineQueuePanel();
  });
}

const observer = new MutationObserver(() => renderOfflineQueuePanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderOfflineQueuePanel();
});

window.addEventListener("kairos:auth", renderOfflineQueuePanel);
