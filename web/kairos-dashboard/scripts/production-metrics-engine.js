import { getLiveWorkQueue } from "./live-work-queue.js";
import { getAutomationRuns } from "./workflow-automation-engine.js";
import { getAgentDispatches } from "./agent-scheduler.js";
import { getExecutionHistory } from "./execution-history.js";
import { approvalMetrics } from "./approval-workflow.js";
import { dependencyMetrics } from "./task-dependency-graph.js";

const targets = { queue: 24, approval: 3, dependency: 2, active: 8 };

function ageHours(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.round((Date.now() - time) / 3600000));
}

export function getProductionMetrics() {
  const work = getLiveWorkQueue();
  const approvals = approvalMetrics();
  const dependencies = dependencyMetrics();
  const automationRuns = getAutomationRuns();
  const dispatches = getAgentDispatches();
  const history = getExecutionHistory();
  const active = work.filter(item => item.status === "Active");
  const complete = work.filter(item => item.status === "Complete");
  const queued = work.filter(item => item.status === "Queued");
  const oldestQueuedHours = queued.reduce((max, item) => Math.max(max, ageHours(item.createdAt)), 0);
  const throughput = complete.length + history.filter(item => ["Complete", "Approved", "Executed"].includes(item.status)).length;
  const pressure = active.length + queued.length + approvals.pending + dependencies.waiting;
  const issues = [];
  if (approvals.pending > targets.approval) issues.push("Approval backlog");
  if (dependencies.waiting > targets.dependency) issues.push("Dependency waiting");
  if (active.length > targets.active) issues.push("Active work load");
  if (oldestQueuedHours > targets.queue) issues.push("Queue latency");
  return {
    activeLoad: active.length,
    queuedLoad: queued.length,
    throughput,
    oldestQueuedHours,
    automationRunsCount: automationRuns.length,
    dispatchCount: dispatches.length,
    pressure,
    bottlenecks: issues,
    approvals,
    dependencies,
    health: Math.max(0, Math.min(100, 100 - pressure * 3 - issues.length * 8 + throughput)),
    updatedAt: new Date().toLocaleString()
  };
}

export function getSlaStatus() {
  const metrics = getProductionMetrics();
  return [
    { label: "Queue latency", value: metrics.oldestQueuedHours, target: targets.queue, unit: "h", status: metrics.oldestQueuedHours <= targets.queue ? "On Track" : "At Risk" },
    { label: "Approval backlog", value: metrics.approvals.pending, target: targets.approval, unit: "items", status: metrics.approvals.pending <= targets.approval ? "On Track" : "At Risk" },
    { label: "Dependency waiting", value: metrics.dependencies.waiting, target: targets.dependency, unit: "links", status: metrics.dependencies.waiting <= targets.dependency ? "On Track" : "At Risk" },
    { label: "Active load", value: metrics.activeLoad, target: targets.active, unit: "items", status: metrics.activeLoad <= targets.active ? "On Track" : "At Risk" }
  ];
}
