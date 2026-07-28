import { createKairosCustomerRuntimeProjection, KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD } from "./kairos-customer-runtime-projection-v1.js";

export const KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD = "kairos-customer-runtime-projection-store-20260727-1";
const INTERNAL_PATH = "/registry/kairos-customer-runtime-projections";
const COLLECTION_ROUTE = /^\/api\/kairos\/customer\/projects\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/customer\/projects\/([^/]+)\/?$/i;

export async function handleKairosCustomerRuntimeProjectionAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const item = pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !item) return null;
  const customerId = authenticateCustomer(request, env);
  if (!customerId) return json({ success: false, error: { code: "CUSTOMER_AUTH_REQUIRED", message: "Authenticated customer access is required." } }, 401);
  if (request.method !== "GET") return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } }, 405);
  return forward(env, item ? { operation: "customer-read", customerId, projectId: clean(item[1], 180) } : { operation: "customer-list", customerId });
}

export async function handleKairosCustomerRuntimeProjectionObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const input = await request.json().catch(() => ({}));
  if (input.operation === "customer-read") return readCustomerProject(state, input.customerId, input.projectId);
  if (input.operation === "customer-list") return listCustomerProjects(state, input.customerId);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown customer runtime projection operation." } }, 400);
}

async function readCustomerProject(state, customerId, projectId) {
  const project = (await load(state)).find((item) => item.projectId === clean(projectId, 180));
  if (!project) return json({ success: false, error: { code: "CUSTOMER_PROJECT_NOT_FOUND", message: "Project was not found." } }, 404);
  try { return json({ success: true, project: createKairosCustomerRuntimeProjection(project, { customerId }), builds: builds() }); }
  catch (error) { return failure(error); }
}

async function listCustomerProjects(state, customerId) {
  try {
    const projects = (await load(state)).filter((item) => clean(item.customerId, 180) === clean(customerId, 180)).map((item) => createKairosCustomerRuntimeProjection(item, { customerId })).sort((a, b) => Date.parse(b.timeline.at(-1)?.occurredAt || 0) - Date.parse(a.timeline.at(-1)?.occurredAt || 0));
    return json({ success: true, count: projects.length, projects, builds: builds() });
  } catch (error) { return failure(error); }
}

function authenticateCustomer(request, env) {
  const customerHeader = clean(request.headers.get("x-kairos-customer-id"), 180);
  const accessEmail = clean(request.headers.get("cf-access-authenticated-user-email"), 320).toLowerCase();
  if (customerHeader && accessEmail) return customerHeader;
  const auth = request.headers.get("authorization") || "";
  const token = String(env?.KAIROS_CUSTOMER_ACCESS_TOKEN || "");
  return token && auth === `Bearer ${token}` ? customerHeader : "";
}
function forward(env, input) { if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "CUSTOMER_RUNTIME_STORAGE_UNAVAILABLE", message: "Customer runtime storage is unavailable." } }, 503); const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry")); return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })); }
async function load(state) { const value = await state.storage.get("kairos-runtime-projects:records"); return Array.isArray(value) ? value : []; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { projection: KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD, store: KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD }; }
function failure(error) { return json({ success: false, error: { code: error?.code || "CUSTOMER_RUNTIME_PROJECTION_INVALID", message: error?.message || "Customer runtime projection failed." } }, error?.status || 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Kairos-Customer-Runtime-Projection": KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD, "X-Kairos-Customer-Runtime-Projection-Store": KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD } }); }
