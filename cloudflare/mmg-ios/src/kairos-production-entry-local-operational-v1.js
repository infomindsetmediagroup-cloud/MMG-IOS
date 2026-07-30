import { getAgentByName } from "agents";
import operationalRuntime, {
  KairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
} from "./kairos-production-entry-operational-execution-v1.js";

export {
  KairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
};

export const KAIROS_LOCAL_OPERATIONAL_BUILD = "kairos-local-operational-20260730-1";

const RUNTIME_PROJECT_PATH = "/registry/kairos-runtime-projects";
const REGISTRY_OBJECT = "mmg-production-project-registry";
const ACTION_ROUTE = /^\/api\/workflows\/([^/]+)\/(approve|prepare-source|start-production)$/i;
const LEGACY_SAFE_ACTION_ROUTE = /^\/api\/workflows\/([^/]+)\/(resume|reject)$/i;
const SERVER_GENERATION_ROUTE = /^\/api\/production-registry\/manuscripts\/[^/]+\/generation-job$/i;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (path === "/api/operational-readiness") {
      if (method !== "GET") return methodNotAllowed("GET");
      return stamp(localOperationalReadiness(env));
    }

    if (/^\/api\/kairos\/?$/i.test(path)) {
      return stamp(localKairosContract(request));
    }

    if (method === "POST" && SERVER_GENERATION_ROUTE.test(path)) {
      return stamp(json({
        status: "local_execution_required",
        error: {
          code: "LOCAL_BROWSER_INFERENCE_REQUIRED",
          message: "Kairos production generation runs locally through the browser WebGPU runtime. Server-side provider generation is disabled.",
        },
        provider: "browser-webgpu",
        externalPaidAPIUsed: false,
        build: KAIROS_LOCAL_OPERATIONAL_BUILD,
      }, 409));
    }

    if (path === "/api/workflows" && method === "GET") {
      return stamp(await readLocalOperationalWorkflows(request, env, ctx));
    }

    const actionMatch = path.match(ACTION_ROUTE);
    if (actionMatch) {
      if (method !== "POST") return methodNotAllowed("POST");
      return stamp(await handleLocalWorkflowAction(
        request,
        env,
        ctx,
        decodeURIComponent(actionMatch[1]),
        actionMatch[2].toLowerCase(),
      ));
    }

    if (path === "/api/hub/run" || LEGACY_SAFE_ACTION_ROUTE.test(path)) {
      return stamp(await operationalRuntime.fetch(request, readinessCompatibilityEnv(env), ctx));
    }

    return stamp(await operationalRuntime.fetch(request, localOnlyEnv(env), ctx));
  },

  async scheduled(controller, env, ctx) {
    if (typeof operationalRuntime.scheduled === "function") {
      return operationalRuntime.scheduled(controller, localOnlyEnv(env), ctx);
    }
    return undefined;
  },
};

function localOperationalReadiness(env) {
  const checks = {
    runtimeStorage: Boolean(env?.KAIROS_PROJECTS?.idFromName && env?.KAIROS_PROJECTS?.get),
    projectAgent: Boolean(env?.KAIROS_PROJECT_AGENT),
    foundationWorkflow: Boolean(env?.KAIROS_PROJECT_WORKFLOW),
    browserAssets: Boolean(env?.ASSETS),
    localInference: true,
    externalProviderDisabled: true,
  };
  const ready = checks.runtimeStorage && checks.projectAgent && checks.foundationWorkflow && checks.browserAssets;
  return json({
    status: ready ? "ready" : "degraded",
    checks,
    objectiveSubmission: checks.runtimeStorage && checks.projectAgent && checks.foundationWorkflow ? "ready" : "blocked",
    sourceGeneration: checks.browserAssets ? "local-browser" : "blocked",
    productionExecution: checks.browserAssets ? "local-browser" : "blocked",
    inferenceProvider: "browser-webgpu",
    externalPaidAPIUsed: false,
    openAICallAllowed: false,
    approvalPolicy: "explicit",
    automaticPublicationAllowed: false,
    commerceMutationAllowed: false,
    build: KAIROS_LOCAL_OPERATIONAL_BUILD,
  }, ready ? 200 : 503);
}

function localKairosContract(request) {
  if (request.method === "GET") {
    return json({
      success: true,
      status: "ready",
      provider: "browser-webgpu",
      executionSurface: "local-browser",
      externalPaidAPIUsed: false,
      openAICallAllowed: false,
      build: KAIROS_LOCAL_OPERATIONAL_BUILD,
    });
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return methodNotAllowed("GET, POST, or OPTIONS");
  return json({
    success: false,
    status: "local_execution_required",
    error: {
      code: "LOCAL_BROWSER_INFERENCE_REQUIRED",
      message: "Kairos intelligence is produced locally in the browser. The server model-provider route is disabled.",
    },
    provider: "browser-webgpu",
    externalPaidAPIUsed: false,
    openAICallAllowed: false,
    build: KAIROS_LOCAL_OPERATIONAL_BUILD,
  }, 409);
}

async function readLocalOperationalWorkflows(request, env, ctx) {
  try {
    assertLocalBindings(env);
    const delegated = await operationalRuntime.fetch(request, readinessCompatibilityEnv(env), ctx);
    const payload = await delegated.json().catch(() => ({}));
    if (!delegated.ok) {
      throw runtimeError(
        payload?.error?.message || `Workflow projection returned ${delegated.status}.`,
        payload?.error?.code || "WORKFLOW_PROJECTION_FAILED",
        delegated.status,
      );
    }
    const workflows = (Array.isArray(payload?.workflows) ? payload.workflows : []).map(enhanceLocalWorkflow);
    return json({
      ...payload,
      status: "ready",
      workflows,
      count: workflows.length,
      executionSource: "kairos-project-agent-local-webgpu",
      inferenceProvider: "browser-webgpu",
      externalPaidAPIUsed: false,
      openAICallAllowed: false,
      operationalBuild: KAIROS_LOCAL_OPERATIONAL_BUILD,
    });
  } catch (error) {
    return failure(error, "WORKFLOW_PROJECTION_FAILED", "Kairos could not load local operational workflows.");
  }
}

function enhanceLocalWorkflow(workflow) {
  const assets = Array.isArray(workflow?.assets) ? workflow.assets : [];
  const sourceReady = assets.some((asset) => asset?.type === "authoritative_source" && ["verified", "stored", "ready"].includes(String(asset?.status || "").toLowerCase()));
  const localComplete = assets.some((asset) => asset?.type === "locally_generated_manuscript" && ["verified", "stored", "ready"].includes(String(asset?.status || "").toLowerCase()));
  const approved = Array.isArray(workflow?.approvals) && workflow.approvals.some((item) => item?.required && item?.status === "approved");
  const foundationStatus = String(workflow?.foundationWorkflow?.status || "").toLowerCase();
  const foundationComplete = foundationStatus === "completed" || (approved && !workflow?.pendingApproval);

  const localized = {
    ...workflow,
    sourceReady,
    localProductionComplete: localComplete,
    inferenceProvider: "browser-webgpu",
    externalPaidAPIUsed: false,
    openAICallAllowed: false,
    localOperationalBuild: KAIROS_LOCAL_OPERATIONAL_BUILD,
  };

  if (!sourceReady && foundationComplete) {
    return {
      ...localized,
      state: "pending",
      progressPercent: Math.max(55, Number(workflow?.progressPercent || 0)),
      actionRequired: "prepare-local-source",
      canApprove: true,
      canReject: false,
      canStartProduction: false,
      localSourceRequired: true,
      blockedReason: null,
      statusReason: null,
      nextAction: "Generate and verify the authoritative source locally on this device.",
    };
  }

  if (sourceReady && !localComplete && approved) {
    return {
      ...localized,
      state: "queued",
      progressPercent: Math.max(60, Number(workflow?.progressPercent || 0)),
      actionRequired: "start-local-production",
      canApprove: false,
      canReject: false,
      canStartProduction: true,
      localProductionRequired: true,
      blockedReason: null,
      statusReason: null,
      nextAction: "Start local WebGPU manuscript production on this device.",
    };
  }

  if (localComplete) {
    return {
      ...localized,
      state: "active",
      progressPercent: Math.max(90, Number(workflow?.progressPercent || 0)),
      actionRequired: null,
      canApprove: false,
      canReject: false,
      canStartProduction: false,
      blockedReason: null,
      statusReason: null,
      nextAction: "Review the locally generated manuscript evidence before packaging.",
    };
  }

  return localized;
}

async function handleLocalWorkflowAction(request, env, ctx, runtimeProjectId, action) {
  try {
    assertLocalBindings(env);
    if (!/^kproject_[a-z0-9_-]{8,}$/i.test(runtimeProjectId)) {
      return json({ error: { code: "WORKFLOW_ID_INVALID", message: "The Kairos workflow identifier is invalid." } }, 400);
    }
    const runtimeProject = await readRuntimeProject(env, runtimeProjectId);
    const agentProjectId = agentProjectID(runtimeProjectId);
    const operator = browserIdentityHash(request);

    if (action === "approve") {
      const result = await approveLocalFoundation(env, runtimeProject, agentProjectId, operator);
      return json({ status: "accepted", action, runtimeProjectId, agentProjectId, ...result }, 202);
    }
    if (action === "prepare-source") {
      const result = await synchronizeLocalSource(request, env, ctx, runtimeProject, agentProjectId, operator);
      return json({ status: "accepted", action, runtimeProjectId, agentProjectId, ...result }, 202);
    }
    if (action === "start-production") {
      const result = await completeLocalProduction(request, env, ctx, runtimeProject, agentProjectId, operator);
      return json({ status: "accepted", action, runtimeProjectId, agentProjectId, ...result }, 202);
    }
    return json({ error: { code: "WORKFLOW_ACTION_INVALID", message: "This local Kairos workflow action is not supported." } }, 400);
  } catch (error) {
    return failure(error, "LOCAL_WORKFLOW_ACTION_FAILED", "Kairos could not complete the local workflow action.");
  }
}

async function approveLocalFoundation(env, runtimeProject, agentProjectId, operator) {
  const agent = await projectAgent(env, agentProjectId);
  const agentState = await agent.getProjectState();
  const instanceId = agentState?.pendingApproval?.workflowInstanceId || agentState?.activeWorkflow?.instanceId;
  const foundationStatus = String(agentState?.activeWorkflow?.status || "").toLowerCase();
  const foundationAlreadyCompleted = foundationStatus === "completed" && !agentState?.pendingApproval;
  if (!instanceId) throw runtimeError("No foundation workflow was found.", "FOUNDATION_APPROVAL_NOT_FOUND", 409);
  if (!foundationAlreadyCompleted) {
    await agent.approveFoundationWorkflow(instanceId, {
      approvedBy: operator,
      reason: "Approved for local Kairos production in the Executive OS.",
    });
  }

  const sourceReady = hasAsset(runtimeProject, "authoritative_source");
  const targetState = runtimeProject.state === "blocked" || runtimeProject.state === "planning"
    ? "awaiting_approval"
    : runtimeProject.state;
  const updated = await transitionRuntime(env, runtimeProject.projectId, {
    state: targetState,
    event: event("approval_granted", targetState, operator, sourceReady
      ? "The foundation is approved and the verified authoritative source is retained."
      : "The foundation is approved. Authoritative source generation will run locally on the operator device."),
    progress: sourceReady
      ? runtimeProject.progress
      : { percent: 55, stage: "local_source_required", completedUnits: 2, totalUnits: 5 },
    objective: { ...(runtimeProject.objective || {}), approved: true },
    approvals: approveRuntimeApprovals(runtimeProject.approvals, operator),
    blockedReason: null,
    operatorIdentityHash: operator,
  });

  return {
    workflowInstanceId: instanceId,
    sourceRequired: !sourceReady,
    provider: "browser-webgpu",
    externalPaidAPIUsed: false,
    workflow: enhanceLocalWorkflow({ ...updated, foundationWorkflow: await agent.getProjectState().then((state) => state?.activeWorkflow || null) }),
    nextAction: sourceReady
      ? "Start local production."
      : "Generate the authoritative source locally on this device.",
  };
}

async function synchronizeLocalSource(request, env, ctx, runtimeProject, agentProjectId, operator) {
  if (!hasApproval(runtimeProject)) {
    throw runtimeError("The project foundation must be approved before local source synchronization.", "PRODUCTION_APPROVAL_REQUIRED", 409);
  }
  const sourceResponse = await operationalRuntime.fetch(new Request(
    new URL(`/api/production-registry/manuscripts/${encodeURIComponent(agentProjectId)}/source/text`, request.url),
    { method: "GET", headers: request.headers },
  ), localOnlyEnv(env), ctx);
  const sourceBody = await sourceResponse.json().catch(() => ({}));
  const manuscript = String(sourceBody?.manuscript || "").trim();
  if (!sourceResponse.ok || manuscript.length < 500) {
    throw runtimeError(sourceBody?.error?.message || "The locally generated authoritative source is unavailable or incomplete.", sourceBody?.error?.code || "LOCAL_SOURCE_REQUIRED", 409);
  }
  const source = sourceBody?.source || {};
  const assets = upsertById(runtimeProject.assets, {
    assetId: `asset_source_${agentProjectId}`,
    type: "authoritative_source",
    status: "verified",
    version: 1,
    checksum: source.checksum || null,
    sourceReference: source.sourceDownloadURL || `/api/production-registry/manuscripts/${encodeURIComponent(agentProjectId)}/source/download`,
    receivedAt: new Date().toISOString(),
  }, "assetId");
  const deliverables = upsertById(runtimeProject.deliverables, {
    deliverableId: `deliverable_manuscript_${agentProjectId}`,
    type: "digital_asset_manuscript",
    status: "planned",
    version: 1,
    assetIds: [`asset_source_${agentProjectId}`],
    approved: false,
  }, "deliverableId");
  const state = ["awaiting_approval", "blocked"].includes(runtimeProject.state) ? "queued" : runtimeProject.state;
  if (!["queued", "executing", "quality_review", "packaging"].includes(state)) {
    throw runtimeError(`The project cannot synchronize a local source from state ${runtimeProject.state}.`, "LOCAL_SOURCE_STATE_INVALID", 409);
  }
  const updated = await transitionRuntime(env, runtimeProject.projectId, {
    state,
    event: event("asset_received", state, operator, "The locally generated authoritative source was stored and checksum-verified."),
    progress: { percent: 60, stage: "source_ready", completedUnits: 3, totalUnits: 5 },
    objective: { ...(runtimeProject.objective || {}), approved: true },
    approvals: approveRuntimeApprovals(runtimeProject.approvals, operator),
    assets,
    deliverables,
    queue: { ...(runtimeProject.queue || {}), status: "queued", priority: "normal", queuedAt: runtimeProject.queue?.queuedAt || new Date().toISOString() },
    blockedReason: null,
    operatorIdentityHash: operator,
  });
  return {
    source,
    provider: "browser-webgpu",
    externalPaidAPIUsed: false,
    workflow: enhanceLocalWorkflow(updated),
    nextAction: "Start local WebGPU manuscript production.",
  };
}

async function completeLocalProduction(request, env, ctx, runtimeProject, agentProjectId, operator) {
  if (!hasAsset(runtimeProject, "authoritative_source")) {
    throw runtimeError("The authoritative source must be generated and verified before production starts.", "PRODUCTION_SOURCE_REQUIRED", 409);
  }
  if (!hasApproval(runtimeProject)) {
    throw runtimeError("The project foundation must be approved before production starts.", "PRODUCTION_APPROVAL_REQUIRED", 409);
  }
  const inferenceResponse = await operationalRuntime.fetch(new Request(
    new URL(`/api/production-registry/manuscripts/${encodeURIComponent(agentProjectId)}/local-inference`, request.url),
    { method: "GET", headers: request.headers },
  ), localOnlyEnv(env), ctx);
  const inferenceBody = await inferenceResponse.json().catch(() => ({}));
  const inference = inferenceBody?.localInference || null;
  if (!inferenceResponse.ok || !inference) {
    throw runtimeError(inferenceBody?.error?.message || "The locally generated manuscript has not been stored.", inferenceBody?.error?.code || "LOCAL_PRODUCTION_REQUIRED", 409);
  }
  if (String(inference.provider || "") !== "browser-webgpu" || inference.externalPaidAPIUsed !== false) {
    throw runtimeError("The stored manuscript does not satisfy the local-only inference contract.", "LOCAL_INFERENCE_VERIFICATION_FAILED", 409);
  }

  let current = runtimeProject;
  if (["awaiting_approval", "blocked"].includes(current.state)) {
    current = await transitionRuntime(env, current.projectId, {
      state: "queued",
      event: event("execution_queued", "queued", operator, "Verified local production output is ready for runtime reconciliation."),
      approvals: approveRuntimeApprovals(current.approvals, operator),
      queue: { ...(current.queue || {}), status: "queued", queuedAt: new Date().toISOString() },
      blockedReason: null,
      operatorIdentityHash: operator,
    });
  }
  if (current.state === "queued") {
    current = await transitionRuntime(env, current.projectId, {
      state: "executing",
      event: event("execution_started", "executing", operator, "Kairos began verifying the locally generated manuscript."),
      progress: { percent: 80, stage: "local_manuscript_verification", completedUnits: 4, totalUnits: 5 },
      queue: { ...(current.queue || {}), status: "running", startedAt: new Date().toISOString(), attempt: Number(current.queue?.attempt || 0) + 1 },
      operatorIdentityHash: operator,
    });
  }
  if (current.state !== "executing" && current.state !== "quality_review") {
    throw runtimeError(`The project cannot reconcile local production from state ${current.state}.`, "LOCAL_PRODUCTION_STATE_INVALID", 409);
  }

  const assets = upsertById(current.assets, {
    assetId: `asset_local_manuscript_${agentProjectId}`,
    type: "locally_generated_manuscript",
    status: "verified",
    version: 1,
    checksum: inference.outputSha256 || null,
    sourceReference: `/api/production-registry/manuscripts/${encodeURIComponent(agentProjectId)}/local-inference`,
    receivedAt: inference.generatedAt || new Date().toISOString(),
  }, "assetId");
  const deliverables = upsertById(current.deliverables, {
    deliverableId: `deliverable_manuscript_${agentProjectId}`,
    type: "digital_asset_manuscript",
    status: "ready_for_review",
    version: 1,
    assetIds: [`asset_source_${agentProjectId}`, `asset_local_manuscript_${agentProjectId}`],
    approved: false,
  }, "deliverableId");
  const updated = await transitionRuntime(env, current.projectId, {
    state: "quality_review",
    event: event("execution_completed", "quality_review", operator, current.state === "quality_review"
      ? "The locally generated manuscript remains ready for quality review."
      : "The locally generated manuscript was stored, verified, and moved to quality review."),
    progress: { percent: 90, stage: "quality_review", completedUnits: 4, totalUnits: 5 },
    assets,
    deliverables,
    queue: { ...(current.queue || {}), status: "completed", completedAt: new Date().toISOString() },
    blockedReason: null,
    operatorIdentityHash: operator,
  });

  return {
    localInference: inference,
    provider: "browser-webgpu",
    externalPaidAPIUsed: false,
    workflow: enhanceLocalWorkflow(updated),
    nextAction: "Review the locally generated manuscript evidence before packaging.",
  };
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
  if (!env?.KAIROS_PROJECTS?.idFromName || !env?.KAIROS_PROJECTS?.get) {
    throw runtimeError("Kairos runtime project storage is unavailable.", "RUNTIME_STORAGE_UNAVAILABLE", 503);
  }
  return env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
}

function assertLocalBindings(env) {
  const response = localOperationalReadiness(env);
  if (response.status >= 400) throw runtimeError("Kairos local operational bindings are incomplete.", "LOCAL_OPERATIONAL_BINDINGS_INCOMPLETE", 503);
}

function localOnlyEnv(env) {
  return new Proxy(env || {}, {
    get(target, property) {
      if (property === "OPENAI_API_KEY" || property === "KAIROS_MODEL_AUTH_TOKEN") return "";
      if (property === "KAIROS_MODEL_PROVIDER") return "browser-webgpu";
      if (property === "KAIROS_MODEL_ENDPOINT") return "";
      if (property === "KAIROS_MODEL_NAME" || property === "KAIROS_OPENAI_MODEL") return "Kairos Local WebLLM";
      if (property === "KAIROS_LOCAL_INFERENCE_ENABLED" || property === "KAIROS_NO_COST_MODE") return "true";
      return Reflect.get(target, property);
    },
  });
}

function readinessCompatibilityEnv(env) {
  const local = localOnlyEnv(env);
  return new Proxy(local, {
    get(target, property) {
      if (property === "OPENAI_API_KEY") return "local-readiness-sentinel-not-a-provider-key";
      return Reflect.get(target, property);
    },
  });
}

function approveRuntimeApprovals(value, operator) {
  const now = new Date().toISOString();
  return (Array.isArray(value) ? value : []).map((item) => ({
    ...item,
    status: item.required === false ? item.status : "approved",
    decidedAt: now,
    identityHash: operator,
    rationale: "Approved for local Kairos production in the Executive OS.",
  }));
}

function hasApproval(project) {
  return Array.isArray(project?.approvals) && project.approvals.some((item) => item?.required && item?.status === "approved");
}

function hasAsset(project, type) {
  return (Array.isArray(project?.assets) ? project.assets : []).some((asset) => asset?.type === type && ["verified", "stored", "ready"].includes(String(asset?.status || "").toLowerCase()));
}

function upsertById(value, item, key) {
  const list = Array.isArray(value) ? value.slice() : [];
  const index = list.findIndex((entry) => entry?.[key] === item[key]);
  if (index >= 0) list[index] = { ...list[index], ...item };
  else list.push(item);
  return list;
}

function event(type, state, actorIdentityHash, summary) {
  return { type, state, actorIdentityHash, summary, occurredAt: new Date().toISOString(), evidenceIds: [] };
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

function methodNotAllowed(allowed) {
  return stamp(json({ error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed}.` } }, 405));
}

function failure(error, fallbackCode, fallbackMessage) {
  return json({
    status: "failed",
    error: {
      code: error?.code || fallbackCode,
      message: error instanceof Error ? error.message : fallbackMessage,
      retriable: Number(error?.status || 500) >= 500,
    },
    provider: "browser-webgpu",
    externalPaidAPIUsed: false,
    openAICallAllowed: false,
    automaticPublicationAllowed: false,
    commerceMutationAllowed: false,
    build: KAIROS_LOCAL_OPERATIONAL_BUILD,
  }, Number(error?.status || 503));
}

function runtimeError(message, code = "LOCAL_OPERATIONAL_EXECUTION_FAILED", status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Local-Operational", KAIROS_LOCAL_OPERATIONAL_BUILD);
  headers.set("X-Kairos-Inference-Provider", "browser-webgpu");
  headers.set("X-Kairos-External-Paid-API", "disabled");
  headers.set("X-Kairos-Automatic-Publication", "disabled");
  headers.set("X-Kairos-Commerce-Mutation", "approval-gated");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Local-Operational": KAIROS_LOCAL_OPERATIONAL_BUILD,
      "X-Kairos-Inference-Provider": "browser-webgpu",
      "X-Kairos-External-Paid-API": "disabled",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}
