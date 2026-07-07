const routineKey = "kairos.routine.board.v1";

const seedRoutines = [
  { id: "ROUTINE-001", title: "Morning Site Review", lane: "Website", cadence: "Daily", status: "Ready", lastChecked: "Never" },
  { id: "ROUTINE-002", title: "Revenue Review", lane: "Revenue", cadence: "Daily", status: "Ready", lastChecked: "Never" },
  { id: "ROUTINE-003", title: "Commerce Review", lane: "Shopify", cadence: "Daily", status: "Ready", lastChecked: "Never" },
  { id: "ROUTINE-004", title: "Baseline Save", lane: "System", cadence: "Weekly", status: "Ready", lastChecked: "Never" }
];

function readRoutines() {
  try {
    return JSON.parse(localStorage.getItem(routineKey) || "null") || seedRoutines;
  } catch {
    return seedRoutines;
  }
}

function writeRoutines(items) {
  localStorage.setItem(routineKey, JSON.stringify(items));
  return items;
}

export function getRoutineBoard() {
  return readRoutines();
}

export function markRoutineChecked(id) {
  const next = readRoutines().map(item => item.id === id ? { ...item, status: "Checked", lastChecked: new Date().toLocaleString() } : item);
  return writeRoutines(next);
}

export function resetRoutineBoard() {
  return writeRoutines(seedRoutines);
}

export function routineBoardMetrics() {
  const items = readRoutines();
  return {
    total: items.length,
    ready: items.filter(item => item.status === "Ready").length,
    checked: items.filter(item => item.status === "Checked").length
  };
}
