import { getLiveWorkQueue } from "./live-work-queue.js";

export function getDependencyGraph() {
  const items = getLiveWorkQueue();
  const ids = new Set(items.map(item => item.id));
  const nodes = items.map(item => ({
    id: item.id,
    title: item.title,
    status: item.status,
    priority: item.priority,
    lane: item.lane
  }));
  const edges = items
    .filter(item => item.dependency && item.dependency !== "None")
    .map(item => ({ from: item.dependency, to: item.id, valid: ids.has(item.dependency) }));
  return { nodes, edges };
}

export function dependencyMetrics() {
  const graph = getDependencyGraph();
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    blocked: graph.edges.filter(edge => edge.valid).length,
    missing: graph.edges.filter(edge => !edge.valid).length
  };
}

export function dependentTasksFor(id) {
  const graph = getDependencyGraph();
  return graph.edges.filter(edge => edge.from === id).map(edge => edge.to);
}
