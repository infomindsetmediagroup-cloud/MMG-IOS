import { getLiveWorkQueue, moveWorkItem, setWorkItemPriority } from "./live-work-queue.js";
import { getWorkforceAgents, orchestrateWorkforce } from "./ai-workforce-orchestrator.js";
import { dependencyMetrics, getDependencyGraph } from "./task-dependency-graph.js";
import { createExecutionRun } from "./execution-orchestrator.js";
import { recordExecutionHistory } from "./execution-history.js";
import { pushNotification } from "./notifications.js";

const schedulerKey = "kairos.agent.scheduler.v1";

function readSchedule() {
  try {
    return JSON.parse(localStorage.getItem(schedulerKey) || "null") || { dispatches: [] };
  } catch {
    return { dispatches: [] };
  }
}

function writeSchedule(state) {
  localStorage.setItem(schedulerKey, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("kairos:agent-scheduler-updated", { detail: { dispatches: state.dispatches.length } }));
  return state;
}

function scoreWork(item, graph) {
  const priorityScore = item.priority === "High" ? 50 : item.priority === "Medium" ? 25 : 10;
  const progressScore = Math.max(0, 30 - Number(item.progress || 0));
  const dependencyPenalty = graph.edges.some(edge => edge.to === item.id && edge.waiting) ? -40 : 0;
  const approvalPenalty = item.status === "Ready for Approval" ? -15 : 0;
  return priorityScore + progressScore + dependencyPenalty + approvalPenalty;
}

function agentForLane(lane) {
  const agents = getWorkforceAgents();
  const text = String(lane || "").toLowerCase();
  if (text.includes("website")) return agents.find(agent => agent.lane === "Website") || agents[0];
  if (text.includes("shopify") || text.includes("commerce")) return agents.find(agent => agent.lane === "Shopify") || agents[0];
  if (text.includes("content")) return agents.find(agent => agent.lane === "Content") || agents[0];
  if (text.includes("quality")) return agents.find(agent => agent.lane === "Quality") || agents[0];
  return agents.find(agent => agent.lane === "Operations") || agents[0];
}

export function buildAgentDispatchPlan(limit = 8) {
  const graph = getDependencyGraph();
  return getLiveWorkQueue()
    .filter(item => item.status !== "Complete")
    .map(item => ({ ...item, score: scoreWork(item, graph), agent: agentForLane(item.lane) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item, index) => ({
      id: "DISPATCH-" + item.id.replace(/[^0-9]/g, ""),
      workId: item.id,
      title: item.title,
      lane: item.lane,
      score: item.score,
      priority: item.priority,
      agentId: item.agent.id,
      agentName: item.agent.name,
      sequence: index + 1,
      status: item.score < 0 ? "Waiting" : "Ready",
      createdAt: new Date().toLocaleString()
    }));
}

export function runAgentScheduler() {
  const plan = buildAgentDispatchPlan();
  plan.filter(item => item.status === "Ready").slice(0, 3).forEach(item => {
    setWorkItemPriority(item.workId, item.priority === "High" ? "High" : "Medium");
    moveWorkItem(item.workId, "up");
  });
  orchestrateWorkforce(6);
  const run = createExecutionRun("Agent Scheduler dispatch");
  const state = readSchedule();
  writeSchedule({ dispatches: [{ id: "SCHED-" + String(Date.now()).slice(-6), runId: run.id, createdAt: new Date().toLocaleString(), plan }, ...state.dispatches].slice(0, 20) });
  recordExecutionHistory("Agent scheduler dispatch", plan.length + " items scored for " + run.id, "Dispatched");
  pushNotification("Agent scheduler complete", plan.length + " work items scored and dispatched.", "Success");
  return plan;
}

export function getAgentDispatches() {
  return readSchedule().dispatches;
}

export function schedulerMetrics() {
  const dispatches = getAgentDispatches();
  const latest = dispatches[0]?.plan || [];
  const dependencies = dependencyMetrics();
  return {
    dispatches: dispatches.length,
    latest: latest.length,
    ready: latest.filter(item => item.status === "Ready").length,
    waiting: latest.filter(item => item.status === "Waiting").length,
    dependencyWaiting: dependencies.waiting || dependencies.blocked || 0
  };
}
