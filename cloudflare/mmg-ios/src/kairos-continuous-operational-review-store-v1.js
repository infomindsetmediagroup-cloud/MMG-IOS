import { createKairosContinuousOperationalReview, evaluateKairosContinuousOperationalReview, KAIROS_CONTINUOUS_OPERATIONAL_REVIEW_BUILD } from "./kairos-continuous-operational-review-v1.js";

export const KAIROS_CONTINUOUS_OPERATIONAL_REVIEW_STORE_BUILD = "kairos-continuous-operational-review-store-20260726-1";
const INTERNAL_PATH = "/registry/kairos-continuous-operational-review";
const COLLECTION_ROUTE = /^\/api\/kairos\/operations\/reviews\/?$/i;
const EXPORT_ROUTE = /^\/api\/kairos\/operations\/reviews\/export\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/operations\/reviews\/([^/]+)\/?$/i;
const MAX_RECORDS = 200;

export async function handleKairosContinuousOperationalReviewAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const isExport = EXPORT_ROUTE.test(pathname);
  const item = isExport ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !isExport && !item) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated operational review access is required." } }, 401);
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
  const reviewId = clean(item[1], 180);
  if (request.method === "GET") return forward(env, { operation: "read", reviewId });
  if (request.method === "PATCH") {
    const input = await request.json().catch(() => ({}));
    return forward(env, { operation: "evaluate", reviewId, input: enrichInput(input, identity, env) });
  }
  return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or PATCH." } }, 405);
}

export async function handleKairosContinuousOperationalReviewObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const body = await request.json().catch(() => ({}));
  if (body.operation === "create") return create(state, body.input);
  if (body.operation === "read") return read(state, body.reviewId);
  if (body.operation === "list") return list(state);
  if (body.operation === "evaluate") return evaluate(state, body.reviewId, body.input);
  if (body.operation === "export") return exportPackage(state);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown operational review operation." } }, 400);
}

async function create(state, input) {
  try {
    const review = createKairosContinuousOperationalReview(input);
    const records = await load(state);
    if (records.some((item) => item.reviewId === review.reviewId)) return json({ success: false, error: { code: "REVIEW_EXISTS", message: "Operational review already exists." } }, 409);
    records.push(review); await save(state, records);
    return json({ success: true, review, builds: builds() }, 201);
  } catch (error) { return failure(error); }
}
async function read(state, reviewId) { const review = (await load(state)).find((item) => item.reviewId === clean(reviewId, 180)); return review ? json({ success: true, review, builds: builds() }) : json({ success: false, error: { code: "REVIEW_NOT_FOUND", message: "Operational review was not found." } }, 404); }
async function list(state) { const reviews = sorted(await load(state)); return json({ success: true, count: reviews.length, reviews, builds: builds() }); }
async function evaluate(state, reviewId, input) {
  try {
    const records = await load(state); const index = records.findIndex((item) => item.reviewId === clean(reviewId, 180));
    if (index < 0) return json({ success: false, error: { code: "REVIEW_NOT_FOUND", message: "Operational review was not found." } }, 404);
    records[index] = evaluateKairosContinuousOperationalReview(records[index], input); await save(state, records);
    return json({ success: true, review: records[index], builds: builds() });
  } catch (error) { return failure(error); }
}
async function exportPackage(state) {
  const reviews = sorted(await load(state));
  return json({ success: true, exportVersion: "kairos-continuous-operational-review-export-v1", generatedAt: new Date().toISOString(), count: reviews.length, reviews, deploymentExecutionIncluded: false, rollbackExecutionIncluded: false, retryExecutionIncluded: false, automaticRemediationIncluded: false, builds: builds() });
}
function enrichInput(input, identity, env) { return { ...input, operatorIdentityHash: hashIdentity(identity), continuityId: clean(input.continuityId || env?.KAIROS_CONTINUITY_ID, 180) || null, assuranceId: clean(input.assuranceId || env?.KAIROS_ASSURANCE_ID, 180) || null, authorizationId: clean(input.authorizationId || env?.KAIROS_LAUNCH_AUTHORIZATION_ID, 180) || null, certificationId: clean(input.certificationId || env?.KAIROS_CERTIFICATION_ID, 180) || null, releaseId: clean(input.releaseId || env?.KAIROS_RELEASE_ID, 180) || null, deploymentId: clean(input.deploymentId || env?.KAIROS_DEPLOYMENT_ID, 180) || null, environment: clean(input.environment || env?.KAIROS_ENVIRONMENT || "production", 80), commitSha: clean(input.commitSha || env?.KAIROS_COMMIT_SHA, 80) || null }; }
async function load(state) { const value = await state.storage.get("kairos-continuous-operational-review:records"); return Array.isArray(value) ? value : []; }
async function save(state, records) { await state.storage.put("kairos-continuous-operational-review:records", records.slice(-MAX_RECORDS)); }
function sorted(records) { return records.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
async function forward(env, body) { if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "REVIEW_STORAGE_UNAVAILABLE", message: "Operational review storage is unavailable." } }, 503); const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry")); return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })); }
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { review: KAIROS_CONTINUOUS_OPERATIONAL_REVIEW_BUILD, store: KAIROS_CONTINUOUS_OPERATIONAL_REVIEW_STORE_BUILD }; }
function failure(error) { return json({ success: false, error: { code: error?.code || "REVIEW_INVALID", message: error?.message || "Operational review operation failed." } }, error?.status || 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Continuous-Operational-Review-Store": KAIROS_CONTINUOUS_OPERATIONAL_REVIEW_STORE_BUILD } }); }
