import { calculateSystemHealth } from "./health-orchestrator.js";
import { panelRegistryMetrics } from "./panel-registry.js";
import { taskMetrics } from "./task-board.js";
import { getActionLog } from "./runtime-actions.js";
import { getApprovals } from "./approval-center.js";
import { getGoldenMaster } from "./golden-master.js";

export function buildControlDeck() {
  const health = calculateSystemHealth();
  const registry = panelRegistryMetrics();
  const tasks = taskMetrics();
  const actions = getActionLog();
  const approvals = getApprovals();
  const goldenMaster = getGoldenMaster();

  return [
    { title: "System Health", value: `${health.score}%`, status: health.score >= 85 ? "Good" : "Watch" },
    { title: "Active Panels", value: `${registry.active}/${registry.total}`, status: "Good" },
    { title: "Active Tasks", value: tasks.active, status: tasks.active ? "Good" : "Watch" },
    { title: "Queued Commands", value: actions.filter(item => item.status === "Queued").length, status: actions.length ? "Good" : "Watch" },
    { title: "Pending Approvals", value: approvals.filter(item => item.status === "Pending").length, status: approvals.some(item => item.status === "Pending") ? "Watch" : "Good" },
    { title: "Golden Master", value: goldenMaster ? "Saved" : "Missing", status: goldenMaster ? "Good" : "Watch" }
  ];
}
