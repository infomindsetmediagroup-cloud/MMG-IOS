import { getTasks, moveTask, taskMetrics } from "./task-board.js";
import { pushNotification } from "./notifications.js";

function badgeClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["complete", "p1"].includes(normalized)) return "badge good";
  if (["next", "active", "queued", "p2"].includes(normalized)) return "badge warning";
  return "badge";
}

function renderTaskBoard() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-task-board]")) return;

  const tasks = getTasks();
  const metrics = taskMetrics();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.taskBoard = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Execution</p>
        <h3>Task Board</h3>
      </div>
      <span class="badge warning">${metrics.next} Next</span>
    </div>
    <div class="list">
      ${tasks.map(task => `
        <div class="list-item">
          <div>
            <strong>${task.title}</strong>
            <p class="muted">${task.id} • ${task.lane} • ${task.updatedAt || "Seeded"}</p>
          </div>
          <div class="action-row" style="margin-top:0;">
            <span class="${badgeClass(task.priority)}">${task.priority}</span>
            <span class="${badgeClass(task.status)}">${task.status}</span>
            <button class="action-button" data-task-active="${task.id}">Start</button>
            <button class="action-button" data-task-complete="${task.id}">Done</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelectorAll("[data-task-active]").forEach(button => {
    button.addEventListener("click", () => {
      moveTask(button.dataset.taskActive, "Active");
      pushNotification("Task started", button.dataset.taskActive, "Info");
      card.remove();
      renderTaskBoard();
    });
  });

  card.querySelectorAll("[data-task-complete]").forEach(button => {
    button.addEventListener("click", () => {
      moveTask(button.dataset.taskComplete, "Complete");
      pushNotification("Task completed", button.dataset.taskComplete, "Success");
      card.remove();
      renderTaskBoard();
    });
  });
}

const observer = new MutationObserver(() => renderTaskBoard());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderTaskBoard();
});

window.addEventListener("kairos:auth", renderTaskBoard);
