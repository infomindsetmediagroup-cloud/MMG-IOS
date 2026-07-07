import { getActionLog } from "./runtime-actions.js";
import { getPaletteHistory } from "./command-palette.js";
import { getOfflineQueue } from "./offline-queue.js";

export function buildCommandHistory() {
  const actions = getActionLog().map(item => ({
    title: item.action,
    detail: item.detail,
    source: "Action Log",
    status: item.status,
    createdAt: item.createdAt
  }));

  const palette = getPaletteHistory().map(item => ({
    title: item.command,
    detail: "Command Palette",
    source: "Palette",
    status: item.status,
    createdAt: item.createdAt
  }));

  const offline = getOfflineQueue().map(item => ({
    title: item.title,
    detail: item.detail,
    source: "Offline Queue",
    status: item.status,
    createdAt: item.createdAt
  }));

  return actions.concat(palette, offline).slice(0, 30);
}

export function commandHistoryMetrics() {
  const history = buildCommandHistory();
  return {
    total: history.length,
    waiting: history.filter(item => String(item.status).toLowerCase().includes("pending")).length,
    handled: history.filter(item => String(item.status).toLowerCase() !== "pending").length,
    sources: [...new Set(history.map(item => item.source))].length
  };
}
