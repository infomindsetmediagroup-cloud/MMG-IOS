import { recordAction } from "./runtime-actions.js";
import { pushNotification } from "./notifications.js";
import { moveTask } from "./task-board.js";

const funnelKey = "kairos.revenue.funnel.runs.v1";

const funnelChecklist = [
  { title: "Welcome offer defined", impact: "High" },
  { title: "Early visit signup timing mapped", impact: "High" },
  { title: "Free Vault email capture CTA prepared", impact: "High" },
  { title: "Checkout savings offer staged", impact: "High" },
  { title: "Creator Launch Bundle upsell mapped", impact: "Medium" },
  { title: "Post-purchase review request mapped", impact: "Medium" },
  { title: "Email list destination selected", impact: "High" },
  { title: "Analytics events defined", impact: "Medium" }
];

function readRuns() {
  try {
    return JSON.parse(localStorage.getItem(funnelKey) || "[]");
  } catch {
    return [];
  }
}

export function getRevenueFunnelRuns() {
  return readRuns();
}

export function runRevenueFunnelBuild() {
  const ready = [
    "Welcome offer defined",
    "Early visit signup timing mapped",
    "Free Vault email capture CTA prepared",
    "Checkout savings offer staged",
    "Creator Launch Bundle upsell mapped"
  ];

  const findings = funnelChecklist.map(item => ({
    ...item,
    status: ready.includes(item.title) ? "Ready" : "Needs Setup"
  }));

  const score = Math.round((findings.filter(item => item.status === "Ready").length / findings.length) * 100);
  const run = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    score,
    findings,
    createdAt: new Date().toLocaleString()
  };

  localStorage.setItem(funnelKey, JSON.stringify([run, ...readRuns()].slice(0, 10)));
  recordAction("Create Capture Funnel", `Revenue funnel build completed with ${score}% readiness.`);
  moveTask("TASK-003", "Active");
  pushNotification("Revenue funnel build completed", `Latest funnel readiness: ${score}%.`, score >= 80 ? "Success" : "Warning");
  return run;
}
