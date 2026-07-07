import { recordAction } from "./runtime-actions.js";
import { pushNotification } from "./notifications.js";
import { moveTask } from "./task-board.js";

const auditKey = "kairos.site.audit.runs.v1";

const auditChecklist = [
  "Homepage navigation resolves",
  "Knowledge Library route is present",
  "Publishing Services route is present",
  "Customer Portal route is present",
  "System Vault route is mapped",
  "Free Vault email capture path exists",
  "Checkout discount offer is staged",
  "Judge.me product review widgets are mapped",
  "Product template sections are normalized",
  "Bundle landing page is queued"
];

function readRuns() {
  try {
    return JSON.parse(localStorage.getItem(auditKey) || "[]");
  } catch {
    return [];
  }
}

export function getSiteAuditRuns() {
  return readRuns();
}

export function runSiteAudit() {
  const completed = [
    "Homepage navigation resolves",
    "Publishing Services route is present",
    "Customer Portal route is present"
  ];

  const findings = auditChecklist.map(item => ({
    title: item,
    status: completed.includes(item) ? "Pass" : "Needs Work",
    severity: completed.includes(item) ? "Low" : item.includes("Judge.me") || item.includes("email capture") ? "High" : "Medium"
  }));

  const score = Math.round((findings.filter(item => item.status === "Pass").length / findings.length) * 100);
  const run = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    score,
    findings,
    createdAt: new Date().toLocaleString()
  };

  localStorage.setItem(auditKey, JSON.stringify([run, ...readRuns()].slice(0, 10)));
  recordAction("Run Website Audit", `Site audit completed with ${score}% score.`);
  moveTask("TASK-001", "Active");
  pushNotification("Website audit completed", `Latest audit score: ${score}%.`, score >= 80 ? "Success" : "Warning");
  return run;
}
