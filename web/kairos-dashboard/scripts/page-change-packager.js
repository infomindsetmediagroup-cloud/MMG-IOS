import { pushNotification } from "./notifications.js";

const packageKey = "kairos.page.change.packages.v1";

const seededChanges = [
  { id: "PAGE-001", page: "Homepage", change: "Verify primary navigation and critical CTA routing", status: "Draft", impact: "Reduce dead-end traffic and lost conversions." },
  { id: "PAGE-002", page: "Knowledge Library", change: "Stage category landing structure for AI, Publishing, Content, and Business Systems", status: "Draft", impact: "Improve educational discovery and internal linking." },
  { id: "PAGE-003", page: "Publishing Services", change: "Stage service entry copy and customer portal handoff language", status: "Draft", impact: "Clarify post-purchase workflow." },
  { id: "PAGE-004", page: "Customer Portal", change: "Stage download center, license record, and support intake sections", status: "Draft", impact: "Prepare buyer access workflow." },
  { id: "PAGE-005", page: "Product Pages", change: "Stage review widgets, trust proof, offer blocks, and bundle cross-sells", status: "Draft", impact: "Increase conversion readiness." },
  { id: "PAGE-006", page: "Free Vault", change: "Stage lead capture page structure and upgrade path", status: "Draft", impact: "Create email capture and paid-product path." }
];

function readPackages() {
  try {
    return JSON.parse(localStorage.getItem(packageKey) || "null") || seededChanges;
  } catch {
    return seededChanges;
  }
}

function writePackages(items) {
  localStorage.setItem(packageKey, JSON.stringify(items));
  return items;
}

export function getPageChangePackages() {
  return readPackages();
}

export function approvePageChange(id) {
  const next = readPackages().map(item => item.id === id ? { ...item, status: "Ready", updatedAt: new Date().toLocaleString() } : item);
  writePackages(next);
  pushNotification("Page change staged", id, "Success");
  return next;
}

export function pageChangeMetrics() {
  const items = readPackages();
  return {
    total: items.length,
    draft: items.filter(item => item.status === "Draft").length,
    ready: items.filter(item => item.status === "Ready").length
  };
}
