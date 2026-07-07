import { pushNotification } from "./notifications.js";
import { recordAction } from "./runtime-actions.js";

const offlineQueueKey = "kairos.offline.queue.v1";

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(offlineQueueKey) || "[]");
  } catch {
    return [];
  }
}

export function getOfflineQueue() {
  return readQueue();
}

export function queueOfflineCommand(title, detail = "Queued for later execution") {
  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title,
    detail,
    status: "Pending",
    createdAt: new Date().toLocaleString()
  };
  const next = [item, ...readQueue()].slice(0, 30);
  localStorage.setItem(offlineQueueKey, JSON.stringify(next));
  pushNotification("Offline command queued", title, "Info");
  return item;
}

export function replayOfflineQueue() {
  const queue = readQueue();
  const replayed = queue.filter(item => item.status !== "Replayed");
  replayed.forEach(item => recordAction(item.title, item.detail));
  const next = queue.map(item => ({ ...item, status: "Replayed", replayedAt: new Date().toLocaleString() }));
  localStorage.setItem(offlineQueueKey, JSON.stringify(next));
  pushNotification("Offline queue replayed", `${replayed.length} queued commands replayed.`, "Success");
  return next;
}

export function clearOfflineQueue() {
  localStorage.removeItem(offlineQueueKey);
  pushNotification("Offline queue cleared", "Queued offline commands cleared.", "Warning");
}
