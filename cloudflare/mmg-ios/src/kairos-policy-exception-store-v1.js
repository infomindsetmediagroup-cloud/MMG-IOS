import { createKairosPolicyException, evaluateKairosPolicyException, KAIROS_POLICY_EXCEPTION_GOVERNANCE_BUILD } from "./kairos-policy-exception-governance-v1.js";

export const KAIROS_POLICY_EXCEPTION_STORE_BUILD = "kairos-policy-exception-store-20260726-1";
const INTERNAL_PATH = "/registry/kairos-policy-exceptions";
const COLLECTION_ROUTE = /^\/api\/kairos\/operations\/exceptions\/?$/i;
const EXPORT_ROUTE = /^\/api\/kairos\/operations\/exceptions\/export\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/operations\/exceptions\/([^/]+)\/?$/i;
const MAX_RECORDS = 200;

export async function handleKairosPolicyExceptionAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const isExport = EXPORT_ROUTE.test(pathname);
  const item = isExport ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !isExport && !item) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated policy exception access is required." } }, 401);
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
  const exceptionId = clean(item[1], 180);
  if (request.method === "GET") return forward(env, { operation: "read", exceptionId });
  if (request.method === "PATCH") {
    const input = await request.json().catch(() => ({}));
    return forward(env, { operation: "evaluate", exceptionId, input: enrichInput(input, identity, env) });
  }
  return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or PATCH." } }, 405);
}

export async function handleKairosPolicyExceptionObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const body = await request.json().catch(() => ({}));
  if (body.operation === "create") return create(state, body.input);
  if (body.operation === "read") return read(state, body.exceptionId);
  if (body.operation === "list") return list(state);
  if (body.operation === "evaluate") return evaluate(state, body.exceptionId, body.input);
  if (body.operation === "export") return exportPackage(state);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown policy exception operation." } }, 400);
}

async function create(state, input) {
  try {
    const exception = createKairosPolicyException(input);
    const records = await load(state);
    if (records.some((item) => item.exceptionId === exception.exceptionId)) return json({ success: false, error: { code: "EXCEPTION_EXISTS", message: "Policy exception already exists." } }, 409);
    records.push(exception); await save(state, records);
    return json({ success: true, exception, builds: builds() }, 201);
  } catch (error) { return failure(error); }
}
async function read(state, exceptionId) { const exception = (await load(state)).find((item) => item.exceptionId === clean(exceptionId, 180)); return exception ? json({ success: true, exception, builds: builds() }) : json({ success: false, error: { code: "EXCEPTION_NOT_FOUND", message: "Policy exception was not found." } }, 404); }
async function list(state) { const exceptions = sorted(await load(state)); return json({ success: true, count: exceptions.length, exceptions, builds: builds() }); }
async function evaluate(state, exceptionId, input) {
  try {
    const records = await load(state); const index = records.findIndex((item) => item.exceptionId === clean(exceptionId, 180));
    if (index < 0) return json({ success: false, error: { code: "EXCEPTION_NOT_FOUND", message: "Policy exception was not found." } }, 404);
    records[index] = evaluateKairosPolicyException(records[index], input); await save(state, records);
    return json({ success: true, exception: records[index], builds: builds() });
  } catch (error) { return failure(error); }
}
async function exportPackage(state) {
  const exceptions = sorted(await load(state));
  return json({ success: true, exportVersion: "kairos-policy-exception-export-v1", generatedAt: new Date().toISOString(), count: exceptions.length, exceptions, deploymentExecutionIncluded: false, rollbackExecutionIncluded: false, retryExecutionIncluded: false, automaticRemediationIncluded: false, builds: builds() });
}
function enrichInput(input, identity, env) { return { ...input, operatorIdentityHash: hashIdentity(identity), reviewId: clean(input.reviewId || env?.KAIROS_REVIEW_ID, 180) || null, continuityId: clean(input.continuityId || env?.KAIROS_CONTINUITY_ID, 180) || null, environment: clean(input.environment || env?.KAIROS_ENVIRONMENT || "production", 80), commitSha: clean(input.commitSha || env?.KAIROS_COMMIT_SHA, 80) || null }; }
async function load(state) { const value = await state.storage.get("kairos-policy-exception:records"); return Array.isArray(value) ? value : []; }
async function save(state, records) { await state.storage.put("kairos-policy-exception:records", records.slice(-MAX_RECORDS)); }
function sorted(records) { return records.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
async function forward(env, body) { if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "EXCEPTION_STORAGE_UNAVAILABLE", message: "Policy exception storage is unavailable." } }, 503); const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry")); return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })); }
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { governance: KAIROS_POLICY_EXCEPTION_GOVERNANCE_BUILD, store: KAIROS_POLICY_EXCEPTION_STORE_BUILD }; }
function failure(error) { return json({ success: false, error: { code: error?.code || "EXCEPTION_INVALID", message: error?.message || "Policy exception operation failed." } }, error?.status || 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Policy-Exception-Store": KAIROS_POLICY_EXCEPTION_STORE_BUILD } }); }
