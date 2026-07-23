import { createKairosIntelligenceRuntime } from "./intelligence-runtime.js";

const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
});

export function isKairosIntelligenceRoute(pathname) {
  return pathname === "/api/health" || pathname === "/api/kairos/intelligence" || pathname === "/api/kairos/plan";
}

export async function handleKairosIntelligenceRequest(request, env) {
  const requestId = request.headers.get("X-Request-ID") || crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const intelligence = createKairosIntelligenceRuntime(env);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json(200, {
        ok: true,
        service: "mmg-kairos",
        runtime: "cloudflare-control-plane",
        intelligence: intelligence.describe(),
        paidApiRequired: false,
        shopifyWritesEnabled: isTrue(env?.KAIROS_SHOPIFY_WRITES_ENABLED),
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
      const body = await readJson(request);
      const plan = await intelligence.plan({
        objective: body?.objective,
        context: body?.context,
      });
      return json(200, { plan, requestId });
    }

    return json(405, {
      error: { code: "METHOD_NOT_ALLOWED", message: "The Kairos intelligence route does not support this method." },
      requestId,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
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
  const authorization = request.headers.get("Authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!supplied || !(await constantTimeEqual(supplied, expected))) {
    throw apiError("UNAUTHORIZED", "A valid Kairos bearer token is required.", 401);
  }
}

async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 2_000_000) throw apiError("REQUEST_TOO_LARGE", "Request body exceeds 2 MB.", 413);
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw apiError("JSON_REQUIRED", "Content-Type application/json is required.", 415);
  }
  try {
    return await request.json();
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
