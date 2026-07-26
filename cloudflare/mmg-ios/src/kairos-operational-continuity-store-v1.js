import { createKairosOperationalContinuity, evaluateKairosOperationalContinuity, KAIROS_OPERATIONAL_CONTINUITY_BUILD } from "./kairos-operational-continuity-v1.js";

export const KAIROS_OPERATIONAL_CONTINUITY_STORE_BUILD = "kairos-operational-continuity-store-20260726-1";
const INTERNAL_PATH = "/registry/kairos-operational-continuity";
const COLLECTION_ROUTE = /^\/api\/kairos\/operations\/continuity\/?$/i;
const EXPORT_ROUTE = /^\/api\/kairos\/operations\/continuity\/export\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/operations\/continuity\/([^/]+)\/?$/i;
const MAX_RECORDS = 200;

export async function handleKairosOperationalContinuityAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const isExport = EXPORT_ROUTE.test(pathname);
  const item = isExport ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !isExport && !item) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated operational continuity access is required." } }, 401);
  if (isExport) {
    if (request.method !== "GET") return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } }, 405);
    return forward(env, { operation: "export" });
  }
  if (COLLECTION_ROUTE.test(pathname)) {
    if (request.method === "GET") return forward(env, { operation: "list" });
    if (request.method === "POST") {
      const input = await request.json().catch(() => ({}));
      return forward(env, { operation: "create", input: enrichInput(input, identity, env) });
    }
    return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST." } }, 405);
  }
  const continuityId = clean(item[1], 180);
  if (request.method === "GET") return forward(env, { operation: "read", continuityId });
  if (request.method === "PATCH") {
    const input = await request.json().catch(() => ({}));
    return forward(env, { operation: "evaluate", continuityId, input: enrichInput(input, identity, env) });
  }
  return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or PATCH." } }, 405);
}

export async function handleKairosOperationalContinuityObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const body = await request.json().catch(() => ({}));
  if (body.operation === "create") return create(state, body.input);
  if (body.operation === "read") return read(state, body.continuityId);
  if (body.operation === "list") return list(state);
  if (body.operation === "evaluate") return evaluate(state, body.continuityId, body.input);
  if (body.operation === "export") return exportPackage(state);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown operational continuity operation." } }, 400);
}

async function create(state, input) {
  try {
    const continuity = createKairosOperationalContinuity(input);
    const records = await load(state);
    if (records.some((item) => item.continuityId === continuity.continuityId)) return json({ success: false, error: { code: "CONTINUITY_EXISTS", message: "Continuity record already exists." } }, 409);
    records.push(continuity);
    await save(state, records);
    return json({ success: true, continuity, builds: builds() }, 201);
  } catch (error) { return failure(error); }
}

async function read(state, continuityId) {
  const continuity = (await load(state)).find((item) => item.continuityId === clean(continuityId, 180));
  return continuity ? json({ success: true, continuity, builds: builds() }) : json({ success: false, error: { code: "CONTINUITY_NOT_FOUND", message: "Continuity record was not found." } }, 404);
}

async function list(state) {
  const continuities = sorted(await load(state));
  return json({ success: true, count: continuities.length, continuities, builds: builds() });
}

async function evaluate(state, continuityId, input) {
  try {
    const records = await load(state);
    const index = records.findIndex((item) => item.continuityId === clean(continuityId, 180));
    if (index < 0) return json({ success: false, error: { code: "CONTINUITY_NOT_FOUND", message: "Continuity record was not found." } }, 404);
    records[index] = evaluateKairosOperationalContinuity(records[index], input);
    await save(state, records);
    return json({ success: true, continuity: records[index], builds: builds() });
  } catch (error) { return failure(error); }
}

async function exportPackage(state) {
  const continuities = sorted(await load(state));
  return json({
    success: true,
    exportVersion: "kairos-operational-continuity-export-v1",
    generatedAt: new Date().toISOString(),
    count: continuities.length,
    continuities,
    deploymentExecutionIncluded: false,
    rollbackExecutionIncluded: false,
    retryExecutionIncluded: false,
    automaticRemediationIncluded: false,
    builds: builds(),
  });
}

function enrichInput(input, identity, env) {
  return {
    ...input,
    operatorIdentityHash: hashIdentity(identity),
    assuranceId: clean(input.assuranceId || env?.KAIROS_ASSURANCE_ID, 180) || null,
    authorizationId: clean(input.authorizationId || env?.KAIROS_LAUNCH_AUTHORIZATION_ID, 180) || null,
    certificationId: clean(input.certificationId || env?.KAIROS_CERTIFICATION_ID, 180) || null,
    releaseId: clean(input.releaseId || env?.KAIROS_RELEASE_ID, 180) || null,
    deploymentId: clean(input.deploymentId || env?.KAIROS_DEPLOYMENT_ID, 180) || null,
    environment: clean(input.environment || env?.KAIROS_ENVIRONMENT || "production", 80),
    commitSha: clean(input.commitSha || env?.KAIROS_COMMIT_SHA, 80) || null,
  };
}

async function load(state) { const value = await state.storage.get("kairos-operational-continuity:records"); return Array.isArray(value) ? value : []; }
async function save(state, records) { await state.storage.put("kairos-operational-continuity:records", records.slice(-MAX_RECORDS)); }
function sorted(records) { return records.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
async function forward(env, body) {
  if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "CONTINUITY_STORAGE_UNAVAILABLE", message: "Operational continuity storage is unavailable." } }, 503);
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry"));
  return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { continuity: KAIROS_OPERATIONAL_CONTINUITY_BUILD, store: KAIROS_OPERATIONAL_CONTINUITY_STORE_BUILD }; }
function failure(error) { return json({ success: false, error: { code: error?.code || "CONTINUITY_INVALID", message: error?.message || "Operational continuity operation failed." } }, error?.status || 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Operational-Continuity-Store": KAIROS_OPERATIONAL_CONTINUITY_STORE_BUILD } }); }
