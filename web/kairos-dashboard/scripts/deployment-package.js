import { calculateQAGate } from "./qa-gate.js";
import { buildLaunchReadinessBoard } from "./launch-readiness-board.js";
import { buildNextActions } from "./next-actions.js";

const deploymentKey = "kairos.deployment.packages.v1";

function readPackages() {
  try {
    return JSON.parse(localStorage.getItem(deploymentKey) || "[]");
  } catch {
    return [];
  }
}

function writePackages(items) {
  localStorage.setItem(deploymentKey, JSON.stringify(items));
  return items;
}

export function getDeploymentPackages() {
  return readPackages();
}

export function createDeploymentPackage() {
  const qa = calculateQAGate();
  const readiness = buildLaunchReadinessBoard();
  const nextActions = buildNextActions();
  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: "Kairos Deployment Package",
    status: qa.status === "Pass" ? "Ready" : "Hold",
    qaScore: qa.score,
    readiness,
    nextActions,
    createdAt: new Date().toLocaleString()
  };
  return writePackages([item, ...readPackages()].slice(0, 12))[0];
}

export function deploymentPackageMetrics() {
  const items = readPackages();
  return {
    total: items.length,
    ready: items.filter(item => item.status === "Ready").length,
    hold: items.filter(item => item.status === "Hold").length
  };
}
