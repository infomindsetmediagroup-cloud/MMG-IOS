import { createKairosIncident, transitionKairosIncident, KAIROS_INCIDENT_LIFECYCLE_BUILD } from "./kairos-incident-lifecycle-v1.js";

export const KAIROS_INCIDENT_STORE_BUILD = "kairos-incident-store-20260725-2-export";
const INTERNAL_PATH = "/registry/kairos-incidents";
const COLLECTION_ROUTE = /^\/api\/kairos\/operations\/incidents\/?$/i;
const EXPORT_ROUTE = /^\/api\/kairos\/operations\/incidents\/export\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/operations\/incidents\/([^/]+)\/?$/i;
const MAX_INCIDENTS = 500;

export async function handleKairosIncidentAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const isExport = EXPORT_ROUTE.test(pathname);
  const item = isExport ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !isExport && !item) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated incident access is required." } }, 401);
  if (isExport) {
    if (request.method !== "GET") return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } }, 405);
    return forward(env, { operation: "export" });
  }
  if (COLLECTION_ROUTE.test(pathname)) {
    if (request.method === "GET") return forward(env, { operation: "list" });
    if (request.method === "POST") {
      const input = await request.json().catch(() => ({}));
      return forward(env, { operation: "create", input: { ...input, ownerIdentityHash: hashIdentity(identity) } });
    }
    return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST." } }, 405);
  }
  const incidentId = clean(item[1], 180);
  if (request.method === "GET") return forward(env, { operation: "read", incidentId });
  if (request.method === "PATCH") {
    const input = await request.json().catch(() => ({}));
    return forward(env, { operation: "transition", incidentId, input: { ...input, ownerIdentityHash: hashIdentity(identity) } });
  }
  return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or PATCH." } }, 405);
}

export async function handleKairosIncidentObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const body = await request.json().catch(() => ({}));
  if (body.operation === "create") return create(state, body.input);
  if (body.operation === "read") return read(state, body.incidentId);
  if (body.operation === "list") return list(state);
  if (body.operation === "export") return exportPackage(state);
  if (body.operation === "transition") return transition(state, body.incidentId, body.input);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown incident operation." } }, 400);
}

async function create(state, input) {
  try {
    const incident = createKairosIncident(input);
    const incidents = await load(state);
    if (incidents.some((item) => item.incidentId === incident.incidentId)) return json({ success: false, error: { code: "INCIDENT_EXISTS", message: "Incident already exists." } }, 409);
    incidents.push(incident);
    await save(state, incidents);
    return json({ success: true, incident, builds: builds() }, 201);
  } catch (error) { return incidentFailure(error); }
}

async function read(state, incidentId) {
  const incident = (await load(state)).find((item) => item.incidentId === clean(incidentId, 180));
  return incident ? json({ success: true, incident, builds: builds() }) : json({ success: false, error: { code: "INCIDENT_NOT_FOUND", message: "Incident was not found." } }, 404);
}

async function list(state) {
  const incidents = sorted(await load(state));
  return json({ success: true, count: incidents.length, incidents, builds: builds() });
}

async function exportPackage(state) {
  const incidents = sorted(await load(state));
  return json({
    success: true,
    exportVersion: "kairos-incident-export-v1",
    generatedAt: new Date().toISOString(),
    count: incidents.length,
    incidents,
    automaticRemediationIncluded: false,
    builds: builds(),
  });
}

async function transition(state, incidentId, input) {
  try {
    const incidents = await load(state);
    const index = incidents.findIndex((item) => item.incidentId === clean(incidentId, 180));
    if (index < 0) return json({ success: false, error: { code: "INCIDENT_NOT_FOUND", message: "Incident was not found." } }, 404);
    incidents[index] = transitionKairosIncident(incidents[index], input);
    await save(state, incidents);
    return json({ success: true, incident: incidents[index], builds: builds() });
  } catch (error) { return incidentFailure(error); }
}

async function load(state) { const value = await state.storage.get("kairos-incidents:records"); return Array.isArray(value) ? value : []; }
async function save(state, incidents) { await state.storage.put("kairos-incidents:records", incidents.slice(-MAX_INCIDENTS)); }
function sorted(incidents) { return incidents.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
async function forward(env, body) {
  if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "INCIDENT_STORAGE_UNAVAILABLE", message: "Incident storage is unavailable." } }, 503);
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry"));
  return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { lifecycle: KAIROS_INCIDENT_LIFECYCLE_BUILD, store: KAIROS_INCIDENT_STORE_BUILD }; }
function incidentFailure(error) { return json({ success: false, error: { code: error?.code || "INCIDENT_INVALID", message: error?.message || "Incident operation failed." } }, error?.status || 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Incident-Store": KAIROS_INCIDENT_STORE_BUILD } }); }
