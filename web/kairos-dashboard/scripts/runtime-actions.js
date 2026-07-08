import { createRuntimeSnapshot, queueApproval, queueExecutionWork, advanceExecutionWork } from "./runtime-store.js";
import { pushNotification } from "./notifications.js";

const storageKey = "kairos.action.log.v1";

export function getActionLog() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    return [];
  }
}

function inferExecutionStatus(action) {
  const normalized = action.toLowerCase();
  if (normalized.includes("approve") || normalized.includes("prepare") || normalized.includes("stage")) return "Ready";
  if (normalized.includes("run") || normalized.includes("build") || normalized.includes("create") || normalized.includes("generate")) return "In Progress";
  if (normalized.includes("complete") || normalized.includes("release")) return "Completed";
  return "Queued";
}

export function recordAction(action, detail = "Queued from dashboard") {
  const event = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    action,
    detail,
    status: inferExecutionStatus(action),
    createdAt: new Date().toLocaleString()
  };
  const next = [event, ...getActionLog()].slice(0, 20);
  localStorage.setItem(storageKey, JSON.stringify(next));
  pushNotification(action, detail, "Info");

  const work = queueExecutionWork(action, "Dashboard Command", detail);
  if (event.status !== "Queued") {
    advanceExecutionWork(work.id);
  }

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
