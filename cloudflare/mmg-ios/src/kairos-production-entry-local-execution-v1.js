import { getAgentByName } from "agents";
import operationalRuntime, {
  KairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
} from "./kairos-production-entry-operational-execution-v1.js";

export { KairosProject, KairosProjectAgent, KairosProjectFoundationWorkflow, KairosManuscriptGenerationWorkflow };

export const KAIROS_LOCAL_OPERATIONAL_EXECUTION_BUILD = "kairos-local-operational-execution-20260730-1";

const RUNTIME_PROJECT_PATH = "/registry/kairos-runtime-projects";
const REGISTRY_OBJECT = "mmg-production-project-registry";
const ACTION_ROUTE = /^\/api\/workflows\/([^/]+)\/(approve|prepare-source|sync-source|start-production|complete-production)$/i;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/operational-readiness") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return localReadiness(env);
    }

    if (url.pathname === "/api/kairos" && request.method !== "GET") {
      return json({
        status: "blocked",
        error: {
          code: "LOCAL_INFERENCE_REQUIRED",
          message: "Kairos production generation runs locally through the bundled browser WebGPU runtime. External model-provider calls are disabled.",
        },
        inference: localInferencePolicy(),
      }, 409);
    }

    if (url.pathname === "/api/workflows" && request.method === "GET") {
      const response = await operationalRuntime.fetch(request, env, ctx);
      return projectLocalWorkflowState(response);
    }

    const match = url.pathname.match(ACTION_ROUTE);
    if (match) {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const projectId = clean(decodeURIComponent(match[1]), 180);
      const action = match[2].toLowerCase();
      try {
        if (action === "approve") return await approveFoundationLocally(request, env, projectId);
        if (action === "prepare-source") return await prepareLocalSource(env, projectId);
        if (action === "sync-source") return await syncLocalSource(request, env, projectId);
        if (action === "start-production") return await startLocalProduction(request, env, projectId);
        if (action === "complete-production") return await completeLocalProduction(request, env, projectId);
      } catch (error) {
        return failure(error);
      }
    }

    return operationalRuntime.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof operationalRuntime.scheduled === "function") return operationalRuntime.scheduled(controller, env, ctx);
    return undefined;
  },
};

function localReadiness(env) {
  const checks = {
    runtimeStorage: Boolean(env?.KAIROS_PROJECTS?.idFromName && env?.KAIROS_PROJECTS?.get),
    projectAgent: Boolean(env?.KAIROS_PROJECT_AGENT),
    foundationWorkflow: Boolean(env?.KAIROS_PROJECT_WORKFLOW),
    localInference: String(env?.KAIROS_LOCAL_INFERENCE_ENABLED || "true").toLowerCase() !== "false",
    staticAssets: Boolean(env?.ASSETS),
  };
  const ready = Object.values(checks).every(Boolean);
  return json({
    status: ready ? "ready" : "blocked",
    ready,
    checks,
    execution: {
      foundation: checks.projectAgent && checks.foundationWorkflow ? "ready" : "blocked",
      sourceGeneration: checks.localInference && checks.runtimeStorage ? "browser-webgpu" : "blocked",
      manuscriptProduction: checks.localInference && checks.runtimeStorage ? "browser-webgpu" : "blocked",
      backendProviderCalls: "disabled",
      automaticPublication: "disabled",
      commerceMutation: "approval-gated",
    },
    inference: localInferencePolicy(),
    build: KAIROS_LOCAL_OPERATIONAL_EXECUTION_BUILD,
  }, ready ? 200 : 503);
}

async function approveFoundationLocally(request, env, runtimeProjectId) {
  assertLocalBindings(env);
  const project = await readRuntimeProject(env, runtimeProjectId);
  const agentProjectId = agentProjectID(runtimeProjectId);
  const agent = await projectAgent(env, agentProjectId);
  const agentState = await agent.getState();
  const foundation = agentState?.activeFoundationWorkflow || null;

  if (!foundation?.instanceId) {
    throw runtimeError("The project does not have a durable foundation Workflow instance.", "FOUNDATION_WORKFLOW_NOT_FOUND", 409);
  }

  if (foundation.status !== "completed") {
    await agent.approveFoundationWorkflow({
      instanceId: foundation.instanceId,
      approvedBy: browserIdentityHash(request),
      note: "Foundation approved for local Kairos generation. External model-provider calls are disabled.",
    });
  }

  const operator = browserIdentityHash(request);
  const approved = approveRuntimeApprovals(project.approvals, operator);
  const nextState = ["awaiting_approval", "blocked"].includes(project.state) ? "queued" : project.state;
  if (!new Set(["queued", "awaiting_approval", "blocked"]).has(project.state)) {
    throw runtimeError(`Foundation approval is not valid while the project is ${project.state}.`, "FOUNDATION_APPROVAL_STATE_INVALID", 409);
  }

  const updated = await transitionRuntime(env, runtimeProjectId, {
    state: nextState,
    approvals: approved,
    objective: { ...project.objective, approved: true },
    progress: { percent: 55, stage: "local_source_generation_required", completedUnits: 1, totalUnits: 3 },
    queue: {
      ...project.queue,
      status: "awaiting_local_inference",
      queuedAt: project.queue?.queuedAt || new Date().toISOString(),
      attempt: Number(project.queue?.attempt || 0),
    },
    blockedReason: null,
    operatorIdentityHash: operator,
    event: event("approval_granted", "queued", operator, "Foundation approved. Kairos local source generation is ready."),
  });

  return json({
    status: "approved",
    workflow: localWorkflowProjection(updated, agentProjectId),
    localInference: sourcePlan(updated, agentProjectId),
    nextAction: "Generate the authoritative source locally in Kairos.",
    externalProviderCalled: false,
    build: KAIROS_LOCAL_OPERATIONAL_EXECUTION_BUILD,
  });
}

async function prepareLocalSource(env, runtimeProjectId) {
  assertLocalBindings(env);
  const project = await readRuntimeProject(env, runtimeProjectId);
  assertApproved(project);
  const agentProjectId = agentProjectID(runtimeProjectId);

  if (hasVerifiedSource(project)) {
    return json({
      status: "already-ready",
      localInference: sourcePlan(project, agentProjectId),
      workflow: localWorkflowProjection(project, agentProjectId),
      externalProviderCalled: false,
      build: KAIROS_LOCAL_OPERATIONAL_EXECUTION_BUILD,
    });
  }

  return json({
    status: "local-generation-required",
    localInference: sourcePlan(project, agentProjectId),
    workflow: localWorkflowProjection(project, agentProjectId),
    externalProviderCalled: false,
    build: KAIROS_LOCAL_OPERATIONAL_EXECUTION_BUILD,
  });
}

async function syncLocalSource(request, env, runtimeProjectId) {
  assertLocalBindings(env);
  const project = await readRuntimeProject(env, runtimeProjectId);
  assertApproved(project);
  const agentProjectId = agentProjectID(runtimeProjectId);
  const source = await readAuthoritativeSource(env, agentProjectId);
  const operator = browserIdentityHash(request);
  const assetId = `source_${agentProjectId}`;
  const deliverableId = `deliverable_source_${agentProjectId}`;
  const now = new Date().toISOString();

  const updated = await transitionRuntime(env, runtimeProjectId, {
    state: project.state === "blocked" ? "queued" : project.state,
    assets: upsertById(project.assets, {
      assetId,
      type: "authoritative_source",
      status: "verified",
      version: 1,
      checksum: source.checksum,
      sourceReference: source.sourceReference,
      receivedAt: source.storedAt || now,
    }, "assetId"),
    deliverables: upsertById(project.deliverables, {
      deliverableId,
      type: "authoritative_source",
      status: "ready",
      version: 1,
      assetIds: [assetId],
      approved: true,
    }, "deliverableId"),
    progress: { percent: 65, stage: "local_source_ready", completedUnits: 2, totalUnits: 3 },
    queue: { ...project.queue, status: "ready_for_local_production", queuedAt: project.queue?.queuedAt || now },
    blockedReason: null,
    operatorIdentityHash: operator,
    event: event("asset_received", "queued", operator, "Locally generated authoritative source stored and checksum-verified."),
  });

  return json({
    status: "source-ready",
    workflow: localWorkflowProjection(updated, agentProjectId),
    source,
    nextAction: "Start local manuscript production.",
    externalProviderCalled: false,
    build: KAIROS_LOCAL_OPERATIONAL_EXECUTION_BUILD,
  });
}

async function startLocalProduction(request, env, runtimeProjectId) {
  assertLocalBindings(env);
  const project = await readRuntimeProject(env, runtimeProjectId);
  assertApproved(project);
  if (!hasVerifiedSource(project)) throw runtimeError("A verified authoritative source is required before local production can start.", "AUTHORITATIVE_SOURCE_REQUIRED", 409);
  if (project.state === "quality_review") {
    return json({ status: "already-complete", workflow: localWorkflowProjection(project, agentProjectID(runtimeProjectId)), externalProviderCalled: false });
  }
  if (!new Set(["queued", "executing"]).has(project.state)) {
    throw runtimeError(`Local production cannot start while the project is ${project.state}.`, "LOCAL_PRODUCTION_STATE_INVALID", 409);
  }

  const operator = browserIdentityHash(request);
  const now = new Date().toISOString();
  const updated = project.state === "executing" ? project : await transitionRuntime(env, runtimeProjectId, {
    state: "executing",
    progress: { percent: 70, stage: "local_manuscript_generation", completedUnits: 2, totalUnits: 3 },
    queue: { ...project.queue, status: "running_locally", startedAt: now, attempt: Number(project.queue?.attempt || 0) + 1 },
    operatorIdentityHash: operator,
    event: event("execution_started", "executing", operator, "Kairos local manuscript generation started in the browser WebGPU runtime."),
  });

  const agentProjectId = agentProjectID(runtimeProjectId);
  return json({
    status: "local-production-started",
    workflow: localWorkflowProjection(updated, agentProjectId),
    localInference: {
      mode: "browser-webgpu",
      stage: "manuscript",
      projectId: agentProjectId,
      runtimeProjectId,
      targetWords: 25500,
      externalPaidAPIUsed: false,
      cloudflareNeuronsUsed: 0,
    },
    externalProviderCalled: false,
    build: KAIROS_LOCAL_OPERATIONAL_EXECUTION_BUILD,
  }, 202);
}

async function completeLocalProduction(request, env, runtimeProjectId) {
  assertLocalBindings(env);
  const project = await readRuntimeProject(env, runtimeProjectId);
  if (project.state === "quality_review") {
    return json({ status: "already-complete", workflow: localWorkflowProjection(project, agentProjectID(runtimeProjectId)), externalProviderCalled: false });
  }
  if (project.state !== "executing") throw runtimeError("The project is not running local production.", "LOCAL_PRODUCTION_NOT_RUNNING", 409);

  const agentProjectId = agentProjectID(runtimeProjectId);
  const record = await readLocalInferenceRecord(env, agentProjectId);
  if (record.provider !== "browser-webgpu" || record.externalPaidAPIUsed !== false || Number(record.cloudflareNeuronsUsed || 0) !== 0) {
    throw runtimeError("The stored manuscript does not satisfy the local-only inference contract.", "LOCAL_INFERENCE_EVIDENCE_INVALID", 409);
  }

  const operator = browserIdentityHash(request);
  const now = new Date().toISOString();
  const assetId = `local_manuscript_${agentProjectId}`;
  const updated = await transitionRuntime(env, runtimeProjectId, {
    state: "quality_review",
    assets: upsertById(project.assets, {
      assetId,
      type: "locally_generated_manuscript",
      status: "qa_required",
      version: 1,
      checksum: record.outputSha256,
      sourceReference: `/api/production-registry/manuscripts/${encodeURIComponent(agentProjectId)}/source/download`,
      receivedAt: record.generatedAt || now,
    }, "assetId"),
    deliverables: upsertById(project.deliverables, {
      deliverableId: `deliverable_local_manuscript_${agentProjectId}`,
      type: "expanded_manuscript",
      status: "qa_required",
      version: 1,
      assetIds: [assetId],
      approved: false,
    }, "deliverableId"),
    progress: { percent: 85, stage: "local_manuscript_ready_for_qa", completedUnits: 3, totalUnits: 3 },
    queue: { ...project.queue, status: "completed", completedAt: now },
    operatorIdentityHash: operator,
    event: event("execution_completed", "quality_review", operator, "Kairos local manuscript generation completed and entered quality review."),
  });

  return json({
    status: "local-production-complete",
    workflow: localWorkflowProjection(updated, agentProjectId),
    localInference: record,
    nextAction: "Review the locally generated manuscript before packaging.",
    externalProviderCalled: false,
    build: KAIROS_LOCAL_OPERATIONAL_EXECUTION_BUILD,
  });
}

async function projectLocalWorkflowState(response) {
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; }
  catch { return new Response(text, { status: response.status, headers: response.headers }); }
  if (!response.ok || !Array.isArray(body?.workflows)) return stampJSON(body, response.status, response.headers);

  body.workflows = body.workflows.map((workflow) => {
    const rawState = clean(workflow?.rawState || workflow?.runtimeState || "", 40);
    const stage = clean(workflow?.progress?.stage || workflow?.stage || "", 80);
    const sourceReady = workflow?.sourceReady === true;
    if (["queued", "blocked"].includes(rawState) && !sourceReady) {
      return { ...workflow, state: "queued", actionRequired: "prepare-source", nextAction: "Generate authoritative source locally", executionMode: "browser-webgpu", externalProviderCalled: false };
    }
    if (["queued", "blocked"].includes(rawState) && sourceReady) {
      return { ...workflow, state: "queued", actionRequired: "start-production", nextAction: "Run manuscript production locally", executionMode: "browser-webgpu", externalProviderCalled: false };
    }
    if (rawState === "executing" || stage === "local_manuscript_generation") {
      return { ...workflow, state: "active", actionRequired: null, nextAction: "Local manuscript generation is running on this device", executionMode: "browser-webgpu", externalProviderCalled: false };
    }
    if (rawState === "quality_review" || stage === "local_manuscript_ready_for_qa") {
      return { ...workflow, state: "completed", actionRequired: null, nextAction: "Review local manuscript before packaging", executionMode: "browser-webgpu", externalProviderCalled: false };
    }
    return workflow;
  });
  body.inference = localInferencePolicy();
  body.build = KAIROS_LOCAL_OPERATIONAL_EXECUTION_BUILD;
  return stampJSON(body, response.status, response.headers);
}

function localWorkflowProjection(project, agentProjectId) {
  const sourceReady = hasVerifiedSource(project);
  let actionRequired = null;
  let nextAction = "Review project state.";
  if (project.state === "awaiting_approval") { actionRequired = "approve-foundation"; nextAction = "Approve the foundation."; }
  else if (project.state === "queued" && !sourceReady) { actionRequired = "prepare-source"; nextAction = "Generate authoritative source locally."; }
  else if (project.state === "queued" && sourceReady) { actionRequired = "start-production"; nextAction = "Run manuscript production locally."; }
  else if (project.state === "executing") nextAction = "Local manuscript generation is running.";
  else if (project.state === "quality_review") nextAction = "Review the local manuscript before packaging.";
  return {
    id: project.projectId,
    runtimeProjectId: project.projectId,
    agentProjectId,
    title: project.title,
    objective: project.objective?.summary || null,
    state: project.state === "quality_review" ? "completed" : project.state === "executing" ? "active" : project.state,
    rawState: project.state,
    progress: project.progress,
    sourceReady,
    actionRequired,
    nextAction,
    executionMode: "browser-webgpu",
    externalProviderCalled: false,
    automaticPublicationAllowed: false,
    commerceMutationAllowed: false,
  };
}

function sourcePlan(project, agentProjectId) {
  return {
    mode: "browser-webgpu",
    stage: "authoritative-source",
    runtimeProjectId: project.projectId,
    projectId: agentProjectId,
    title: project.title,
    objective: project.objective?.summary || project.title,
    minimumWords: 1500,
    modelPreference: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    externalPaidAPIUsed: false,
    cloudflareNeuronsUsed: 0,
  };
}

function localInferencePolicy() {
  return {
    provider: "browser-webgpu",
    runtime: "same-origin-webllm",
    noCost: true,
    externalPaidAPIUsed: false,
    cloudflareNeuronsUsed: 0,
    backendProviderCalls: false,
  };
}

async function readAuthoritativeSource(env, projectId) {
  const response = await registryStub(env).fetch(new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source/text`, { method: "GET" }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw runtimeError(body?.error?.message || "The locally generated authoritative source is unavailable.", body?.error?.code || "AUTHORITATIVE_SOURCE_NOT_FOUND", response.status);
  const manuscript = String(body?.manuscript || "").trim();
  if (manuscript.length < 500) throw runtimeError("The locally generated authoritative source is incomplete.", "AUTHORITATIVE_SOURCE_INCOMPLETE", 409);
  return {
    checksum: clean(body?.source?.checksum, 180) || null,
    storedAt: body?.source?.storedAt || body?.source?.updatedAt || new Date().toISOString(),
    wordCount: Number(body?.source?.wordCount || countWords(manuscript)),
    characterCount: manuscript.length,
    sourceReference: `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source/text`,
  };
}

async function readLocalInferenceRecord(env, projectId) {
  const response = await registryStub(env).fetch(new Request(`https://kairos.internal/registry/manuscripts/${projectId}/local-inference`, { method: "GET" }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.localInference) throw runtimeError(body?.error?.message || "No locally generated manuscript is stored.", body?.error?.code || "LOCAL_INFERENCE_NOT_FOUND", response.status || 404);
  return body.localInference;
}

async function projectAgent(env, projectId) {
  if (!env?.KAIROS_PROJECT_AGENT) throw runtimeError("The Kairos project-agent binding is unavailable.", "PROJECT_AGENT_UNAVAILABLE", 503);
  return getAgentByName(env.KAIROS_PROJECT_AGENT, projectId, { locationHint: "wnam", routingRetry: { maxAttempts: 3 } });
}

async function readRuntimeProject(env, projectId) {
  const result = await runtimeMutation(env, { operation: "read", projectId });
  if (!result?.project) throw runtimeError("Kairos runtime project was not found.", "RUNTIME_PROJECT_NOT_FOUND", 404);
  return result.project;
}

async function transitionRuntime(env, projectId, input) {
  const result = await runtimeMutation(env, { operation: "transition", projectId, input });
  return result.project;
}

async function runtimeMutation(env, payload) {
  const response = await registryStub(env).fetch(new Request(`https://kairos.internal${RUNTIME_PROJECT_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw runtimeError(body?.error?.message || "Kairos runtime storage operation failed.", body?.error?.code || "RUNTIME_STORAGE_FAILED", response.status);
  return body;
}

function registryStub(env) {
  if (!env?.KAIROS_PROJECTS?.idFromName || !env?.KAIROS_PROJECTS?.get) throw runtimeError("Kairos runtime project storage is unavailable.", "RUNTIME_STORAGE_UNAVAILABLE", 503);
  return env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
}

function assertLocalBindings(env) {
  const missing = [];
  if (!env?.KAIROS_PROJECTS?.idFromName || !env?.KAIROS_PROJECTS?.get) missing.push("runtime storage");
  if (!env?.KAIROS_PROJECT_AGENT) missing.push("project Agent");
  if (!env?.KAIROS_PROJECT_WORKFLOW) missing.push("foundation Workflow");
  if (String(env?.KAIROS_LOCAL_INFERENCE_ENABLED || "true").toLowerCase() === "false") missing.push("local inference");
  if (missing.length) throw runtimeError(`Kairos local execution is unavailable: ${missing.join(", ")}.`, "LOCAL_EXECUTION_BINDINGS_INCOMPLETE", 503);
}

function assertApproved(project) {
  if (!project?.approvals?.some((item) => item?.required && item?.status === "approved")) {
    throw runtimeError("Foundation approval is required before local generation.", "FOUNDATION_APPROVAL_REQUIRED", 409);
  }
}

function hasVerifiedSource(project) {
  return Array.isArray(project?.assets) && project.assets.some((item) => item?.type === "authoritative_source" && item?.status === "verified" && item?.checksum);
}

function approveRuntimeApprovals(value, operator) {
  const now = new Date().toISOString();
  return (Array.isArray(value) ? value : []).map((item) => ({
    ...item,
    status: item.required === false ? item.status : "approved",
    decidedAt: now,
    identityHash: operator,
    rationale: "Approved for Kairos local-only generation in the Executive OS.",
  }));
}

function event(type, state, actorIdentityHash, summary) {
  return { type, state, actorIdentityHash, summary, occurredAt: new Date().toISOString(), evidenceIds: [] };
}

function upsertById(value, item, key) {
  const list = Array.isArray(value) ? value.slice() : [];
  const index = list.findIndex((entry) => entry?.[key] === item[key]);
  if (index >= 0) list[index] = { ...list[index], ...item };
  else list.push(item);
  return list;
}

function agentProjectID(runtimeProjectId) {
  const value = clean(runtimeProjectId, 180).toLowerCase().replace(/_/g, "-").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 128);
  if (!/^[a-z0-9][a-z0-9-]{7,127}$/.test(value)) throw runtimeError("The Kairos project identifier could not be normalized for the project Agent.", "PROJECT_AGENT_ID_INVALID", 400);
  return value;
}

function browserIdentityHash(request) {
  const identity = clean(request.headers.get("cf-access-authenticated-user-email") || request.headers.get("x-kairos-operator") || "kairos-dashboard-operator", 320).toLowerCase();
  let hash = 2166136261;
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function countWords(value) { return (String(value || "").match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length; }
function methodNotAllowed(allowed) { return json({ error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed}.` } }, 405); }
function failure(error) {
  return json({
    status: "failed",
    error: { code: error?.code || "LOCAL_OPERATION_FAILED", message: error instanceof Error ? error.message : "Kairos local execution failed.", retriable: Number(error?.status || 500) >= 500 },
    inference: localInferencePolicy(),
    build: KAIROS_LOCAL_OPERATIONAL_EXECUTION_BUILD,
  }, Number(error?.status || 503));
}
function runtimeError(message, code = "LOCAL_OPERATION_FAILED", status = 400) { return Object.assign(new Error(message), { code, status }); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function stampJSON(body, status, inheritedHeaders = new Headers()) {
  const headers = new Headers(inheritedHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Local-Execution", KAIROS_LOCAL_OPERATIONAL_EXECUTION_BUILD);
  headers.set("X-Kairos-External-Provider", "disabled");
  headers.set("X-Kairos-Inference-Cost-Mode", "no-cost-local");
  return new Response(JSON.stringify(body), { status, headers });
}
function json(value, status = 200) { return stampJSON(value, status); }
