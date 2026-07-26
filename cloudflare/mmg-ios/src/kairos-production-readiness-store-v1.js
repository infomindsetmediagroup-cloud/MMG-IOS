import { createKairosReadinessCertification, evaluateKairosReadinessCertification, KAIROS_PRODUCTION_READINESS_CERTIFICATION_BUILD } from "./kairos-production-readiness-certification-v1.js";

export const KAIROS_PRODUCTION_READINESS_STORE_BUILD = "kairos-production-readiness-store-20260725-1";
const INTERNAL_PATH = "/registry/kairos-production-readiness";
const COLLECTION_ROUTE = /^\/api\/kairos\/operations\/readiness-certifications\/?$/i;
const EXPORT_ROUTE = /^\/api\/kairos\/operations\/readiness-certifications\/export\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/operations\/readiness-certifications\/([^/]+)\/?$/i;
const MAX_CERTIFICATIONS = 200;

export async function handleKairosProductionReadinessAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const isExport = EXPORT_ROUTE.test(pathname);
  const item = isExport ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !isExport && !item) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated readiness certification access is required." } }, 401);
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
  const certificationId = clean(item[1], 180);
  if (request.method === "GET") return forward(env, { operation: "read", certificationId });
  if (request.method === "PATCH") {
    const input = await request.json().catch(() => ({}));
    return forward(env, { operation: "evaluate", certificationId, input: enrichInput(input, identity, env) });
  }
  return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or PATCH." } }, 405);
}

export async function handleKairosProductionReadinessObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const body = await request.json().catch(() => ({}));
  if (body.operation === "create") return create(state, body.input);
  if (body.operation === "read") return read(state, body.certificationId);
  if (body.operation === "list") return list(state);
  if (body.operation === "evaluate") return evaluate(state, body.certificationId, body.input);
  if (body.operation === "export") return exportPackage(state);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown readiness certification operation." } }, 400);
}

async function create(state, input) {
  try {
    const certification = createKairosReadinessCertification(input);
    const records = await load(state);
    if (records.some((item) => item.certificationId === certification.certificationId)) return json({ success: false, error: { code: "CERTIFICATION_EXISTS", message: "Certification already exists." } }, 409);
    records.push(certification);
    await save(state, records);
    return json({ success: true, certification, builds: builds() }, 201);
  } catch (error) { return certificationFailure(error); }
}

async function read(state, certificationId) {
  const certification = (await load(state)).find((item) => item.certificationId === clean(certificationId, 180));
  return certification ? json({ success: true, certification, builds: builds() }) : json({ success: false, error: { code: "CERTIFICATION_NOT_FOUND", message: "Certification was not found." } }, 404);
}

async function list(state) {
  const certifications = sorted(await load(state));
  return json({ success: true, count: certifications.length, certifications, builds: builds() });
}

async function evaluate(state, certificationId, input) {
  try {
    const records = await load(state);
    const index = records.findIndex((item) => item.certificationId === clean(certificationId, 180));
    if (index < 0) return json({ success: false, error: { code: "CERTIFICATION_NOT_FOUND", message: "Certification was not found." } }, 404);
    records[index] = evaluateKairosReadinessCertification(records[index], input);
    await save(state, records);
    return json({ success: true, certification: records[index], builds: builds() });
  } catch (error) { return certificationFailure(error); }
}

async function exportPackage(state) {
  const certifications = sorted(await load(state));
  return json({
    success: true,
    exportVersion: "kairos-production-readiness-export-v1",
    generatedAt: new Date().toISOString(),
    count: certifications.length,
    certifications,
    launchExecutionIncluded: false,
    deploymentExecutionIncluded: false,
    rollbackExecutionIncluded: false,
    automaticRemediationIncluded: false,
    builds: builds(),
  });
}

function enrichInput(input, identity, env) {
  return {
    ...input,
    operatorIdentityHash: hashIdentity(identity),
    releaseId: clean(input.releaseId || env?.KAIROS_RELEASE_ID, 180) || null,
    deploymentId: clean(input.deploymentId || env?.KAIROS_DEPLOYMENT_ID, 180) || null,
    environment: clean(input.environment || env?.KAIROS_ENVIRONMENT || "production", 80),
    commitSha: clean(input.commitSha || env?.KAIROS_COMMIT_SHA, 80) || null,
  };
}

async function load(state) { const value = await state.storage.get("kairos-production-readiness:records"); return Array.isArray(value) ? value : []; }
async function save(state, records) { await state.storage.put("kairos-production-readiness:records", records.slice(-MAX_CERTIFICATIONS)); }
function sorted(records) { return records.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
async function forward(env, body) {
  if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "CERTIFICATION_STORAGE_UNAVAILABLE", message: "Readiness certification storage is unavailable." } }, 503);
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry"));
  return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { certification: KAIROS_PRODUCTION_READINESS_CERTIFICATION_BUILD, store: KAIROS_PRODUCTION_READINESS_STORE_BUILD }; }
function certificationFailure(error) { return json({ success: false, error: { code: error?.code || "CERTIFICATION_INVALID", message: error?.message || "Readiness certification operation failed." } }, error?.status || 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Production-Readiness-Store": KAIROS_PRODUCTION_READINESS_STORE_BUILD } }); }
