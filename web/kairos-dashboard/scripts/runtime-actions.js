import { createRuntimeSnapshot, queueApproval } from "./runtime-store.js";

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

  if (action.toLowerCase().includes("approve")) {
    queueApproval(action, "Dashboard Command");
  }

  if (action.toLowerCase().includes("golden master") || action.toLowerCase().includes("snapshot")) {
    createRuntimeSnapshot(action, { detail, status: event.status });
  }

  return event;
}

export function updateActionStatus(id, status) {
  const next = getActionLog().map(item => item.id === id ? { ...item, status } : item);
  localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}

export function clearActionLog() {
  localStorage.removeItem(storageKey);
}
