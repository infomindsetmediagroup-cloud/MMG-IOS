import { createKairosCustomerRuntimeProjection, KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD } from "./kairos-customer-runtime-projection-v1.js";
import { applyKairosCustomerApproval, recordKairosCustomerNotification, KAIROS_CUSTOMER_RUNTIME_ACTIONS_BUILD } from "./kairos-customer-runtime-actions-v1.js";
import { authenticateKairosCustomerRequest, customerCorsPreflight, withCustomerPortalCors, KAIROS_CUSTOMER_AUTH_SESSION_BUILD } from "./kairos-customer-auth-session-v1.js";

export const KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD = "kairos-customer-runtime-projection-store-20260807-4-secure-session";
const INTERNAL_PATH = "/registry/kairos-customer-runtime-projections";
const COLLECTION_ROUTE = /^\/api\/kairos\/customer\/projects\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/customer\/projects\/([^/]+)\/?$/i;
const ACTION_ROUTE = /^\/api\/kairos\/customer\/projects\/([^/]+)\/(approve|notifications)\/?$/i;

export async function handleKairosCustomerRuntimeProjectionAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const action = pathname.match(ACTION_ROUTE);
  const item = action ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !item && !action) return null;
  if (request.method === "OPTIONS") return customerCorsPreflight(request, env);

  const identity = await authenticateKairosCustomerRequest(request, env);
  if (!identity) {
    return withCustomerPortalCors(json({
      success: false,
      error: {
        code: "CUSTOMER_AUTH_REQUIRED",
        message: "Authenticated Shopify customer access is required.",
      },
    }, 401), request, env);
  }

  const customerId = identity.kairosCustomerId;
  if (action) {
    if (request.method !== "POST") return withCustomerPortalCors(method("POST"), request, env);
    const input = await request.json().catch(() => ({}));
    const response = await forward(env, {
      operation: action[2] === "approve" ? "customer-approve" : "customer-notify",
      customerId,
      projectId: clean(action[1], 180),
      input: {
        ...input,
        customerIdentityHash: await hashIdentity(identity.shopifyCustomerId),
      },
    });
    return withCustomerPortalCors(response, request, env);
  }

  if (request.method !== "GET") return withCustomerPortalCors(method("GET"), request, env);
  const response = await forward(env, item
    ? { operation: "customer-read", customerId, projectId: clean(item[1], 180) }
    : { operation: "customer-list", customerId });
  return withCustomerPortalCors(response, request, env);
}

export async function handleKairosCustomerRuntimeProjectionObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const input = await request.json().catch(() => ({}));
  if (input.operation === "customer-read") return readCustomerProject(state, input.customerId, input.projectId);
  if (input.operation === "customer-list") return listCustomerProjects(state, input.customerId);
  if (input.operation === "customer-approve") return mutateCustomerProject(state, input.customerId, input.projectId, (project) => applyKairosCustomerApproval(project, input.input));
  if (input.operation === "customer-notify") return mutateCustomerProject(state, input.customerId, input.projectId, (project) => recordKairosCustomerNotification(project, input.input));
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown customer runtime projection operation." } }, 400);
}

async function readCustomerProject(state, customerId, projectId) {
  const project = (await load(state)).find((item) => item.projectId === clean(projectId, 180));
  if (!project) return notFound();
  if (clean(project.customerId, 180) !== clean(customerId, 180)) return notFound();
  try {
    return json({ success: true, project: createKairosCustomerRuntimeProjection(project, { customerId }), builds: builds() });
  } catch (error) {
    return failure(error);
  }
}

async function listCustomerProjects(state, customerId) {
  try {
    const projects = (await load(state))
      .filter((item) => clean(item.customerId, 180) === clean(customerId, 180))
      .map((item) => createKairosCustomerRuntimeProjection(item, { customerId }))
      .sort((a, b) => Date.parse(b.timeline.at(-1)?.occurredAt || 0) - Date.parse(a.timeline.at(-1)?.occurredAt || 0));
    return json({ success: true, count: projects.length, projects, builds: builds() });
  } catch (error) {
    return failure(error);
  }
}

async function mutateCustomerProject(state, customerId, projectId, callback) {
  try {
    const records = await load(state);
    const index = records.findIndex((item) => item.projectId === clean(projectId, 180));
    if (index < 0) return notFound();
    if (clean(records[index].customerId, 180) !== clean(customerId, 180)) return notFound();
    records[index] = callback(records[index]);
    await state.storage.put("kairos-runtime-projects:records", records.slice(-500));
    return json({ success: true, project: createKairosCustomerRuntimeProjection(records[index], { customerId }), builds: builds() });
  } catch (error) {
    return failure(error);
  }
}

function forward(env, input) {
  if (!env?.KAIROS_PROJECTS) {
    return Promise.resolve(json({ success: false, error: { code: "CUSTOMER_RUNTIME_STORAGE_UNAVAILABLE", message: "Customer runtime storage is unavailable." } }, 503));
  }
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry"));
  return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

async function load(state) {
  const value = await state.storage.get("kairos-runtime-projects:records");
  return Array.isArray(value) ? value : [];
}

async function hashIdentity(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `kcid_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "").slice(0, 16)}`;
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function builds() {
  return {
    projection: KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD,
    store: KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD,
    actions: KAIROS_CUSTOMER_RUNTIME_ACTIONS_BUILD,
    auth: KAIROS_CUSTOMER_AUTH_SESSION_BUILD,
  };
}

function notFound() {
  return json({ success: false, error: { code: "CUSTOMER_PROJECT_NOT_FOUND", message: "Project was not found." } }, 404);
}

function failure(error) {
  return json({ success: false, error: { code: error?.code || "CUSTOMER_RUNTIME_PROJECTION_INVALID", message: error?.message || "Customer runtime projection failed." } }, error?.status || 400);
}

function method(allowed) {
  return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed}.` } }, 405);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Kairos-Customer-Runtime-Projection": KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD,
      "X-Kairos-Customer-Runtime-Projection-Store": KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD,
      "X-Kairos-Customer-Runtime-Actions": KAIROS_CUSTOMER_RUNTIME_ACTIONS_BUILD,
      "X-Kairos-Customer-Auth": KAIROS_CUSTOMER_AUTH_SESSION_BUILD,
    },
  });
}
