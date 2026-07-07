const historyKey = "kairos.execution.history.v1";

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(historyKey) || "[]");
  } catch {
    return [];
  }
}

function writeHistory(items) {
  localStorage.setItem(historyKey, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("kairos:execution-history-updated", { detail: { total: items.length } }));
  return items;
}

export function recordExecutionHistory(action, detail, status = "Logged") {
  const item = {
    id: "HIST-" + String(Date.now()).slice(-7),
    action,
    detail,
    status,
    createdAt: new Date().toLocaleString()
  };
  return writeHistory([item, ...readHistory()].slice(0, 80));
}

export function getExecutionHistory() {
  return readHistory();
}

export function historyMetrics() {
  const items = readHistory();
  return {
    total: items.length,
    latest: items[0]?.status || "Standby",
    completed: items.filter(item => item.status === "Complete" || item.status === "Approved").length
  };
}
