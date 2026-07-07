import { getActionLog } from "./runtime-actions.js";
import { getNotifications } from "./notifications.js";
import { getRuntimeStore } from "./runtime-store.js";
import { getTasks } from "./task-board.js";
import { getApprovals } from "./approval-center.js";

export function buildExportPayload() {
  return {
    exportedAt: new Date().toISOString(),
    app: "Kairos Operations Dashboard",
    version: "Phase 1",
    runtime: getRuntimeStore(),
    actions: getActionLog(),
    notifications: getNotifications(),
    tasks: getTasks(),
    approvals: getApprovals()
  };
}

export function downloadRuntimeExport() {
  const payload = buildExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `kairos-runtime-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return payload;
}
