import { liveWorkMetrics } from "./live-work-queue.js";
import { approvalMetrics } from "./approval-workflow.js";
import { dependencyMetrics } from "./task-dependency-graph.js";
import { historyMetrics } from "./execution-history.js";
import { orchestratorMetrics } from "./execution-orchestrator.js";

export function getDashboardAnalytics() {
  const work = liveWorkMetrics();
  const approvals = approvalMetrics();
  const dependencies = dependencyMetrics();
  const history = historyMetrics();
  const orchestrator = orchestratorMetrics();
  const throughputBase = work.complete + approvals.approved + history.completed;
  return {
    work,
    approvals,
    dependencies,
    history,
    orchestrator,
    throughput: throughputBase,
    pressure: work.high + approvals.pending + dependencies.missing + orchestrator.blockedItems,
    updatedAt: new Date().toLocaleString()
  };
}

export function dashboardHealthScore() {
  const analytics = getDashboardAnalytics();
  return Math.max(0, Math.min(100, 100 - analytics.pressure * 7 + analytics.throughput * 2));
}
