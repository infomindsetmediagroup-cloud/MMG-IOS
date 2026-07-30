import { getAgentByName } from "agents";
import localRuntime, {
  KairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
} from "./kairos-production-entry-local-execution-v1.js";

export { KairosProject, KairosProjectAgent, KairosProjectFoundationWorkflow, KairosManuscriptGenerationWorkflow };

export const KAIROS_LOCAL_ONLY_ENTRY_BUILD = "kairos-local-only-entry-20260730-2";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const RUNTIME_PROJECT_PATH = "/registry/kairos-runtime-projects";
const LOCAL_APPROVAL = /^\/api\/workflows\/([^/]+)\/approve$/i;
const LEGACY_MANUSCRIPT_GENERATION = /^\/api\/production-registry\/manuscripts\/[a-z0-9-]{8,}\/generation-job$/i;
const REVENUE_GENERATION = /^\/api\/kairos\/revenue\/(bootstrap-live-runtime|execute-content-batch|execute-visual-batch|execute-package-batch)$/i;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const approvalMatch = url.pathname.match(LOCAL_APPROVAL);

    if (method === "POST" && approvalMatch) {
      try {
        return await approveFoundationLocally(request, env, clean(decodeURIComponent(approvalMatch[1]), 180));
      } catch (error) {
        return failure(error);
      }
    }

    if (method === "POST" && (LEGACY_MANUSCRIPT_GENERATION.test(url.pathname) || REVENUE_GENERATION.test(url.pathname))) {
      return localRequired(url.pathname);
    }

    return localRuntime.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof localRuntime.scheduled === "function") return localRuntime.scheduled(controller, env, ctx);
    return undefined;
  },
};

async function approveFoundationLocally(request, env, runtimeProjectId) {
  if (!/^kproject_[a-z0-9_-]{8,}$/i.test(runtimeProjectId)) {
    throw runtimeError("The Kairos workflow identifier is invalid.", "WORKFLOW_ID_INVALID", 400);
  }
  assertBindings(env);
  const project = await readRuntimeProject(env, runtimeProjectId);
  if (!new Set(["queued", "awaiting_approval", "blocked"]).has(project.state)) {
    throw runtimeError(`Foundation approval is not valid while the project is ${project.state}.`, "FOUNDATION_APPROVAL_STATE_INVALID", 409);
  }

  const agentProjectId = agentProjectID(runtimeProjectId);
  const agent = getAgentByName(env.KAIROS_PROJECT_AGENT, agentProjectId, { locationHint: "wnam", routingRetry: { maxAttempts: 3 } });
  const agentState = await agent.getProjectState();
  const foundation = agentState?.activeWorkflow || null;
  if (!foundation?.instanceId) {
    throw runtimeError("The project does not have a durable foundation Workflow instance.", "FOUNDATION_WORKFLOW_NOT_FOUND", 409);
  }
  if (foundation.status !== "completed") {
    await agent.approveFoundationWorkflow(foundation.instanceId, {
      approvedBy: browserIdentityHash(request),
      reason: "Foundation approved for Kairos local-only generation. External model-provider calls are disabled.",
    });
  }

  const operator = browserIdentityHash(request);
  const updated = await transitionRuntime(env, runtimeProjectId, {
    state: "queued",
    approvals: approveRuntimeApprovals(project.approvals, operator),
    objective: { ...(project.objective || {}), approved: true },
    progress: { percent: 55, stage: "local_source_generation_required", completedUnits: 1, totalUnits: 3 },
    queue: {
      ...(project.queue || {}),
      status: "awaiting_local_inference",
      queuedAt: project.queue?.queuedAt || new Date().toISOString(),
      attempt: Number(project.queue?.attempt || 0),
    },
    blockedReason: null,
    operatorIdentityHash: operator,
    event: {
      type: "approval_granted",
      state: "queued",
      actorIdentityHash: operator,
      summary: "Foundation approved. Kairos local source generation is ready.",
      occurredAt: new Date().toISOString(),
      evidenceIds: [],
    },
  });

  return json({
    status: "approved",
    workflow: {
      id: updated.projectId,
      runtimeProjectId: updated.projectId,
      agentProjectId,
      title: updated.title,
      state: "queued",
      rawState: updated.state,
      progress: updated.progress,
      sourceReady: false,
      actionRequired: "prepare-source",
      nextAction: "Generate the authoritative source locally in Kairos.",
      executionMode: "browser-webgpu",
      externalProviderCalled: false,
      automaticPublicationAllowed: false,
      commerceMutationAllowed: false,
    },
    localInference: {
      mode: "browser-webgpu",
      stage: "authoritative-source",
      runtimeProjectId: updated.projectId,
      projectId: agentProjectId,
      title: updated.title,
      objective: updated.objective?.summary || updated.title,
      minimumWords: 1500,
      modelPreference: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
      externalPaidAPIUsed: false,
      cloudflareNeuronsUsed: 0,
    },
    nextAction: "Generate the authoritative source locally in Kairos.",
    externalProviderCalled: false,
    build: KAIROS_LOCAL_ONLY_ENTRY_BUILD,
  });
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
  return env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
}

function assertBindings(env) {
  if (!env?.KAIROS_PROJECTS?.idFromName || !env?.KAIROS_PROJECTS?.get || !env?.KAIROS_PROJECT_AGENT) {
    throw runtimeError("Kairos local execution bindings are incomplete.", "LOCAL_EXECUTION_BINDINGS_INCOMPLETE", 503);
  }
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

function localRequired(pathname) {
  return json({
    status: "blocked",
    error: {
      code: "LOCAL_INFERENCE_REQUIRED",
      message: "This legacy backend generation route is disabled. Kairos production must run locally through the same-origin browser WebGPU runtime.",
    },
    route: pathname,
    inference: {
      provider: "browser-webgpu",
      runtime: "same-origin-webllm",
      noCost: true,
      externalPaidAPIUsed: false,
      cloudflareNeuronsUsed: 0,
      backendProviderCalls: false,
    },
    build: KAIROS_LOCAL_ONLY_ENTRY_BUILD,
  }, 409);
}

function failure(error) {
  return json({
    status: "failed",
    error: {
      code: error?.code || "LOCAL_OPERATION_FAILED",
      message: error instanceof Error ? error.message : "Kairos local execution failed.",
      retriable: Number(error?.status || 500) >= 500,
    },
    build: KAIROS_LOCAL_ONLY_ENTRY_BUILD,
  }, Number(error?.status || 503));
}

function runtimeError(message, code = "LOCAL_OPERATION_FAILED", status = 400) {
  return Object.assign(new Error(message), { code, status });
}
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Local-Only": KAIROS_LOCAL_ONLY_ENTRY_BUILD,
      "X-Kairos-External-Provider": "disabled",
    },
  });
}
