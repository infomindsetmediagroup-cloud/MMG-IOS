import { getDeploymentReadiness } from "./deployment-readiness-engine.js";
import { getExecutionReadiness } from "./execution-readiness-engine.js";

export function getValidationChecklist() {
  const deployment = getDeploymentReadiness();
  const execution = getExecutionReadiness();
  const items = [
    { name: "Repository health", done: deployment.ready },
    { name: "Deployment readiness", done: deployment.ready },
    { name: "Execution pipeline seeded", done: execution.total > 0 },
    { name: "Kairos priorities covered", done: execution.hasPriorityCoverage },
    { name: "Website operations seeded", done: execution.seededSources.includes("Website Ops") },
    { name: "Shopify operations seeded", done: execution.seededSources.includes("Shopify Ops") },
    { name: "Operator review", done: execution.ready && deployment.ready }
  ];

  return {
    ready: deployment.ready && execution.ready,
    items,
    next: deployment.ready ? execution.next : deployment.next,
    updated: new Date().toLocaleString()
  };
}
