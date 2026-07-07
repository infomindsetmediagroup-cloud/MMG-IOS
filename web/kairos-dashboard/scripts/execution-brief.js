import { calculateReadinessScore, readinessStatus } from "./readiness-score.js";
import { buildNextActions } from "./next-actions.js";
import { buildActivityTimeline } from "./activity-timeline.js";
import { commandHistoryMetrics } from "./command-history.js";
import { routineBoardMetrics } from "./routine-board.js";
import { taskMetrics } from "./task-board.js";

export function buildExecutionBrief() {
  const readiness = calculateReadinessScore();
  const actions = buildNextActions();
  const timeline = buildActivityTimeline();
  const commands = commandHistoryMetrics();
  const routines = routineBoardMetrics();
  const tasks = taskMetrics();

  return {
    title: "Kairos Execution Brief",
    status: readinessStatus(readiness.score),
    score: readiness.score,
    generatedAt: new Date().toLocaleString(),
    summary: [
      `${readiness.score}% operational readiness`,
      `${actions.length} next actions identified`,
      `${commands.total} command records`,
      `${routines.total} cadence items`,
      `${tasks.active} active tasks`
    ],
    nextActions: actions.slice(0, 5),
    timeline: timeline.slice(0, 5)
  };
}
