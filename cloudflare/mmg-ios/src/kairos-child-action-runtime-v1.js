import { analyzeNativeObjective } from "./kairos-native-kernel-v1.js";
import { runAutonomyCycle } from "./kairos-autonomy-runtime-v1.js";
import {
  KAIROS_ACTION_CONTRACTS,
  ledgerBatchUpsert,
  ledgerGet,
  ledgerList,
  ledgerUpsert,
} from "./kairos-operational-runtime-v1.js";
import { inferenceRuntime } from "./kairos-intelligence-v1.js";

export const KAIROS_CHILD_ACTION_RUNTIME_BUILD = "kairos-child-action-runtime-20260716-1";
const EXECUTE_ROUTE = "/api/hub/execute";
const TERMINAL_STATES = new Set(["completed", "cancelled", "blocked"]);

export async function handleChildActionRequest(request, env, ctx, delegate) {
  const url = new URL(request.url);
  if (url.pathname !== EXECUTE_ROUTE || request.method !== "POST") return null;
  if (!env?.KAIROS_PROJECTS) return failure(503, "operational_ledger_unavailable", "Kairos durable operational storage is not configured.");
  if (typeof delegate !== "function") return failure(503, "domain_delegate_unavailable", "Kairos domain services are not available to the child-action runtime.");

  const payload = await safeBody(request);
  const action = clean(payload?.action, 120).toLowerCase();
  const definition = KAIROS_ACTION_CONTRACTS[action];
  if (!definition || action === "website" || action === "health") {
    return failure(404, "unknown_child_action", "This child action is not available through the direct execution runtime.");
  }

  const objective = clean(payload?.objective || defaultObjective(definition), 12000);
  if (definition.requiresObjective && objective.length < 3) {
    return failure(400, "objective_required", `Enter the ${definition.title.toLowerCase()} objective.`);
  }

  const now = new Date().toISOString();
  const workflowID = `workflow-${crypto.randomUUID()}`;
  const workItemID = `work-${crypto.randomUUID()}`;
  const taskID = `task-${crypto.randomUUID()}`;
  const resultID = `child-result-${crypto.randomUUID()}`;
  const domainEvidence = await collectDomainEvidence(request, definition, delegate);
  const nativeObjective = analyzeNativeObjective(objective);
  const approvalRequired = Boolean(definition.approvalRequired);
  const task = {
    id: taskID,
    title: `Produce verified ${definition.title} deliverable`,
    description: `Complete the requested ${definition.title} objective as a finished, usable internal deliverable. Ground the output in the authoritative evidence supplied with the work item, follow MMG/Kairos governance, preserve limitations, and return explicit verification and a concrete next action. Objective: ${objective}`,
    stage: "execute",
    executionClass: approvalRequired ? "high-impact-domain-action" : "internal-domain-deliverable",
    approvalRequired,
    approvalStatus: approvalRequired ? "pending" : "not-required",
    state: "ready",
    owner: definition.owner,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  const workflow = {
    id: workflowID,
    build: KAIROS_CHILD_ACTION_RUNTIME_BUILD,
    title: `${definition.title} · ${shortTitle(objective)}`,
    objective,
    center: definition.center,
    priority: normalizePriority(payload?.priority),
    state: "ready",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    owner: definition.owner,
    source: `command-center/${action}/direct-execution`,
    approvalRequired,
    approvalStatus: approvalRequired ? "pending" : "not-required",
    tasks: [task],
    taskCount: 1,
    completedTasks: 0,
    progress: 0,
    nextAction: approvalRequired ? "Approve the governed action" : task.title,
    workItemID,
    safeguards: safeguards(),
  };
  const workItem = {
    id: workItemID,
    workItemID,
    workflowID,
    build: KAIROS_CHILD_ACTION_RUNTIME_BUILD,
    action,
    title: shortTitle(objective),
    objective,
    center: definition.center,
    owner: definition.owner,
    status: "ready",
    state: "ready",
    operation: approvalRequired ? "awaiting-approval" : "direct-native-execution",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    analysis: {
      nativeObjective,
      domainEvidence,
      evidenceCapturedAt: now,
      evidencePolicy: "authoritative-read-only-domain-snapshot",
    },
    intelligence: {
      mode: "direct-objective-to-deliverable",
      runtime: inferenceRuntime(env),
      taskCount: 1,
      planningLayer: "deterministic-contract",
      executionLayer: "verified-native-task-execution",
    },
    domain: {
      workspaceModule: definition.module,
      openEvent: definition.event,
      apiRoutes: definition.apiRoutes,
    },
    payload: sanitizedPayload(payload),
    evidence: {
      source: "kairos-child-action-runtime-v1",
      persistent: true,
      storage: "durable-object",
      domainEvidenceCount: domainEvidence.length,
      externalActionTaken: false,
      inventedData: false,
      executionReceiptRequired: true,
    },
    nextAction: approvalRequired ? "Approve the governed action before execution." : "Kairos is producing and verifying the requested deliverable.",
  };

  await ledgerBatchUpsert(env, [
    { collection: "workflows", id: workflowID, value: workflow },
    { collection: "work-items", id: workItemID, value: workItem },
  ]);

  if (approvalRequired) {
    const result = buildResult({
      resultID,
      action,
      definition,
      objective,
      workflow,
      workItem,
      artifacts: [],
      cycles: [],
      status: "needs-approval",
      summary: `${definition.title} is prepared and requires explicit approval before execution.`,
    });
    await ledgerUpsert(env, "child-action-results", resultID, result);
    return json(result, 202);
  }

  const cycles = [];
  let currentWorkflow = workflow;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const cycle = await runAutonomyCycle(env, {
      source: `command-center-direct:${action}`,
      targetWorkflowID: workflowID,
      claimScope: `direct-${workflowID}-${attempt}-${crypto.randomUUID()}`,
      minimumIntervalMs: 60_000,
      delegate,
    });
    cycles.push(compactCycle(cycle));
    currentWorkflow = (await ledgerGet(env, "workflows", workflowID)) || currentWorkflow;
    if (TERMINAL_STATES.has(String(currentWorkflow?.state || "")) || Number(currentWorkflow?.progress || 0) >= 100) break;
  }

  const [workflowReadback, workItemReadback, allArtifacts] = await Promise.all([
    ledgerGet(env, "workflows", workflowID),
    ledgerGet(env, "work-items", workItemID),
    ledgerList(env, "native-task-artifacts", 300),
  ]);
  currentWorkflow = workflowReadback || currentWorkflow;
  const currentWorkItem = workItemReadback || workItem;
  const artifacts = allArtifacts
    .filter(value => value?.workflowID === workflowID && value?.status === "verified")
    .sort((left, right) => Date.parse(left.createdAt || 0) - Date.parse(right.createdAt || 0));

  const blockedTask = (currentWorkflow?.tasks || []).find(value => value?.state === "blocked");
  const completed = currentWorkflow?.state === "completed" && artifacts.length > 0;
  const blocked = currentWorkflow?.state === "blocked" || Boolean(blockedTask);
  const status = completed ? "completed" : blocked ? "blocked" : "needs-attention";
  const summary = completed
    ? artifacts.at(-1)?.summary || `${definition.title} completed with verified read-back.`
    : blocked
      ? blockedTask?.blockedReason || currentWorkflow?.blockedReason || `${definition.title} could not complete.`
      : `${definition.title} is preserved in the work queue but did not reach verified completion in this request.`;

  const result = buildResult({
    resultID,
    action,
    definition,
    objective,
    workflow: currentWorkflow,
    workItem: currentWorkItem,
    artifacts,
    cycles,
    status,
    summary,
  });
  await ledgerUpsert(env, "child-action-results", resultID, result);
  return json(result, completed ? 200 : blocked ? 409 : 202);
}

async function collectDomainEvidence(request, definition, delegate) {
  const routes = [...new Set([
    "/api/health",
    "/api/readiness-registry",
    ...(Array.isArray(definition.apiRoutes) ? definition.apiRoutes : []),
  ])].filter(route => /^\/api\//.test(route)).slice(0, 6);
  const evidence = [];
  for (const route of routes) {
    try {
      const headers = new Headers(request.headers);
      headers.delete("Content-Length");
      headers.set("X-Kairos-Evidence-Read", "true");
      const response = await delegate(new Request(new URL(route, request.url), { method: "GET", headers }));
      const body = await safeResponseJSON(response);
      evidence.push({
        id: `route:${route}`,
        route,
        status: response.status,
        ok: response.ok,
        body: compact(body),
      });
    } catch (error) {
      evidence.push({
        id: `route:${route}`,
        route,
        status: 0,
        ok: false,
        error: clean(error instanceof Error ? error.message : "Evidence route unavailable.", 1200),
      });
    }
  }
  return evidence;
}

function buildResult({ resultID, action, definition, objective, workflow, workItem, artifacts, cycles, status, summary }) {
  const sections = [];
  for (const artifact of artifacts) {
    const deliverable = artifact?.deliverable || {};
    sections.push({
      name: deliverable.title || `${definition.title} Deliverable`,
      status: "completed",
      content: clean(deliverable.content || artifact.summary, 16000),
      type: deliverable.type || artifact.executionClass || "internal-domain-deliverable",
      artifactID: artifact.id,
      contentHash: artifact.contentHash,
    });
    if (Array.isArray(artifact.verification) && artifact.verification.length) {
      sections.push({
        name: "Verification",
        status: "completed",
        content: artifact.verification.map(item => `• ${item}`).join("\n"),
      });
    }
    if (Array.isArray(artifact.evidenceReferences) && artifact.evidenceReferences.length) {
      sections.push({
        name: "Evidence",
        status: "completed",
        content: artifact.evidenceReferences.join("\n"),
      });
    }
    if (artifact.nextAction) {
      sections.push({ name: "Next Action", status: "completed", content: artifact.nextAction });
    }
  }
  if (!sections.length) {
    sections.push({ name: "Objective", status, content: objective });
    sections.push({
      name: "Execution State",
      status,
      content: `${workflow?.state || status}; ${workflow?.progress || 0}% complete. ${workflow?.nextAction || workItem?.nextAction || "Review the preserved work item."}`,
    });
  }
  return {
    id: resultID,
    resultID,
    status,
    build: KAIROS_CHILD_ACTION_RUNTIME_BUILD,
    kernel: "kairos-child-objective-to-deliverable-v1",
    action,
    title: definition.title,
    objective,
    summary,
    workflowID: workflow?.id || null,
    workItemID: workItem?.id || null,
    workflow,
    sections,
    deliverables: artifacts.map(artifact => ({
      artifactID: artifact.id,
      title: artifact.deliverable?.title || artifact.taskTitle,
      type: artifact.deliverable?.type || artifact.executionClass,
      content: artifact.deliverable?.content || "",
      contentHash: artifact.contentHash,
      verification: artifact.verification || [],
      evidenceReferences: artifact.evidenceReferences || [],
      nextAction: artifact.nextAction || "",
    })),
    cycles,
    evidence: {
      persistent: true,
      artifactReadbackVerified: artifacts.every(value => value?.status === "verified"),
      externalActionTaken: false,
      liveMutationPerformed: false,
      modelReasoningStored: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function compactCycle(value) {
  return {
    id: value?.id || null,
    status: value?.status || "unknown",
    actionsApplied: Number(value?.actionsApplied || 0),
    decisionsPreserved: Number(value?.decisionsPreserved || 0),
    error: value?.error || null,
  };
}

function compact(value) {
  if (value == null || typeof value !== "object") return value;
  const serialized = JSON.stringify(value);
  if (serialized.length <= 12000) return value;
  return {
    truncated: true,
    status: value.status || null,
    build: value.build || null,
    summary: clean(value.summary || value.message, 3000),
    keys: Object.keys(value).slice(0, 60),
  };
}

function sanitizedPayload(payload) {
  return Object.fromEntries(Object.entries(payload || {})
    .filter(([key]) => !["action", "objective"].includes(key))
    .map(([key, value]) => [key, typeof value === "string" ? clean(value, 12000) : value]));
}

function safeguards() {
  return {
    externalPublicationAutomatic: false,
    destructiveActionAutomatic: false,
    spendingAutomatic: false,
    permissionChangeAutomatic: false,
    completionRequiresEvidence: true,
    durableReceiptRequired: true,
    directChildExecution: true,
  };
}

function defaultObjective(definition) {
  return `Inspect authoritative current state and produce the complete ${definition.title} deliverable.`;
}

function normalizePriority(value) {
  return new Set(["critical", "high", "normal", "low"]).has(value) ? value : "normal";
}

function shortTitle(value) {
  const text = clean(value, 180);
  return text.length <= 90 ? text : `${text.slice(0, 87)}…`;
}

function clean(value, maximum) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maximum);
}

async function safeBody(request) {
  try { return await request.json(); } catch { return {}; }
}

async function safeResponseJSON(response) {
  try { return await response.clone().json(); } catch {
    try { return { summary: await response.clone().text() }; } catch { return {}; }
  }
}

function failure(status, code, message) {
  return json({
    status: "needs-attention",
    build: KAIROS_CHILD_ACTION_RUNTIME_BUILD,
    error: { code, message },
  }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Child-Action-Runtime": KAIROS_CHILD_ACTION_RUNTIME_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
