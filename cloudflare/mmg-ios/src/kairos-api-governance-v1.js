export const KAIROS_API_GOVERNANCE_BUILD = "kairos-api-governance-20260725-1";

const ROUTE = /^\/api\/kairos\/?$/i;
const OBJECT_ROUTE = "/registry/kairos-api/governance";
const REGISTRY_OBJECT = "mmg-production-project-registry";

export async function handleGovernedKairosAPI(request, env, handler) {
  const url = new URL(request.url);
  if (!ROUTE.test(url.pathname)) return null;
  if (request.method === "OPTIONS") return handler(request);

  const requestId = request.headers.get("x-kairos-request-id") || `kairos_req_${crypto.randomUUID().replace(/-/g, "")}`;
  const identity = authenticate(request, env);
  if (!identity.authorized) {
    await recordGovernance(env, { operation: "audit", event: auditEvent(request, requestId, identity, 401, "AUTH_REQUIRED") });
    return governedError(401, requestId, "AUTH_REQUIRED", "Authenticated Kairos access is required.");
  }

  const throttle = await recordGovernance(env, {
    operation: "admit",
    identityKey: identity.key,
    limit: clampInt(env?.KAIROS_API_RATE_LIMIT, 1, 300, 30),
    windowSeconds: clampInt(env?.KAIROS_API_RATE_WINDOW_SECONDS, 10, 3600, 60),
    event: auditEvent(request, requestId, identity, 0, "REQUEST_ADMITTED"),
    retention: clampInt(env?.KAIROS_API_AUDIT_RETENTION, 50, 5000, 500),
  });

  if (!throttle?.allowed) {
    const retryAfter = Number(throttle?.retryAfter || 60);
    const response = governedError(429, requestId, "RATE_LIMITED", "Kairos request capacity has been reached. Retry after the current window resets.");
    const headers = new Headers(response.headers);
    headers.set("Retry-After", String(retryAfter));
    headers.set("X-RateLimit-Limit", String(throttle?.limit || 0));
    headers.set("X-RateLimit-Remaining", "0");
    return new Response(response.body, { status: response.status, headers });
  }

  const headers = new Headers(request.headers);
  headers.set("X-Kairos-Request-Id", requestId);
  headers.set("X-Kairos-Authenticated-Identity", identity.display);
  const governedRequest = new Request(request, { headers });
  const response = await handler(governedRequest);
  const completed = auditEvent(request, requestId, identity, response?.status || 500, response?.status < 400 ? "REQUEST_COMPLETED" : "REQUEST_FAILED");
  await recordGovernance(env, { operation: "audit", event: completed, retention: clampInt(env?.KAIROS_API_AUDIT_RETENTION, 50, 5000, 500) });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("X-Kairos-Authenticated-Identity", identity.display);
  responseHeaders.set("X-RateLimit-Limit", String(throttle.limit));
  responseHeaders.set("X-RateLimit-Remaining", String(throttle.remaining));
  responseHeaders.set("X-Kairos-API-Governance", KAIROS_API_GOVERNANCE_BUILD);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
}

export async function handleKairosAPIGovernanceObjectRequest(state, request) {
  const url = new URL(request.url);
  if (url.pathname !== OBJECT_ROUTE) return null;
  if (request.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  const input = await request.json().catch(() => ({}));
  const retention = clampInt(input.retention, 50, 5000, 500);

  if (input.operation === "admit") {
    const now = Date.now();
    const windowMs = clampInt(input.windowSeconds, 10, 3600, 60) * 1000;
    const limit = clampInt(input.limit, 1, 300, 30);
    const identityKey = safeKey(input.identityKey || "anonymous");
    const bucket = Math.floor(now / windowMs);
    const key = `kairos-api-rate:${identityKey}:${bucket}`;
    const count = Number(await state.storage.get(key) || 0) + 1;
    await state.storage.put(key, count, { expirationTtl: Math.ceil(windowMs / 1000) + 60 });
    await appendAudit(state, input.event, retention);
    const allowed = count <= limit;
    return json({ allowed, limit, remaining: Math.max(0, limit - count), retryAfter: Math.max(1, Math.ceil(((bucket + 1) * windowMs - now) / 1000)) });
  }

  if (input.operation === "audit") {
    await appendAudit(state, input.event, retention);
    return json({ stored: true });
  }

  return json({ error: { code: "OPERATION_INVALID" } }, 400);
}

function authenticate(request, env) {
  const mode = String(env?.KAIROS_API_AUTH_MODE || "access-or-token").toLowerCase();
  if (mode === "disabled") return { authorized: true, key: "development", display: "development" };

  const accessEmail = clean(request.headers.get("cf-access-authenticated-user-email"), 200).toLowerCase();
  if (accessEmail) return { authorized: true, key: `access:${accessEmail}`, display: accessEmail };

  const bearer = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const expected = String(env?.KAIROS_API_ACCESS_TOKEN || "").trim();
  if (bearer && expected && timingSafeEqual(bearer, expected)) return { authorized: true, key: `token:${hashKey(bearer)}`, display: "service-token" };

  return { authorized: false, key: "anonymous", display: "anonymous" };
}

async function recordGovernance(env, body) {
  if (!env?.KAIROS_PROJECTS) return body.operation === "admit" ? { allowed: false, limit: 0, remaining: 0, retryAfter: 60 } : null;
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
  const response = await stub.fetch(new Request(`https://kairos.internal${OBJECT_ROUTE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  return response.json().catch(() => null);
}

async function appendAudit(state, event, retention) {
  if (!event) return;
  const indexKey = "kairos-api-audit:index";
  const id = clean(event.requestId, 120) || crypto.randomUUID();
  const key = `kairos-api-audit:${id}:${Date.now()}`;
  const index = Array.isArray(await state.storage.get(indexKey)) ? await state.storage.get(indexKey) : [];
  const next = [key, ...index].slice(0, retention);
  await state.storage.put(key, { ...event, storedAt: new Date().toISOString() });
  await state.storage.put(indexKey, next);
  const removed = index.slice(Math.max(0, retention - 1));
  if (removed.length) await state.storage.delete(removed);
}

function auditEvent(request, requestId, identity, status, outcome) {
  return {
    requestId,
    method: request.method,
    path: new URL(request.url).pathname,
    identity: identity.display,
    identityKey: identity.key,
    clientBuild: clean(request.headers.get("x-mmg-client-build"), 160) || null,
    userAgent: clean(request.headers.get("user-agent"), 240) || null,
    status,
    outcome,
    occurredAt: new Date().toISOString(),
  };
}

function governedError(status, requestId, code, message) {
  return json({ success: false, requestId, status: "failed", error: { code, message, retriable: status === 429 }, actions: [], requiresApproval: false }, status, {
    "X-Kairos-Request-Id": requestId,
    "X-Kairos-API-Governance": KAIROS_API_GOVERNANCE_BUILD,
    "WWW-Authenticate": status === 401 ? "Bearer" : undefined,
  });
}

function json(value, status = 200, extraHeaders = {}) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  for (const [key, value] of Object.entries(extraHeaders)) if (value) headers.set(key, value);
  return new Response(JSON.stringify(value), { status, headers });
}
function clean(value, maximum) { return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, maximum); }
function safeKey(value) { return clean(value, 240).replace(/[^a-z0-9:_@.-]/gi, "_"); }
function clampInt(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback; }
function hashKey(value) { let hash = 2166136261; for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16); }
function timingSafeEqual(left, right) { if (left.length !== right.length) return false; let result = 0; for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index); return result === 0; }
