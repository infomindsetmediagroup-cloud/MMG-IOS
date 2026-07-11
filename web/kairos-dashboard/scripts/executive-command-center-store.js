const storeKey = "kairos.executive.command-center.v4";
const legacyStoreKeys = ["kairos.executive.command-center.v3", "kairos.executive.command-center.v2", "kairos.executive.command-center.v1"];
const STORE_VERSION = 4;

export const commandCenters = [
  { id: "executive", title: "Executive Operations", icon: "✦", detail: "Approvals, decisions, priorities, and work requiring your attention." },
  { id: "shopify", title: "Shopify & Website", icon: "◇", detail: "Live storefront, homepage, products, navigation, and publishing operations." },
  { id: "production", title: "Products & Production", icon: "▣", detail: "Customer work and MMG assets moving through production." },
  { id: "knowledge", title: "Knowledge", icon: "⌘", detail: "Completed work, evidence, decisions, and institutional memory." },
  { id: "system", title: "System & Release", icon: "⚙", detail: "Runtime readiness, releases, failures, and genuine operating health." },
];

const seedWork = [
  {
    id: "EXEC-001",
    center: "executive",
    title: "Review the active operating priorities",
    objective: "Review current MMG Command Center work, identify the highest-value next actions, and return an ordered executive priority brief.",
    status: "Ready for Approval",
    progress: 0,
    actionType: "executive.priority.review",
    updatedAt: "Awaiting approval",
  },
  {
    id: "WEB-001",
    center: "shopify",
    title: "Inspect the live Shopify homepage",
    objective: "Audit the live Shopify homepage and identify verified storefront findings, the published experience, and homepage-critical public assets.",
    status: "Ready for Approval",
    progress: 0,
    actionType: "storefront.audit",
    updatedAt: "Awaiting approval",
  },
  {
    id: "WEB-002",
    center: "shopify",
    title: "Prepare the guided homepage change package",
    objective: "Use WEB-001 evidence and the approved MMG guided-experience doctrine to prepare a cohesive, implementation-ready homepage change package.",
    status: "Queued",
    progress: 0,
    actionType: "website.change.package",
    executionActionType: "shopify.theme.files.upsert",
    requiresReview: true,
    dependency: "WEB-001",
    updatedAt: "Waiting for live audit evidence",
  },
  {
    id: "PROD-001",
    center: "production",
    title: "Map approved work into the production pipeline",
    objective: "Create an operational route for approved MMG work through production, verification, delivery, and knowledge preservation.",
    status: "Queued",
    progress: 0,
    actionType: "production.pipeline.map",
    requiresReview: true,
    updatedAt: "Ready to activate",
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
  return { version: STORE_VERSION, work: seedWork.map(item => ({ ...item })), knowledge: [], updatedAt: new Date().toISOString() };
}

function normalizeProposal(item, merged) {
  if (!item.requiresReview) return merged;
  if (merged.status === "Completed" && merged.evidence) {
    return {
      ...merged,
      status: "Proposal Ready",
      progress: 100,
      proposal: merged.evidence,
      evidence: null,
      updatedAt: "Proposal prepared; executive approval required",
    };
  }
  if (
    merged.status === "Needs Attention"
    && /does not support the requested action|unsupported[_ ]action/i.test(merged.error || "")
    && merged.proposal
  ) {
    return {
      ...merged,
      status: "Proposal Ready",
      progress: 100,
      error: "",
      updatedAt: "Approved proposal recovered; internal execution route connected",
    };
  }
  return merged;
}

function mergeWork(storedWork = []) {
  const storedById = new Map(storedWork.map(item => [item.id, item]));
  return seedWork.map(seed => {
    const stored = storedById.get(seed.id) || {};
    let merged = {
      ...seed,
      ...stored,
      actionType: seed.actionType,
      executionActionType: seed.executionActionType,
      requiresReview: Boolean(seed.requiresReview),
      objective: seed.objective,
      title: seed.title,
      center: seed.center,
    };
    if (seed.id === "WEB-001" && /adapter is not configured/i.test(merged.error || "")) {
      merged = { ...merged, error: "", status: "Ready for Approval", progress: 0, updatedAt: "Live inspection route connected; ready to run" };
    }
    if (seed.id === "PROD-001" && /adapter not connected/i.test(merged.updatedAt || "")) {
      merged = { ...merged, updatedAt: "Ready to activate" };
    }
    return normalizeProposal(seed, merged);
  });
}

function migrateLegacy() {
  for (const key of legacyStoreKeys) {
    try {
      const legacy = JSON.parse(localStorage.getItem(key) || "null");
      if (!legacy) continue;
      const migrated = { ...defaultStore(), work: mergeWork(legacy.work), knowledge: legacy.knowledge || [] };
      save(migrated, false);
      return migrated;
    } catch {
      // Continue to the next legacy key.
    }
  }
  return null;
}

export function getCommandCenterStore() {
  try {
    const current = JSON.parse(localStorage.getItem(storeKey) || "null");
    if (current?.version === STORE_VERSION) {
      return { ...defaultStore(), ...current, work: mergeWork(current.work), knowledge: current.knowledge || [] };
    }
    return migrateLegacy() || defaultStore();
  } catch {
    return defaultStore();
  }
}

function save(next, notify = true) {
  const value = { ...next, version: STORE_VERSION, updatedAt: new Date().toISOString() };
  localStorage.setItem(storeKey, JSON.stringify(value));
  if (notify) window.dispatchEvent(new CustomEvent("kairos:command-center-updated"));
  return value;
}

export function updateWorkItem(id, patch) {
  const current = getCommandCenterStore();
  return save({
    ...current,
    work: current.work.map(item => item.id === id ? { ...item, ...patch, updatedAt: patch.updatedAt || new Date().toLocaleString() } : item),
  });
}

export function unlockDependents(completedId) {
  const current = getCommandCenterStore();
  let changed = false;
  const work = current.work.map(item => {
    if (item.dependency !== completedId || item.status !== "Queued") return item;
    changed = true;
    return { ...item, status: "Ready for Approval", progress: 0, error: "", updatedAt: `${completedId} completed; ready to prepare` };
  });
  return changed ? save({ ...current, work }) : current;
}

export function recordCompletedKnowledge(workItem, evidence) {
  const current = getCommandCenterStore();
  const record = {
    id: evidence?.actionID || crypto.randomUUID(),
    title: workItem.title,
    center: workItem.center,
    workItemId: workItem.id,
    completedAt: evidence?.completedAt || new Date().toISOString(),
    evidence: evidence?.evidence || evidence || {},
  };
  return save({ ...current, knowledge: [record, ...current.knowledge.filter(item => item.id !== record.id)].slice(0, 100) });
}

export function nextRunnableWork(centerId) {
  const store = getCommandCenterStore();
  const items = store.work.filter(item => item.center === centerId && item.actionType);
  return items.find(item => item.status === "Proposal Ready")
    || items.find(item => ["Needs Attention", "Failed", "Paused", "Revision Requested"].includes(item.status))
    || items.find(item => item.status === "Ready for Approval")
    || items.find(item => item.status === "Queued" && !item.dependency)
    || null;
}

export function resetCommandCenterStore() {
  localStorage.removeItem(storeKey);
  legacyStoreKeys.forEach(key => localStorage.removeItem(key));
  window.dispatchEvent(new CustomEvent("kairos:command-center-updated"));
}
