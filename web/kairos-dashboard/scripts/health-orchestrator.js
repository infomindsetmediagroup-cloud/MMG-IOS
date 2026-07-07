import { diagnosticsMetrics } from "./diagnostics.js";
import { panelRegistryMetrics } from "./panel-registry.js";
import { taskMetrics } from "./task-board.js";
import { getActionLog } from "./runtime-actions.js";
import { getNotifications } from "./notifications.js";
import { getRuntimeStore } from "./runtime-store.js";

const healthKey = "kairos.health.orchestrator.v1";

export function calculateSystemHealth() {
  const diagnostics = diagnosticsMetrics();
  const registry = panelRegistryMetrics();
  const tasks = taskMetrics();
  const actions = getActionLog();
  const notifications = getNotifications();
  const store = getRuntimeStore();

  const diagnosticScore = diagnostics.total ? Math.round((diagnostics.passed / diagnostics.total) * 100) : 0;
  const registryScore = registry.total ? Math.round((registry.active / registry.total) * 100) : 0;
  const taskScore = tasks.total ? Math.round(((tasks.active + tasks.complete) / tasks.total) * 100) : 0;
  const continuityScore = store.lastSavedAt || (store.snapshots || []).length ? 100 : 60;
  const commandScore = actions.length ? 100 : 70;
  const notificationScore = notifications.length ? 100 : 70;

  const score = Math.round((diagnosticScore + registryScore + taskScore + continuityScore + commandScore + notificationScore) / 6);

  return {
    score,
    diagnosticScore,
    registryScore,
    taskScore,
    continuityScore,
    commandScore,
    notificationScore,
    createdAt: new Date().toLocaleString()
  };
}

export function saveSystemHealth() {
  const health = calculateSystemHealth();
  localStorage.setItem(healthKey, JSON.stringify(health));
  return health;
}

export function getSavedSystemHealth() {
  try {
    return JSON.parse(localStorage.getItem(healthKey) || "null");
  } catch {
    return null;
  }
}
