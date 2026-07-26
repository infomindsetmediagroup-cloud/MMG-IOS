import { recordKairosObservabilityEvent, KAIROS_OBSERVABILITY_STORE_BUILD } from "./kairos-observability-store-v1.js";

export const KAIROS_OBSERVABILITY_RUNTIME_BUILD = "kairos-observability-runtime-20260726-2-ordered";

export async function observeKairosResponse(request, response, env, ctx) {
  if (!response) return response;
  const startedAt = request.headers.get("X-Kairos-Started-At") || new Date().toISOString();
  const requestId = response.headers.get("X-Kairos-Request-Id") || request.headers.get("X-Kairos-Request-Id") || crypto.randomUUID();
  const url = new URL(request.url);
  const payload = await readPayload(response);
  const approvalId = clean(payload?.approvalId || payload?.actions?.[0]?.approvalId, 160) || null;
  const toolId = clean(payload?.tool || payload?.actions?.[0]?.toolId || payload?.toolEvidence?.[0]?.toolId, 160) || null;
  const executor = clean(payload?.actions?.[0]?.executor || payload?.toolEvidence?.[0]?.executor, 160) || null;
  const outcome = response.ok ? (response.status === 202 ? "pending" : "success") : response.status === 401 || response.status === 403 ? "blocked" : "failure";
  const completedAt = new Date().toISOString();
  const events = [{
    requestId,
    approvalId,
    toolId,
    executor,
    phase: "response_completed",
    outcome,
    startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    errorCode: payload?.error?.code || null,
    evidenceCount: Array.isArray(payload?.toolEvidence) ? payload.toolEvidence.length : 0,
    verificationPassed: typeof payload?.verification?.verified === "boolean" ? payload.verification.verified : null,
    metadata: { path: url.pathname, method: request.method, status: response.status },
  }];

  if (/\/api\/kairos\/tools\/propose\/?$/i.test(url.pathname) || payload?.status === "approval_required") {
    events.push({ requestId, approvalId, toolId, executor, phase: "tool_proposed", outcome: response.ok ? "pending" : outcome, startedAt: completedAt, completedAt, metadata: { status: response.status } });
  }
  if (/\/api\/kairos\/tools\/continue\/?$/i.test(url.pathname) && approvalId) {
    events.push({ requestId, approvalId, toolId, executor, phase: "approval_consumed", outcome: response.ok || response.status === 409 ? "success" : outcome, startedAt: completedAt, completedAt, metadata: { status: response.status } });
    events.push({ requestId, approvalId, toolId, executor, phase: response.ok ? "tool_execution_completed" : "tool_execution_failed", outcome, startedAt, completedAt, errorCode: payload?.error?.code || null, verificationPassed: typeof payload?.verification?.verified === "boolean" ? payload.verification.verified : null, metadata: { status: response.status } });
    if (payload?.verification || payload?.result?.verification) {
      const verification = payload.verification || payload.result.verification;
      events.push({ requestId, approvalId, toolId, executor, phase: "verification_completed", outcome: verification?.verified === false ? "failure" : "success", startedAt: completedAt, completedAt, verificationPassed: verification?.verified !== false, metadata: { status: response.status } });
    }
  }

  const work = persistEventsInOrder(env, events);
  if (ctx?.waitUntil) ctx.waitUntil(work);
  else await work;
  return stamp(response, requestId);
}

export function withKairosObservabilityStart(request) {
  const headers = new Headers(request.headers);
  if (!headers.has("X-Kairos-Request-Id")) headers.set("X-Kairos-Request-Id", crypto.randomUUID());
  if (!headers.has("X-Kairos-Started-At")) headers.set("X-Kairos-Started-At", new Date().toISOString());
  return new Request(request, { headers });
}

async function persistEventsInOrder(env, events) {
  const results = [];
  for (const event of events) results.push(await safeRecord(env, event));
  return results;
}

async function safeRecord(env, event) {
  try { return await recordKairosObservabilityEvent(env, event); }
  catch { return null; }
}

async function readPayload(response) {
  if (!(response.headers.get("content-type") || "").includes("application/json")) return null;
  return response.clone().json().catch(() => null);
}

function stamp(response, requestId) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Request-Id", requestId);
  headers.set("X-Kairos-Observability-Runtime", KAIROS_OBSERVABILITY_RUNTIME_BUILD);
  headers.set("X-Kairos-Observability-Store", KAIROS_OBSERVABILITY_STORE_BUILD);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
