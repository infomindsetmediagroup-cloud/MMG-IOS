import { recordAction } from "./runtime-actions.js";
import { pushNotification } from "./notifications.js";
import { moveTask } from "./task-board.js";

const vaultKey = "kairos.vault.builder.runs.v1";

const vaultBlueprint = [
  { title: "Free Vault entry offer", status: "Ready", lane: "Lead Magnet" },
  { title: "AI Prompt Starter Pack", status: "Ready", lane: "Free Asset" },
  { title: "Creator Starter Kit", status: "Needs Setup", lane: "Free Asset" },
  { title: "Publishing Checklist", status: "Needs Setup", lane: "Free Asset" },
  { title: "Vault access rules", status: "Needs Setup", lane: "Entitlements" },
  { title: "Customer Portal handoff", status: "Needs Setup", lane: "Delivery" },
  { title: "Email capture destination", status: "Needs Setup", lane: "CRM" },
  { title: "Upgrade path to paid systems", status: "Needs Setup", lane: "Expansion" }
];

function readRuns() {
  try {
    return JSON.parse(localStorage.getItem(vaultKey) || "[]");
  } catch {
    return [];
  }
}

export function getVaultBuilderRuns() {
  return readRuns();
}

export function runVaultBuilder() {
  const score = Math.round((vaultBlueprint.filter(item => item.status === "Ready").length / vaultBlueprint.length) * 100);
  const run = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: "Free Vault Build",
    score,
    items: vaultBlueprint,
    createdAt: new Date().toLocaleString()
  };

  localStorage.setItem(vaultKey, JSON.stringify([run, ...readRuns()].slice(0, 10)));
  recordAction("Build Free Vault", `Free Vault build pass completed with ${score}% readiness.`);
  moveTask("TASK-003", "Active");
  moveTask("TASK-006", "Active");
  pushNotification("Free Vault build pass completed", `Free Vault readiness: ${score}%.`, score >= 80 ? "Success" : "Warning");
  return run;
}
