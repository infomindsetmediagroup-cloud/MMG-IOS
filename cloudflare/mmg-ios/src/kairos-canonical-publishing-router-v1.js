import { handleManuscriptAutoPipeline } from "./kairos-manuscript-auto-pipeline-v1.js";
import {
  CANONICAL_CONFIRMATIONS,
  KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD,
  assertCanonicalPackageReady,
  assertNoForbiddenPublicIdentity,
  assertShopifyDraftAuthorization,
  assertShopifyPublishAuthorization,
  canonicalContractSnapshot,
  canonicalCustomerPackageFiles,
  canonicalizePipelineRecord,
} from "./kairos-canonical-publishing-contract-v1.js";

export const KAIROS_CANONICAL_PUBLISHING_ROUTER_BUILD =
  "kairos-canonical-publishing-router-20260806-2";

const ROUTE = /^\/api\/kairos\/publishing\/manuscripts\/([a-z0-9-]{8,})(?:\/(status|digital-asset|package|shopify-draft|shopify-publish))?$/i;

export async function handleCanonicalPublishingRequest(
  request,
  env,
  _ctx,
  dependencies = {},
) {
  const url = new URL(request.url);
  const manuscriptPipeline =
    dependencies.manuscriptPipeline || handleManuscriptAutoPipeline;

  if (url.pathname === "/api/kairos/publishing/contracts") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return canonicalJSON({
      status: "ready",
      contract: canonicalContractSnapshot(),
      routes: canonicalRouteSnapshot(),
    });
  }

  const match = url.pathname.match(ROUTE);
  if (!match) return null;

  const projectId = match[1];
  const action = (match[2] || "status").toLowerCase();

  try {
    if (action === "status") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      const delegated = await delegate(
        request,
        manuscriptPipeline,
        env,
        projectId,
        "status",
      );
      return decoratePipelineResponse(delegated, {
        projectId,
        action,
        enforceCanonicalPackage: false,
      });
    }

    if (action === "package") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      const current = await readCanonicalPipelineRecord(
        request,
        manuscriptPipeline,
        env,
        projectId,
      );
      const normalized = assertCanonicalPackageReady(current);
      const delegated = await delegatePackage(
        request,
        manuscriptPipeline,
        env,
        projectId,
      );
      if (!delegated.ok) {
        return decoratePipelineResponse(delegated, {
          projectId,
          action,
          enforceCanonicalPackage: false,
        });
      }
      const expected = canonicalCustomerPackageFiles(normalized.metadata.title);
      const headers = new Headers(delegated.headers);
      headers.set(
        "Content-Disposition",
        `attachment; filename="${expected.archive.replace(/["\r\n]/g, "")}"`,
      );
      for (const [key, value] of canonicalHeaders(projectId, action)) {
        headers.set(key, value);
      }
      return new Response(delegated.body, {
        status: delegated.status,
        statusText: delegated.statusText,
        headers,
      });
    }

    if (request.method !== "POST") return methodNotAllowed("POST");
    const body = await readJSON(request);
    assertNoForbiddenPublicIdentity(body);

    if (action === "digital-asset") {
      const delegated = await delegate(
        request,
        manuscriptPipeline,
        env,
        projectId,
        "run",
        body,
      );
      return decoratePipelineResponse(delegated, {
        projectId,
        action,
        enforceCanonicalPackage: true,
      });
    }

    const current = await readCanonicalPipelineRecord(
      request,
      manuscriptPipeline,
      env,
      projectId,
    );
    assertCanonicalPackageReady(current);

    if (action === "shopify-draft") {
      assertShopifyDraftAuthorization(body);
      const delegated = await delegate(
        request,
        manuscriptPipeline,
        env,
        projectId,
        "shopify-draft",
        body,
      );
      return decoratePipelineResponse(delegated, {
        projectId,
        action,
        enforceCanonicalPackage: false,
      });
    }

    if (action === "shopify-publish") {
      assertShopifyPublishAuthorization(body);
      const delegated = await delegate(
        request,
        manuscriptPipeline,
        env,
        projectId,
        "shopify-publish",
        body,
      );
      return decoratePipelineResponse(delegated, {
        projectId,
        action,
        enforceCanonicalPackage: false,
      });
    }

    return canonicalFailure(
      404,
      "CANONICAL_PUBLISHING_ACTION_NOT_FOUND",
      "The requested canonical publishing action does not exist.",
    );
  } catch (error) {
    return canonicalFailure(
      Number(error?.status || 500),
      error?.code || "CANONICAL_PUBLISHING_FAILED",
      error instanceof Error
        ? error.message
        : "The canonical publishing workflow failed.",
      error?.record || null,
    );
  }
}

export function canonicalRouteSnapshot() {
  return Object.freeze({
    contracts: "GET /api/kairos/publishing/contracts",
    status:
      "GET /api/kairos/publishing/manuscripts/:projectId/status",
    digitalAsset:
      "POST /api/kairos/publishing/manuscripts/:projectId/digital-asset",
    package:
      "GET /api/kairos/publishing/manuscripts/:projectId/package",
    shopifyDraft:
      "POST /api/kairos/publishing/manuscripts/:projectId/shopify-draft",
    shopifyPublish:
      "POST /api/kairos/publishing/manuscripts/:projectId/shopify-publish",
    confirmations: CANONICAL_CONFIRMATIONS,
  });
}

async function readCanonicalPipelineRecord(
  request,
  manuscriptPipeline,
  env,
  projectId,
) {
  const response = await delegate(
    request,
    manuscriptPipeline,
    env,
    projectId,
    "status",
  );
  const body = await responseJSON(response);
  if (!response.ok) {
    throw routeError(
      response.status,
      body?.error?.code || "CANONICAL_PIPELINE_STATUS_UNAVAILABLE",
      body?.error?.message ||
        "The manuscript pipeline status could not be loaded.",
    );
  }
  return canonicalizePipelineRecord(body);
}

async function delegate(
  request,
  manuscriptPipeline,
  env,
  projectId,
  action,
  body = null,
) {
  const origin = new URL(request.url).origin;
  const suffix = action === "status" ? "" : `/${action}`;
  const headers = new Headers(request.headers);
  headers.set("X-Kairos-Canonical-Publishing", KAIROS_CANONICAL_PUBLISHING_ROUTER_BUILD);
  headers.set(
    "X-Kairos-Canonical-Contract",
    KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD,
  );
  if (body !== null) headers.set("Content-Type", "application/json; charset=utf-8");

  const delegatedRequest = new Request(
    `${origin}/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline${suffix}`,
    {
      method: action === "status" ? "GET" : "POST",
      headers,
      body: body === null ? undefined : JSON.stringify(body),
    },
  );

  const response = await manuscriptPipeline(delegatedRequest, env);
  if (!(response instanceof Response)) {
    throw routeError(
      502,
      "CANONICAL_PIPELINE_DELEGATE_MISSING",
      "The manuscript pipeline did not return an executable response.",
    );
  }
  return response;
}

async function delegatePackage(
  request,
  manuscriptPipeline,
  env,
  projectId,
) {
  const origin = new URL(request.url).origin;
  const headers = new Headers(request.headers);
  headers.set("X-Kairos-Canonical-Publishing", KAIROS_CANONICAL_PUBLISHING_ROUTER_BUILD);
  headers.set(
    "X-Kairos-Canonical-Contract",
    KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD,
  );
  const response = await manuscriptPipeline(
    new Request(
      `${origin}/api/admin-asset-vault/projects/${encodeURIComponent(projectId)}/package`,
      { method: "GET", headers },
    ),
    env,
  );
  if (!(response instanceof Response)) {
    throw routeError(
      502,
      "CANONICAL_PACKAGE_DELEGATE_MISSING",
      "The customer package route did not return an executable response.",
    );
  }
  return response;
}

async function decoratePipelineResponse(
  response,
  { projectId, action, enforceCanonicalPackage },
) {
  const contentType = String(response.headers.get("Content-Type") || "");
  if (!contentType.includes("application/json")) {
    return stamp(response, projectId, action);
  }

  const body = await responseJSON(response);
  if (!response.ok) {
    return canonicalJSON(body, response.status, projectId, action);
  }

  const normalized = canonicalizePipelineRecord(body);
  if (enforceCanonicalPackage) assertCanonicalPackageReady(normalized);

  return canonicalJSON(
    {
      ...normalized,
      canonicalInvocation: {
        projectId,
        action,
        accepted: true,
        contractBuild: KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD,
        routerBuild: KAIROS_CANONICAL_PUBLISHING_ROUTER_BUILD,
      },
    },
    response.status,
    projectId,
    action,
  );
}

async function readJSON(request) {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw routeError(
      400,
      "CANONICAL_PUBLISHING_JSON_INVALID",
      "The canonical publishing request body must be valid JSON.",
    );
  }
}

async function responseJSON(response) {
  return response.json().catch(() => ({}));
}

function methodNotAllowed(method) {
  return canonicalFailure(
    405,
    "CANONICAL_PUBLISHING_METHOD_NOT_ALLOWED",
    `This route requires ${method}.`,
  );
}

function canonicalFailure(status, code, message, record = null) {
  return canonicalJSON(
    {
      status: "failed",
      error: { code, message },
      canonicalRecord: record,
      build: KAIROS_CANONICAL_PUBLISHING_ROUTER_BUILD,
    },
    status,
  );
}

function canonicalJSON(
  value,
  status = 200,
  projectId = "",
  action = "",
) {
  const headers = canonicalHeaders(projectId, action);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { status, headers });
}

function stamp(response, projectId, action) {
  const headers = new Headers(response.headers);
  for (const [key, value] of canonicalHeaders(projectId, action)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function canonicalHeaders(projectId = "", action = "") {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Kairos-Canonical-Publishing": KAIROS_CANONICAL_PUBLISHING_ROUTER_BUILD,
    "X-Kairos-Canonical-Contract": KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD,
  });
  if (projectId) headers.set("X-Kairos-Publishing-Project", projectId);
  if (action) headers.set("X-Kairos-Publishing-Action", action);
  return headers;
}

function routeError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
