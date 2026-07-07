import { getDeploymentPackages } from "./deployment-package.js";
import { getPostDeployVerifierRuns } from "./post-deploy-verifier.js";
import { getGoldenMaster } from "./golden-master.js";

const rollbackKey = "kairos.rollback.center.v1";

function readRollbacks() {
  try {
    return JSON.parse(localStorage.getItem(rollbackKey) || "[]");
  } catch {
    return [];
  }
}

function writeRollbacks(items) {
  localStorage.setItem(rollbackKey, JSON.stringify(items));
  return items;
}

export function getRollbackPlans() {
  return readRollbacks();
}

export function createRollbackPlan() {
  const deployment = getDeploymentPackages()[0];
  const verifier = getPostDeployVerifierRuns()[0];
  const golden = getGoldenMaster();
  const plan = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: "Kairos Rollback Plan",
    status: golden ? "Ready" : "Hold",
    deploymentStatus: deployment?.status || "No Package",
    verifierStatus: verifier?.status || "Not Verified",
    baselineStatus: golden ? "Golden Master Available" : "Missing Baseline",
    steps: [
      "Pause new production changes.",
      "Restore previous approved dashboard baseline.",
      "Verify module loading and runtime panels.",
      "Re-run QA gate and post-deploy verifier.",
      "Resume work queue after confirmation."
    ],
    createdAt: new Date().toLocaleString()
  };
  return writeRollbacks([plan, ...readRollbacks()].slice(0, 12))[0];
}

export function rollbackMetrics() {
  const items = readRollbacks();
  return {
    total: items.length,
    ready: items.filter(item => item.status === "Ready").length,
    hold: items.filter(item => item.status === "Hold").length
  };
}
