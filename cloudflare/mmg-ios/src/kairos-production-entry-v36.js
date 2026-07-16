import runtime, { KairosProject } from "./kairos-production-entry-v35.js";
import { handleAutonomyRequest, KAIROS_AUTONOMY_BUILD, KAIROS_AUTONOMY_POLICY, runAutonomyCycle } from "./kairos-autonomy-runtime-v1.js";
import { inferenceRuntime } from "./kairos-intelligence-v1.js";

const BUILD = "kairos-production-entry-20260715-90";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      const autonomy = await handleAutonomyRequest(request, env, next => runtime.fetch(next, env, ctx));
      if (autonomy) return stamp(autonomy);
    } catch (error) {
      return jsonError(Number(error?.statusCode || 500), error?.code || "autonomy_request_failed", error instanceof Error ? error.message : "Kairos autonomy request failed.");
    }

    let response = await runtime.fetch(request, env, ctx);
    if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) response = await intelligenceHealth(response, env);
    return stamp(response);
  },

  async scheduled(controller, env, ctx) {
    if (typeof runtime.scheduled === "function") await runtime.scheduled(controller, env, ctx);
    const work = runAutonomyCycle(env, {
      source: `scheduled:${String(controller?.cron || "cloudflare-cron")}`,
      delegate: next => runtime.fetch(next, env, ctx),
    }).catch(() => null);
    if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work);
    else await work;
  },
};

async function intelligenceHealth(response, env) {
  let body;
  try { body = await response.clone().json(); }
  catch { return response; }
  const enhancedInference = inferenceRuntime(env);
  const autonomyEnabled = String(env?.KAIROS_AUTONOMY_ENABLED || "").toLowerCase() === "true";
  body.build = BUILD;
  body.enhancedInference = {
    ...enhancedInference,
    status: enhancedInference.configured ? "operational" : "needs-configuration",
  };
  body.autonomy = {
    status: autonomyEnabled ? "operational" : "disabled",
    build: KAIROS_AUTONOMY_BUILD,
    mode: KAIROS_AUTONOMY_POLICY.mode,
    schedule: "twice-daily-cloudflare-cron",
    policy: KAIROS_AUTONOMY_POLICY,
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    enhancedAccountScopedInference: enhancedInference.configured ? "operational" : "needs-configuration",
    boundedAutonomousOperations: autonomyEnabled ? "operational" : "disabled",
    autonomousQueuePrioritization: autonomyEnabled ? "operational" : "disabled",
    evidenceBackedInternalTaskAdvancement: autonomyEnabled ? "operational" : "disabled",
    highImpactApprovalGates: "enforced",
  };
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Enhanced-Inference", enhancedInference.mode);
  headers.set("X-Kairos-Autonomy", autonomyEnabled ? "operational" : "disabled");
  return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers });
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Production-Entry", BUILD);
  headers.set("X-Kairos-Autonomy-Build", KAIROS_AUTONOMY_BUILD);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonError(status, code, message) {
  return new Response(JSON.stringify({ status: "needs-attention", build: BUILD, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Production-Entry": BUILD, "X-Content-Type-Options": "nosniff" },
  });
}
