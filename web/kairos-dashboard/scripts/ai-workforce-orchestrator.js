import { getLiveWorkQueue, moveWorkItem, setWorkItemPriority, updateWorkItemProgress } from "./live-work-queue.js";
import { createExecutionRun } from "./execution-orchestrator.js";
import { recordExecutionHistory } from "./execution-history.js";
import { pushNotification } from "./notifications.js";

const workforceKey = "kairos.ai.workforce.v1";

const agents = [
  { id: "agent-site", name: "Site Operator", lane: "Website", specialty: "UX, SEO, routing, site fixes" },
  { id: "agent-commerce", name: "Commerce Operator", lane: "Shopify", specialty: "Products, bundles, checkout readiness" },
  { id: "agent-content", name: "Content Operator", lane: "Content", specialty: "Knowledge Library, articles, marketing copy" },
  { id: "agent-quality", name: "Quality Operator", lane: "Quality", specialty: "QA, approval gates, release checks" },
  { id: "agent-ops", name: "Operations Operator", lane: "Operations", specialty: "General command intake and dependency cleanup" }
];

function readState() {
  try {
    return JSON.parse(localStorage.getItem(workforceKey) || "null") || { assignments: [] };
  } catch {
    return { assignments: [] };
  }
}

function writeState(state) {
  localStorage.setItem(workforceKey, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("kairos:ai-workforce-updated", { detail: { assignments: state.assignments.length } }));
  return state;
}

function agentFor(item) {
  const text = String(item.lane || item.type || "").toLowerCase();
  if (text.includes("website")) return agents[0];
  if (text.includes("shopify") || text.includes("commerce") || text.includes("product")) return agents[1];
  if (text.includes("content") || text.includes("knowledge")) return agents[2];
  if (text.includes("quality") || text.includes("qa") || text.includes("release")) return agents[3];
  return agents[4];
}

export function getWorkforceAgents() {
  return agents;
}

export function orchestrateWorkforce(limit = 6) {
  const work = getLiveWorkQueue()
    .filter(item => item.status !== "Complete")
    .slice(0, limit);
  const assignments = work.map((item, index) => {
    const agent = agentFor(item);
    return {
      id: "ASSIGN-" + item.id.replace(/[^0-9]/g, ""),
      workId: item.id,
      title: item.title,
      agentId: agent.id,
      agentName: agent.name,
      lane: item.lane,
      status: item.status === "Queued" ? "Assigned" : "In Progress",
      priority: item.priority,
      sequence: index + 1,
      createdAt: new Date().toLocaleString()
    };
  });
  writeState({ assignments });
  const run = createExecutionRun("AI Workforce orchestration");
  recordExecutionHistory("AI workforce orchestrated", assignments.length + " assignments linked to " + run.id, "Assigned");
  pushNotification("AI workforce orchestrated", assignments.length + " assignments created.", "Success");
  return assignments;
}

export function boostAssignment(workId) {
  setWorkItemPriority(workId, "High");
  moveWorkItem(workId, "up");
  recordExecutionHistory("Assignment boosted", workId + " moved up and marked high priority.", "Active");
  pushNotification("Assignment boosted", workId, "Info");
}

export function advanceAssignment(workId) {
  updateWorkItemProgress(workId, 25);
  recordExecutionHistory("Assignment advanced", workId + " progressed by AI workforce.", "Active");
  pushNotification("Assignment advanced", workId, "Success");
}

export function getWorkforceAssignments() {
  return readState().assignments;
}

export function workforceMetrics() {
  const assignments = getWorkforceAssignments();
  return {
    total: assignments.length,
    assigned: assignments.filter(item => item.status === "Assigned").length,
    active: assignments.filter(item => item.status === "In Progress").length,
    high: assignments.filter(item => item.priority === "High").length,
    agents: agents.length
  };
}
