import { getActionLog } from "./runtime-actions.js";
import { getNotifications } from "./notifications.js";
import { getTasks } from "./task-board.js";
import { getRuntimeStore } from "./runtime-store.js";

export function buildActivityTimeline() {
  const actions = getActionLog().map(item => ({
    title: item.action,
    detail: item.detail,
    type: "Action",
    status: item.status,
    createdAt: item.createdAt
  }));

  const notifications = getNotifications().map(item => ({
    title: item.title,
    detail: item.body,
    type: "Notification",
    status: item.level,
    createdAt: item.createdAt
  }));

  const tasks = getTasks().map(item => ({
    title: item.title,
    detail: `${item.lane} • ${item.priority}`,
    type: "Task",
    status: item.status,
    createdAt: item.updatedAt || "Seeded"
  }));

  const snapshots = (getRuntimeStore().snapshots || []).map(item => ({
    title: item.label,
    detail: "Runtime snapshot",
    type: "Snapshot",
    status: "Saved",
    createdAt: item.createdAt
  }));

  return [...actions, ...notifications, ...tasks, ...snapshots]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 24);
}
