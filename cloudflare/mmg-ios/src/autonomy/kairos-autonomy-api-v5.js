/**
 * ============================================================================
 * KAIROS AUTONOMOUS BUSINESS OPERATIONS
 * AUTHENTICATED COMPLETE OPERATIONS API V5
 * Organization: Mindset Media Group / The Legacy, LLC
 * ============================================================================
 */

import {
  handleAutonomyApiRequest as handleAutonomyApiV4Request,
  KAIROS_AUTONOMY_API_BUILD as KAIROS_AUTONOMY_API_V4_BUILD,
  KAIROS_BUSINESS_COLLECTION_PATH,
} from "./kairos-autonomy-api-v4.js";
import {
  executeBusinessStateOperations,
  evaluateAutonomousOperationsActivation,
  KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD,
} from "./kairos-autonomous-operations-cycle-v1.js";
import { KAIROS_BUSINESS_PRIORITIZER_BUILD } from "./kairos-business-prioritizer-v1.js";
import { KAIROS_BUSINESS_ORCHESTRATOR_BUILD } from "./kairos-business-orchestrator-v1.js";

export const KAIROS_AUTONOMY_API_BUILD =
  "kairos-autonomy-api-20260802-5-complete-operations";
export { KAIROS_BUSINESS_COLLECTION_PATH };

const STATUS_PATH = "/api/autonomy/status";
const MAX_RESPONSE_BYTES = 1024 * 1024;

export async function handleAutonomyApiRequest(request, env = {}, ctx = {}, options = {}) {
  let pathname = null;
  let method = null;
  try {
    const url = new URL(request.url);
    pathname = url.pathname;
    method = request.method;
  } catch {
    // The delegated API remains authoritative for malformed requests.
  }

  let delegated;
  try {
    delegated = await handleAutonomyApiV4Request(request, env, ctx, options);
  } catch {
    return apiError(502, "AUTONOMY_API_DELEGATION_FAILED", "The autonomy API request could not be delegated.");
  }

  if (delegated === null) return null;
  if (!(delegated instanceof Response)) {
    return apiError(502, "AUTONOMY_API_DELEGATION_FAILED", "The autonomy API returned an invalid response.");
  }

  if (pathname === KAIROS_BUSINESS_COLLECTION_PATH && method === "POST") {
    return completeManualCollection(delegated, env, ctx, options);
  }
  if (pathname === STATUS_PATH && method === "GET") {
    return upgradeStatus(delegated, env, options);
  }
  return upgradeResponse(delegated);
}

async function completeManualCollection(response, env, ctx, options) {
  if (response.status !== 200) return upgradeResponse(response);
  const parsed = await readBoundedJson(response, MAX_RESPONSE_BYTES);
  if (!parsed.ok || !isPlainObject(parsed.value) || parsed.value.ok !== true) {
    return apiError(
      502,
      "INVALID_BUSINESS_COLLECTION_RESPONSE",
      "The business-state collection API returned an invalid response.",
      response.headers,
    );
  }
  const body = parsed.value;
  if (!isPlainObject(body.businessState) || body.businessState.ok !== true) {
    return apiError(
      502,
      "INVALID_BUSINESS_STATE",
      "The business-state collection response did not contain a valid state.",
      response.headers,
    );
  }

  const operationsEnv = readOption(options, "operationsEnv") || env;
  const cycleOptions = buildCycleOptions(options);
  let operations;
  try {
    operations = await executeBusinessStateOperations(
      body.businessState,
      operationsEnv,
      ctx,
      cycleOptions,
    );
  } catch {
    operations = null;
  }
  if (!operations || typeof operations.ok !== "boolean") {
    return apiError(
      503,
      "AUTONOMOUS_OPERATIONS_FAILED",
      "The autonomous operations cycle did not return a valid result.",
      response.headers,
    );
  }

  const output = {
    ...body,
    ok: operations.ok,
    build: KAIROS_AUTONOMY_API_BUILD,
    apiV4Build: KAIROS_AUTONOMY_API_V4_BUILD,
    cycleBuild: KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD,
    prioritizerBuild: KAIROS_BUSINESS_PRIORITIZER_BUILD,
    orchestratorBuild: KAIROS_BUSINESS_ORCHESTRATOR_BUILD,
    operations,
    error: operations.ok ? null : operations.error,
  };
  return jsonResponse(
    output,
    operations.ok ? 200 : 503,
    upgradedHeaders(response.headers),
  );
}

async function upgradeStatus(response, env, options) {
  if (response.status !== 200) return upgradeResponse(response);
  const parsed = await readBoundedJson(response, MAX_RESPONSE_BYTES);
  if (!parsed.ok || !isPlainObject(parsed.value)) {
    return apiError(502, "STATUS_RESPONSE_INVALID", "The autonomy status response is invalid.");
  }

  const body = parsed.value;
  const activation = evaluateAutonomousOperationsActivation(
    readOption(options, "operationsEnv") || env,
    { workflowResolver: readOption(options, "workflowResolver") },
  );
  body.ok = true;
  body.build = KAIROS_AUTONOMY_API_BUILD;
  body.builds = {
    ...(isPlainObject(body.builds) ? body.builds : {}),
    api: KAIROS_AUTONOMY_API_BUILD,
    apiV4: KAIROS_AUTONOMY_API_V4_BUILD,
    cycle: KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD,
    prioritizer: KAIROS_BUSINESS_PRIORITIZER_BUILD,
    orchestrator: KAIROS_BUSINESS_ORCHESTRATOR_BUILD,
  };
  body.businessObservation = {
    ...(isPlainObject(body.businessObservation) ? body.businessObservation : {}),
    manualCollectionPath: KAIROS_BUSINESS_COLLECTION_PATH,
    manualCollectionAvailable: true,
    manualPersistenceEnabled: true,
    scheduledCollectionEnabled: activation.projection.scheduledEnabled,
    scheduledPersistenceEnabled: activation.ready,
    prioritizationEnabled: activation.ready,
    orchestrationEnabled: activation.ready,
    certifiedExecutionEnabled: activation.ready,
    externalMutationEnabled: false,
    approvalBoundaryEnabled: true,
  };
  body.autonomousOperations = {
    enabled: activation.projection.operationsEnabled,
    ready: activation.ready,
    activationId: "business-operations-v1",
    cycleBuild: KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD,
    prioritizerBuild: KAIROS_BUSINESS_PRIORITIZER_BUILD,
    orchestratorBuild: KAIROS_BUSINESS_ORCHESTRATOR_BUILD,
    activation: activation.projection,
    certifiedAutonomousActions: [
      "collector.refresh",
      "website.reinspect",
      "incident.record",
      "repair.propose",
    ],
    approvalRequiredActions: [
      "executive.review.request",
      "github.issue.create",
      "github.branch.prepare",
      "github.pull_request.prepare",
      "github.merge",
      "cloudflare.deploy.production",
      "shopify.product.create",
      "shopify.product.update",
      "shopify.product.publish",
      "shopify.price.change",
      "customer.email.send",
      "publication.release",
    ],
  };

  return jsonResponse(body, 200, upgradedHeaders(response.headers));
}

async function upgradeResponse(response) {
  const headers = upgradedHeaders(response.headers);
  const contentType = headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  const parsed = await readBoundedJson(response, MAX_RESPONSE_BYTES);
  if (!parsed.ok) {
    return apiError(502, "RESPONSE_UPGRADE_FAILED", "The autonomy API response could not be upgraded.", headers);
  }
  if (isPlainObject(parsed.value)) parsed.value.build = KAIROS_AUTONOMY_API_BUILD;
  return jsonResponse(parsed.value, response.status, headers, response.statusText);
}

function buildCycleOptions(options) {
  const output = {};
  const keys = [
    "ledgerClient",
    "businessCollector",
    "prioritizer",
    "orchestrator",
    "policyEvaluator",
    "websiteHealthExecutor",
    "fetchImpl",
    "taskTimeoutMs",
    "websiteHealthTimeoutMs",
    "websiteHealthMaxBodyBytes",
    "workflowResolver",
  ];
  for (const key of keys) {
    const value = readOption(options, key);
    if (value !== undefined) output[key] = value;
  }
  return output;
}

function upgradedHeaders(source) {
  const headers = new Headers(source || {});
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Autonomy-API-Build", KAIROS_AUTONOMY_API_BUILD);
  headers.set("X-Kairos-Autonomy-API-V4-Build", KAIROS_AUTONOMY_API_V4_BUILD);
  headers.set("X-Kairos-Autonomous-Operations-Cycle-Build", KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD);
  headers.set("X-Kairos-Business-Prioritizer-Build", KAIROS_BUSINESS_PRIORITIZER_BUILD);
  headers.set("X-Kairos-Business-Orchestrator-Build", KAIROS_BUSINESS_ORCHESTRATOR_BUILD);
  return headers;
}

async function readBoundedJson(response, maximumBytes) {
  let text;
  try {
    text = await readBoundedText(response, maximumBytes);
  } catch {
    return { ok: false };
  }
  if (!text.ok || !text.text) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text.text) };
  } catch {
    return { ok: false };
  }
}

async function readBoundedText(response, maximumBytes) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    return new TextEncoder().encode(text).byteLength <= maximumBytes
      ? { ok: true, text }
      : { ok: false };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maximumBytes) {
      try {
        await reader.cancel("response_limit_reached");
      } catch {
        // Best-effort cancellation only.
      }
      return { ok: false };
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(combined) };
}

function jsonResponse(value, status, headers, statusText) {
  const outputHeaders = new Headers(headers || {});
  outputHeaders.set("Content-Type", "application/json; charset=utf-8");
  outputHeaders.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(value), {
    status,
    statusText,
    headers: outputHeaders,
  });
}

function apiError(status, code, message, sourceHeaders) {
  return jsonResponse({
    ok: false,
    build: KAIROS_AUTONOMY_API_BUILD,
    error: { code, message },
  }, status, upgradedHeaders(sourceHeaders));
}

function readOption(options, key) {
  if (!options || typeof options !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
