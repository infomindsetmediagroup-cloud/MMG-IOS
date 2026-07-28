import { executeFirstRevenueRunStoreAction, KAIROS_FIRST_REVENUE_RUN_STORE_BUILD } from "./kairos-first-revenue-run-store-v1.js";

export const KAIROS_FIRST_REVENUE_RUN_API_BUILD = "kairos-first-revenue-run-api-20260728-1";
const COLLECTION = /^\/api\/kairos\/revenue\/first-run\/?$/i;
const ITEM = /^\/api\/kairos\/revenue\/first-run\/([^/]+)\/?$/i;
const ACTION = /^\/api\/kairos\/revenue\/first-run\/([^/]+)\/(complete-stage)\/?$/i;
const INTERNAL = "/registry/kairos-first-revenue-runs";

export async function handleFirstRevenueRunAPI(request, env) {
  const path = new URL(request.url).pathname;
  const action = path.match(ACTION);
  const item = action ? null : path.match(ITEM);
  if (!COLLECTION.test(path) && !action && !item) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated Kairos access is required." } }, 401);
  if (COLLECTION.test(path)) {
    if (request.method === "POST") return forward(env, { action: "start", input: enrich(await body(request), identity) });
    if (request.method === "GET") return forward(env, { action: "list", input: {} });
    return method("GET or POST");
  }
  if (item && request.method === "GET") return forward(env, { action: "read", input: { runId: clean(item[1], 180) } });
  if (action && request.method === "POST") return forward(env, { action: action[2], input: enrich({ ...(await body(request)), runId: clean(action[1], 180) }, identity) });
  return method(action ? "POST" : "GET");
}

export async function handleFirstRevenueRunObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL) return null;
  try { const payload = await body(request); return json(await executeFirstRevenueRunStoreAction(state, payload.action, payload.input || {})); }
  catch (error) { return json({ success: false, error: { code: error.code || "FIRST_REVENUE_RUN_FAILED", message: error.message || "First revenue run failed." } }, error.status || 400); }
}

function enrich(input, identity) { return { ...input, operatorIdentityHash: hashIdentity(identity) }; }
async function forward(env, payload) { if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "REVENUE_STORAGE_UNAVAILABLE", message: "Kairos revenue storage is unavailable." } }, 503); const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry")); return stub.fetch(new Request(`https://kairos.internal${INTERNAL}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })); }
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && request.headers.get("authorization") === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function method(allowed) { return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed}.` } }, 405); }
async function body(request) { return request.json().catch(() => ({})); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-First-Revenue-Run-API": KAIROS_FIRST_REVENUE_RUN_API_BUILD, "X-Kairos-First-Revenue-Run-Store": KAIROS_FIRST_REVENUE_RUN_STORE_BUILD } }); }
