import { pushNotification } from "./notifications.js";

const workQueueKey = "kairos.live.work.queue.v1";

const seedWork = [
  { id: "WORK-001", title: "Sweep public MMG pages", lane: "Website", type: "Resweep", status: "Queued", impact: "Find broken pages, routing gaps, and conversion blockers." },
  { id: "WORK-002", title: "Prepare page change batch", lane: "Website", type: "Implementation", status: "Queued", impact: "Convert audit findings into approved page edits." },
  { id: "WORK-003", title: "Prepare digital product additions", lane: "Shopify", type: "Product Ops", status: "Queued", impact: "Stage product records, assets, pricing, and download workflow requirements." },
  { id: "WORK-004", title: "Prepare bundle product package", lane: "Shopify", type: "Product Ops", status: "Queued", impact: "Stage Creator Launch Bundle configuration and product page copy." },
  { id: "WORK-005", title: "Prepare Knowledge Library article batch", lane: "Content", type: "Publishing", status: "Queued", impact: "Turn category backlog into publishable educational articles." },
  { id: "WORK-006", title: "Prepare customer portal delivery map", lane: "Customer Ops", type: "Portal", status: "Queued", impact: "Map product purchases to download access and support workflow." }
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
  return items;
}

export function getLiveWorkQueue() {
  return readWork();
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
    complete: items.filter(item => item.status === "Complete").length
  };
}
