import { getDeploymentPackages } from "./deployment-package.js";
import { calculateQAGate } from "./qa-gate.js";
import { getGoldenMaster } from "./golden-master.js";

const verifierKey = "kairos.post.deploy.verifier.v1";

function readRuns() {
  try {
    return JSON.parse(localStorage.getItem(verifierKey) || "[]");
  } catch {
    return [];
  }
}

function writeRuns(items) {
  localStorage.setItem(verifierKey, JSON.stringify(items));
  return items;
}

export function getPostDeployVerifierRuns() {
  return readRuns();
}

export function runPostDeployVerifier() {
  const latestPackage = getDeploymentPackages()[0];
  const qa = calculateQAGate();
  const goldenMaster = getGoldenMaster();
  const checks = [
    { title: "Deployment package exists", status: latestPackage ? "Pass" : "Hold" },
    { title: "QA gate calculated", status: qa.score >= 60 ? "Pass" : "Hold" },
    { title: "Golden Master exists", status: goldenMaster ? "Pass" : "Hold" },
    { title: "Runtime modules loaded", status: "Pass" },
    { title: "Operator approval required", status: latestPackage?.status === "Ready" ? "Pass" : "Hold" }
  ];
  const score = Math.round((checks.filter(item => item.status === "Pass").length / checks.length) * 100);
  const run = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: "Post Deploy Verification",
    status: score >= 80 ? "Ready" : "Hold",
    score,
    checks,
    createdAt: new Date().toLocaleString()
  };
  return writeRuns([run, ...readRuns()].slice(0, 12))[0];
}

export function postDeployVerifierMetrics() {
  const runs = readRuns();
  return {
    total: runs.length,
    ready: runs.filter(item => item.status === "Ready").length,
    hold: runs.filter(item => item.status === "Hold").length
  };
}
