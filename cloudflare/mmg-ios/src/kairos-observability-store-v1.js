import { createKairosObservabilityEvent, sanitizeObservabilityEvent, KAIROS_OBSERVABILITY_EVENTS_BUILD } from "./kairos-observability-events-v1.js";

export const KAIROS_OBSERVABILITY_STORE_BUILD = "kairos-observability-store-20260725-1";
const INTERNAL_PATH = "/registry/kairos-observability";
const PUBLIC_ROUTE = /^\/api\/kairos\/operations\/(request|approval)\/([^/]+)\/?$/i;
const MAX_EVENTS = 2000;
const MAX_TIMELINE = 200;

export async function handleKairosObservabilityAPI(request, env) {
  const match = new URL(request.url).pathname.match(PUBLIC_ROUTE);
  if (!match) return null;
  if (request.method !== "GET") return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } }, 405);
  if (!authenticate(request, env)) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated operations access is required." } }, 401);
  const key = clean(match[2], 160);
  if (!key) return json({ success: false, error: { code: "TIMELINE_ID_REQUIRED", message: "A request or approval identifier is required." } }, 400);
  const result = await callObject(env, { operation: "timeline", kind: match[1].toLowerCase(), id: key });
  return json(result.body, result.status);
}

export async function recordKairosObservabilityEvent(env, input) {
  const event = createKairosObservabilityEvent(input);
  const result = await callObject(env, { operation: "append", event });
  if (!result.ok) throw observabilityStoreError(result.body?.error?.code || "OBSERVABILITY_STORAGE_FAILED", result.body?.error?.message || "Observability storage failed.", result.status);
  return result.body.event;
}

export async function handleKairosObservabilityObjectRequest(state, request) {
  const url = new URL(request.url);
  if (url.pathname !== INTERNAL_PATH) return null;
  const body = await request.json().catch(() => ({}));
  if (body.operation === "append") return append(state, body.event);
  if (body.operation === "timeline") return timeline(state, body.kind, body.id);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown observability operation." } }, 400);
}

async function append(state, raw) {
  let event;
  try { event = sanitizeObservabilityEvent(raw); }
  catch (error) { return json({ success: false, error: { code: error?.code || "OBSERVABILITY_EVENT_INVALID", message: error?.message || "Invalid observability event." } }, 400); }
  const events = Array.isArray(await state.storage.get("kairos-observability:events")) ? await state.storage.get("kairos-observability:events") : [];
  events.push(event);
  await state.storage.put("kairos-observability:events", events.slice(-MAX_EVENTS));
  if (event.requestId) await appendIndex(state, `kairos-observability:request:${event.requestId}`, event.eventId);
  if (event.approvalId) await appendIndex(state, `kairos-observability:approval:${event.approvalId}`, event.eventId);
  return json({ success: true, event }, 201);
}

async function appendIndex(state, key, eventId) {
  const ids = Array.isArray(await state.storage.get(key)) ? await state.storage.get(key) : [];
  ids.push(eventId);
  await state.storage.put(key, ids.slice(-MAX_TIMELINE));
}

async function timeline(state, kind, id) {
  if (!new Set(["request", "approval"]).has(kind)) return json({ success: false, error: { code: "TIMELINE_KIND_INVALID", message: "Timeline kind must be request or approval." } }, 400);
  const ids = Array.isArray(await state.storage.get(`kairos-observability:${kind}:${clean(id, 160)}`)) ? await state.storage.get(`kairos-observability:${kind}:${clean(id, 160)}`) : [];
  const all = Array.isArray(await state.storage.get("kairos-observability:events")) ? await state.storage.get("kairos-observability:events") : [];
  const wanted = new Set(ids);
  const events = all.filter((event) => wanted.has(event.eventId)).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)).slice(-MAX_TIMELINE);
  return json({ success: true, kind, id: clean(id, 160), count: events.length, events, builds: { events: KAIROS_OBSERVABILITY_EVENTS_BUILD, store: KAIROS_OBSERVABILITY_STORE_BUILD } });
}

async function callObject(env, body) {
  if (!env?.KAIROS_PROJECTS) return { ok: false, status: 503, body: { success: false, error: { code: "OBSERVABILITY_STORAGE_UNAVAILABLE", message: "Observability storage is unavailable." } } };
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry"));
  const response = await stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
}

function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function observabilityStoreError(code, message, status = 500) { const error = new Error(message); error.code = code; error.status = status; return error; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Observability-Store": KAIROS_OBSERVABILITY_STORE_BUILD } }); }
