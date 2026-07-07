const storageKey = "kairos.action.log.v1";

export function getActionLog() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    return [];
  }
}

export function recordAction(action, detail = "Queued from dashboard") {
  const event = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    action,
    detail,
    status: "Queued",
    createdAt: new Date().toLocaleString()
  };
  const next = [event, ...getActionLog()].slice(0, 20);
  localStorage.setItem(storageKey, JSON.stringify(next));
  return event;
}

export function clearActionLog() {
  localStorage.removeItem(storageKey);
}
