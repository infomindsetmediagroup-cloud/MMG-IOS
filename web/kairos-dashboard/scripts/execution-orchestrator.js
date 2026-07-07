import { getLiveWorkQueue, queueCommandWorkItem } from "./live-work-queue.js";
import { pushNotification } from "./notifications.js";

const orchestratorKey = "kairos.execution.orchestrator.v1";

function readState() {
  try {
    return JSON.parse(localStorage.getItem(orchestratorKey) || "null") || { runs: [] };
  } catch {
    return { runs: [] };
  }
}

function writeState(state) {
  localStorage.setItem(orchestratorKey, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("kairos:orchestrator-updated", { detail: { runs: state.runs.length } }));
  return state;
}

function readinessFor(item) {
  if (item.dependency && item.dependency !== "None") {
    const dependency = getLiveWorkQueue().find(candidate => candidate.id === item.dependency);
    if (dependency && dependency.status !== "Complete") return "Blocked";
  }
  if (item.status === "Complete") return "Complete";
  if (item.status === "Ready for Approval") return "Approval";
  return "Ready";
}

export function createExecutionRun(label = "Command Center execution run") {
  const items = getLiveWorkQueue();
  const run = {
    id: "RUN-" + String(Date.now()).slice(-6),
    label,
    createdAt: new Date().toLocaleString(),
    status: "Planned",
    items: items.slice(0, 8).map(item => ({ id: item.id, title: item.title, lane: item.lane, readiness: readinessFor(item) }))
  };
  const state = readState();
  writeState({ ...state, runs: [run, ...state.runs].slice(0, 12) });
  pushNotification("Execution run created", run.id + " staged from current work queue.", "Success");
  return run;
}

export function queueOrchestratedCommand(command) {
  const item = queueCommandWorkItem(command, { source: "Execution Orchestrator" });
  createExecutionRun("Run for " + item.id);
  return item;
}

export function getExecutionRuns() {
  return readState().runs;
}

export function orchestratorMetrics() {
  const runs = getExecutionRuns();
  const latest = runs[0];
  return {
    totalRuns: runs.length,
    latestStatus: latest?.status || "Standby",
    readyItems: latest?.items?.filter(item => item.readiness === "Ready").length || 0,
    blockedItems: latest?.items?.filter(item => item.readiness === "Blocked").length || 0
  };
}
