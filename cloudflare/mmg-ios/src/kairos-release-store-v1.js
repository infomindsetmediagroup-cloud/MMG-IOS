import { createKairosReleaseRecord, evaluateKairosRelease, KAIROS_RELEASE_RECOVERY_BUILD } from "./kairos-release-recovery-v1.js";

export const KAIROS_RELEASE_STORE_BUILD = "kairos-release-store-20260725-1";
const INTERNAL_PATH = "/registry/kairos-releases";
const COLLECTION_ROUTE = /^\/api\/kairos\/operations\/releases\/?$/i;
const EXPORT_ROUTE = /^\/api\/kairos\/operations\/releases\/export\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/operations\/releases\/([^/]+)\/?$/i;
const MAX_RELEASES = 300;

export async function handleKairosReleaseAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const isExport = EXPORT_ROUTE.test(pathname);
  const item = isExport ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !isExport && !item) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated release operations access is required." } }, 401);
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
  const releaseId = clean(item[1], 180);
  if (request.method === "GET") return forward(env, { operation: "read", releaseId });
  if (request.method === "PATCH") {
    const input = await request.json().catch(() => ({}));
    return forward(env, { operation: "evaluate", releaseId, input: enrichInput(input, identity, env) });
  }
  return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or PATCH." } }, 405);
}

export async function handleKairosReleaseObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const body = await request.json().catch(() => ({}));
  if (body.operation === "create") return create(state, body.input);
  if (body.operation === "read") return read(state, body.releaseId);
  if (body.operation === "list") return list(state);
  if (body.operation === "evaluate") return evaluate(state, body.releaseId, body.input);
  if (body.operation === "export") return exportPackage(state);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown release operation." } }, 400);
}

async function create(state, input) {
  try {
    const release = withCorrelations(createKairosReleaseRecord(input), input);
    const releases = await load(state);
    if (releases.some((item) => item.releaseId === release.releaseId)) return json({ success: false, error: { code: "RELEASE_EXISTS", message: "Release already exists." } }, 409);
    releases.push(release);
    await save(state, releases);
    return json({ success: true, release, builds: builds() }, 201);
  } catch (error) { return releaseFailure(error); }
}

async function read(state, releaseId) {
  const release = (await load(state)).find((item) => item.releaseId === clean(releaseId, 180));
  return release ? json({ success: true, release, builds: builds() }) : json({ success: false, error: { code: "RELEASE_NOT_FOUND", message: "Release was not found." } }, 404);
}

async function list(state) {
  const releases = sorted(await load(state));
  return json({ success: true, count: releases.length, releases, builds: builds() });
}

async function evaluate(state, releaseId, input) {
  try {
    const releases = await load(state);
    const index = releases.findIndex((item) => item.releaseId === clean(releaseId, 180));
    if (index < 0) return json({ success: false, error: { code: "RELEASE_NOT_FOUND", message: "Release was not found." } }, 404);
    releases[index] = withCorrelations(evaluateKairosRelease(releases[index], input), { ...releases[index], ...input });
    await save(state, releases);
    return json({ success: true, release: releases[index], builds: builds() });
  } catch (error) { return releaseFailure(error); }
}

async function exportPackage(state) {
  const releases = sorted(await load(state));
  return json({
    success: true,
    exportVersion: "kairos-release-export-v1",
    generatedAt: new Date().toISOString(),
    count: releases.length,
    releases,
    deploymentExecutionIncluded: false,
    rollbackExecutionIncluded: false,
    automaticRemediationIncluded: false,
    builds: builds(),
  });
}

function withCorrelations(record, input = {}) {
  return Object.freeze({
    ...record,
    incidentIds: boundedIds(input.incidentIds || (input.incidentId ? [input.incidentId] : record.incidentIds), "kinc_"),
    observabilityEventIds: boundedIds(input.observabilityEventIds || record.observabilityEventIds, "kevt_"),
    requestIds: boundedIds(input.requestIds || record.requestIds),
    approvalIds: boundedIds(input.approvalIds || record.approvalIds),
  });
}

function enrichInput(input, identity, env) {
  return {
    ...input,
    operatorIdentityHash: hashIdentity(identity),
    releaseId: clean(input.releaseId || env?.KAIROS_RELEASE_ID, 180) || undefined,
    deploymentId: clean(input.deploymentId || env?.KAIROS_DEPLOYMENT_ID, 180) || null,
    environment: clean(input.environment || env?.KAIROS_ENVIRONMENT || "production", 80),
    commitSha: clean(input.commitSha || env?.KAIROS_COMMIT_SHA, 80) || null,
  };
}

async function load(state) { const value = await state.storage.get("kairos-releases:records"); return Array.isArray(value) ? value : []; }
async function save(state, releases) { await state.storage.put("kairos-releases:records", releases.slice(-MAX_RELEASES)); }
function sorted(releases) { return releases.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
function boundedIds(value, requiredPrefix = "") { if (!Array.isArray(value)) return Object.freeze([]); return Object.freeze([...new Set(value.map((item) => clean(item, 180)).filter((item) => item && (!requiredPrefix || item.startsWith(requiredPrefix))))].slice(-100)); }
async function forward(env, body) {
  if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "RELEASE_STORAGE_UNAVAILABLE", message: "Release storage is unavailable." } }, 503);
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry"));
  return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { recovery: KAIROS_RELEASE_RECOVERY_BUILD, store: KAIROS_RELEASE_STORE_BUILD }; }
function releaseFailure(error) { return json({ success: false, error: { code: error?.code || "RELEASE_INVALID", message: error?.message || "Release operation failed." } }, error?.status || 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Release-Store": KAIROS_RELEASE_STORE_BUILD } }); }
