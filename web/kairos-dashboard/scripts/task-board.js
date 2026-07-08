const taskKey = "kairos.task.board.v1";

const seedTasks = [
  { id: "TASK-001", title: "Promote Website Audit to executable workflow", lane: "Website", status: "Next", priority: "P1" },
  { id: "TASK-002", title: "Connect Judge.me review widget checklist", lane: "Shopify", status: "Next", priority: "P1" },
  { id: "TASK-003", title: "Build Free Vault lead capture package", lane: "Revenue", status: "Next", priority: "P1" },
  { id: "TASK-004", title: "Wire Customer Portal Value Discovery recommendations", lane: "Customer Portal", status: "Queued", priority: "P1" },
  { id: "TASK-005", title: "Prepare Shopify bundle product schema", lane: "Bundles", status: "Queued", priority: "P2" },
  { id: "TASK-006", title: "Draft Knowledge Bank taxonomy", lane: "Knowledge", status: "Queued", priority: "P2" }
];

function readTasks() {
  try {
    return JSON.parse(localStorage.getItem(taskKey) || "null") || seedTasks;
  } catch {
    return seedTasks;
  }
}

export function getTasks() {
  return readTasks();
}

export function saveTasks(tasks) {
  localStorage.setItem(taskKey, JSON.stringify(tasks));
  return tasks;
}

export function moveTask(id, status) {
  const tasks = readTasks().map(task => task.id === id ? { ...task, status, updatedAt: new Date().toLocaleString() } : task);
  return saveTasks(tasks);
}

export function taskMetrics() {
  const tasks = readTasks();
  return {
    total: tasks.length,
    next: tasks.filter(task => task.status === "Next").length,
    active: tasks.filter(task => task.status === "Active").length,
    complete: tasks.filter(task => task.status === "Complete").length
  };
}
