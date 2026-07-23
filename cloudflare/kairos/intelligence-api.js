import { createKairosIntelligenceRuntime } from "./intelligence-runtime.js";

const MAX_PLAN_REQUEST_BYTES = 64_000;
const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

export function isKairosIntelligenceRoute(pathname) {
  return pathname === "/api/health" || pathname === "/api/kairos/intelligence" || pathname === "/api/kairos/plan";
}

export async function handleKairosIntelligenceRequest(request, env) {
  const requestId = normalizeRequestId(request.headers.get("X-Request-ID"));
  const startedAt = Date.now();
  try {
    const url = new URL(request.url);
    const intelligence = createKairosIntelligenceRuntime(env);

    if (request.method === "GET" && url.pathname === "/api/health") {
      const description = intelligence.describe();
      return json(200, {
        ok: true,
        status: "ready",
        service: "mmg-kairos",
        runtime: "cloudflare-control-plane",
        environment: String(env?.KAIROS_ENVIRONMENT || "staging"),
        releaseId: String(env?.KAIROS_RELEASE_ID || "unversioned"),
        intelligence: {
          provider: description.provider,
          endpointConfigured: description.endpointConfigured,
          modelRequired: description.modelRequired,
          paidApiRequired: false,
          deterministicFallback: description.deterministicFallback,
          executionMode: description.executionMode,
        },
        paidApiRequired: false,
        productionMutationsEnabled: isTrue(env?.KAIROS_SHOPIFY_WRITES_ENABLED),
        requestId,
      });
    }

    await authenticateRuntimeRequest(request, env);

    if (request.method === "GET" && url.pathname === "/api/kairos/intelligence") {
      return json(200, {
        intelligence: intelligence.describe(),
        autonomy: {
          currentLevel: 2,
          name: "draft_mode",
          productionMutationsRequireApproval: true,
        },
        requestId,
      });
    }

    if (request.method === "POST" && url.pathname === "/api/kairos/plan") {
      enforceRequestOrigin(request, url, env);
      const body = await readJson(request);
      const plan = await intelligence.plan({
        objective: body?.objective,
        context: body?.context,
      });
      logEvent("kairos.plan.completed", {
        requestId,
        durationMs: Date.now() - startedAt,
        provider: plan.provider || plan.mode,
        workflowId: plan.workflowId,
        requiresApproval: plan.requiresApproval,
        fallback: plan.fallback === true,
      });
      return json(200, { plan, requestId });
    }

    return json(405, {
      error: { code: "METHOD_NOT_ALLOWED", message: "The Kairos intelligence route does not support this method." },
      requestId,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    logEvent("kairos.request.failed", {
      requestId,
      durationMs: Date.now() - startedAt,
      status,
      code: error?.code || "INTELLIGENCE_RUNTIME_ERROR",
    });
    return json(status, {
      error: {
        code: error?.code || "INTELLIGENCE_RUNTIME_ERROR",
        message: status >= 500 && !error?.code ? "Kairos intelligence runtime failure." : String(error?.message || "Request failed."),
      },
      requestId,
    });
  }
}

async function authenticateRuntimeRequest(request, env) {
  const expected = String(env?.KAIROS_RUNTIME_TOKEN || "").trim();
  if (!expected) throw apiError("RUNTIME_TOKEN_MISSING", "KAIROS_RUNTIME_TOKEN is not configured.", 503);
  if (expected.length < 32) throw apiError("RUNTIME_TOKEN_WEAK", "KAIROS_RUNTIME_TOKEN must contain at least 32 characters.", 503);
  const authorization = request.headers.get("Authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!supplied || !(await constantTimeEqual(supplied, expected))) {
    throw apiError("UNAUTHORIZED", "A valid Kairos bearer token is required.", 401);
  }
}

function enforceRequestOrigin(request, url, env) {
  const origin = String(request.headers.get("Origin") || "").trim();
  if (!origin) return;
  const allowed = new Set([
    url.origin,
    ...String(env?.KAIROS_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]);
  if (!allowed.has(origin)) {
    throw apiError("ORIGIN_DENIED", "The request origin is not authorized for the Kairos control plane.", 403);
  }
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_PLAN_REQUEST_BYTES) {
    throw apiError("REQUEST_TOO_LARGE", "Request body exceeds 64 KB.", 413);
  }
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw apiError("JSON_REQUIRED", "Content-Type application/json is required.", 415);
  }

  let text;
  try {
    text = await request.text();
  } catch {
    throw apiError("REQUEST_UNREADABLE", "The request body could not be read.", 400);
  }
  if (new TextEncoder().encode(text).byteLength > MAX_PLAN_REQUEST_BYTES) {
    throw apiError("REQUEST_TOO_LARGE", "Request body exceeds 64 KB.", 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw apiError("INVALID_JSON", "The request body is not valid JSON.", 400);
  }
}

async function constantTimeEqual(left, right) {
  const [a, b] = await Promise.all([sha256(String(left)), sha256(String(right))]);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeRequestId(value) {
  const candidate = String(value || "").trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(candidate) ? candidate : crypto.randomUUID();
}

function logEvent(event, details) {
  console.log(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...details,
  }));
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function isTrue(value) {
  return String(value || "").toLowerCase() === "true";
}

function apiError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
