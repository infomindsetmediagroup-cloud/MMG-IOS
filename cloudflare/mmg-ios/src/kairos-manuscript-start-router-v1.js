import { getAgentByName } from "agents";
import {
  KAIROS_MANUSCRIPT_GENERATION_BUILD,
  KAIROS_MANUSCRIPT_WORKFLOW_VERSION,
} from "./kairos-manuscript-generation-job-v1.js";

export const KAIROS_MANUSCRIPT_START_ROUTER_BUILD = "kairos-manuscript-start-router-20260725-1";
export const KAIROS_MANUSCRIPT_START_MODE_WORKFLOW = "workflow";
export const KAIROS_MANUSCRIPT_START_MODE_LEGACY = "legacy-alarm";

const MAX_STEPS = 32;

export function resolveManuscriptStartMode(env) {
  const requested = String(env?.KAIROS_MANUSCRIPT_START_MODE || KAIROS_MANUSCRIPT_START_MODE_WORKFLOW)
    .trim()
    .toLowerCase();
  const rollbackEnabled = String(env?.KAIROS_MANUSCRIPT_LEGACY_ALARM_ROLLBACK_ENABLED || "false")
    .trim()
    .toLowerCase() === "true";
  if (requested === KAIROS_MANUSCRIPT_START_MODE_LEGACY && rollbackEnabled) {
    return KAIROS_MANUSCRIPT_START_MODE_LEGACY;
  }
  return KAIROS_MANUSCRIPT_START_MODE_WORKFLOW;
}

export async function handleCanonicalManuscriptStart(request, env) {
  if (request.method !== "POST") return null;
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/generation-job$/i);
  if (!match) return null;

  const projectId = match[1].toLowerCase();
  const mode = resolveManuscriptStartMode(env);
  if (mode === KAIROS_MANUSCRIPT_START_MODE_LEGACY) return null;

  if (!env?.KAIROS_PROJECT_AGENT || !env?.KAIROS_MANUSCRIPT_WORKFLOW) {
    return jsonError(
      503,
      "GENERATION_WORKFLOW_UNAVAILABLE",
      "The durable manuscript Workflow is unavailable. Kairos will not silently fall back to the legacy alarm runner.",
      mode,
    );
  }

  try {
    const body = await readJSON(request);
    const requestedBy = cleanText(body.requestedBy || body.actor, 120) || "kairos-owner";
    const agent = await getAgentByName(env.KAIROS_PROJECT_AGENT, projectId, {
      locationHint: "wnam",
      routingRetry: { maxAttempts: 3 },
    });
    const result = await agent.startManuscriptGenerationWorkflow({
      projectId,
      title: cleanText(body.title, 180) || "Untitled Kairos Project",
      requestedBy,
    });
    const active = result?.state?.activeManuscriptWorkflow || {};
    const status = result?.reused ? String(active.status || "running") : "queued";
    const now = new Date().toISOString();
    const job = {
      build: KAIROS_MANUSCRIPT_GENERATION_BUILD,
      workflowVersion: KAIROS_MANUSCRIPT_WORKFLOW_VERSION,
      workflowInstanceId: result?.instanceId || active.instanceId || null,
      projectId,
      status,
      executionMode: KAIROS_MANUSCRIPT_WORKFLOW_VERSION,
      phase: result?.reused ? "Durable manuscript Workflow already active" : "Durable manuscript Workflow accepted",
      step: 0,
      maxSteps: MAX_STEPS,
      requestedBy,
      requestedAt: active.approvedAt || now,
      createdAt: active.startedAt || now,
      updatedAt: active.updatedAt || now,
      error: null,
    };
    return json({
      status,
      build: KAIROS_MANUSCRIPT_START_ROUTER_BUILD,
      projectId,
      startMode: mode,
      reused: Boolean(result?.reused),
      workflowInstanceId: job.workflowInstanceId,
      job,
    }, result?.reused ? 200 : 202, mode);
  } catch (error) {
    return jsonError(
      classifyStatus(error),
      classifyError(error),
      String(error?.message || error || "Kairos could not start the durable manuscript Workflow."),
      mode,
    );
  }
}

async function readJSON(request) {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("The request body must be valid JSON."), { status: 400, code: "INTERNAL_CONTRACT_VIOLATION" });
  }
}

function cleanText(value, maximum) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function classifyStatus(error) {
  const status = Number(error?.status || 0);
  if (status >= 400 && status <= 599) return status;
  const code = classifyError(error);
  return code.startsWith("PROVIDER_") || code === "GENERATION_WORKFLOW_UNAVAILABLE" ? 503 : 400;
}

function classifyError(error) {
  const value = `${error?.code || ""} ${error?.message || error || ""}`.toLowerCase();
  if (value.includes("quota") || value.includes("insufficient_quota")) return "PROVIDER_QUOTA_EXHAUSTED";
  if (value.includes("401") || value.includes("api key") || value.includes("auth")) return "PROVIDER_AUTH_INVALID";
  if (value.includes("403") || value.includes("permission")) return "PROVIDER_PERMISSION_DENIED";
  if (value.includes("source")) return "SOURCE_INVALID";
  if (value.includes("workflow") || value.includes("binding")) return "GENERATION_WORKFLOW_UNAVAILABLE";
  return error?.code || "INTERNAL_CONTRACT_VIOLATION";
}

function jsonError(status, code, message, mode) {
  return json({
    status: "failed",
    startMode: mode,
    error: {
      code,
      message,
      retriable: status >= 500 || code.startsWith("PROVIDER_"),
      stage: "manuscript_workflow_start",
    },
  }, status, mode);
}

function json(value, status = 200, mode = KAIROS_MANUSCRIPT_START_MODE_WORKFLOW) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Manuscript-Start-Router": KAIROS_MANUSCRIPT_START_ROUTER_BUILD,
      "X-Kairos-Manuscript-Start-Mode": mode,
      "X-Kairos-Contract-Version": "1.0.0",
    },
  });
}
