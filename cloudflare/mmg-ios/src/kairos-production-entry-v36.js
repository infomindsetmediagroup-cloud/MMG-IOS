import runtime, { KairosProject } from "./kairos-production-entry-v35.js";
import { handleAutonomyRequest, KAIROS_AUTONOMY_BUILD, KAIROS_AUTONOMY_POLICY, runAutonomyCycle } from "./kairos-autonomy-runtime-v1.js";
import { inferenceRuntime } from "./kairos-intelligence-v1.js";

const BUILD = "kairos-production-entry-20260716-92";

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
    scheduleEventDrivenAutonomy(request, response, env, ctx, next => runtime.fetch(next, env, ctx));
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
    schedule: "event-driven-plus-15-minute-recovery-cron",
    policy: KAIROS_AUTONOMY_POLICY,
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    enhancedAccountScopedInference: enhancedInference.configured ? "operational" : "needs-configuration",
    boundedAutonomousOperations: autonomyEnabled ? "operational" : "disabled",
    autonomousQueuePrioritization: autonomyEnabled ? "operational" : "disabled",
    evidenceBackedInternalTaskAdvancement: autonomyEnabled ? "verified-artifact-and-readback" : "disabled",
    eventDrivenNativeExecution: autonomyEnabled ? "operational" : "disabled",
    highImpactApprovalGates: "enforced",
  };
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Enhanced-Inference", enhancedInference.mode);
  headers.set("X-Kairos-Autonomy", autonomyEnabled ? "operational" : "disabled");
  return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers });
}

function scheduleEventDrivenAutonomy(request, response, env, ctx, delegate) {
  if (!response.ok || ["GET", "HEAD", "OPTIONS"].includes(request.method) || String(env?.KAIROS_AUTONOMY_ENABLED || "").toLowerCase() !== "true") return;
  if (request.headers.get("X-Kairos-Autonomy-Dispatch") === "manual") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/autonomy/")) return;
  const responseCopy = response.clone();
  const work = (async () => {
    let body;
    try { body = await responseCopy.json(); } catch { return; }
    const workflows = collectWorkflowRecords(body);
    const explicitID = cleanID(body?.workflowID || body?.workItem?.workflowID);
    if (explicitID && !workflows.some(value => value.id === explicitID)) workflows.push({ id: explicitID });
    const trigger = eventTrigger(request, body);
    for (const workflow of workflows.slice(0, 3)) {
      if (!workflow.id || ["completed", "cancelled"].includes(workflow.state)) continue;
      if (workflow.approvalRequired && workflow.approvalStatus !== "approved") continue;
      await runAutonomyCycle(env, {
        source: `event:${trigger}`,
        targetWorkflowID: workflow.id,
        claimScope: `workflow-${workflow.id}`,
        minimumIntervalMs: 60_000,
        delegate,
      });
    }
  })().catch(() => null);
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work);
}

function collectWorkflowRecords(value, result = [], depth = 0, seen = new Set()) {
  if (!value || typeof value !== "object" || depth > 6 || seen.has(value)) return result;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectWorkflowRecords(item, result, depth + 1, seen);
    return result;
  }
  if (cleanID(value.id) && Array.isArray(value.tasks) && typeof value.state === "string") result.push(value);
  for (const child of Object.values(value)) collectWorkflowRecords(child, result, depth + 1, seen);
  return [...new Map(result.map(record => [record.id, record])).values()];
}

function eventTrigger(request, body) {
  const path = new URL(request.url).pathname.replace(/^\/api\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 100) || "mutation";
  const command = String(body?.command || "").replace(/[^a-z0-9]+/gi, "-").slice(0, 30);
  return `${request.method.toLowerCase()}-${path}${command ? `-${command}` : ""}`.slice(0, 140);
}

function cleanID(value) {
  const id = String(value || "").trim();
  return /^[a-z0-9._:-]{1,220}$/i.test(id) ? id : "";
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
