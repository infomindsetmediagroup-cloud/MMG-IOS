import { createKairosCustomerRuntimeProjection, KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD } from "./kairos-customer-runtime-projection-v1.js";
import { applyKairosCustomerApproval, recordKairosCustomerNotification, KAIROS_CUSTOMER_RUNTIME_ACTIONS_BUILD } from "./kairos-customer-runtime-actions-v1.js";
import { verifyShopifyCustomerSession, KAIROS_SHOPIFY_CUSTOMER_AUTH_BUILD } from "./shopify/kairos-shopify-customer-auth-v1.js";

export const KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD = "kairos-customer-runtime-projection-store-20260807-4-shopify-session-bridge";
const INTERNAL_PATH = "/registry/kairos-customer-runtime-projections";
const COLLECTION_ROUTE = /^\/api\/kairos\/customer\/projects\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/customer\/projects\/([^/]+)\/?$/i;
const ACTION_ROUTE = /^\/api\/kairos\/customer\/projects\/([^/]+)\/(approve|notifications)\/?$/i;
const DEFAULT_STOREFRONT_DOMAIN = "themindsetmediagroup.com";

export async function handleKairosCustomerRuntimeProjectionAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const action = pathname.match(ACTION_ROUTE);
  const item = action ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !item && !action) return null;

  if (request.method === "OPTIONS") return corsPreflight();

  const identity = await authenticateCustomer(request, env);
  if (!identity) {
    return json({
      success: false,
      error: {
        code: "CUSTOMER_AUTH_REQUIRED",
        message: "Authenticated Shopify customer access is required.",
      },
    }, 401);
  }

  const customerId = identity.kairosCustomerId;
  if (action) {
    if (request.method !== "POST") return method("POST");
    const input = await request.json().catch(() => ({}));
    return forward(env, {
      operation: action[2] === "approve" ? "customer-approve" : "customer-notify",
      customerId,
      projectId: clean(action[1], 180),
      input: {
        ...input,
        customerIdentityHash: hashIdentity(identity.shopifyCustomerId),
      },
    });
  }

  if (request.method !== "GET") return method("GET");
  return forward(env, item
    ? { operation: "customer-read", customerId, projectId: clean(item[1], 180) }
    : { operation: "customer-list", customerId });
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

async function authenticateCustomer(request, env) {
  const authorization = clean(request.headers.get("authorization"), 8192);
  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  // Customer-account UI extensions authenticate external backend calls with a
  // Shopify-signed session JWT. Verify that JWT first and derive customer
  // identity only from its signed `sub` claim.
  if (token.split(".").length === 3) {
    const session = await verifyShopifyCustomerSession(request, env);
    if (!session.ok) return null;
    return {
      shopifyCustomerId: session.shopifyCustomerId,
      kairosCustomerId: mapKairosCustomerId(session.shopifyCustomerId, env),
      authMode: "shopify-customer-session",
    };
  }

  // Backward-compatible path for a server-controlled Shopify Customer Account
  // access token. Browser-provided customer IDs remain ignored.
  const storefrontDomain = clean(env?.KAIROS_SHOPIFY_STOREFRONT_DOMAIN || DEFAULT_STOREFRONT_DOMAIN, 255)
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");

  try {
    const discoveryResponse = await fetch(`https://${storefrontDomain}/.well-known/customer-account-api`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!discoveryResponse.ok) return null;
    const discovery = await discoveryResponse.json().catch(() => ({}));
    const graphqlEndpoint = clean(discovery?.graphql_api, 1024);
    if (!graphqlEndpoint || !/^https:\/\//i.test(graphqlEndpoint)) return null;

    const identityResponse = await fetch(graphqlEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token,
      },
      body: JSON.stringify({
        operationName: "KairosCustomerIdentity",
        query: "query KairosCustomerIdentity { customer { id } }",
        variables: {},
      }),
    });
    if (!identityResponse.ok) return null;
    const identityPayload = await identityResponse.json().catch(() => ({}));
    if (Array.isArray(identityPayload?.errors) && identityPayload.errors.length) return null;
    const shopifyCustomerId = clean(identityPayload?.data?.customer?.id, 255);
    if (!/^gid:\/\/shopify\/Customer\/\d+$/i.test(shopifyCustomerId)) return null;

    return {
      shopifyCustomerId,
      kairosCustomerId: mapKairosCustomerId(shopifyCustomerId, env),
      authMode: "shopify-customer-access-token",
    };
  } catch {
    return null;
  }
}

function mapKairosCustomerId(shopifyCustomerId, env) {
  const rawMap = clean(env?.KAIROS_SHOPIFY_CUSTOMER_MAP, 65535);
  if (rawMap) {
    try {
      const parsed = JSON.parse(rawMap);
      const mapped = clean(parsed?.[shopifyCustomerId], 180);
      if (mapped) return mapped;
    } catch {
      // Invalid optional mapping must never weaken authentication. Fall through
      // to the immutable Shopify customer GID as the canonical Kairos identity.
    }
  }
  return clean(shopifyCustomerId, 180);
}

async function forward(env, input) {
  if (!env?.KAIROS_PROJECTS) {
    return json({ success: false, error: { code: "CUSTOMER_RUNTIME_STORAGE_UNAVAILABLE", message: "Customer runtime storage is unavailable." } }, 503);
  }
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry"));
  const response = await stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
  return withCustomerCors(response);
}

async function load(state) {
  const value = await state.storage.get("kairos-runtime-projects:records");
  return Array.isArray(value) ? value : [];
}

function hashIdentity(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `kcid_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function builds() {
  return {
    projection: KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD,
    store: KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD,
    actions: KAIROS_CUSTOMER_RUNTIME_ACTIONS_BUILD,
    customerAuth: KAIROS_SHOPIFY_CUSTOMER_AUTH_BUILD,
  };
}

function notFound() {
  return json({ success: false, error: { code: "CUSTOMER_PROJECT_NOT_FOUND", message: "Project was not found." } }, 404);
}

function failure(error) {
  return json({ success: false, error: { code: error?.code || "CUSTOMER_RUNTIME_PROJECTION_INVALID", message: error?.message || "Customer runtime projection failed." } }, error?.status || 400);
}

function method(allowed) {
  const response = json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed}.` } }, 405);
  response.headers.set("Allow", allowed);
  return response;
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: customerCorsHeaders(),
  });
}

function withCustomerCors(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of customerCorsHeaders()) headers.set(name, value);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Authorization");
  headers.set("X-Kairos-Shopify-Customer-Auth", KAIROS_SHOPIFY_CUSTOMER_AUTH_BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function customerCorsHeaders() {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    "X-Content-Type-Options": "nosniff",
  });
}

function json(value, status = 200) {
  const headers = customerCorsHeaders();
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Authorization");
  headers.set("X-Kairos-Customer-Runtime-Projection", KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD);
  headers.set("X-Kairos-Customer-Runtime-Projection-Store", KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD);
  headers.set("X-Kairos-Customer-Runtime-Actions", KAIROS_CUSTOMER_RUNTIME_ACTIONS_BUILD);
  headers.set("X-Kairos-Shopify-Customer-Auth", KAIROS_SHOPIFY_CUSTOMER_AUTH_BUILD);
  return new Response(JSON.stringify(value), { status, headers });
}
