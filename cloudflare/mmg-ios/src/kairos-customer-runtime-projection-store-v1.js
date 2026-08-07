import { createKairosCustomerRuntimeProjection, KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD } from "./kairos-customer-runtime-projection-v1.js";
import { applyKairosCustomerApproval, recordKairosCustomerNotification, KAIROS_CUSTOMER_RUNTIME_ACTIONS_BUILD } from "./kairos-customer-runtime-actions-v1.js";

export const KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD = "kairos-customer-runtime-projection-store-20260807-4-secure-package-download";
const INTERNAL_PATH = "/registry/kairos-customer-runtime-projections";
const COLLECTION_ROUTE = /^\/api\/kairos\/customer\/projects\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/customer\/projects\/([^/]+)\/?$/i;
const ACTION_ROUTE = /^\/api\/kairos\/customer\/projects\/([^/]+)\/(approve|notifications)\/?$/i;
const PACKAGE_ROUTE = /^\/api\/kairos\/customer\/projects\/([^/]+)\/deliverables\/package\/?$/i;
const DEFAULT_STOREFRONT_DOMAIN = "themindsetmediagroup.com";
const MANUSCRIPT_REFERENCE = /^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/(?:source|setup|editorial|deliverables)(?:\/|$)/i;
const DELIVERABLE_MANUSCRIPT_SUFFIX = /(?:^|_)([a-z0-9][a-z0-9-]{7,})$/i;

export async function handleKairosCustomerRuntimeProjectionAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const packageMatch = pathname.match(PACKAGE_ROUTE);
  const action = packageMatch ? null : pathname.match(ACTION_ROUTE);
  const item = packageMatch || action ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !item && !action && !packageMatch) return null;

  const identity = await authenticateCustomer(request, env);
  if (!identity) {
    return json({ success: false, error: { code: "CUSTOMER_AUTH_REQUIRED", message: "Authenticated Shopify customer access is required." } }, 401);
  }

  const customerId = identity.kairosCustomerId;
  if (packageMatch) {
    if (request.method !== "GET") return method("GET");
    return serveCustomerPackage(env, customerId, clean(packageMatch[1], 180));
  }

  if (action) {
    if (request.method !== "POST") return method("POST");
    const input = await request.json().catch(() => ({}));
    return forward(env, {
      operation: action[2] === "approve" ? "customer-approve" : "customer-notify",
      customerId,
      projectId: clean(action[1], 180),
      input: { ...input, customerIdentityHash: hashIdentity(identity.shopifyCustomerId) },
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
  if (input.operation === "customer-package-resolve") return resolveCustomerPackage(state, input.customerId, input.projectId);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown customer runtime projection operation." } }, 400);
}

async function readCustomerProject(state, customerId, projectId) {
  const project = (await load(state)).find((item) => item.projectId === clean(projectId, 180));
  if (!project) return notFound();
  if (clean(project.customerId, 180) !== clean(customerId, 180)) return notFound();
  try {
    return json({ success: true, project: customerProjection(project, customerId), builds: builds() });
  } catch (error) {
    return failure(error);
  }
}

async function listCustomerProjects(state, customerId) {
  try {
    const projects = (await load(state))
      .filter((item) => clean(item.customerId, 180) === clean(customerId, 180))
      .map((item) => customerProjection(item, customerId))
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
    return json({ success: true, project: customerProjection(records[index], customerId), builds: builds() });
  } catch (error) {
    return failure(error);
  }
}

async function resolveCustomerPackage(state, customerId, projectId) {
  const project = (await load(state)).find((item) => item.projectId === clean(projectId, 180));
  if (!project) return notFound();
  if (clean(project.customerId, 180) !== clean(customerId, 180)) return notFound();
  if (!hasEligibleCustomerPackage(project)) {
    return json({ success: false, error: { code: "CUSTOMER_PACKAGE_NOT_READY", message: "The final customer package is not ready for download." } }, 409);
  }
  const manuscriptProjectId = resolveManuscriptProjectId(project);
  if (!manuscriptProjectId) {
    return json({ success: false, error: { code: "CUSTOMER_PACKAGE_REFERENCE_MISSING", message: "The final customer package is not attached to a protected manuscript record yet." } }, 409);
  }
  return json({ success: true, manuscriptProjectId });
}

async function serveCustomerPackage(env, customerId, projectId) {
  if (!env?.KAIROS_MANUSCRIPT_SOURCES?.idFromName || !env?.KAIROS_MANUSCRIPT_SOURCES?.get) {
    return json({ success: false, error: { code: "CUSTOMER_PACKAGE_STORAGE_UNAVAILABLE", message: "Protected package storage is unavailable." } }, 503);
  }
  const resolvedResponse = await forward(env, { operation: "customer-package-resolve", customerId, projectId });
  const resolved = await resolvedResponse.clone().json().catch(() => ({}));
  if (!resolvedResponse.ok || resolved?.success !== true || !resolved?.manuscriptProjectId) {
    return new Response(resolvedResponse.body, { status: resolvedResponse.status, statusText: resolvedResponse.statusText, headers: resolvedResponse.headers });
  }

  const manuscriptProjectId = clean(resolved.manuscriptProjectId, 180);
  const stub = env.KAIROS_MANUSCRIPT_SOURCES.get(env.KAIROS_MANUSCRIPT_SOURCES.idFromName(manuscriptProjectId));
  const packageResponse = await stub.fetch(new Request(
    `https://kairos.internal/registry/manuscripts/${encodeURIComponent(manuscriptProjectId)}/deliverables/zip`,
    { method: "GET", headers: { Accept: "application/zip, application/octet-stream" } },
  ));
  if (!packageResponse.ok) {
    return json({ success: false, error: { code: "CUSTOMER_PACKAGE_NOT_READY", message: "The final customer package is not ready for download." } }, packageResponse.status === 404 ? 404 : 409);
  }

  const headers = new Headers(packageResponse.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Type", headers.get("Content-Type") || "application/zip");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Kairos-Customer-Runtime-Projection-Store", KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD);
  return new Response(packageResponse.body, { status: 200, headers });
}

function customerProjection(project, customerId) {
  const projection = createKairosCustomerRuntimeProjection(project, { customerId });
  return Object.freeze({ ...projection, packageDownloadAvailable: hasEligibleCustomerPackage(project) && Boolean(resolveManuscriptProjectId(project)) });
}

function hasEligibleCustomerPackage(project) {
  const state = clean(project?.state, 40);
  if (!["delivery", "follow_up", "archived"].includes(state)) return false;
  return (Array.isArray(project?.deliverables) ? project.deliverables : []).some((item) =>
    item?.approved === true && ["packaged", "delivered"].includes(clean(item?.status, 40)),
  );
}

function resolveManuscriptProjectId(project) {
  const deliverables = (Array.isArray(project?.deliverables) ? project.deliverables : []).filter((item) =>
    item?.approved === true && ["packaged", "delivered"].includes(clean(item?.status, 40)),
  );
  const allowedAssetIds = new Set(deliverables.flatMap((item) => Array.isArray(item?.assetIds) ? item.assetIds.map((id) => clean(id, 180)) : []));
  const assets = Array.isArray(project?.assets) ? project.assets : [];
  for (const asset of assets) {
    if (allowedAssetIds.size && !allowedAssetIds.has(clean(asset?.assetId, 180))) continue;
    const reference = clean(asset?.sourceReference, 500);
    const match = reference.match(MANUSCRIPT_REFERENCE);
    if (match) return match[1];
  }
  for (const deliverable of deliverables) {
    const match = clean(deliverable?.deliverableId, 180).match(DELIVERABLE_MANUSCRIPT_SUFFIX);
    const candidate = clean(match?.[1], 180);
    if (/^[a-z0-9][a-z0-9-]{7,}$/i.test(candidate) && candidate.includes("-")) return candidate;
  }
  return null;
}

async function authenticateCustomer(request, env) {
  const authorization = clean(request.headers.get("authorization"), 4096);
  if (!authorization) return null;
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return null;

  const storefrontDomain = clean(env?.KAIROS_SHOPIFY_STOREFRONT_DOMAIN || DEFAULT_STOREFRONT_DOMAIN, 255)
    .replace(/^https?:\/\//i, "").replace(/\/$/, "");

  try {
    const discoveryResponse = await fetch(`https://${storefrontDomain}/.well-known/customer-account-api`, {
      method: "GET", headers: { Accept: "application/json" }, cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!discoveryResponse.ok) return null;
    const discovery = await discoveryResponse.json().catch(() => ({}));
    const graphqlEndpoint = clean(discovery?.graphql_api, 1024);
    if (!graphqlEndpoint || !/^https:\/\//i.test(graphqlEndpoint)) return null;

    const identityResponse = await fetch(graphqlEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: accessToken },
      body: JSON.stringify({ operationName: "KairosCustomerIdentity", query: "query KairosCustomerIdentity { customer { id } }", variables: {} }),
    });
    if (!identityResponse.ok) return null;
    const identityPayload = await identityResponse.json().catch(() => ({}));
    if (Array.isArray(identityPayload?.errors) && identityPayload.errors.length) return null;
    const shopifyCustomerId = clean(identityPayload?.data?.customer?.id, 255);
    if (!/^gid:\/\/shopify\/Customer\/\d+$/i.test(shopifyCustomerId)) return null;
    return { shopifyCustomerId, kairosCustomerId: mapKairosCustomerId(shopifyCustomerId, env) };
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
    } catch {}
  }
  return clean(shopifyCustomerId, 180);
}

function forward(env, input) {
  if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "CUSTOMER_RUNTIME_STORAGE_UNAVAILABLE", message: "Customer runtime storage is unavailable." } }, 503);
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry"));
  return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }));
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

function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { projection: KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD, store: KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD, actions: KAIROS_CUSTOMER_RUNTIME_ACTIONS_BUILD }; }
function notFound() { return json({ success: false, error: { code: "CUSTOMER_PROJECT_NOT_FOUND", message: "Project was not found." } }, 404); }
function failure(error) { return json({ success: false, error: { code: error?.code || "CUSTOMER_RUNTIME_PROJECTION_INVALID", message: error?.message || "Customer runtime projection failed." } }, error?.status || 400); }
function method(allowed) { return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed}.` } }, 405); }
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Kairos-Customer-Runtime-Projection": KAIROS_CUSTOMER_RUNTIME_PROJECTION_BUILD, "X-Kairos-Customer-Runtime-Projection-Store": KAIROS_CUSTOMER_RUNTIME_PROJECTION_STORE_BUILD, "X-Kairos-Customer-Runtime-Actions": KAIROS_CUSTOMER_RUNTIME_ACTIONS_BUILD } });
}
