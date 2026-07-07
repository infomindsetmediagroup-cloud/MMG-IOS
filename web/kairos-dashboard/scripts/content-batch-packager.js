import { pushNotification } from "./notifications.js";

const contentBatchKey = "kairos.content.batch.packages.v1";

const seedContent = [
  { id: "CONTENT-001", title: "AI Prompting for Beginners article", category: "AI", status: "Draft", output: "Knowledge Library article outline and internal links." },
  { id: "CONTENT-002", title: "Creator Launch Checklist article", category: "Content Creation", status: "Draft", output: "Step-by-step creator education page." },
  { id: "CONTENT-003", title: "Publishing Services explainer", category: "Publishing", status: "Draft", output: "Service education page with customer portal handoff." },
  { id: "CONTENT-004", title: "Digital Product Delivery guide", category: "Business Systems", status: "Draft", output: "Download workflow and license-access education page." },
  { id: "CONTENT-005", title: "Free Vault welcome sequence", category: "Lead Capture", status: "Draft", output: "Email capture onboarding copy and upgrade path." }
];

function readContent() {
  try {
    return JSON.parse(localStorage.getItem(contentBatchKey) || "null") || seedContent;
  } catch {
    return seedContent;
  }
}

function writeContent(items) {
  localStorage.setItem(contentBatchKey, JSON.stringify(items));
  return items;
}

export function getContentBatchPackages() {
  return readContent();
}

export function stageContentBatch(id) {
  const next = readContent().map(item => item.id === id ? { ...item, status: "Staged", updatedAt: new Date().toLocaleString() } : item);
  writeContent(next);
  pushNotification("Content package staged", id, "Success");
  return next;
}

export function contentBatchMetrics() {
  const items = readContent();
  return {
    total: items.length,
    draft: items.filter(item => item.status === "Draft").length,
    staged: items.filter(item => item.status === "Staged").length
  };
}
