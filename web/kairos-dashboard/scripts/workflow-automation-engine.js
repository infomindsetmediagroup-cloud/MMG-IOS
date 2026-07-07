import { advanceWorkItem, getLiveWorkQueue, setWorkItemPriority, updateWorkItemProgress } from "./live-work-queue.js";
import { requestApprovalForWork } from "./approval-workflow.js";
import { dependencyMetrics, getDependencyGraph } from "./task-dependency-graph.js";
import { runAgentScheduler } from "./agent-scheduler.js";
import { recordExecutionHistory } from "./execution-history.js";
import { pushNotification } from "./notifications.js";

const automationKey = "kairos.workflow.automation.v1";

const defaultRules = [
  { id: "AUTO-001", name: "Promote high-priority queued work", type: "promotion", enabled: true },
  { id: "AUTO-002", name: "Route ready work to approval", type: "approval", enabled: true },
  { id: "AUTO-003", name: "Advance low-risk active work", type: "progress", enabled: true },
  { id: "AUTO-004", name: "Dispatch scheduler when dependencies clear", type: "dispatch", enabled: true }
];

function readState() {
  try {
    return JSON.parse(localStorage.getItem(automationKey) || "null") || { rules: defaultRules, runs: [] };
  } catch {
    return { rules: defaultRules, runs: [] };
  }
}

function writeState(state) {
  localStorage.setItem(automationKey, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("kairos:workflow-automation-updated", { detail: { runs: state.runs.length } }));
  return state;
}

export function getAutomationRules() {
  const state = readState();
  return state.rules?.length ? state.rules : defaultRules;
}

export function toggleAutomationRule(id) {
  const state = readState();
  const rules = getAutomationRules().map(rule => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule);
  writeState({ ...state, rules });
  pushNotification("Automation rule updated", id, "Info");
  return rules;
}

function applyRule(rule, context) {
  if (!rule.enabled) return [];
  const events = [];

  if (rule.type === "promotion") {
    context.work.filter(item => item.priority === "High" && item.status === "Queued").slice(0, 2).forEach(item => {
      setWorkItemPriority(item.id, "High");
      advanceWorkItem(item.id);
      events.push(rule.id + " promoted " + item.id);
    });
  }

  if (rule.type === "approval") {
    context.work.filter(item => item.progress >= 80 || item.status === "Ready for Approval").slice(0, 3).forEach(item => {
      requestApprovalForWork(item.id);
      events.push(rule.id + " routed " + item.id + " to approval");
    });
  }

  if (rule.type === "progress") {
    context.work.filter(item => item.status === "Active" && item.priority !== "High").slice(0, 2).forEach(item => {
      updateWorkItemProgress(item.id, 10);
      events.push(rule.id + " progressed " + item.id);
    });
  }

  if (rule.type === "dispatch" && context.dependencies.waiting === 0) {
    runAgentScheduler();
    events.push(rule.id + " dispatched scheduler");
  }

  return events;
}

export function runWorkflowAutomation() {
  const state = readState();
  const context = {
    work: getLiveWorkQueue(),
    graph: getDependencyGraph(),
    dependencies: dependencyMetrics()
  };
  const events = getAutomationRules().flatMap(rule => applyRule(rule, context));
  const run = {
    id: "AUTO-RUN-" + String(Date.now()).slice(-6),
    createdAt: new Date().toLocaleString(),
    events,
    status: events.length ? "Executed" : "No Changes"
  };
  writeState({ ...state, runs: [run, ...(state.runs || [])].slice(0, 30) });
  recordExecutionHistory("Workflow automation run", run.id + " produced " + events.length + " events", run.status);
  pushNotification("Automation complete", events.length + " events processed.", events.length ? "Success" : "Info");
  return run;
}

export function getAutomationRuns() {
  return readState().runs || [];
}

export function automationMetrics() {
  const rules = getAutomationRules();
  const runs = getAutomationRuns();
  const latest = runs[0];
  return {
    rules: rules.length,
    enabled: rules.filter(rule => rule.enabled).length,
    runs: runs.length,
    latestEvents: latest?.events?.length || 0,
    latestStatus: latest?.status || "Standby"
  };
}
