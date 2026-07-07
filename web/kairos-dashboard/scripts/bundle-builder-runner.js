import { recordAction } from "./runtime-actions.js";
import { pushNotification } from "./notifications.js";
import { moveTask } from "./task-board.js";

const bundleKey = "kairos.bundle.builder.runs.v1";

const bundleBlueprint = [
  { title: "Bundle name and offer angle", status: "Ready", lane: "Offer" },
  { title: "Included digital products", status: "Ready", lane: "Products" },
  { title: "Bundle price and value stack", status: "Ready", lane: "Pricing" },
  { title: "Vault entitlement mapping", status: "Needs Setup", lane: "Access" },
  { title: "Product page copy", status: "Needs Setup", lane: "Content" },
  { title: "Checkout path", status: "Needs Setup", lane: "Commerce" },
  { title: "Post-purchase delivery path", status: "Needs Setup", lane: "Delivery" },
  { title: "Review and proof block", status: "Needs Setup", lane: "Trust" }
];

function readRuns() {
  try {
    return JSON.parse(localStorage.getItem(bundleKey) || "[]");
  } catch {
    return [];
  }
}

export function getBundleBuilderRuns() {
  return readRuns();
}

export function runBundleBuilder() {
  const score = Math.round((bundleBlueprint.filter(item => item.status === "Ready").length / bundleBlueprint.length) * 100);
  const run = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: "Creator Launch Bundle",
    score,
    items: bundleBlueprint,
    createdAt: new Date().toLocaleString()
  };

  localStorage.setItem(bundleKey, JSON.stringify([run, ...readRuns()].slice(0, 10)));
  recordAction("Package Next Bundle", `Creator Launch Bundle build pass completed with ${score}% readiness.`);
  moveTask("TASK-005", "Active");
  pushNotification("Bundle build pass completed", `Creator Launch Bundle readiness: ${score}%.`, score >= 80 ? "Success" : "Warning");
  return run;
}
