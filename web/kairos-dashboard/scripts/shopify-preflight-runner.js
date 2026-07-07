import { recordAction } from "./runtime-actions.js";
import { pushNotification } from "./notifications.js";
import { moveTask } from "./task-board.js";

const preflightKey = "kairos.shopify.preflight.runs.v1";

const preflightChecklist = [
  { title: "Judge.me star rating block mapped", severity: "Critical" },
  { title: "Full review widget placement mapped", severity: "Critical" },
  { title: "Creator Launch Bundle product schema prepared", severity: "High" },
  { title: "First-order discount code plan staged", severity: "High" },
  { title: "Free Vault lead capture destination mapped", severity: "High" },
  { title: "Product page offer sections normalized", severity: "Medium" },
  { title: "Checkout trust proof path mapped", severity: "Medium" },
  { title: "Post-purchase review request workflow queued", severity: "Medium" }
];

function readRuns() {
  try {
    return JSON.parse(localStorage.getItem(preflightKey) || "[]");
  } catch {
    return [];
  }
}

export function getShopifyPreflightRuns() {
  return readRuns();
}

export function runShopifyPreflight() {
  const completed = [
    "Creator Launch Bundle product schema prepared",
    "First-order discount code plan staged",
    "Product page offer sections normalized"
  ];

  const findings = preflightChecklist.map(item => ({
    ...item,
    status: completed.includes(item.title) ? "Ready" : "Needs Work"
  }));

  const score = Math.round((findings.filter(item => item.status === "Ready").length / findings.length) * 100);
  const run = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    score,
    findings,
    createdAt: new Date().toLocaleString()
  };

  localStorage.setItem(preflightKey, JSON.stringify([run, ...readRuns()].slice(0, 10)));
  recordAction("Prepare Shopify Queue", `Shopify preflight completed with ${score}% readiness.`);
  moveTask("TASK-002", "Active");
  moveTask("TASK-005", "Active");
  pushNotification("Shopify preflight completed", `Latest Shopify readiness: ${score}%.`, score >= 80 ? "Success" : "Warning");
  return run;
}
