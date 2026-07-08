const storeKey = "kairos.runtime.store.v1";

const seedState = {
  version: 2,
  operator: localStorage.getItem("kairos.operator.v1") || "Mike",
  sessionMode: "Operation",
  approvals: [],
  snapshots: [],
  executionPipeline: [],
  lastSavedAt: null
};

const pipelineOrder = ["Queued", "In Progress", "Ready", "Completed"];

function safeRead() {
  try {
    const current = JSON.parse(localStorage.getItem(storeKey) || "null") || seedState;
    return {
      ...seedState,
      ...current,
      version: 2,
      sessionMode: current.sessionMode || seedState.sessionMode,
      approvals: current.approvals || [],
      snapshots: current.snapshots || [],
      executionPipeline: current.executionPipeline || []
    };
  } catch {
    return seedState;
  }
}

export function getRuntimeStore() {
  return safeRead();
}

export function saveRuntimeStore(nextState) {
  const current = safeRead();
  const next = {
    ...current,
    ...nextState,
    lastSavedAt: new Date().toLocaleString()
  };
  localStorage.setItem(storeKey, JSON.stringify(next));
  return next;
}

export function createRuntimeSnapshot(label, payload = {}) {
  const current = safeRead();
  const snapshot = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    label,
    payload,
    createdAt: new Date().toLocaleString()
  };
  const next = {
    ...current,
    snapshots: [snapshot, ...(current.snapshots || [])].slice(0, 12),
    lastSavedAt: snapshot.createdAt
  };
  localStorage.setItem(storeKey, JSON.stringify(next));
  return snapshot;
}

export function queueApproval(title, source = "Kairos") {
  const current = safeRead();
  const approval = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title,
    source,
    status: "Pending",
    createdAt: new Date().toLocaleString()
  };
  const next = {
    ...current,
    approvals: [approval, ...(current.approvals || [])].slice(0, 20),
    lastSavedAt: approval.createdAt
  };
  localStorage.setItem(storeKey, JSON.stringify(next));
  return approval;
}

export function queueExecutionWork(title, source = "Dashboard Command", detail = "Queued from dashboard") {
  const current = safeRead();
  const work = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title,
    source,
    detail,
    status: "Queued",
    createdAt: new Date().toLocaleString(),
    updatedAt: new Date().toLocaleString()
  };
  const next = {
    ...current,
    executionPipeline: [work, ...(current.executionPipeline || [])].slice(0, 30),
    lastSavedAt: work.updatedAt
  };
  localStorage.setItem(storeKey, JSON.stringify(next));
  return work;
}

export function advanceExecutionWork(id) {
  const current = safeRead();
  const nextPipeline = (current.executionPipeline || []).map(item => {
    if (item.id !== id) return item;
    const currentIndex = pipelineOrder.indexOf(item.status);
    const nextStatus = pipelineOrder[Math.min(currentIndex + 1, pipelineOrder.length - 1)] || "In Progress";
    return { ...item, status: nextStatus, updatedAt: new Date().toLocaleString() };
  });
  const next = {
    ...current,
    executionPipeline: nextPipeline,
    lastSavedAt: new Date().toLocaleString()
  };
  localStorage.setItem(storeKey, JSON.stringify(next));
  return nextPipeline;
}

export function setExecutionWorkStatus(id, status) {
  const current = safeRead();
  const nextPipeline = (current.executionPipeline || []).map(item => (
    item.id === id ? { ...item, status, updatedAt: new Date().toLocaleString() } : item
  ));
  const next = {
    ...current,
    executionPipeline: nextPipeline,
    lastSavedAt: new Date().toLocaleString()
  };
  localStorage.setItem(storeKey, JSON.stringify(next));
  return nextPipeline;
}

export function clearExecutionPipeline() {
  const next = saveRuntimeStore({ executionPipeline: [] });
  return next.executionPipeline;
}
