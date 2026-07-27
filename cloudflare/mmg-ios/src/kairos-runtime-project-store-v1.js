import { createKairosRuntimeProject, transitionKairosRuntimeProject, KAIROS_RUNTIME_PROJECT_BUILD } from "./kairos-runtime-project-v1.js";

export const KAIROS_RUNTIME_PROJECT_STORE_BUILD = "kairos-runtime-project-store-20260727-1";
const INTERNAL_PATH = "/registry/kairos-runtime-projects";
const COLLECTION_ROUTE = /^\/api\/kairos\/runtime\/projects\/?$/i;
const EXPORT_ROUTE = /^\/api\/kairos\/runtime\/projects\/export\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/runtime\/projects\/([^/]+)\/?$/i;
const EVENT_ROUTE = /^\/api\/kairos\/runtime\/projects\/([^/]+)\/events\/?$/i;
const MAX_RECORDS = 500;

export async function handleKairosRuntimeProjectAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const isExport = EXPORT_ROUTE.test(pathname);
  const eventMatch = isExport ? null : pathname.match(EVENT_ROUTE);
  const itemMatch = isExport || eventMatch ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !isExport && !eventMatch && !itemMatch) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated Kairos runtime access is required." } }, 401);
  if (isExport) return request.method === "GET" ? forward(env, { operation: "export" }) : method("GET");
  if (COLLECTION_ROUTE.test(pathname)) {
    if (request.method === "GET") return forward(env, { operation: "list" });
    if (request.method === "POST") return forward(env, { operation: "create", input: enrichInput(await body(request), identity, env) });
    return method("GET or POST");
  }
  if (eventMatch) {
    if (request.method !== "POST") return method("POST");
    return forward(env, { operation: "transition", projectId: clean(eventMatch[1], 180), input: enrichInput(await body(request), identity, env) });
  }
  const projectId = clean(itemMatch[1], 180);
  if (request.method === "GET") return forward(env, { operation: "read", projectId });
  if (request.method === "PATCH") return forward(env, { operation: "transition", projectId, input: enrichInput(await body(request), identity, env) });
  return method("GET or PATCH");
}

export async function handleKairosRuntimeProjectObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const input = await body(request);
  if (input.operation === "create") return create(state, input.input);
  if (input.operation === "read") return read(state, input.projectId);
  if (input.operation === "list") return list(state);
  if (input.operation === "transition") return transition(state, input.projectId, input.input);
  if (input.operation === "export") return exportPackage(state);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown Kairos runtime project operation." } }, 400);
}

async function create(state, input) {
  try {
    const project = createKairosRuntimeProject({ ...input, events: [...(Array.isArray(input?.events) ? input.events : []), { type: "project_created", state: input?.state || "initialized", actorIdentityHash: input?.operatorIdentityHash, summary: "Kairos runtime project created." }] });
    const records = await load(state);
    if (records.some((item) => item.projectId === project.projectId)) return json({ success: false, error: { code: "RUNTIME_PROJECT_EXISTS", message: "Kairos runtime project already exists." } }, 409);
    records.push(project); await save(state, records);
    return json({ success: true, project, builds: builds() }, 201);
  } catch (error) { return failure(error); }
}
async function read(state, projectId) { const project = (await load(state)).find((item) => item.projectId === clean(projectId, 180)); return project ? json({ success: true, project, builds: builds() }) : json({ success: false, error: { code: "RUNTIME_PROJECT_NOT_FOUND", message: "Kairos runtime project was not found." } }, 404); }
async function list(state) { const projects = sorted(await load(state)); return json({ success: true, count: projects.length, projects, builds: builds() }); }
async function transition(state, projectId, input) {
  try {
    const records = await load(state); const index = records.findIndex((item) => item.projectId === clean(projectId, 180));
    if (index < 0) return json({ success: false, error: { code: "RUNTIME_PROJECT_NOT_FOUND", message: "Kairos runtime project was not found." } }, 404);
    records[index] = transitionKairosRuntimeProject(records[index], input); await save(state, records);
    return json({ success: true, project: records[index], builds: builds() });
  } catch (error) { return failure(error); }
}
async function exportPackage(state) { const projects = sorted(await load(state)); return json({ success: true, exportVersion: "kairos-runtime-project-export-v1", generatedAt: new Date().toISOString(), count: projects.length, projects, deploymentExecutionIncluded: false, commerceMutationIncluded: false, externalPublicationIncluded: false, builds: builds() }); }
function enrichInput(input, identity, env) { return { ...input, operatorIdentityHash: hashIdentity(identity), environment: clean(input.environment || env?.KAIROS_ENVIRONMENT || "production", 80), commitSha: clean(input.commitSha || env?.KAIROS_COMMIT_SHA, 80) || null }; }
async function load(state) { const value = await state.storage.get("kairos-runtime-projects:records"); return Array.isArray(value) ? value : []; }
async function save(state, records) { await state.storage.put("kairos-runtime-projects:records", records.slice(-MAX_RECORDS)); }
function sorted(records) { return records.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
async function forward(env, input) { if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "RUNTIME_STORAGE_UNAVAILABLE", message: "Kairos runtime project storage is unavailable." } }, 503); const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry")); return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })); }
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { runtime: KAIROS_RUNTIME_PROJECT_BUILD, store: KAIROS_RUNTIME_PROJECT_STORE_BUILD }; }
function failure(error) { return json({ success: false, error: { code: error?.code || "RUNTIME_PROJECT_INVALID", message: error?.message || "Kairos runtime project operation failed." } }, error?.status || 400); }
function method(allowed) { return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed}.` } }, 405); }
async function body(request) { return request.json().catch(() => ({})); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Runtime-Project-Store": KAIROS_RUNTIME_PROJECT_STORE_BUILD } }); }
