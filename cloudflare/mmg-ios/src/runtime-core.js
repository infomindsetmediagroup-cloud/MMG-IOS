const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const BUILD = "command-center-cloudflare-native-20260711-9";
export const SESSION_COOKIE = "mmg_kairos_session";
export const SESSION_TTL_SECONDS = 43200;

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": "cloudflare-native",
      "X-MMG-Build": BUILD,
      ...headers,
    },
  });
}

export function runtimeError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function requireEnv(env, keys) {
  const missing = keys.filter(key => !String(env[key] || "").trim());
  if (missing.length) throw runtimeError(503, "runtime_not_configured", `Cloudflare runtime is missing: ${missing.join(", ")}`);
}

export async function readJson(requestOrResponse) {
  try { return await requestOrResponse.json(); }
  catch { throw runtimeError(400, "invalid_json", "Request body must be valid JSON."); }
}

export function bounded(value, maximum, field) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw runtimeError(400, "invalid_request", `${field} is empty or exceeds its limit.`);
  }
  return value.trim();
}

export function readCookie(header, name) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
}

export function constantTimeEqual(left, right) {
  left = String(left || "");
  right = String(right || "");
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function issueSession(operatorInput, secret) {
  const operator = bounded(operatorInput, 80, "operator").replace(/\s+/g, " ");
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    sub: `operator:${operator.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    tenantId: "mmg-internal",
    role: "executive",
    operator,
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
    jti: crypto.randomUUID(),
  };
  const encoded = base64url(JSON.stringify(payload));
  return { token: `${encoded}.${await sign(encoded, secret)}`, session: toSession(payload) };
}

export async function verifySession(token, secret) {
  if (!token) return null;
  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra) return null;
  if (!constantTimeEqual(signaturePart, await sign(payloadPart, secret))) return null;
  try {
    const payload = JSON.parse(fromBase64url(payloadPart));
    if (payload.role !== "executive" || payload.tenantId !== "mmg-internal" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return toSession(payload);
  } catch { return null; }
}

export async function requireSession(request, env) {
  requireEnv(env, ["KAIROS_RUNTIME_TOKEN"]);
  const session = await verifySession(readCookie(request.headers.get("Cookie"), SESSION_COOKIE), env.KAIROS_RUNTIME_TOKEN);
  if (!session) throw runtimeError(401, "unauthorized", "An authenticated Kairos operator session is required.");
  return session;
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

function toSession(payload) {
  return { sub: payload.sub, tenantId: payload.tenantId, role: payload.role, operator: payload.operator, issuedAt: payload.iat, expiresAt: payload.exp, sessionId: payload.jti };
}
function base64url(value) { return bytesToBase64url(encoder.encode(value)); }
function bytesToBase64url(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function fromBase64url(value) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4); return decoder.decode(Uint8Array.from(atob(normalized), character => character.charCodeAt(0))); }
