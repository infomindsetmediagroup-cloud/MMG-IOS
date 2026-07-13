const BUILD = "kairos-workflow-runtime-20260713-1";
const CACHE_SECONDS = 60 * 60 * 24 * 30;
const VALID_STATES = new Set(["ready", "active", "blocked", "completed", "cancelled"]);
const VALID_PRIORITIES = new Set(["critical", "high", "normal", "low"]);
const VALID_CENTERS = new Set(["knowledge", "content", "business", "customers", "operations"]);

export async function createWorkflow(request, payload = {}) {
  const title = clean(payload.title, 180);
  const objective = clean(payload.objective, 4000);
  if (!title) throw new Error("Enter a workflow title.");
  if (!objective) throw new Error("Enter the workflow objective.");

  const now = new Date().toISOString();
  const workflow = {
    id: `workflow-${crypto.randomUUID()}`,
    build: BUILD,
    title,
    objective,
    center: VALID_CENTERS.has(payload.center) ? payload.center : "operations",
    priority: VALID_PRIORITIES.has(payload.priority) ? payload.priority : "normal",
    state: "ready",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    owner: clean(payload.owner || "Kairos", 120),
    source: clean(payload.source || "command-center", 120),
    approvalRequired: Boolean(payload.approvalRequired),
    approvalStatus: payload.approvalRequired ? "pending" : "not-required",
    tasks: normalizeTasks(payload.tasks, now),
    progress: 0,
    nextAction: "Start workflow",
    safeguards: {
      floatingControls: false,
      externalPublicationAutomatic: false,
      destructiveActionAutomatic: false,
      completionRequiresTaskClosure: true,
    },
  };
  workflow.progress = calculateProgress(workflow.tasks);
  await persistWorkflow(request, workflow);
  await upsertQueue(request, workflow);
  return workflow;
}

export async function listWorkflows(request) {
  const queue = await readQueue(request);
  return queue.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function readWorkflow(request, workflowID) {
  if (!workflowID) return null;
  const response = await caches.default.match(workflowRequest(request, workflowID));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

export async function updateWorkflow(request, workflowID, payload = {}) {
  const workflow = await readWorkflow(request, workflowID);
  if (!workflow) throw new Error("Workflow not found.");
  const now = new Date().toISOString();
  const command = clean(payload.command, 60);

  if (command === "start") {
    if (workflow.approvalRequired && workflow.approvalStatus !== "approved") throw new Error("This workflow requires approval before it can start.");
    workflow.state = "active";
    workflow.startedAt ||= now;
    workflow.nextAction = nextTask(workflow.tasks)?.title || "Complete workflow";
  } else if (command === "approve") {
    workflow.approvalStatus = "approved";
    workflow.approvedAt = now;
    workflow.approvedBy = clean(payload.actor || "Executive", 120);
    workflow.nextAction = workflow.state === "ready" ? "Start workflow" : workflow.nextAction;
  } else if (command === "block") {
    workflow.state = "blocked";
    workflow.blockedReason = clean(payload.reason || "Blocked by operator", 1000);
    workflow.nextAction = "Resolve blocker";
  } else if (command === "resume") {
    workflow.state = "active";
    workflow.blockedReason = null;
    workflow.nextAction = nextTask(workflow.tasks)?.title || "Complete workflow";
  } else if (command === "cancel") {
    workflow.state = "cancelled";
    workflow.cancelledAt = now;
    workflow.nextAction = "No further action";
  } else if (command === "complete") {
    if (workflow.tasks.some(task => task.state !== "completed" && task.state !== "cancelled")) throw new Error("Complete or cancel every task before closing the workflow.");
    workflow.state = "completed";
    workflow.completedAt = now;
    workflow.progress = 100;
    workflow.nextAction = "Review completion receipt";
  } else if (VALID_STATES.has(payload.state)) {
    workflow.state = payload.state;
  }

  if (payload.title !== undefined) workflow.title = clean(payload.title, 180) || workflow.title;
  if (payload.objective !== undefined) workflow.objective = clean(payload.objective, 4000) || workflow.objective;
  if (VALID_PRIORITIES.has(payload.priority)) workflow.priority = payload.priority;
  workflow.updatedAt = now;
  workflow.progress = calculateProgress(workflow.tasks);
  await persistWorkflow(request, workflow);
  await upsertQueue(request, workflow);
  return workflow;
}

export async function createTask(request, workflowID, payload = {}) {
  const workflow = await readWorkflow(request, workflowID);
  if (!workflow) throw new Error("Workflow not found.");
  const title = clean(payload.title, 240);
  if (!title) throw new Error("Enter a task title.");
  const now = new Date().toISOString();
  workflow.tasks.push({
    id: `task-${crypto.randomUUID()}`,
    title,
    description: clean(payload.description, 2000),
    state: "ready",
    owner: clean(payload.owner || "Kairos", 120),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  });
  workflow.updatedAt = now;
  workflow.progress = calculateProgress(workflow.tasks);
  workflow.nextAction = nextTask(workflow.tasks)?.title || workflow.nextAction;
  await persistWorkflow(request, workflow);
  await upsertQueue(request, workflow);
  return workflow;
}

export async function updateTask(request, workflowID, taskID, payload = {}) {
  const workflow = await readWorkflow(request, workflowID);
  if (!workflow) throw new Error("Workflow not found.");
  const task = workflow.tasks.find(candidate => candidate.id === taskID);
  if (!task) throw new Error("Task not found.");
  const now = new Date().toISOString();
  if (payload.title !== undefined) task.title = clean(payload.title, 240) || task.title;
  if (payload.description !== undefined) task.description = clean(payload.description, 2000);
  if (VALID_STATES.has(payload.state)) {
    task.state = payload.state;
    task.completedAt = payload.state === "completed" ? now : null;
  }
  task.updatedAt = now;
  workflow.updatedAt = now;
  workflow.progress = calculateProgress(workflow.tasks);
  workflow.nextAction = nextTask(workflow.tasks)?.title || (workflow.progress === 100 ? "Complete workflow" : "Review workflow");
  await persistWorkflow(request, workflow);
  await upsertQueue(request, workflow);
  return workflow;
}

function normalizeTasks(tasks, now) {
  const source = Array.isArray(tasks) && tasks.length ? tasks : [
    { title: "Define scope", description: "Confirm the objective, constraints, and completion evidence." },
    { title: "Execute work", description: "Perform the bounded production work." },
    { title: "Verify result", description: "Read back the authoritative result and preserve evidence." },
  ];
  return source.slice(0, 50).map(task => ({
    id: `task-${crypto.randomUUID()}`,
    title: clean(task.title, 240) || "Workflow task",
    description: clean(task.description, 2000),
    state: "ready",
    owner: clean(task.owner || "Kairos", 120),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  }));
}

async function persistWorkflow(request, workflow) {
  await caches.default.put(workflowRequest(request, workflow.id), stored(workflow));
}

async function upsertQueue(request, workflow) {
  const queue = await readQueue(request);
  const index = queue.findIndex(item => item.id === workflow.id);
  const summary = summarize(workflow);
  if (index >= 0) queue[index] = summary; else queue.unshift(summary);
  await caches.default.put(queueRequest(request), stored(queue.slice(0, 250)));
}

async function readQueue(request) {
  const response = await caches.default.match(queueRequest(request));
  if (!response) return [];
  try { const value = await response.json(); return Array.isArray(value) ? value : []; } catch { return []; }
}

function summarize(workflow) {
  return {
    id: workflow.id,
    title: workflow.title,
    objective: workflow.objective,
    center: workflow.center,
    priority: workflow.priority,
    state: workflow.state,
    progress: workflow.progress,
    taskCount: workflow.tasks.length,
    completedTasks: workflow.tasks.filter(task => task.state === "completed").length,
    approvalRequired: workflow.approvalRequired,
    approvalStatus: workflow.approvalStatus,
    nextAction: workflow.nextAction,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  };
}

function calculateProgress(tasks) {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter(task => task.state === "completed" || task.state === "cancelled").length / tasks.length) * 100);
}
function nextTask(tasks) { return tasks.find(task => task.state === "ready" || task.state === "active" || task.state === "blocked"); }
function priorityRank(value) { return ({ critical: 0, high: 1, normal: 2, low: 3 })[value] ?? 2; }
function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function workflowRequest(request, id) { return new Request(new URL(`/_kairos/workflows/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function queueRequest(request) { return new Request(new URL("/_kairos/workflows/queue", request.url).toString(), { method: "GET" }); }
