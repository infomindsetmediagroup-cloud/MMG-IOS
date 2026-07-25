import {
  KAIROS_MANUSCRIPT_START_MODE_LEGACY,
  KAIROS_MANUSCRIPT_START_MODE_WORKFLOW,
  resolveManuscriptStartMode,
} from "./kairos-manuscript-start-router-v1.js";

export const KAIROS_RUNTIME_HEALTH_BUILD = "kairos-runtime-health-20260725-2-canonical-workflow";
export const KAIROS_CONTRACT_VERSION = "1.0.0";

export function handleKairosRuntimeHealth(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/kairos/runtime/health") return null;
  if (request.method !== "GET") {
    return json({
      status: "failed",
      error: {
        code: "INTERNAL_CONTRACT_VIOLATION",
        message: "The runtime health endpoint accepts GET requests only.",
        retriable: false,
        stage: "runtime-health",
      },
    }, 405);
  }

  const provider = providerHealth(env);
  const orchestration = orchestrationHealth(env);
  return json({
    application: "ready",
    storage: env?.KAIROS_PROJECTS ? "ready" : "unavailable",
    workflow: orchestration.status,
    provider,
    orchestration,
    release: {
      build: String(env?.KAIROS_RELEASE_ID || KAIROS_RUNTIME_HEALTH_BUILD),
      contractVersion: KAIROS_CONTRACT_VERSION,
      deployedAt: null,
    },
    boundaries: {
      shopifyDraftApprovalRequired: true,
      livePublicationApprovalRequired: true,
      directWebsiteMutationAuthorized: false,
      browserInferenceRequired: false,
    },
  });
}

function orchestrationHealth(env) {
  const manuscriptStartMode = resolveManuscriptStartMode(env);
  const projectAgentReady = Boolean(env?.KAIROS_PROJECT_AGENT);
  const manuscriptWorkflowReady = Boolean(env?.KAIROS_MANUSCRIPT_WORKFLOW);
  const projectWorkflowReady = Boolean(env?.KAIROS_PROJECT_WORKFLOW);
  const legacyRollbackEnabled = String(env?.KAIROS_MANUSCRIPT_LEGACY_ALARM_ROLLBACK_ENABLED || "false")
    .trim()
    .toLowerCase() === "true";
  const durableReady = projectAgentReady && manuscriptWorkflowReady;
  const selectedPathReady = manuscriptStartMode === KAIROS_MANUSCRIPT_START_MODE_WORKFLOW
    ? durableReady
    : legacyRollbackEnabled;
  return {
    status: selectedPathReady && projectWorkflowReady ? "ready" : "degraded",
    manuscriptStartMode,
    durableManuscriptWorkflow: durableReady ? "ready" : "unavailable",
    projectFoundationWorkflow: projectWorkflowReady ? "ready" : "unavailable",
    legacyAlarmRollback: legacyRollbackEnabled ? "available" : "disabled",
    automaticLegacyFallback: false,
    canonicalMode: KAIROS_MANUSCRIPT_START_MODE_WORKFLOW,
    rollbackMode: KAIROS_MANUSCRIPT_START_MODE_LEGACY,
  };
}

function providerHealth(env) {
  const provider = String(env?.KAIROS_MODEL_PROVIDER || "disabled").toLowerCase();
  const model = String(env?.KAIROS_MODEL_NAME || env?.KAIROS_OPENAI_MODEL || "").trim() || null;
  const explicitStatus = String(env?.KAIROS_PROVIDER_STATUS || "").toLowerCase();
  const explicitReason = String(env?.KAIROS_PROVIDER_REASON || "").trim() || null;

  if (["ready", "degraded", "blocked", "disabled", "unknown"].includes(explicitStatus)) {
    return { provider, status: explicitStatus, model, reason: explicitReason, checkedAt: new Date().toISOString() };
  }
  if (provider === "disabled" || provider === "deterministic") {
    return { provider, status: "disabled", model, reason: null, checkedAt: new Date().toISOString() };
  }
  if (provider === "openai" && !String(env?.OPENAI_API_KEY || "")) {
    return { provider, status: "blocked", model, reason: "PROVIDER_AUTH_INVALID", checkedAt: new Date().toISOString() };
  }
  return { provider, status: "unknown", model, reason: null, checkedAt: new Date().toISOString() };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Runtime-Health": KAIROS_RUNTIME_HEALTH_BUILD,
      "X-Kairos-Contract-Version": KAIROS_CONTRACT_VERSION,
    },
  });
}
