import { getRuntimeStore } from "./runtime-store.js";
import { kairosState } from "./state.js";

const requiredOperationSources = ["Kairos Priority", "Website Ops", "Shopify Ops"];

export function getExecutionReadiness() {
  const store = getRuntimeStore();
  const pipeline = store.executionPipeline || [];
  const sourceSet = new Set(pipeline.map(item => item.source));
  const seededSources = requiredOperationSources.filter(source => sourceSet.has(source));
  const completed = pipeline.filter(item => item.status === "Completed").length;
  const active = pipeline.filter(item => item.status === "In Progress").length;
  const ready = pipeline.filter(item => item.status === "Ready").length;
  const queued = pipeline.filter(item => item.status === "Queued").length;
  const hasPriorityCoverage = kairosState.priorities.every(priority => pipeline.some(item => item.title === priority.title));

  return {
    ready: pipeline.length > 0 && seededSources.length === requiredOperationSources.length && hasPriorityCoverage,
    total: pipeline.length,
    completed,
    active,
    readyCount: ready,
    queued,
    seededSources,
    missingSources: requiredOperationSources.filter(source => !sourceSet.has(source)),
    hasPriorityCoverage,
    next: pipeline.length === 0
      ? "Seed all operations before final validation."
      : seededSources.length < requiredOperationSources.length
        ? "Seed remaining operation sources."
        : hasPriorityCoverage
          ? "Advance active work toward Ready and Completed."
          : "Seed Kairos priorities into the execution pipeline.",
    updated: new Date().toLocaleString()
  };
}
