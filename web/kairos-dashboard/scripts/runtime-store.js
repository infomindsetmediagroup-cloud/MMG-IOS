const storeKey = "kairos.runtime.store.v1";

const seedState = {
  version: 1,
  operator: localStorage.getItem("kairos.operator.v1") || "Mike",
  sessionMode: "Build",
  approvals: [],
  snapshots: [],
  lastSavedAt: null
};

function safeRead() {
  try {
    return JSON.parse(localStorage.getItem(storeKey) || "null") || seedState;
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
