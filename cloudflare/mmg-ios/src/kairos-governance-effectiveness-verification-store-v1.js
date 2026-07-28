import { createKairosGovernanceEffectivenessVerification, evaluateKairosGovernanceEffectivenessVerification, KAIROS_GOVERNANCE_EFFECTIVENESS_VERIFICATION_BUILD } from "./kairos-governance-effectiveness-verification-v1.js";
import { handleKairosGovernanceLessonsInstitutionalizationAPI, handleKairosGovernanceLessonsInstitutionalizationObjectRequest, KAIROS_GOVERNANCE_LESSONS_INSTITUTIONALIZATION_STORE_BUILD } from "./kairos-governance-lessons-institutionalization-store-v1.js";
import { KAIROS_GOVERNANCE_LESSONS_INSTITUTIONALIZATION_BUILD } from "./kairos-governance-lessons-institutionalization-v1.js";
import { handleKairosRuntimeProjectAPI, handleKairosRuntimeProjectObjectRequest, KAIROS_RUNTIME_PROJECT_STORE_BUILD } from "./kairos-runtime-project-store-v1.js";
import { KAIROS_RUNTIME_PROJECT_BUILD } from "./kairos-runtime-project-v1.js";

export const KAIROS_GOVERNANCE_EFFECTIVENESS_VERIFICATION_STORE_BUILD = "kairos-governance-effectiveness-verification-store-20260727-3";
const INTERNAL_PATH = "/registry/kairos-governance-effectiveness-verifications";
const COLLECTION_ROUTE = /^\/api\/kairos\/operations\/effectiveness-verifications\/?$/i;
const EXPORT_ROUTE = /^\/api\/kairos\/operations\/effectiveness-verifications\/export\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/operations\/effectiveness-verifications\/([^/]+)\/?$/i;
const MAX_RECORDS = 200;

export async function handleKairosGovernanceEffectivenessVerificationAPI(request, env) {
  const runtime = await handleKairosRuntimeProjectAPI(request.clone(), env); if (runtime) return stampRuntime(runtime);
  const institutionalization = await handleKairosGovernanceLessonsInstitutionalizationAPI(request.clone(), env); if (institutionalization) return stampInstitutionalization(institutionalization);
  const pathname = new URL(request.url).pathname;
  const isExport = EXPORT_ROUTE.test(pathname);
  const item = isExport ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !isExport && !item) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated governance effectiveness-verification access is required." } }, 401);
  if (isExport) {
    if (request.method !== "GET") return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } }, 405);
    return forward(env, { operation: "export" });
  }
  if (COLLECTION_ROUTE.test(pathname)) {
    if (request.method === "GET") return forward(env, { operation: "list" });
    if (request.method === "POST") return forward(env, { operation: "create", input: enrichInput(await request.json().catch(() => ({})), identity, env) });
    return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST." } }, 405);
  }
  const verificationId = clean(item[1], 180);
  if (request.method === "GET") return forward(env, { operation: "read", verificationId });
  if (request.method === "PATCH") return forward(env, { operation: "evaluate", verificationId, input: enrichInput(await request.json().catch(() => ({})), identity, env) });
  return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or PATCH." } }, 405);
}

export async function handleKairosGovernanceEffectivenessVerificationObjectRequest(state, request) {
  const runtime = await handleKairosRuntimeProjectObjectRequest(state, request.clone()); if (runtime) return stampRuntime(runtime);
  const institutionalization = await handleKairosGovernanceLessonsInstitutionalizationObjectRequest(state, request.clone()); if (institutionalization) return stampInstitutionalization(institutionalization);
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const body = await request.json().catch(() => ({}));
  if (body.operation === "create") return create(state, body.input);
  if (body.operation === "read") return read(state, body.verificationId);
  if (body.operation === "list") return list(state);
  if (body.operation === "evaluate") return evaluate(state, body.verificationId, body.input);
  if (body.operation === "export") return exportPackage(state);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown governance effectiveness-verification operation." } }, 400);
}

async function create(state, input) { try { const verification = createKairosGovernanceEffectivenessVerification(input); const records = await load(state); if (records.some((item) => item.verificationId === verification.verificationId)) return json({ success: false, error: { code: "EFFECTIVENESS_VERIFICATION_EXISTS", message: "Governance effectiveness verification already exists." } }, 409); records.push(verification); await save(state, records); return json({ success: true, verification, builds: builds() }, 201); } catch (error) { return failure(error); } }
async function read(state, verificationId) { const verification = (await load(state)).find((item) => item.verificationId === clean(verificationId, 180)); return verification ? json({ success: true, verification, builds: builds() }) : json({ success: false, error: { code: "EFFECTIVENESS_VERIFICATION_NOT_FOUND", message: "Governance effectiveness verification was not found." } }, 404); }
async function list(state) { const verifications = sorted(await load(state)); return json({ success: true, count: verifications.length, verifications, builds: builds() }); }
async function evaluate(state, verificationId, input) { try { const records = await load(state); const index = records.findIndex((item) => item.verificationId === clean(verificationId, 180)); if (index < 0) return json({ success: false, error: { code: "EFFECTIVENESS_VERIFICATION_NOT_FOUND", message: "Governance effectiveness verification was not found." } }, 404); records[index] = evaluateKairosGovernanceEffectivenessVerification(records[index], input); await save(state, records); return json({ success: true, verification: records[index], builds: builds() }); } catch (error) { return failure(error); } }
async function exportPackage(state) { const verifications = sorted(await load(state)); return json({ success: true, exportVersion: "kairos-governance-effectiveness-verification-export-v1", generatedAt: new Date().toISOString(), count: verifications.length, verifications, deploymentExecutionIncluded: false, rollbackExecutionIncluded: false, retryExecutionIncluded: false, remediationExecutionIncluded: false, automaticRemediationIncluded: false, builds: builds() }); }
function enrichInput(input, identity, env) { return { ...input, operatorIdentityHash: hashIdentity(identity), environment: clean(input.environment || env?.KAIROS_ENVIRONMENT || "production", 80), commitSha: clean(input.commitSha || env?.KAIROS_COMMIT_SHA, 80) || null }; }
async function load(state) { const value = await state.storage.get("kairos-governance-effectiveness-verification:records"); return Array.isArray(value) ? value : []; }
async function save(state, records) { await state.storage.put("kairos-governance-effectiveness-verification:records", records.slice(-MAX_RECORDS)); }
function sorted(records) { return records.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
async function forward(env, body) { if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "EFFECTIVENESS_STORAGE_UNAVAILABLE", message: "Governance effectiveness-verification storage is unavailable." } }, 503); const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry")); return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })); }
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { verification: KAIROS_GOVERNANCE_EFFECTIVENESS_VERIFICATION_BUILD, store: KAIROS_GOVERNANCE_EFFECTIVENESS_VERIFICATION_STORE_BUILD, institutionalization: KAIROS_GOVERNANCE_LESSONS_INSTITUTIONALIZATION_BUILD, institutionalizationStore: KAIROS_GOVERNANCE_LESSONS_INSTITUTIONALIZATION_STORE_BUILD, runtime: KAIROS_RUNTIME_PROJECT_BUILD, runtimeStore: KAIROS_RUNTIME_PROJECT_STORE_BUILD }; }
function failure(error) { return json({ success: false, error: { code: error?.code || "EFFECTIVENESS_VERIFICATION_INVALID", message: error?.message || "Governance effectiveness-verification operation failed." } }, error?.status || 400); }
function stampInstitutionalization(response) { const headers = new Headers(response.headers); headers.set("X-Kairos-Governance-Lessons-Institutionalization", KAIROS_GOVERNANCE_LESSONS_INSTITUTIONALIZATION_BUILD); headers.set("X-Kairos-Governance-Lessons-Institutionalization-Store", KAIROS_GOVERNANCE_LESSONS_INSTITUTIONALIZATION_STORE_BUILD); return new Response(response.body, { status: response.status, statusText: response.statusText, headers }); }
function stampRuntime(response) { const headers = new Headers(response.headers); headers.set("X-Kairos-Runtime-Project", KAIROS_RUNTIME_PROJECT_BUILD); headers.set("X-Kairos-Runtime-Project-Store", KAIROS_RUNTIME_PROJECT_STORE_BUILD); return new Response(response.body, { status: response.status, statusText: response.statusText, headers }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Governance-Effectiveness-Verification-Store": KAIROS_GOVERNANCE_EFFECTIVENESS_VERIFICATION_STORE_BUILD } }); }
