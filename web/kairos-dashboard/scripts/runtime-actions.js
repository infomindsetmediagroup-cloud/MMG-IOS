import { createRuntimeSnapshot, queueApproval } from "./runtime-store.js";
import { pushNotification } from "./notifications.js";

const storageKey = "kairos.action.log.v1";

export function getActionLog() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    return [];
  }
}

export function recordAction(action, detail = "Queued from dashboard") {
  const event = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    action,
    detail,
    status: "Queued",
    createdAt: new Date().toLocaleString()
  };
  const next = [event, ...getActionLog()].slice(0, 20);
  localStorage.setItem(storageKey, JSON.stringify(next));
  pushNotification(action, detail, "Info");

  if (action.toLowerCase().includes("approve")) {
    queueApproval(action, "Dashboard Command");
    pushNotification("Approval queued", action, "Warning");
  }

  if (action.toLowerCase().includes("golden master") || action.toLowerCase().includes("snapshot")) {
    createRuntimeSnapshot(action, { detail, status: event.status });
    pushNotification("Runtime snapshot saved", action, "Success");
  }

  return event;
}

export function updateActionStatus(id, status) {
  const next = getActionLog().map(item => item.id === id ? { ...item, status } : item);
  localStorage.setItem(storageKey, JSON.stringify(next));
  pushNotification("Action status updated", status, "Info");
  return next;
}

export function clearActionLog() {
  localStorage.removeItem(storageKey);
  pushNotification("Command log cleared", "Runtime action history cleared from this browser.", "Warning");
}
