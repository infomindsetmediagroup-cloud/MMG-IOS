const storeKey = "kairos.runtime.store.v1";

const storeVersion = 2;
const maxApprovals = 20;
const maxSnapshots = 12;
const maxExecutionPipelineItems = 30;
const pipelineOrder = ["Queued", "In Progress", "Ready", "Completed"];

const seedState = {
  version: storeVersion,
  operator: localStorage.getItem("kairos.operator.v1") || "Mike",
  sessionMode: "Operation",
  approvals: [],
  snapshots: [],
  executionPipeline: [],
  lastSavedAt: null
};

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

function timestamp() {
  return new Date().toLocaleString();
}

function normalizeStatus(status, fallback = "Queued") {
  const value = String(status || fallback);
  return pipelineOrder.includes(value) ? value : fallback;
}

function normalizeApproval(item) {
  return {
    id: String(item?.id || makeId()),
    title: String(item?.title || "Untitled Approval"),
    source: String(item?.source || "Kairos"),
    relatedWorkId: item?.relatedWorkId ? String(item.relatedWorkId) : null,
    status: String(item?.status || "Pending"),
    createdAt: String(item?.createdAt || timestamp()),
    updatedAt: String(item?.updatedAt || item?.createdAt || timestamp())
  };
}

function normalizeSnapshot(item) {
  return {
    id: String(item?.id || makeId()),
    label: String(item?.label || "Runtime Snapshot"),
    payload: item?.payload && typeof item.payload === "object" ? item.payload : {},
    createdAt: String(item?.createdAt || timestamp())
  };
}

function normalizeExecutionWork(item) {
  return {
    id: String(item?.id || makeId()),
    title: String(item?.title || "Untitled Work"),
    source: String(item?.source || "Dashboard Command"),
    detail: String(item?.detail || "Queued from dashboard"),
    status: normalizeStatus(item?.status),
    createdAt: String(item?.createdAt || timestamp()),
    updatedAt: String(item?.updatedAt || item?.createdAt || timestamp())
  };
}

function normalizeState(current = {}) {
  const approvals = Array.isArray(current.approvals) ? current.approvals.map(normalizeApproval).slice(0, maxApprovals) : [];
  const snapshots = Array.isArray(current.snapshots) ? current.snapshots.map(normalizeSnapshot).slice(0, maxSnapshots) : [];
  const executionPipeline = Array.isArray(current.executionPipeline) ? current.executionPipeline.map(normalizeExecutionWork).slice(0, maxExecutionPipelineItems) : [];

  return {
    ...seedState,
    ...current,
    version: storeVersion,
    operator: String(current.operator || seedState.operator),
    sessionMode: String(current.sessionMode || seedState.sessionMode),
    approvals,
    snapshots,
    executionPipeline,
    lastSavedAt: current.lastSavedAt ? String(current.lastSavedAt) : null
  };
}

function safeRead() {
  try {
    const current = JSON.parse(localStorage.getItem(storeKey) || "null") || seedState;
    return normalizeState(current);
  } catch {
    return normalizeState(seedState);
  }
}

function persist(next) {
  const normalized = normalizeState(next);
  localStorage.setItem(storeKey, JSON.stringify(normalized));
  return normalized;
}

export function getRuntimeStore() {
  return safeRead();
}

export function saveRuntimeStore(nextState) {
  const current = safeRead();
  return persist({
    ...current,
    ...nextState,
    lastSavedAt: timestamp()
  });
}

export function createRuntimeSnapshot(label, payload = {}) {
  const current = safeRead();
  const snapshot = normalizeSnapshot({
    id: makeId(),
    label,
    payload,
    createdAt: timestamp()
  });
  persist({
    ...current,
    snapshots: [snapshot, ...current.snapshots].slice(0, maxSnapshots),
    lastSavedAt: snapshot.createdAt
  });
  return snapshot;
}

export function queueApproval(title, source = "Kairos", relatedWorkId = null) {
  const current = safeRead();
  const approval = normalizeApproval({
    id: makeId(),
    title,
    source,
    relatedWorkId,
    status: "Pending",
    createdAt: timestamp(),
    updatedAt: timestamp()
  });
  persist({
    ...current,
    approvals: [approval, ...current.approvals].slice(0, maxApprovals),
    lastSavedAt: approval.createdAt
  });
  return approval;
}

export function queueExecutionWork(title, source = "Dashboard Command", detail = "Queued from dashboard") {
  const current = safeRead();
  const work = normalizeExecutionWork({
    id: makeId(),
    title,
    source,
    detail,
    status: "Queued",
    createdAt: timestamp(),
    updatedAt: timestamp()
  });
  persist({
    ...current,
    executionPipeline: [work, ...current.executionPipeline].slice(0, maxExecutionPipelineItems),
    lastSavedAt: work.updatedAt
  });
  return work;
}

export function advanceExecutionWork(id) {
  const current = safeRead();
  const safeId = String(id || "");
  const nextPipeline = current.executionPipeline.map(item => {
    if (item.id !== safeId) return item;
    const currentIndex = pipelineOrder.indexOf(item.status);
    const nextStatus = pipelineOrder[Math.min(currentIndex + 1, pipelineOrder.length - 1)] || "In Progress";
    return { ...item, status: nextStatus, updatedAt: timestamp() };
  });
  const next = persist({
    ...current,
    executionPipeline: nextPipeline,
    lastSavedAt: timestamp()
  });
  return next.executionPipeline;
}

export function setExecutionWorkStatus(id, status) {
  const current = safeRead();
  const safeId = String(id || "");
  const safeStatus = normalizeStatus(status);
  const nextPipeline = current.executionPipeline.map(item => (
    item.id === safeId ? { ...item, status: safeStatus, updatedAt: timestamp() } : item
  ));
  const next = persist({
    ...current,
    executionPipeline: nextPipeline,
    lastSavedAt: timestamp()
  });
  return next.executionPipeline;
}

export function approveExecutionWork(id) {
  const current = safeRead();
  const safeId = String(id || "");
  const target = current.executionPipeline.find(item => item.id === safeId);
  if (!target) return null;
  const approval = normalizeApproval({
    id: makeId(),
    title: `Approve ${target.title}`,
    source: target.source,
    relatedWorkId: safeId,
    status: "Approved",
    createdAt: timestamp(),
    updatedAt: timestamp()
  });
  const nextPipeline = current.executionPipeline.map(item => (
    item.id === safeId ? { ...item, status: "Ready", updatedAt: approval.updatedAt } : item
  ));
  persist({
    ...current,
    approvals: [approval, ...current.approvals].slice(0, maxApprovals),
    executionPipeline: nextPipeline,
    lastSavedAt: approval.updatedAt
  });
  return approval;
}

export function completeExecutionWork(id) {
  return setExecutionWorkStatus(id, "Completed");
}

export function clearExecutionPipeline() {
  const next = saveRuntimeStore({ executionPipeline: [] });
  return next.executionPipeline;
}
