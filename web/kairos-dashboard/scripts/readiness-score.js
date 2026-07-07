import { calculateSystemHealth } from "./health-orchestrator.js";
import { taskMetrics } from "./task-board.js";
import { panelRegistryMetrics } from "./panel-registry.js";
import { commandHistoryMetrics } from "./command-history.js";
import { routineBoardMetrics } from "./routine-board.js";

export function calculateReadinessScore() {
  const health = calculateSystemHealth();
  const tasks = taskMetrics();
  const panels = panelRegistryMetrics();
  const commands = commandHistoryMetrics();
  const routines = routineBoardMetrics();

  const panelScore = panels.total ? Math.round((panels.active / panels.total) * 100) : 0;
  const taskScore = tasks.total ? Math.round(((tasks.active + tasks.complete) / tasks.total) * 100) : 0;
  const commandScore = commands.total ? Math.min(100, 70 + commands.handled * 5) : 55;
  const routineScore = routines.total ? Math.round((routines.checked / routines.total) * 100) : 0;
  const score = Math.round((health.score + panelScore + taskScore + commandScore + routineScore) / 5);

  return {
    score,
    health: health.score,
    panels: panelScore,
    tasks: taskScore,
    commands: commandScore,
    routines: routineScore,
    createdAt: new Date().toLocaleString()
  };
}

export function readinessStatus(score) {
  if (score >= 90) return "Operational";
  if (score >= 75) return "Strong";
  if (score >= 60) return "Building";
  return "Early";
}
