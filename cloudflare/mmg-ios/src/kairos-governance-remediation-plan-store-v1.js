import { createKairosGovernanceRemediationPlan, evaluateKairosGovernanceRemediationPlan, KAIROS_GOVERNANCE_REMEDIATION_PLANNING_BUILD } from "./kairos-governance-remediation-planning-v1.js";
import { handleKairosGovernanceEffectivenessVerificationAPI, handleKairosGovernanceEffectivenessVerificationObjectRequest, KAIROS_GOVERNANCE_EFFECTIVENESS_VERIFICATION_STORE_BUILD } from "./kairos-governance-effectiveness-verification-store-v1.js";
import { KAIROS_GOVERNANCE_EFFECTIVENESS_VERIFICATION_BUILD } from "./kairos-governance-effectiveness-verification-v1.js";

export const KAIROS_GOVERNANCE_REMEDIATION_PLAN_STORE_BUILD = "kairos-governance-remediation-plan-store-20260727-2";
const INTERNAL_PATH = "/registry/kairos-governance-remediation-plans";
const COLLECTION_ROUTE = /^\/api\/kairos\/operations\/remediation-plans\/?$/i;
const EXPORT_ROUTE = /^\/api\/kairos\/operations\/remediation-plans\/export\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/operations\/remediation-plans\/([^/]+)\/?$/i;
const MAX_RECORDS = 200;

export async function handleKairosGovernanceRemediationPlanAPI(request, env) {
  const effectiveness = await handleKairosGovernanceEffectivenessVerificationAPI(request.clone(), env); if (effectiveness) return effectiveness;
  const pathname = new URL(request.url).pathname;
  const isExport = EXPORT_ROUTE.test(pathname);
  const item = isExport ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !isExport && !item) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated governance remediation-plan access is required." } }, 401);
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
  const remediationPlanId = clean(item[1], 180);
  if (request.method === "GET") return forward(env, { operation: "read", remediationPlanId });
  if (request.method === "PATCH") {
    const input = await request.json().catch(() => ({}));
    return forward(env, { operation: "evaluate", remediationPlanId, input: enrichInput(input, identity, env) });
  }
  return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or PATCH." } }, 405);
}

export async function handleKairosGovernanceRemediationPlanObjectRequest(state, request) {
  const effectiveness = await handleKairosGovernanceEffectivenessVerificationObjectRequest(state, request.clone()); if (effectiveness) return effectiveness;
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const body = await request.json().catch(() => ({}));
  if (body.operation === "create") return create(state, body.input);
  if (body.operation === "read") return read(state, body.remediationPlanId);
  if (body.operation === "list") return list(state);
  if (body.operation === "evaluate") return evaluate(state, body.remediationPlanId, body.input);
  if (body.operation === "export") return exportPackage(state);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown governance remediation-plan operation." } }, 400);
}

async function create(state, input) {
  try {
    const remediationPlan = createKairosGovernanceRemediationPlan(input);
    const records = await load(state);
    if (records.some((item) => item.remediationPlanId === remediationPlan.remediationPlanId)) return json({ success: false, error: { code: "REMEDIATION_PLAN_EXISTS", message: "Governance remediation plan already exists." } }, 409);
    records.push(remediationPlan); await save(state, records);
    return json({ success: true, remediationPlan, builds: builds() }, 201);
  } catch (error) { return failure(error); }
}
async function read(state, remediationPlanId) { const remediationPlan = (await load(state)).find((item) => item.remediationPlanId === clean(remediationPlanId, 180)); return remediationPlan ? json({ success: true, remediationPlan, builds: builds() }) : json({ success: false, error: { code: "REMEDIATION_PLAN_NOT_FOUND", message: "Governance remediation plan was not found." } }, 404); }
async function list(state) { const remediationPlans = sorted(await load(state)); return json({ success: true, count: remediationPlans.length, remediationPlans, builds: builds() }); }
async function evaluate(state, remediationPlanId, input) {
  try {
    const records = await load(state); const index = records.findIndex((item) => item.remediationPlanId === clean(remediationPlanId, 180));
    if (index < 0) return json({ success: false, error: { code: "REMEDIATION_PLAN_NOT_FOUND", message: "Governance remediation plan was not found." } }, 404);
    records[index] = evaluateKairosGovernanceRemediationPlan(records[index], input); await save(state, records);
    return json({ success: true, remediationPlan: records[index], builds: builds() });
  } catch (error) { return failure(error); }
}
async function exportPackage(state) {
  const remediationPlans = sorted(await load(state));
  return json({ success: true, exportVersion: "kairos-governance-remediation-plan-export-v1", generatedAt: new Date().toISOString(), count: remediationPlans.length, remediationPlans, deploymentExecutionIncluded: false, rollbackExecutionIncluded: false, retryExecutionIncluded: false, remediationExecutionIncluded: false, automaticRemediationIncluded: false, builds: builds() });
}
function enrichInput(input, identity, env) { return { ...input, operatorIdentityHash: hashIdentity(identity), environment: clean(input.environment || env?.KAIROS_ENVIRONMENT || "production", 80), commitSha: clean(input.commitSha || env?.KAIROS_COMMIT_SHA, 80) || null }; }
async function load(state) { const value = await state.storage.get("kairos-governance-remediation-plan:records"); return Array.isArray(value) ? value : []; }
async function save(state, records) { await state.storage.put("kairos-governance-remediation-plan:records", records.slice(-MAX_RECORDS)); }
function sorted(records) { return records.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
async function forward(env, body) { if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "REMEDIATION_STORAGE_UNAVAILABLE", message: "Governance remediation-plan storage is unavailable." } }, 503); const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry")); return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })); }
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { planning: KAIROS_GOVERNANCE_REMEDIATION_PLANNING_BUILD, store: KAIROS_GOVERNANCE_REMEDIATION_PLAN_STORE_BUILD, effectivenessVerification: KAIROS_GOVERNANCE_EFFECTIVENESS_VERIFICATION_BUILD, effectivenessVerificationStore: KAIROS_GOVERNANCE_EFFECTIVENESS_VERIFICATION_STORE_BUILD }; }
function failure(error) { return json({ success: false, error: { code: error?.code || "REMEDIATION_PLAN_INVALID", message: error?.message || "Governance remediation-plan operation failed." } }, error?.status || 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Governance-Remediation-Plan-Store": KAIROS_GOVERNANCE_REMEDIATION_PLAN_STORE_BUILD, "X-Kairos-Governance-Effectiveness-Verification": KAIROS_GOVERNANCE_EFFECTIVENESS_VERIFICATION_BUILD, "X-Kairos-Governance-Effectiveness-Verification-Store": KAIROS_GOVERNANCE_EFFECTIVENESS_VERIFICATION_STORE_BUILD } }); }
