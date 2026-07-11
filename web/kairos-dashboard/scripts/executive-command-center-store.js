const storeKey = "kairos.executive.command-center.v7";
const legacyStoreKeys = [
  "kairos.executive.command-center.v6",
  "kairos.executive.command-center.v5",
  "kairos.executive.command-center.v4",
  "kairos.executive.command-center.v3",
  "kairos.executive.command-center.v2",
  "kairos.executive.command-center.v1",
];
const STORE_VERSION = 7;
const MAX_KNOWLEDGE_RECORDS = 24;
const MAX_STRING_LENGTH = 1600;
const MAX_ARRAY_ITEMS = 12;
const MAX_OBJECT_KEYS = 24;

let memoryStore = null;
let notificationQueued = false;
const runtimeProposals = new Map();

export const commandCenters = [
  { id: "executive", title: "Executive Operations", icon: "✦", detail: "Approvals, decisions, priorities, and work requiring your attention." },
  { id: "shopify", title: "Shopify & Website", icon: "◇", detail: "Live storefront, homepage, products, navigation, and publishing operations." },
  { id: "production", title: "Products & Production", icon: "▣", detail: "Customer work and MMG assets moving through production." },
  { id: "knowledge", title: "Knowledge", icon: "⌘", detail: "Completed work, evidence, decisions, and institutional memory." },
  { id: "system", title: "System & Release", icon: "⚙", detail: "Runtime readiness, releases, failures, and genuine operating health." },
];

const seedWork = [
  { id: "EXEC-001", center: "executive", title: "Review the active operating priorities", objective: "Review current MMG Command Center work, identify the highest-value next actions, and return an ordered executive priority brief.", status: "Ready for Approval", progress: 0, actionType: "executive.priority.review", updatedAt: "Awaiting approval" },
  { id: "WEB-001", center: "shopify", title: "Inspect the live Shopify homepage", objective: "Audit the live Shopify homepage and identify verified storefront findings, the published experience, and homepage-critical public assets.", status: "Ready for Approval", progress: 0, actionType: "storefront.audit", updatedAt: "Awaiting approval" },
  { id: "WEB-002", center: "shopify", title: "Prepare the guided homepage change package", objective: "Use WEB-001 evidence and the approved MMG guided-experience doctrine to prepare a cohesive, implementation-ready homepage change package.", status: "Queued", progress: 0, actionType: "website.change.package", executionActionType: "shopify.theme.files.upsert", requiresReview: true, dependency: "WEB-001", updatedAt: "Waiting for live audit evidence" },
  { id: "PROD-001", center: "production", title: "Map approved work into the production pipeline", objective: "Create an operational route for approved MMG work through production, verification, delivery, and knowledge preservation.", status: "Queued", progress: 0, actionType: "production.pipeline.map", requiresReview: true, updatedAt: "Ready to activate" },
  { id: "SYS-001", center: "system", title: "Verify Kairos production runtime", objective: "Monitor the production health endpoint and connected execution capabilities.", status: "Working", progress: 50, telemetrySource: "health", updatedAt: "Checking live runtime" },
];

function defaultStore() {
  return { version: STORE_VERSION, work: seedWork.map(item => ({ ...item })), knowledge: [], updatedAt: new Date().toISOString() };
}

function boundedString(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > MAX_STRING_LENGTH ? `${text.slice(0, MAX_STRING_LENGTH - 1)}…` : text;
}

function compactValue(value, depth = 0) {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return boundedString(value);
  if (depth >= 3) return "[bounded]";
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map(entry => compactValue(entry, depth + 1));
  if (typeof value === "object") {
    const result = {};
    for (const [key, entry] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      if (key === "value" && typeof entry === "string" && entry.length > 2000) {
        result.bytes = new Blob([entry]).size;
        result.valueExcluded = true;
        continue;
      }
      result[key] = compactValue(entry, depth + 1);
    }
    return result;
  }
  return boundedString(value);
}

function compactWorkItem(item) {
  const next = { ...item };
  if (next.proposal) next.proposal = compactValue(next.proposal);
  if (next.evidence) next.evidence = compactValue(next.evidence);
  if (next.error) next.error = boundedString(next.error);
  return next;
}

function hydrateRuntimeProposals(store) {
  return {
    ...store,
    work: store.work.map(item => runtimeProposals.has(item.id) ? { ...item, proposal: runtimeProposals.get(item.id) } : item),
  };
}

function normalizeProposal(item, merged) {
  if (!item.requiresReview) return merged;
  if (merged.executionCompleted === true) return { ...merged, status: "Completed", progress: 100, proposal: null, error: "" };
  if (merged.status === "Completed" && merged.evidence) {
    return { ...merged, status: "Proposal Ready", progress: 100, proposal: compactValue(merged.evidence), evidence: null, updatedAt: "Proposal prepared; executive approval required" };
  }
  if (merged.status === "Needs Attention" && /does not support the requested action|unsupported[_ ]action/i.test(merged.error || "") && merged.proposal) {
    return { ...merged, status: "Proposal Ready", progress: 100, error: "", updatedAt: "Approved proposal recovered; internal execution route connected" };
  }
  return merged;
}

function mergeWork(storedWork = []) {
  const storedById = new Map(storedWork.map(item => [item.id, compactWorkItem(item)]));
  return seedWork.map(seed => {
    const stored = storedById.get(seed.id) || {};
    let merged = { ...seed, ...stored, actionType: seed.actionType, executionActionType: seed.executionActionType, requiresReview: Boolean(seed.requiresReview), objective: seed.objective, title: seed.title, center: seed.center };
    if (seed.id === "WEB-001" && /adapter is not configured/i.test(merged.error || "")) merged = { ...merged, error: "", status: "Ready for Approval", progress: 0, updatedAt: "Live inspection route connected; ready to run" };
    if (seed.id === "PROD-001" && /adapter not connected/i.test(merged.updatedAt || "")) merged = { ...merged, updatedAt: "Ready to activate" };
    return normalizeProposal(seed, merged);
  });
}

function purgeLegacyStores() {
  for (const key of legacyStoreKeys) {
    try { localStorage.removeItem(key); } catch { /* Ignore storage restrictions. */ }
  }
}

function sanitizeStore(input) {
  const base = defaultStore();
  const source = input && typeof input === "object" ? input : {};
  return {
    ...base,
    ...source,
    version: STORE_VERSION,
    work: mergeWork(Array.isArray(source.work) ? source.work : []),
    knowledge: (Array.isArray(source.knowledge) ? source.knowledge : []).slice(0, MAX_KNOWLEDGE_RECORDS).map(record => compactValue(record)),
  };
}

export function getCommandCenterStore() {
  purgeLegacyStores();
  if (memoryStore) return hydrateRuntimeProposals(memoryStore);
  try {
    const current = JSON.parse(localStorage.getItem(storeKey) || "null");
    memoryStore = current?.version === STORE_VERSION ? sanitizeStore(current) : defaultStore();
  } catch {
    try { localStorage.removeItem(storeKey); } catch { /* Ignore storage restrictions. */ }
    memoryStore = defaultStore();
  }
  return hydrateRuntimeProposals(memoryStore);
}

function queueNotification() {
  if (notificationQueued) return;
  notificationQueued = true;
  requestAnimationFrame(() => {
    notificationQueued = false;
    window.dispatchEvent(new CustomEvent("kairos:command-center-updated"));
  });
}

function save(next, notify = true) {
  const value = sanitizeStore({ ...next, version: STORE_VERSION, updatedAt: new Date().toISOString() });
  memoryStore = value;
  try { localStorage.setItem(storeKey, JSON.stringify(value)); } catch { /* Keep live in-memory operation usable. */ }
  if (notify) queueNotification();
  return hydrateRuntimeProposals(value);
}

export function updateWorkItem(id, patch) {
  const current = getCommandCenterStore();
  const incoming = patch || {};
  if (Object.prototype.hasOwnProperty.call(incoming, "proposal")) {
    if (incoming.proposal) runtimeProposals.set(id, incoming.proposal);
    else runtimeProposals.delete(id);
  }
  const safePatch = compactWorkItem(incoming);
  return save({ ...current, work: current.work.map(item => item.id === id ? compactWorkItem({ ...item, ...safePatch, updatedAt: safePatch.updatedAt || new Date().toLocaleString() }) : item) });
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
  const record = compactValue({ id: evidence?.actionID || crypto.randomUUID(), title: workItem.title, center: workItem.center, workItemId: workItem.id, completedAt: evidence?.completedAt || new Date().toISOString(), evidence: evidence?.evidence || evidence || {} });
  return save({ ...current, knowledge: [record, ...current.knowledge.filter(item => item.id !== record.id)].slice(0, MAX_KNOWLEDGE_RECORDS) });
}

export function nextRunnableWork(centerId) {
  const store = getCommandCenterStore();
  const items = store.work.filter(item => item.center === centerId && item.actionType);
  return items.find(item => item.status === "Proposal Ready") || items.find(item => ["Needs Attention", "Failed", "Paused", "Revision Requested"].includes(item.status)) || items.find(item => item.status === "Ready for Approval") || items.find(item => item.status === "Queued" && !item.dependency) || null;
}

export function resetCommandCenterStore() {
  memoryStore = null;
  runtimeProposals.clear();
  try { localStorage.removeItem(storeKey); } catch { /* Ignore storage restrictions. */ }
  purgeLegacyStores();
  queueNotification();
}
