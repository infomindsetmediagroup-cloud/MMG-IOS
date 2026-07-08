const taskKey = "kairos.task.board.v1";
const maxTasks = 50;
const validStatuses = ["Queued", "Next", "Active", "Complete", "Blocked"];
const validPriorities = ["P1", "P2", "P3"];

const seedTasks = [
  { id: "TASK-001", title: "Promote Website Audit to executable workflow", lane: "Website", status: "Next", priority: "P1" },
  { id: "TASK-002", title: "Connect Judge.me review widget checklist", lane: "Shopify", status: "Next", priority: "P1" },
  { id: "TASK-003", title: "Build Free Vault lead capture package", lane: "Revenue", status: "Next", priority: "P1" },
  { id: "TASK-004", title: "Wire Customer Portal Value Discovery recommendations", lane: "Customer Portal", status: "Queued", priority: "P1" },
  { id: "TASK-005", title: "Prepare Shopify bundle product schema", lane: "Bundles", status: "Queued", priority: "P2" },
  { id: "TASK-006", title: "Draft Knowledge Bank taxonomy", lane: "Knowledge", status: "Queued", priority: "P2" }
];

function normalizeStatus(status) {
  const value = String(status || "Queued");
  return validStatuses.includes(value) ? value : "Queued";
}

function normalizePriority(priority) {
  const value = String(priority || "P2").toUpperCase();
  return validPriorities.includes(value) ? value : "P2";
}

function normalizeTask(task, index = 0) {
  return {
    id: String(task?.id || `TASK-${String(index + 1).padStart(3, "0")}`),
    title: String(task?.title || "Untitled Task"),
    lane: String(task?.lane || "System"),
    status: normalizeStatus(task?.status),
    priority: normalizePriority(task?.priority),
    createdAt: task?.createdAt ? String(task.createdAt) : null,
    updatedAt: task?.updatedAt ? String(task.updatedAt) : null
  };
}

function normalizeTasks(tasks) {
  const source = Array.isArray(tasks) && tasks.length ? tasks : seedTasks;
  return source.map(normalizeTask).slice(0, maxTasks);
}

function readTasks() {
  try {
    return normalizeTasks(JSON.parse(localStorage.getItem(taskKey) || "null"));
  } catch {
    return normalizeTasks(seedTasks);
  }
}

export function getTasks() {
  return readTasks();
}

export function saveTasks(tasks) {
  const normalized = normalizeTasks(tasks);
  localStorage.setItem(taskKey, JSON.stringify(normalized));
  return normalized;
}

export function moveTask(id, status) {
  const safeId = String(id || "");
  const safeStatus = normalizeStatus(status);
  const tasks = readTasks().map(task => task.id === safeId ? { ...task, status: safeStatus, updatedAt: new Date().toLocaleString() } : task);
  return saveTasks(tasks);
}

export function taskMetrics() {
  const tasks = readTasks();
  return {
    total: tasks.length,
    next: tasks.filter(task => task.status === "Next").length,
    active: tasks.filter(task => task.status === "Active").length,
    complete: tasks.filter(task => task.status === "Complete").length,
    blocked: tasks.filter(task => task.status === "Blocked").length
  };
}
