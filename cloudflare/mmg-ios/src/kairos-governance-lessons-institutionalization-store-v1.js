import { createKairosGovernanceLessonsInstitutionalization, evaluateKairosGovernanceLessonsInstitutionalization, KAIROS_GOVERNANCE_LESSONS_INSTITUTIONALIZATION_BUILD } from "./kairos-governance-lessons-institutionalization-v1.js";

export const KAIROS_GOVERNANCE_LESSONS_INSTITUTIONALIZATION_STORE_BUILD = "kairos-governance-lessons-institutionalization-store-20260727-1";
const INTERNAL_PATH = "/registry/kairos-governance-lessons-institutionalizations";
const COLLECTION_ROUTE = /^\/api\/kairos\/operations\/lessons-institutionalizations\/?$/i;
const EXPORT_ROUTE = /^\/api\/kairos\/operations\/lessons-institutionalizations\/export\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/operations\/lessons-institutionalizations\/([^/]+)\/?$/i;
const MAX_RECORDS = 200;

export async function handleKairosGovernanceLessonsInstitutionalizationAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const isExport = EXPORT_ROUTE.test(pathname);
  const item = isExport ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !isExport && !item) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated governance lessons-institutionalization access is required." } }, 401);
  if (isExport) return request.method === "GET" ? forward(env, { operation: "export" }) : json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } }, 405);
  if (COLLECTION_ROUTE.test(pathname)) {
    if (request.method === "GET") return forward(env, { operation: "list" });
    if (request.method === "POST") return forward(env, { operation: "create", input: enrichInput(await request.json().catch(() => ({})), identity, env) });
    return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST." } }, 405);
  }
  const institutionalizationId = clean(item[1], 180);
  if (request.method === "GET") return forward(env, { operation: "read", institutionalizationId });
  if (request.method === "PATCH") return forward(env, { operation: "evaluate", institutionalizationId, input: enrichInput(await request.json().catch(() => ({})), identity, env) });
  return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or PATCH." } }, 405);
}

export async function handleKairosGovernanceLessonsInstitutionalizationObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const body = await request.json().catch(() => ({}));
  if (body.operation === "create") return create(state, body.input);
  if (body.operation === "read") return read(state, body.institutionalizationId);
  if (body.operation === "list") return list(state);
  if (body.operation === "evaluate") return evaluate(state, body.institutionalizationId, body.input);
  if (body.operation === "export") return exportPackage(state);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown governance lessons-institutionalization operation." } }, 400);
}

async function create(state, input) { try { const institutionalization = createKairosGovernanceLessonsInstitutionalization(input); const records = await load(state); if (records.some((item) => item.institutionalizationId === institutionalization.institutionalizationId)) return json({ success: false, error: { code: "INSTITUTIONALIZATION_EXISTS", message: "Governance lessons institutionalization already exists." } }, 409); records.push(institutionalization); await save(state, records); return json({ success: true, institutionalization, builds: builds() }, 201); } catch (error) { return failure(error); } }
async function read(state, institutionalizationId) { const institutionalization = (await load(state)).find((item) => item.institutionalizationId === clean(institutionalizationId, 180)); return institutionalization ? json({ success: true, institutionalization, builds: builds() }) : json({ success: false, error: { code: "INSTITUTIONALIZATION_NOT_FOUND", message: "Governance lessons institutionalization was not found." } }, 404); }
async function list(state) { const institutionalizations = sorted(await load(state)); return json({ success: true, count: institutionalizations.length, institutionalizations, builds: builds() }); }
async function evaluate(state, institutionalizationId, input) { try { const records = await load(state); const index = records.findIndex((item) => item.institutionalizationId === clean(institutionalizationId, 180)); if (index < 0) return json({ success: false, error: { code: "INSTITUTIONALIZATION_NOT_FOUND", message: "Governance lessons institutionalization was not found." } }, 404); records[index] = evaluateKairosGovernanceLessonsInstitutionalization(records[index], input); await save(state, records); return json({ success: true, institutionalization: records[index], builds: builds() }); } catch (error) { return failure(error); } }
async function exportPackage(state) { const institutionalizations = sorted(await load(state)); return json({ success: true, exportVersion: "kairos-governance-lessons-institutionalization-export-v1", generatedAt: new Date().toISOString(), count: institutionalizations.length, institutionalizations, deploymentExecutionIncluded: false, rollbackExecutionIncluded: false, retryExecutionIncluded: false, changeExecutionIncluded: false, automaticChangeExecutionIncluded: false, builds: builds() }); }
function enrichInput(input, identity, env) { return { ...input, operatorIdentityHash: hashIdentity(identity), environment: clean(input.environment || env?.KAIROS_ENVIRONMENT || "production", 80), commitSha: clean(input.commitSha || env?.KAIROS_COMMIT_SHA, 80) || null }; }
async function load(state) { const value = await state.storage.get("kairos-governance-lessons-institutionalization:records"); return Array.isArray(value) ? value : []; }
async function save(state, records) { await state.storage.put("kairos-governance-lessons-institutionalization:records", records.slice(-MAX_RECORDS)); }
function sorted(records) { return records.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
async function forward(env, body) { if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "INSTITUTIONALIZATION_STORAGE_UNAVAILABLE", message: "Governance lessons-institutionalization storage is unavailable." } }, 503); const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry")); return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })); }
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { institutionalization: KAIROS_GOVERNANCE_LESSONS_INSTITUTIONALIZATION_BUILD, store: KAIROS_GOVERNANCE_LESSONS_INSTITUTIONALIZATION_STORE_BUILD }; }
function failure(error) { return json({ success: false, error: { code: error?.code || "INSTITUTIONALIZATION_INVALID", message: error?.message || "Governance lessons-institutionalization operation failed." } }, error?.status || 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Governance-Lessons-Institutionalization-Store": KAIROS_GOVERNANCE_LESSONS_INSTITUTIONALIZATION_STORE_BUILD } }); }
