import { taskMetrics, getTasks } from "./task-board.js";
import { getApprovals } from "./approval-center.js";
import { calculateReadinessScore } from "./readiness-score.js";
import { getRoutineBoard } from "./routine-board.js";

export function buildNextActions() {
  const readiness = calculateReadinessScore();
  const tasks = getTasks();
  const approvals = getApprovals();
  const routines = getRoutineBoard();
  const metrics = taskMetrics();

  const actions = [];
  if (readiness.score < 75) actions.push({ title: "Raise operational readiness", detail: `Current readiness is ${readiness.score}%.`, priority: "P1", lane: "System" });
  if (metrics.next > 0) actions.push({ title: "Start next task batch", detail: `${metrics.next} tasks are marked Next.`, priority: "P1", lane: "Execution" });
  approvals.filter(item => item.status === "Pending").slice(0, 3).forEach(item => actions.push({ title: item.title, detail: "Pending human approval.", priority: "P1", lane: item.source }));
  routines.filter(item => item.status === "Ready").slice(0, 3).forEach(item => actions.push({ title: item.title, detail: `${item.cadence} cadence not checked.`, priority: "P2", lane: item.lane }));
  tasks.filter(item => item.status === "Queued").slice(0, 3).forEach(item => actions.push({ title: item.title, detail: "Queued backlog item.", priority: item.priority, lane: item.lane }));

  return actions.slice(0, 10);
}
