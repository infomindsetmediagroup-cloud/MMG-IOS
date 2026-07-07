import { getDeploymentPackages } from "./deployment-package.js";
import { getPostDeployVerifierRuns } from "./post-deploy-verifier.js";
import { getRollbackPlans } from "./rollback-center.js";
import { buildNextActions } from "./next-actions.js";

const handoffKey = "kairos.operator.handoff.v1";

function readHandoffs() {
  try {
    return JSON.parse(localStorage.getItem(handoffKey) || "[]");
  } catch {
    return [];
  }
}

function writeHandoffs(items) {
  localStorage.setItem(handoffKey, JSON.stringify(items));
  return items;
}

export function getOperatorHandoffs() {
  return readHandoffs();
}

export function createOperatorHandoff() {
  const deployment = getDeploymentPackages()[0];
  const verifier = getPostDeployVerifierRuns()[0];
  const rollback = getRollbackPlans()[0];
  const nextActions = buildNextActions().slice(0, 5);
  const handoff = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: "Operator Handoff Package",
    status: deployment?.status === "Ready" && verifier?.status === "Ready" ? "Ready" : "Review",
    deploymentStatus: deployment?.status || "No Package",
    verifierStatus: verifier?.status || "Not Verified",
    rollbackStatus: rollback?.status || "No Rollback Plan",
    nextActions,
    createdAt: new Date().toLocaleString()
  };
  return writeHandoffs([handoff, ...readHandoffs()].slice(0, 12))[0];
}

export function operatorHandoffMetrics() {
  const items = readHandoffs();
  return {
    total: items.length,
    ready: items.filter(item => item.status === "Ready").length,
    review: items.filter(item => item.status === "Review").length
  };
}
