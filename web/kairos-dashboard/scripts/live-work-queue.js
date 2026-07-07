import { pushNotification } from "./notifications.js";

const workQueueKey = "kairos.live.work.queue.v1";

const seedWork = [
  { id: "WORK-001", title: "Sweep public MMG pages", lane: "Website", type: "Resweep", status: "Queued", priority: "High", impact: "Find broken pages, routing gaps, and conversion blockers." },
  { id: "WORK-002", title: "Prepare page change batch", lane: "Website", type: "Implementation", status: "Queued", priority: "High", impact: "Convert audit findings into approved page edits." },
  { id: "WORK-003", title: "Prepare digital product additions", lane: "Shopify", type: "Product Ops", status: "Queued", priority: "High", impact: "Stage product records, assets, pricing, and digital package requirements." },
  { id: "WORK-004", title: "Prepare bundle product package", lane: "Shopify", type: "Product Ops", status: "Queued", priority: "Medium", impact: "Stage Creator Launch Bundle configuration and product page copy." },
  { id: "WORK-005", title: "Prepare Knowledge Library article batch", lane: "Content", type: "Publishing", status: "Queued", priority: "Medium", impact: "Turn category backlog into publishable educational articles." },
  { id: "WORK-006", title: "Prepare customer portal delivery map", lane: "Customer Ops", type: "Portal", status: "Queued", priority: "High", impact: "Map product purchases to access and support workflow." }
];

const commandClassifiers = [
  { lane: "Shopify", type: "Product Ops", priority: "High", patterns: ["product", "listing", "shopify", "price", "bundle", "service"] },
  { lane: "Website", type: "Implementation", priority: "High", patterns: ["website", "page", "site", "landing", "navigation", "section", "image", "hero"] },
  { lane: "Content", type: "Publishing", priority: "Medium", patterns: ["content", "article", "post", "caption", "blog", "knowledge", "library"] },
  { lane: "Growth", type: "Marketing", priority: "Medium", patterns: ["campaign", "marketing", "email", "ad", "promo", "launch"] },
  { lane: "Customer Ops", type: "Portal", priority: "High", patterns: ["customer", "portal", "subscription", "delivery", "account"] },
  { lane: "Quality", type: "QA", priority: "High", patterns: ["qa", "test", "release", "bug", "verify", "audit", "fix"] }
];

function readWork() {
  try {
    return JSON.parse(localStorage.getItem(workQueueKey) || "null") || seedWork;
  } catch {
    return seedWork;
  }
}

function writeWork(items) {
  localStorage.setItem(workQueueKey, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("kairos:work-queue-updated", { detail: { total: items.length } }));
  return items;
}

function classifyCommand(input) {
  const text = String(input || "").toLowerCase();
  return commandClassifiers.find(item => item.patterns.some(pattern => text.includes(pattern))) || {
    lane: "Operations",
    type: "AI Intake",
    priority: "Medium"
  };
}

function nextWorkId(items) {
  const max = items.reduce((value, item) => {
    const number = Number(String(item.id || "").replace(/[^0-9]/g, ""));
    return Number.isFinite(number) ? Math.max(value, number) : value;
  }, 0);
  return "WORK-" + String(max + 1).padStart(3, "0");
}

function titleFromCommand(input) {
  const text = String(input || "").trim().replace(/\s+/g, " ");
  if (!text) return "Operator command intake";
  return text.length > 72 ? text.slice(0, 69) + "..." : text;
}

export function getLiveWorkQueue() {
  return readWork();
}

export function queueCommandWorkItem(input, options = {}) {
  const command = String(input || "").trim();
  const current = readWork();
  const classification = classifyCommand(command);
  const item = {
    id: nextWorkId(current),
    title: titleFromCommand(command),
    command,
    lane: options.lane || classification.lane,
    type: options.type || classification.type,
    status: "Queued",
    priority: options.priority || classification.priority,
    source: "Kairos Command Block",
    impact: options.impact || "Natural-language request converted into an actionable Kairos work item.",
    createdAt: new Date().toLocaleString(),
    updatedAt: new Date().toLocaleString()
  };

  writeWork([item, ...current]);
  pushNotification("Command queued", item.id + " added to Live Work Queue.", "Success");
  return item;
}

export function advanceWorkItem(id) {
  const order = ["Queued", "Active", "Ready for Approval", "Complete"];
  const next = readWork().map(item => {
    if (item.id !== id) return item;
    const current = order.indexOf(item.status);
    return { ...item, status: order[Math.min(current + 1, order.length - 1)], updatedAt: new Date().toLocaleString() };
  });
  writeWork(next);
  pushNotification("Work item advanced", id, "Success");
  return next;
}

export function liveWorkMetrics() {
  const items = readWork();
  return {
    total: items.length,
    active: items.filter(item => item.status === "Active").length,
    approval: items.filter(item => item.status === "Ready for Approval").length,
    complete: items.filter(item => item.status === "Complete").length,
    queued: items.filter(item => item.status === "Queued").length
  };
}
