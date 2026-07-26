import { createKairosLaunchAuthorization, evaluateKairosLaunchAuthorization, KAIROS_CONTROLLED_LAUNCH_GOVERNANCE_BUILD } from "./kairos-controlled-launch-governance-v1.js";

export const KAIROS_CONTROLLED_LAUNCH_STORE_BUILD = "kairos-controlled-launch-store-20260725-1";
const INTERNAL_PATH = "/registry/kairos-controlled-launch";
const COLLECTION_ROUTE = /^\/api\/kairos\/operations\/launch-authorizations\/?$/i;
const EXPORT_ROUTE = /^\/api\/kairos\/operations\/launch-authorizations\/export\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/operations\/launch-authorizations\/([^/]+)\/?$/i;
const MAX_AUTHORIZATIONS = 200;

export async function handleKairosControlledLaunchAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const isExport = EXPORT_ROUTE.test(pathname);
  const item = isExport ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !isExport && !item) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated launch governance access is required." } }, 401);
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
  const authorizationId = clean(item[1], 180);
  if (request.method === "GET") return forward(env, { operation: "read", authorizationId });
  if (request.method === "PATCH") {
    const input = await request.json().catch(() => ({}));
    return forward(env, { operation: "evaluate", authorizationId, input: enrichInput(input, identity, env) });
  }
  return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or PATCH." } }, 405);
}

export async function handleKairosControlledLaunchObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const body = await request.json().catch(() => ({}));
  if (body.operation === "create") return create(state, body.input);
  if (body.operation === "read") return read(state, body.authorizationId);
  if (body.operation === "list") return list(state);
  if (body.operation === "evaluate") return evaluate(state, body.authorizationId, body.input);
  if (body.operation === "export") return exportPackage(state);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown launch governance operation." } }, 400);
}

async function create(state, input) {
  try {
    const authorization = createKairosLaunchAuthorization(input);
    const records = await load(state);
    if (records.some((item) => item.authorizationId === authorization.authorizationId)) return json({ success: false, error: { code: "AUTHORIZATION_EXISTS", message: "Launch authorization already exists." } }, 409);
    records.push(authorization);
    await save(state, records);
    return json({ success: true, authorization, builds: builds() }, 201);
  } catch (error) { return failure(error); }
}

async function read(state, authorizationId) {
  const authorization = (await load(state)).find((item) => item.authorizationId === clean(authorizationId, 180));
  return authorization ? json({ success: true, authorization, builds: builds() }) : json({ success: false, error: { code: "AUTHORIZATION_NOT_FOUND", message: "Launch authorization was not found." } }, 404);
}

async function list(state) {
  const authorizations = sorted(await load(state));
  return json({ success: true, count: authorizations.length, authorizations, builds: builds() });
}

async function evaluate(state, authorizationId, input) {
  try {
    const records = await load(state);
    const index = records.findIndex((item) => item.authorizationId === clean(authorizationId, 180));
    if (index < 0) return json({ success: false, error: { code: "AUTHORIZATION_NOT_FOUND", message: "Launch authorization was not found." } }, 404);
    records[index] = evaluateKairosLaunchAuthorization(records[index], input);
    await save(state, records);
    return json({ success: true, authorization: records[index], builds: builds() });
  } catch (error) { return failure(error); }
}

async function exportPackage(state) {
  const authorizations = sorted(await load(state));
  return json({
    success: true,
    exportVersion: "kairos-controlled-launch-export-v1",
    generatedAt: new Date().toISOString(),
    count: authorizations.length,
    authorizations,
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
    certificationId: clean(input.certificationId || env?.KAIROS_CERTIFICATION_ID, 180) || null,
    releaseId: clean(input.releaseId || env?.KAIROS_RELEASE_ID, 180) || null,
    deploymentId: clean(input.deploymentId || env?.KAIROS_DEPLOYMENT_ID, 180) || null,
    environment: clean(input.environment || env?.KAIROS_ENVIRONMENT || "production", 80),
    commitSha: clean(input.commitSha || env?.KAIROS_COMMIT_SHA, 80) || null,
  };
}

async function load(state) { const value = await state.storage.get("kairos-controlled-launch:records"); return Array.isArray(value) ? value : []; }
async function save(state, records) { await state.storage.put("kairos-controlled-launch:records", records.slice(-MAX_AUTHORIZATIONS)); }
function sorted(records) { return records.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
async function forward(env, body) {
  if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "AUTHORIZATION_STORAGE_UNAVAILABLE", message: "Launch authorization storage is unavailable." } }, 503);
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry"));
  return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { governance: KAIROS_CONTROLLED_LAUNCH_GOVERNANCE_BUILD, store: KAIROS_CONTROLLED_LAUNCH_STORE_BUILD }; }
function failure(error) { return json({ success: false, error: { code: error?.code || "AUTHORIZATION_INVALID", message: error?.message || "Launch authorization operation failed." } }, error?.status || 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Controlled-Launch-Store": KAIROS_CONTROLLED_LAUNCH_STORE_BUILD } }); }
