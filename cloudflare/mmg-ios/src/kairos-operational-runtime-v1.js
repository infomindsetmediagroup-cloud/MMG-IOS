import { analyzeNativeObjective } from "./kairos-native-kernel-v1.js";
import { intelligenceConfigured, parseStrictJSON, runKairosIntelligence } from "./kairos-intelligence-v1.js";

export const KAIROS_OPERATIONAL_RUNTIME_BUILD = "kairos-operational-runtime-20260715-1";
const LEDGER_NAME = "kairos-operational-ledger-v1";
const VALID_STATES = new Set(["ready", "active", "blocked", "completed", "cancelled"]);
const VALID_PRIORITIES = new Set(["critical", "high", "normal", "low"]);
const TERMINAL_STATES = new Set(["completed", "cancelled"]);

export const KAIROS_ACTION_CONTRACTS = Object.freeze({
  "knowledge-library": contract("Knowledge Library", "knowledge", "Knowledge Operations", "knowledge-operations.js", "kairos:knowledge-library:open", ["/api/knowledge-library/sources", "/api/knowledge-library/sources/latest"]),
  "research-brief": contract("Research Brief", "knowledge", "Research Operations", "research-synthesis-operations.js", "kairos:research-brief:open", ["/api/research-evidence", "/api/research-evidence/latest"]),
  "decision-record": contract("Decision Record", "knowledge", "Executive Office", "decision-record-operations.js", "kairos:decision-record:open", ["/api/hub/run", "/api/hub/work-items"], true),
  "doctrine-vault": contract("Doctrine Vault", "knowledge", "Knowledge Operations", "knowledge-operations.js", "kairos:doctrine-vault:open", ["/api/doctrine/findings", "/api/doctrine/findings/latest"]),
  "intelligence-synthesis": contract("Intelligence Synthesis", "knowledge", "Executive Intelligence", "research-synthesis-operations.js", "kairos:intelligence-synthesis:open", ["/api/doctrine/syntheses", "/api/doctrine/syntheses/latest"]),
  website: contract("Website Retool", "content", "Website Production", null, null, ["/api/shopify/staging/plan/jobs", "/api/shopify/staging/execute/jobs", "/api/shopify/homepage-release/prepare"]),
  "manuscript-studio": contract("Manuscript Studio", "content", "Publishing", "manuscript-studio.js", "kairos:manuscript-studio:open", ["/api/production-registry/manuscripts", "/api/manuscript/intake/advance"]),
  "social-production": contract("Social Production", "content", "Marketing", "social-production.js", "kairos:social-production:open", ["/api/social-production/prepare", "/api/social-production/connector-handoffs"]),
  "publishing-studio": contract("Publishing Studio", "content", "Publishing", "publishing-studio.js", "kairos:publishing-studio:open", ["/api/publishing-studio/projects", "/api/publishing-studio/latest", "/api/publishing/jobs"]),
  "creative-studio": contract("Creative Studio", "content", "Design Studio", "creative-studio.js", "kairos:creative-studio:open", ["/api/creative-studio/projects", "/api/creative-studio/latest"]),
  "product-launch": contract("Product Launch", "business", "Launch Operations", "product-launch-studio.js", "kairos:product-launch:open", ["/api/product-launch/projects", "/api/product-launch/latest"]),
  "revenue-intelligence": contract("Revenue Intelligence", "business", "Revenue Operations", "revenue-intelligence.js", "kairos:revenue-intelligence:open", ["/api/revenue-intelligence/reviews", "/api/revenue-intelligence/latest"]),
  "growth-plan": contract("Growth Plan", "business", "Growth Operations", "growth-plan.js", "kairos:growth-plan:open", ["/api/growth-plans", "/api/growth-plans/latest"]),
  "offer-builder": contract("Offer Builder", "business", "Offer Operations", "offer-builder.js", "kairos:offer-builder:open", ["/api/offers", "/api/offers/latest"]),
  "campaign-operations": contract("Campaign Operations", "business", "Marketing", "campaign-operations.js", "kairos:campaign-operations:open", ["/api/campaigns", "/api/campaigns/latest"]),
  "visitor-activity": contract("Visitor Activity", "customers", "Analytics", "visitor-activity.js", "kairos:visitor-activity:open", ["/api/visitor-activity/latest", "/api/analytics/live"]),
  "customer-portal": contract("Customer Portal", "customers", "Customer Success", "customer-portal.js", "kairos:customer-portal:open", ["/api/customer-projects", "/api/customer-projects/latest"]),
  deliverables: contract("Deliverables", "customers", "Deliverables and Packaging", "deliverables.js", "kairos:deliverables:open", ["/api/deliverables", "/api/deliverables/latest"]),
  "customer-journey": contract("Customer Journey", "customers", "Customer Experience", "customer-journeys.js", "kairos:customer-journeys:open", ["/api/customer-journeys", "/api/customer-journeys/latest"]),
  "support-intelligence": contract("Support Intelligence", "customers", "Customer Success", "support-intelligence.js", "kairos:support-intelligence:open", ["/api/support-intelligence/cases", "/api/support-intelligence/latest"]),
  health: contract("Runtime Health", "operations", "Platform Operations", null, null, ["/api/health", "/api/capabilities"]),
  "work-queue": contract("Work Queue", "operations", "Project Management", "workflow-runtime.js", "kairos:workflow-runtime:open", ["/api/workflows", "/api/hub/work-items"]),
  "release-control": contract("Release Control", "operations", "Release Operations", "shopify-release-control.js", "kairos:release-control:open", ["/api/shopify/release/prepare", "/api/shopify/resource-release/prepare"]),
  "executive-briefing": contract("Executive Briefing", "operations", "Executive Office", "executive-briefing.js", "kairos:executive-briefing:open", ["/api/executive-briefing/build", "/api/executive-briefing/latest"]),
  "system-registry": contract("System Registry", "operations", "Platform Operations", "system-registry.js", "kairos:system-registry:open", ["/api/system-registry", "/api/readiness-registry"]),
});

export async function handleOperationalRequest(request, env, ctx, delegate) {
  const url = new URL(request.url);

  if (url.pathname === "/api/hub/run" && request.method === "POST") return runCommand(request, env);
  if (url.pathname === "/api/hub/contracts" && request.method === "GET") return json({ status: "ready", build: KAIROS_OPERATIONAL_RUNTIME_BUILD, actions: KAIROS_ACTION_CONTRACTS });
  if (url.pathname === "/api/hub/work-items" && request.method === "GET") return listPublic("work-items", env, "workItems");
  const workItemMatch = url.pathname.match(/^\/api\/hub\/work-items\/([^/]+)$/);
  if (workItemMatch && request.method === "GET") return getPublic("work-items", decodeURIComponent(workItemMatch[1]), env, "workItem");

  if (url.pathname === "/api/workflows" && request.method === "GET") return listWorkflows(request, env, delegate);
  if (url.pathname === "/api/workflows" && request.method === "POST") return createWorkflowEndpoint(request, env);
  const workflowMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)$/);
  if (workflowMatch && request.method === "GET") return readWorkflowEndpoint(request, decodeURIComponent(workflowMatch[1]), env, delegate);
  if (workflowMatch && request.method === "PATCH") return updateWorkflowEndpoint(request, decodeURIComponent(workflowMatch[1]), env);
  const tasksMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)\/tasks$/);
  if (tasksMatch && request.method === "POST") return createTaskEndpoint(request, decodeURIComponent(tasksMatch[1]), env);
  const taskMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === "PATCH") return updateTaskEndpoint(request, decodeURIComponent(taskMatch[1]), decodeURIComponent(taskMatch[2]), env);

  if (url.pathname === "/api/system-registry" && request.method === "GET") return systemRegistry(request, env, delegate);
  return null;
}

export async function mirrorOperationalResponse(request, response, env) {
  if (!env?.KAIROS_PROJECTS || ["GET", "HEAD", "OPTIONS"].includes(request.method) || !response.ok) return;
  const type = String(response.headers.get("Content-Type") || "");
  if (!type.includes("json")) return;
  let body;
  try { body = await response.clone().json(); } catch { return; }
  if (!body || typeof body !== "object") return;

  const workflows = collectNamedObjects(body, new Set(["workflow", "workflows"]));
  for (const workflow of workflows) if (workflow?.id) await ledgerUpsert(env, "workflows", workflow.id, workflow);

  const domainRecords = collectNamedObjects(body, new Set([
    "record", "project", "finding", "synthesis", "brief", "review", "case", "deliverable", "campaign", "offer", "plan", "activation", "handoff", "release", "workOrder",
  ])).filter(value => durableID(value));
  for (const value of domainRecords) await ledgerUpsert(env, "domain-records", durableID(value), value);

  const now = new Date().toISOString();
  const receiptID = `receipt-${crypto.randomUUID()}`;
  const route = new URL(request.url).pathname;
  const receipt = {
    id: receiptID,
    build: KAIROS_OPERATIONAL_RUNTIME_BUILD,
    status: "completed",
    method: request.method,
    route,
    responseStatus: response.status,
    recordIDs: domainRecords.map(durableID),
    workflowIDs: workflows.map(value => value.id).filter(Boolean),
    evidence: compactEvidence(body),
    createdAt: now,
    updatedAt: now,
  };
  await ledgerUpsert(env, "execution-receipts", receiptID, receipt);
}

async function runCommand(request, env) {
  if (!env?.KAIROS_PROJECTS) return error(503, "operational_ledger_unavailable", "Kairos durable operational storage is not configured.");
  let payload;
  try { payload = await request.json(); } catch { return error(400, "invalid_json", "Kairos requires a valid JSON command."); }
  const action = String(payload?.action || "").trim().toLowerCase();
  const definition = KAIROS_ACTION_CONTRACTS[action];
  if (!definition || action === "website" || action === "health") return error(404, "unknown_child_action", "This action is not available through the governed objective runner.");
  const objective = clean(payload?.objective || defaultObjective(definition), 12000);
  if (definition.requiresObjective && objective.length < 3) return error(400, "objective_required", `Enter the ${definition.title.toLowerCase()} objective.`);

  const now = new Date().toISOString();
  const workItemID = `work-${crypto.randomUUID()}`;
  const workflowID = `workflow-${crypto.randomUUID()}`;
  const analysis = analyzeNativeObjective(objective);
  const intelligence = await buildIntelligentPlan(env, definition, objective, analysis);
  const decision = action === "decision-record";
  const checkpointDecision = action === "executive-briefing" && Boolean(payload?.decision);
  const completedOnWrite = decision || checkpointDecision;
  const tasks = buildTasks(definition, objective, intelligence, now, completedOnWrite);
  const workflow = {
    id: workflowID,
    build: KAIROS_OPERATIONAL_RUNTIME_BUILD,
    title: `${definition.title} · ${shortTitle(objective)}`,
    objective,
    center: definition.center,
    priority: normalizePriority(payload?.priority),
    state: completedOnWrite ? "completed" : "ready",
    createdAt: now,
    updatedAt: now,
    startedAt: completedOnWrite ? now : null,
    completedAt: completedOnWrite ? now : null,
    owner: definition.owner,
    source: `command-center/${action}`,
    approvalRequired: Boolean(definition.approvalRequired && !completedOnWrite),
    approvalStatus: definition.approvalRequired && !completedOnWrite ? "pending" : "not-required",
    tasks,
    progress: completedOnWrite ? 100 : 0,
    nextAction: completedOnWrite ? "Review the durable execution receipt" : tasks[0]?.title || "Open the domain workspace",
    workItemID,
    safeguards: canonicalSafeguards(),
  };
  refreshWorkflow(workflow);

  const workItem = {
    id: workItemID,
    workItemID,
    workflowID,
    build: KAIROS_OPERATIONAL_RUNTIME_BUILD,
    action,
    title: shortTitle(objective),
    objective,
    center: definition.center,
    owner: definition.owner,
    status: completedOnWrite ? "completed" : "ready",
    state: completedOnWrite ? "completed" : "ready",
    operation: completedOnWrite ? "persisted" : "queued-for-domain-execution",
    createdAt: now,
    updatedAt: now,
    completedAt: completedOnWrite ? now : null,
    analysis,
    intelligence,
    domain: {
      workspaceModule: definition.module,
      openEvent: definition.event,
      apiRoutes: definition.apiRoutes,
    },
    payload: commandContext(payload),
    evidence: {
      source: "kairos-operational-ledger-v1",
      persistent: true,
      storage: "durable-object",
      externalActionTaken: false,
      inventedData: false,
      executionReceiptRequired: !completedOnWrite,
    },
    nextAction: completedOnWrite ? "Review the preserved record in My Work." : `Open ${definition.title} and execute the prepared workflow.`,
  };

  await Promise.all([
    ledgerUpsert(env, "workflows", workflowID, workflow),
    ledgerUpsert(env, "work-items", workItemID, workItem),
    completedOnWrite ? ledgerUpsert(env, action === "decision-record" ? "decisions" : "executive-decisions", workItemID, { ...workItem, decision: commandContext(payload) }) : Promise.resolve(),
  ]);

  return json({
    status: workItem.status,
    build: KAIROS_OPERATIONAL_RUNTIME_BUILD,
    kernel: "kairos-operational-orchestrator-v1",
    action,
    workItemID,
    workflowID,
    title: workItem.title,
    summary: completedOnWrite ? `${definition.title} was preserved in the durable operational ledger.` : `${definition.title} execution was analyzed, persisted, and queued in My Work.`,
    nextAction: workItem.nextAction,
    workflow,
    sections: resultSections(definition, workItem, workflow),
    evidence: workItem.evidence,
    intelligence: { mode: intelligence.mode, configured: intelligence.configured, fallbackReason: intelligence.fallbackReason || null },
  }, completedOnWrite ? 200 : 202);
}

async function buildIntelligentPlan(env, definition, objective, analysis) {
  const fallback = {
    mode: "kairos-native-deterministic",
    configured: false,
    summary: `Route ${definition.title} through ${definition.owner} using the constitutional observe-to-improve lifecycle.`,
    tasks: domainTaskSeeds(definition, objective),
    verification: ["Read back the authoritative result.", "Preserve evidence and a recommended next action."],
    fallbackReason: "private-intelligence-not-configured",
  };
  if (!intelligenceConfigured(env)) return fallback;
  try {
    const result = await runKairosIntelligence(env, {
      temperature: 0.1,
      maxTokens: 2600,
      system: "You are the private Kairos objective-planning runtime. Return strict JSON only with keys summary, tasks, verification. tasks is an array of 3-8 objects with title and description. Follow the MMG/Kairos lifecycle Observe, Understand, Decide, Execute, Verify, Preserve, Improve. Kairos orchestrates; domain services execute. Never claim an external action occurred without evidence. Preserve approvals for publishing, communications, spend, billing, destructive actions, and permission changes.",
      user: JSON.stringify({ action: definition.title, owner: definition.owner, center: definition.center, objective, nativeAnalysis: analysis, routes: definition.apiRoutes }),
    });
    const parsed = parseStrictJSON(result.text);
    const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks.slice(0, 8).map(item => ({ title: clean(item?.title, 240), description: clean(item?.description, 2000) })).filter(item => item.title) : [];
    if (!tasks.length) throw new Error("Kairos private intelligence returned no executable tasks.");
    return {
      mode: "kairos-private-runtime",
      configured: true,
      model: result.model,
      usage: result.usage,
      summary: clean(parsed?.summary, 3000) || `Execute ${definition.title}.`,
      tasks,
      verification: Array.isArray(parsed?.verification) ? parsed.verification.slice(0, 8).map(item => clean(item, 800)).filter(Boolean) : [],
    };
  } catch (failure) {
    return { ...fallback, configured: true, fallbackReason: clean(failure?.code || failure?.message || "private-intelligence-failed", 300) };
  }
}

async function listWorkflows(request, env, delegate) {
  const durable = await ledgerList(env, "workflows", 500);
  let legacy = [];
  if (delegate) {
    try {
      const response = await delegate(request);
      const body = await response.clone().json();
      legacy = Array.isArray(body?.workflows) ? body.workflows : [];
      for (const workflow of legacy) if (workflow?.id) await ledgerUpsert(env, "workflows", workflow.id, workflow);
    } catch {}
  }
  const byID = new Map([...legacy, ...durable].filter(value => value?.id).map(value => [value.id, value]));
  const workflows = [...byID.values()].sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0));
  return json({ status: "ready", build: KAIROS_OPERATIONAL_RUNTIME_BUILD, persistence: "durable-object", workflows });
}

async function createWorkflowEndpoint(request, env) {
  const payload = await safeBody(request);
  const workflow = newWorkflow(payload);
  await ledgerUpsert(env, "workflows", workflow.id, workflow);
  return json({ status: "created", build: KAIROS_OPERATIONAL_RUNTIME_BUILD, persistence: "durable-object", workflow }, 201);
}

async function readWorkflowEndpoint(request, id, env, delegate) {
  let workflow = await ledgerGet(env, "workflows", id);
  if (!workflow && delegate) {
    try {
      const response = await delegate(request);
      if (response.ok) {
        const body = await response.clone().json();
        workflow = body?.workflow || null;
        if (workflow?.id) await ledgerUpsert(env, "workflows", workflow.id, workflow);
      }
    } catch {}
  }
  return workflow ? json({ status: "ready", build: KAIROS_OPERATIONAL_RUNTIME_BUILD, persistence: "durable-object", workflow }) : error(404, "workflow_not_found", "Workflow not found.");
}

async function updateWorkflowEndpoint(request, id, env) {
  const workflow = await ledgerGet(env, "workflows", id);
  if (!workflow) return error(404, "workflow_not_found", "Workflow not found.");
  const payload = await safeBody(request);
  const now = new Date().toISOString();
  const command = clean(payload?.command, 60);
  if (command === "approve") {
    workflow.approvalStatus = "approved";
    workflow.approvedAt = now;
    workflow.approvedBy = clean(payload?.actor || "Executive", 120);
  } else if (command === "start") {
    if (workflow.approvalRequired && workflow.approvalStatus !== "approved") return error(409, "workflow_approval_required", "This workflow requires approval before it can start.");
    workflow.state = "active";
    workflow.startedAt ||= now;
  } else if (command === "block") {
    workflow.state = "blocked";
    workflow.blockedReason = clean(payload?.reason || "Blocked by operator", 1000);
  } else if (command === "resume") {
    workflow.state = "active";
    workflow.blockedReason = null;
  } else if (command === "cancel") {
    workflow.state = "cancelled";
    workflow.cancelledAt = now;
  } else if (command === "complete") {
    if ((workflow.tasks || []).some(task => !TERMINAL_STATES.has(task.state))) return error(409, "workflow_tasks_open", "Complete or cancel every task before closing the workflow.");
    workflow.state = "completed";
    workflow.completedAt = now;
  } else if (VALID_STATES.has(payload?.state)) workflow.state = payload.state;
  if (payload?.title !== undefined) workflow.title = clean(payload.title, 180) || workflow.title;
  if (payload?.objective !== undefined) workflow.objective = clean(payload.objective, 4000) || workflow.objective;
  if (VALID_PRIORITIES.has(payload?.priority)) workflow.priority = payload.priority;
  workflow.updatedAt = now;
  refreshWorkflow(workflow);
  await ledgerUpsert(env, "workflows", id, workflow);
  return json({ status: "updated", build: KAIROS_OPERATIONAL_RUNTIME_BUILD, persistence: "durable-object", workflow });
}

async function createTaskEndpoint(request, workflowID, env) {
  const workflow = await ledgerGet(env, "workflows", workflowID);
  if (!workflow) return error(404, "workflow_not_found", "Workflow not found.");
  const payload = await safeBody(request);
  const title = clean(payload?.title, 240);
  if (!title) return error(400, "task_title_required", "Enter a task title.");
  const now = new Date().toISOString();
  workflow.tasks ||= [];
  workflow.tasks.push({ id: `task-${crypto.randomUUID()}`, title, description: clean(payload?.description, 2000), state: "ready", owner: clean(payload?.owner || "Kairos", 120), createdAt: now, updatedAt: now, completedAt: null });
  workflow.updatedAt = now;
  refreshWorkflow(workflow);
  await ledgerUpsert(env, "workflows", workflowID, workflow);
  return json({ status: "created", build: KAIROS_OPERATIONAL_RUNTIME_BUILD, persistence: "durable-object", workflow }, 201);
}

async function updateTaskEndpoint(request, workflowID, taskID, env) {
  const workflow = await ledgerGet(env, "workflows", workflowID);
  if (!workflow) return error(404, "workflow_not_found", "Workflow not found.");
  const task = (workflow.tasks || []).find(value => value.id === taskID);
  if (!task) return error(404, "task_not_found", "Task not found.");
  const payload = await safeBody(request);
  const now = new Date().toISOString();
  if (payload?.title !== undefined) task.title = clean(payload.title, 240) || task.title;
  if (payload?.description !== undefined) task.description = clean(payload.description, 2000);
  if (VALID_STATES.has(payload?.state)) {
    task.state = payload.state;
    task.completedAt = payload.state === "completed" ? now : null;
  }
  task.updatedAt = now;
  workflow.updatedAt = now;
  refreshWorkflow(workflow);
  await ledgerUpsert(env, "workflows", workflowID, workflow);
  return json({ status: "updated", build: KAIROS_OPERATIONAL_RUNTIME_BUILD, persistence: "durable-object", workflow });
}

async function systemRegistry(request, env, delegate) {
  const [workflows, workItems, receipts, health, capabilities, readiness] = await Promise.all([
    ledgerList(env, "workflows", 500),
    ledgerList(env, "work-items", 500),
    ledgerList(env, "execution-receipts", 100),
    delegateJSON(request, delegate, "/api/health"),
    delegateJSON(request, delegate, "/api/capabilities"),
    delegateJSON(request, delegate, "/api/readiness-registry"),
  ]);
  const actions = Object.entries(KAIROS_ACTION_CONTRACTS).map(([id, value]) => ({
    id,
    ...value,
    ui: value.module ? "lazy-domain-workspace" : id === "website" ? "native-governed-pipeline" : "native-command-view",
    persistence: "durable-operational-ledger",
    status: value.module || ["website", "health"].includes(id) ? "wired" : "needs-attention",
  }));
  return json({
    status: env?.KAIROS_PROJECTS ? "ready" : "needs-attention",
    build: KAIROS_OPERATIONAL_RUNTIME_BUILD,
    sourceOfTruth: "KAIROS_PROJECTS durable operational ledger",
    intelligence: {
      nativeObjectiveAnalysis: "operational",
      privateRuntime: intelligenceConfigured(env) ? "configured" : "needs-configuration",
      deterministicFallback: "operational",
    },
    counts: {
      actions: actions.length,
      workflows: workflows.length,
      workItems: workItems.length,
      executionReceipts: receipts.length,
    },
    actions,
    runtime: compactEvidence(health),
    capabilities: compactEvidence(capabilities),
    readiness: compactEvidence(readiness),
  });
}

async function listPublic(collection, env, property) {
  const values = await ledgerList(env, collection, 500);
  return json({ status: "ready", build: KAIROS_OPERATIONAL_RUNTIME_BUILD, persistence: "durable-object", [property]: values });
}

async function getPublic(collection, id, env, property) {
  const value = await ledgerGet(env, collection, id);
  return value ? json({ status: "ready", build: KAIROS_OPERATIONAL_RUNTIME_BUILD, persistence: "durable-object", [property]: value }) : error(404, "work_item_not_found", "Work item not found.");
}

function newWorkflow(payload = {}) {
  const title = clean(payload?.title, 180);
  const objective = clean(payload?.objective, 4000);
  if (!title || !objective) throw Object.assign(new Error("Enter a workflow title and objective."), { statusCode: 400, code: "workflow_input_required" });
  const now = new Date().toISOString();
  const sourceTasks = Array.isArray(payload?.tasks) && payload.tasks.length ? payload.tasks : domainTaskSeeds({ title, owner: payload?.owner || "Kairos" }, objective);
  const workflow = {
    id: `workflow-${crypto.randomUUID()}`,
    build: KAIROS_OPERATIONAL_RUNTIME_BUILD,
    title,
    objective,
    center: ["knowledge", "content", "business", "customers", "operations"].includes(payload?.center) ? payload.center : "operations",
    priority: normalizePriority(payload?.priority),
    state: "ready",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    owner: clean(payload?.owner || "Kairos", 120),
    source: clean(payload?.source || "command-center", 160),
    approvalRequired: Boolean(payload?.approvalRequired),
    approvalStatus: payload?.approvalRequired ? "pending" : "not-required",
    tasks: sourceTasks.slice(0, 50).map(item => taskRecord(item, now, false)),
    progress: 0,
    nextAction: "Start workflow",
    safeguards: canonicalSafeguards(),
  };
  refreshWorkflow(workflow);
  return workflow;
}

function buildTasks(definition, objective, intelligence, now, completed) {
  const source = Array.isArray(intelligence?.tasks) && intelligence.tasks.length ? intelligence.tasks : domainTaskSeeds(definition, objective);
  return source.slice(0, 12).map(item => taskRecord(item, now, completed));
}

function taskRecord(item, now, completed) {
  return {
    id: `task-${crypto.randomUUID()}`,
    title: clean(item?.title, 240) || "Execute governed task",
    description: clean(item?.description, 2000),
    state: completed ? "completed" : "ready",
    owner: clean(item?.owner || "Kairos", 120),
    createdAt: now,
    updatedAt: now,
    completedAt: completed ? now : null,
  };
}

function domainTaskSeeds(definition, objective) {
  return [
    { title: "Observe authoritative current state", description: `Gather the current records, doctrine, permissions, dependencies, and source evidence for: ${objective}` },
    { title: "Understand objective and completion evidence", description: `Confirm scope, constraints, success criteria, owner, and the exact durable outcome for ${definition.title}.` },
    { title: "Decide governed execution path", description: `Route the work through ${definition.owner} and its canonical domain services without moving business logic into the presentation layer.` },
    { title: "Execute through the domain workspace", description: `Use ${definition.title} and its registered APIs to perform the bounded work. High-impact effects remain approval-gated.` },
    { title: "Verify authoritative result", description: "Read back the resulting source-of-truth record and validate completeness, quality, security, and evidence." },
    { title: "Preserve deliverable and receipt", description: "Persist the work item, workflow, domain record, evidence, decision context, and recommended next action." },
    { title: "Improve reusable capability", description: "Capture the reusable lesson, template, or workflow refinement without silently changing constitutional authority." },
  ];
}

function resultSections(definition, workItem, workflow) {
  if (workItem.action === "decision-record") {
    const value = workItem.payload;
    return [
      section("Decision", workItem.objective),
      section("Context", value.context || "No additional context recorded."),
      section("Rationale", value.rationale || "No additional rationale recorded."),
      section("Operational impact", value.impact || "Apply through the governed workflow."),
      section("Authority and review", `${value.owner || "Executive"} · effective ${value.effectiveDate || workItem.createdAt.slice(0, 10)} · ${value.reviewTrigger || "Review when material conditions change."}`),
      section("Durable receipt", `${workItem.id} · ${workflow.id}`),
    ];
  }
  return [
    section("Objective", workItem.objective),
    section("Domain route", `${definition.owner} · ${definition.apiRoutes.join(" · ")}`),
    section("Execution state", `${workflow.state}; ${workflow.tasks.length} governed lifecycle tasks persisted.`),
    section("Durable records", `${workItem.id} · ${workflow.id}`),
  ];
}

function refreshWorkflow(workflow) {
  const tasks = Array.isArray(workflow.tasks) ? workflow.tasks : [];
  const completedTasks = tasks.filter(task => TERMINAL_STATES.has(task.state)).length;
  workflow.taskCount = tasks.length;
  workflow.completedTasks = completedTasks;
  workflow.progress = tasks.length ? Math.round(completedTasks / tasks.length * 100) : 0;
  const next = tasks.find(task => !TERMINAL_STATES.has(task.state));
  workflow.nextAction = workflow.state === "completed" ? "Review completion receipt" : next?.title || "Complete workflow";
}

function canonicalSafeguards() {
  return {
    externalPublicationAutomatic: false,
    destructiveActionAutomatic: false,
    spendingAutomatic: false,
    permissionChangeAutomatic: false,
    completionRequiresEvidence: true,
    durableReceiptRequired: true,
  };
}

function contract(title, center, owner, module, event, apiRoutes, approvalRequired = false) {
  return Object.freeze({ title, center, owner, module, event, apiRoutes: Object.freeze(apiRoutes), requiresObjective: !["visitor-activity", "work-queue", "release-control", "executive-briefing", "system-registry", "health"].includes(title.toLowerCase().replaceAll(" ", "-")), approvalRequired });
}

function defaultObjective(definition) { return `Inspect and operate ${definition.title} using current authoritative records.`; }
function normalizePriority(value) { return VALID_PRIORITIES.has(value) ? value : "normal"; }
function shortTitle(value) { const text = clean(value, 180); return text.length < 90 ? text : `${text.slice(0, 87)}…`; }
function commandContext(payload) { return Object.fromEntries(Object.entries(payload || {}).filter(([key]) => key !== "action" && key !== "objective").map(([key, value]) => [key, typeof value === "string" ? clean(value, 12000) : value])); }
function section(name, content) { return { name, status: "completed", content: String(content || "") }; }
function clean(value, max) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function durableID(value) { return clean(value?.id || value?.projectID || value?.projectId || value?.recordID || value?.releaseID || value?.reviewID || value?.planID || value?.actionID, 220); }

function compactEvidence(value) {
  if (!value || typeof value !== "object") return value ?? null;
  const text = JSON.stringify(value);
  if (text.length <= 60000) return value;
  return { truncated: true, status: value.status || null, build: value.build || null, summary: clean(value.summary || value.message, 4000), keys: Object.keys(value).slice(0, 80) };
}

function collectNamedObjects(value, names, result = [], depth = 0, seen = new Set()) {
  if (!value || typeof value !== "object" || depth > 6 || seen.has(value)) return result;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectNamedObjects(item, names, result, depth + 1, seen);
    return result;
  }
  for (const [key, child] of Object.entries(value)) {
    if (names.has(key)) {
      if (Array.isArray(child)) result.push(...child.filter(item => item && typeof item === "object"));
      else if (child && typeof child === "object") result.push(child);
    }
    collectNamedObjects(child, names, result, depth + 1, seen);
  }
  return result;
}

async function delegateJSON(request, delegate, path) {
  if (!delegate) return null;
  try {
    const response = await delegate(new Request(new URL(path, request.url), { method: "GET", headers: request.headers }));
    return await response.clone().json();
  } catch { return null; }
}

function ledgerStub(env) {
  if (!env?.KAIROS_PROJECTS) throw Object.assign(new Error("Kairos durable operational storage is not configured."), { statusCode: 503, code: "operational_ledger_unavailable" });
  return env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(LEDGER_NAME));
}

async function ledgerUpsert(env, collection, id, value) {
  const response = await ledgerStub(env).fetch(new Request("https://kairos.internal/ledger/upsert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection, id, value }) }));
  if (!response.ok) throw new Error(`Kairos could not persist ${collection}/${id}.`);
  return value;
}

async function ledgerGet(env, collection, id) {
  const response = await ledgerStub(env).fetch(new Request(`https://kairos.internal/ledger/get?collection=${encodeURIComponent(collection)}&id=${encodeURIComponent(id)}`));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Kairos could not read ${collection}/${id}.`);
  return (await response.json()).value || null;
}

async function ledgerList(env, collection, limit = 250) {
  if (!env?.KAIROS_PROJECTS) return [];
  const response = await ledgerStub(env).fetch(new Request(`https://kairos.internal/ledger/list?collection=${encodeURIComponent(collection)}&limit=${limit}`));
  if (!response.ok) throw new Error(`Kairos could not list ${collection}.`);
  const body = await response.json();
  return Array.isArray(body?.values) ? body.values : [];
}

async function safeBody(request) { try { return await request.json(); } catch { return {}; } }

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": KAIROS_OPERATIONAL_RUNTIME_BUILD, "X-Kairos-Persistence": "durable-object", "X-Content-Type-Options": "nosniff" } });
}

function error(status, code, message) { return json({ status: "needs-attention", build: KAIROS_OPERATIONAL_RUNTIME_BUILD, error: { code, message } }, status); }
