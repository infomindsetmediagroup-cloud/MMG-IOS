import { liveWorkMetrics } from "./live-work-queue.js";
import { approvalMetrics } from "./approval-workflow.js";
import { orchestratorMetrics } from "./execution-orchestrator.js";
import { dependencyMetrics } from "./task-dependency-graph.js";

export function getOperatorDashboardSnapshot() {
  const work = liveWorkMetrics();
  const approvals = approvalMetrics();
  const runs = orchestratorMetrics();
  const dependencies = dependencyMetrics();
  return {
    mode: "Build",
    work,
    approvals,
    runs,
    dependencies,
    health: Math.max(0, 100 - approvals.pending * 8 - dependencies.missing * 12 - runs.blockedItems * 6),
    updatedAt: new Date().toLocaleString()
  };
}

export function operatorPriorities() {
  const snapshot = getOperatorDashboardSnapshot();
  return [
    { label: "High Priority Work", value: snapshot.work.high, status: snapshot.work.high ? "Active" : "Clear" },
    { label: "Pending Approvals", value: snapshot.approvals.pending, status: snapshot.approvals.pending ? "Review" : "Clear" },
    { label: "Blocked Dependencies", value: snapshot.runs.blockedItems, status: snapshot.runs.blockedItems ? "Blocked" : "Clear" },
    { label: "Missing Links", value: snapshot.dependencies.missing, status: snapshot.dependencies.missing ? "Fix" : "Clear" }
  ];
}
