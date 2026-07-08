import { createRuntimeSnapshot, queueApproval, queueExecutionWork, setExecutionWorkStatus } from "./runtime-store.js";
import { pushNotification } from "./notifications.js";

const storageKey = "kairos.action.log.v1";
const maxActionLogItems = 20;
const validActionStatuses = ["Queued", "In Progress", "Ready", "Completed", "Blocked", "Failed"];

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

function normalizeActionStatus(status) {
  const value = String(status || "Queued");
  return validActionStatuses.includes(value) ? value : "Queued";
}

function normalizeActionEvent(item) {
  return {
    id: String(item?.id || makeId()),
    action: String(item?.action || "Untitled Action"),
    detail: String(item?.detail || "Queued from dashboard"),
    status: normalizeActionStatus(item?.status),
    createdAt: String(item?.createdAt || new Date().toLocaleString()),
    updatedAt: item?.updatedAt ? String(item.updatedAt) : null
  };
}

export function getActionLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeActionEvent).slice(0, maxActionLogItems);
  } catch {
    return [];
  }
}

function saveActionLog(items) {
  const normalized = Array.isArray(items) ? items.map(normalizeActionEvent).slice(0, maxActionLogItems) : [];
  localStorage.setItem(storageKey, JSON.stringify(normalized));
  return normalized;
}

function inferExecutionStatus(action) {
  const normalized = String(action || "").toLowerCase();
  if (normalized.includes("complete") || normalized.includes("release")) return "Completed";
  if (normalized.includes("approve") || normalized.includes("prepare") || normalized.includes("stage")) return "Ready";
  if (normalized.includes("run") || normalized.includes("build") || normalized.includes("create") || normalized.includes("generate") || normalized.includes("validate") || normalized.includes("check")) return "In Progress";
  return "Queued";
}

export function recordAction(action, detail = "Queued from dashboard") {
  const safeAction = String(action || "Untitled Action");
  const safeDetail = String(detail || "Queued from dashboard");
  const event = normalizeActionEvent({
    id: makeId(),
    action: safeAction,
    detail: safeDetail,
    status: inferExecutionStatus(safeAction),
    createdAt: new Date().toLocaleString()
  });
  const next = saveActionLog([event, ...getActionLog()]);
  pushNotification(event.action, event.detail, "Info");

  const work = queueExecutionWork(event.action, "Dashboard Command", event.detail);
  setExecutionWorkStatus(work.id, event.status);

  if (event.action.toLowerCase().includes("approve")) {
    queueApproval(event.action, "Dashboard Command");
    pushNotification("Approval queued", event.action, "Warning");
  }

  if (event.action.toLowerCase().includes("golden master") || event.action.toLowerCase().includes("snapshot")) {
    createRuntimeSnapshot(event.action, { detail: event.detail, status: event.status });
    pushNotification("Runtime snapshot saved", event.action, "Success");
  }

  return next[0];
}

export function updateActionStatus(id, status) {
  const safeId = String(id || "");
  const safeStatus = normalizeActionStatus(status);
  const next = saveActionLog(getActionLog().map(item => item.id === safeId ? { ...item, status: safeStatus, updatedAt: new Date().toLocaleString() } : item));
  pushNotification("Action status updated", safeStatus, "Info");
  return next;
}

export function clearActionLog() {
  localStorage.removeItem(storageKey);
  pushNotification("Command log cleared", "Runtime action history cleared from this browser.", "Warning");
}
