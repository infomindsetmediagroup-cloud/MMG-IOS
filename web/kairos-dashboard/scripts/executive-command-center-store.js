const storeKey = "kairos.executive.command-center.v1";

export const commandCenters = [
  { id: "executive", title: "Executive Operations", icon: "✦", detail: "Approvals, decisions, priorities, and work requiring your attention." },
  { id: "shopify", title: "Shopify & Website", icon: "◇", detail: "Live storefront, homepage, products, navigation, and publishing operations." },
  { id: "production", title: "Products & Production", icon: "▣", detail: "Customer work and MMG assets moving through production." },
  { id: "knowledge", title: "Knowledge", icon: "⌘", detail: "Completed work, evidence, decisions, and institutional memory." },
  { id: "system", title: "System & Release", icon: "⚙", detail: "Runtime readiness, releases, failures, and genuine operating health." },
];

const seedWork = [
  {
    id: "WEB-001",
    center: "shopify",
    title: "Inspect the live Shopify homepage",
    objective: "Audit the live Shopify homepage and identify the published theme and homepage-critical files.",
    status: "Ready for Approval",
    progress: 0,
    actionType: "shopify.homepage.audit",
    updatedAt: "Awaiting approval",
  },
  {
    id: "WEB-002",
    center: "shopify",
    title: "Prepare the guided homepage change package",
    objective: "Compare the homepage with the approved MMG guided-experience doctrine and prepare a cohesive change package.",
    status: "Queued",
    progress: 0,
    dependency: "WEB-001",
    updatedAt: "Waiting for live audit evidence",
  },
  {
    id: "PROD-001",
    center: "production",
    title: "Map approved work into the production pipeline",
    objective: "Route approved MMG work through production, verification, delivery, and knowledge preservation.",
    status: "Queued",
    progress: 0,
    updatedAt: "Adapter not connected",
  },
  {
    id: "SYS-001",
    center: "system",
    title: "Verify Kairos production runtime",
    objective: "Monitor the production health endpoint and connected execution capabilities.",
    status: "Working",
    progress: 50,
    telemetrySource: "health",
    updatedAt: "Checking live runtime",
  },
];

function defaultStore() {
  return { version: 1, work: seedWork, knowledge: [], updatedAt: new Date().toISOString() };
}

export function getCommandCenterStore() {
  try {
    const stored = JSON.parse(localStorage.getItem(storeKey) || "null");
    if (!stored || stored.version !== 1) return defaultStore();
    return { ...defaultStore(), ...stored, work: stored.work || seedWork, knowledge: stored.knowledge || [] };
  } catch {
    return defaultStore();
  }
}

function save(next) {
  const value = { ...next, version: 1, updatedAt: new Date().toISOString() };
  localStorage.setItem(storeKey, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("kairos:command-center-updated"));
  return value;
}

export function updateWorkItem(id, patch) {
  const current = getCommandCenterStore();
  return save({ ...current, work: current.work.map(item => item.id === id ? { ...item, ...patch, updatedAt: patch.updatedAt || new Date().toLocaleString() } : item) });
}

export function recordCompletedKnowledge(workItem, evidence) {
  const current = getCommandCenterStore();
  const record = {
    id: evidence?.actionID || crypto.randomUUID(),
    title: workItem.title,
    center: workItem.center,
    completedAt: evidence?.completedAt || new Date().toISOString(),
    evidence: evidence?.evidence || evidence || {},
  };
  return save({ ...current, knowledge: [record, ...current.knowledge.filter(item => item.id !== record.id)].slice(0, 50) });
}

export function resetCommandCenterStore() {
  localStorage.removeItem(storeKey);
  window.dispatchEvent(new CustomEvent("kairos:command-center-updated"));
}
