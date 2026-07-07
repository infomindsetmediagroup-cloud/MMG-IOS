import { getActionLog } from "./runtime-actions.js";
import { getNotifications } from "./notifications.js";
import { getRuntimeStore } from "./runtime-store.js";

export function buildOperatorBriefing() {
  const actions = getActionLog();
  const notifications = getNotifications();
  const store = getRuntimeStore();

  const pendingApprovals = (store.approvals || []).filter(item => item.status !== "Approved").length;
  const snapshots = (store.snapshots || []).length;
  const queuedActions = actions.filter(item => item.status === "Queued").length;
  const warnings = notifications.filter(item => String(item.level).toLowerCase() === "warning").length;

  return {
    headline: "Kairos Phase 1 is online and expanding.",
    summary: "Command centers, local action logging, notifications, authentication shell, and persistent browser runtime are active.",
    metrics: [
      { title: "Queued Commands", value: queuedActions, status: queuedActions > 0 ? "Active" : "Standby" },
      { title: "Pending Approvals", value: pendingApprovals, status: pendingApprovals > 0 ? "Review" : "Clear" },
      { title: "Runtime Snapshots", value: snapshots, status: snapshots > 0 ? "Saved" : "Pending" },
      { title: "Warnings", value: warnings, status: warnings > 0 ? "Monitor" : "Clear" }
    ],
    nextMoves: [
      "Promote dashboard actions into server-backed workflows.",
      "Replace browser-only runtime with persistent database storage.",
      "Connect Shopify and Judge.me data sources after credential layer is ready.",
      "Create milestone validation batch without continuous workflow burn."
    ]
  };
}
