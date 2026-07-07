import { getLiveWorkQueue } from "./live-work-queue.js";
import { recordExecutionHistory } from "./execution-history.js";
import { pushNotification } from "./notifications.js";

const graphKey = "kairos.task.dependency.graph.v1";

function readOverrides() {
  try {
    return JSON.parse(localStorage.getItem(graphKey) || "null") || { edges: [] };
  } catch {
    return { edges: [] };
  }
}

function writeOverrides(state) {
  localStorage.setItem(graphKey, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("kairos:dependency-graph-updated", { detail: { edges: state.edges.length } }));
  return state;
}

function baseEdges(items) {
  return items
    .filter(item => item.dependency && item.dependency !== "None")
    .map(item => ({ from: item.dependency, to: item.id, source: "work-item", createdAt: item.updatedAt || item.createdAt || "Seed" }));
}

function uniqueEdges(edges) {
  const seen = new Set();
  return edges.filter(edge => {
    const key = edge.from + "->" + edge.to;
    if (seen.has(key) || edge.from === edge.to) return false;
    seen.add(key);
    return true;
  });
}

export function getDependencyGraph() {
  const items = getLiveWorkQueue();
  const ids = new Set(items.map(item => item.id));
  const nodes = items.map(item => ({
    id: item.id,
    title: item.title,
    status: item.status,
    priority: item.priority,
    lane: item.lane,
    progress: item.progress || 0
  }));
  const overrideEdges = readOverrides().edges || [];
  const edges = uniqueEdges([...baseEdges(items), ...overrideEdges]).map(edge => {
    const sourceItem = items.find(item => item.id === edge.from);
    return {
      ...edge,
      valid: ids.has(edge.from) && ids.has(edge.to),
      waiting: sourceItem ? sourceItem.status !== "Complete" : true
    };
  });
  return { nodes, edges };
}

export function addDependency(from, to) {
  if (!from || !to || from === to) return null;
  const state = readOverrides();
  const edge = { from, to, source: "operator", createdAt: new Date().toLocaleString() };
  writeOverrides({ edges: uniqueEdges([edge, ...(state.edges || [])]) });
  recordExecutionHistory("Dependency added", from + " before " + to, "Logged");
  pushNotification("Dependency added", from + " → " + to, "Success");
  return edge;
}

export function removeDependency(from, to) {
  const state = readOverrides();
  const next = (state.edges || []).filter(edge => !(edge.from === from && edge.to === to));
  writeOverrides({ edges: next });
  recordExecutionHistory("Dependency removed", from + " cleared for " + to, "Logged");
  pushNotification("Dependency removed", from + " → " + to, "Info");
  return next;
}

export function dependencyMetrics() {
  const graph = getDependencyGraph();
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    waiting: graph.edges.filter(edge => edge.valid && edge.waiting).length,
    ready: graph.edges.filter(edge => edge.valid && !edge.waiting).length,
    missing: graph.edges.filter(edge => !edge.valid).length,
    blocked: graph.edges.filter(edge => edge.valid && edge.waiting).length
  };
}

export function dependentTasksFor(id) {
  const graph = getDependencyGraph();
  return graph.edges.filter(edge => edge.from === id).map(edge => edge.to);
}

export function prerequisitesFor(id) {
  const graph = getDependencyGraph();
  return graph.edges.filter(edge => edge.to === id).map(edge => edge.from);
}
