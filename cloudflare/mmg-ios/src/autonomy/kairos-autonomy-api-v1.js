import {
  dispatchAutonomyEvent,
  KAIROS_AUTONOMY_DISPATCHER_BUILD,
} from "./kairos-autonomy-dispatcher-v1.js";
import {
  createAutonomyLedgerClient,
  KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD,
} from "./kairos-autonomy-ledger-client-v1.js";
import { listActiveWorkflows } from "./kairos-workflow-registry-v1.js";

export const KAIROS_AUTONOMY_API_BUILD = "kairos-autonomy-api-20260802-1";

const AUTONOMY_ROOT = "/api/autonomy";
const EVENTS_PATH = `${AUTONOMY_ROOT}/events`;
const WORKFLOWS_PATH = `${AUTONOMY_ROOT}/workflows`;
const STATUS_PATH = `${AUTONOMY_ROOT}/status`;
const EVENT_DETAIL_PREFIX = `${EVENTS_PATH}/`;
const DEFAULT_MAX_REQUEST_BYTES = 64 * 1024;
const MIN_MAX_REQUEST_BYTES = 1024;
const MAX_MAX_REQUEST_BYTES = 256 * 1024;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_ERROR_MESSAGE_LENGTH = 1000;
const RETRIABLE_LEDGER_CODES = new Set([
  "LEDGER_UNAVAILABLE",
  "LEDGER_OPERATION_FAILED",
  "LEDGER_INVALID_RESPONSE",
]);
const DISPATCH_DISPOSITIONS = new Set([
  "completed",
  "duplicate",
  "in_progress",
  "rejected",
  "blocked",
  "failed",
]);

export async function handleAutonomyApiRequest(request, env = {}, ctx = {}, options = {}) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }

  if (!isAutonomyPath(url.pathname)) return null;

  const configuredSecret = validateServerSecret(env.KAIROS_AUTONOMY_API_TOKEN);
  if (!configuredSecret) {
    return apiError(
      503,
      "AUTONOMY_API_NOT_CONFIGURED",
      "The autonomy API authentication boundary is not configured.",
    );
  }

  const suppliedToken = parseBearerHeader(request.headers.get("Authorization"));
  if (!suppliedToken) return authenticationRequired();

  let authenticated;
  try {
    authenticated = await compareBearerTokens(suppliedToken, configuredSecret, options);
  } catch {
    return apiError(503, "AUTONOMY_AUTH_UNAVAILABLE", "The autonomy API authentication subsystem is unavailable.");
  }
  if (!authenticated) return authenticationRequired();

  const route = classifyRoute(url.pathname);
  if (route.kind === "unknown") {
    return apiError(404, "NOT_FOUND", "The requested autonomy API endpoint was not found.");
  }

  if (route.kind === "events") {
    if (request.method === "POST") return handleEventSubmission(request, env, ctx, options);
    if (request.method === "GET") return handleRecentEvents(url, env, options);
    return methodNotAllowed("GET, POST");
  }

  if (request.method !== "GET") return methodNotAllowed("GET");
  if (route.kind === "event") return handleEventRetrieval(route.encodedEventId, url, env, options);
  if (route.kind === "workflows") return handleWorkflowListing(options);
  return handleStatus(env);
}

async function handleEventSubmission(request, env, ctx, options) {
  if (!isJsonContentType(request.headers.get("Content-Type"))) {
    return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "The event submission must use application/json.");
  }

  const maxRequestBytes = boundedInteger(
    options.maxRequestBytes,
    DEFAULT_MAX_REQUEST_BYTES,
    MIN_MAX_REQUEST_BYTES,
    MAX_MAX_REQUEST_BYTES,
  );
  const body = await readBoundedBody(request, maxRequestBytes);
  if (!body.ok) {
    return body.code === "REQUEST_TOO_LARGE"
      ? apiError(413, body.code, "The event request body exceeds the permitted size.")
      : apiError(400, body.code, "The event request body must contain a valid JSON object.");
  }

  let event;
  try {
    event = JSON.parse(body.text);
  } catch {
    return apiError(400, "INVALID_JSON_BODY", "The event request body must contain a valid JSON object.");
  }
  if (!isPlainObject(event)) {
    return apiError(400, "INVALID_JSON_BODY", "The event request body must contain a valid JSON object.");
  }

  const dispatcher = Object.hasOwn(options, "dispatcher") ? options.dispatcher : dispatchAutonomyEvent;
  if (typeof dispatcher !== "function") {
    return apiError(500, "DISPATCHER_UNAVAILABLE", "The autonomy dispatcher is unavailable.");
  }

  const dispatchEnv = Object.hasOwn(options, "dispatchEnv") ? options.dispatchEnv : env;
  const dispatchOptions = Object.hasOwn(options, "dispatchOptions") ? options.dispatchOptions : {};

  let dispatchResult;
  try {
    dispatchResult = await dispatcher(event, dispatchEnv, ctx, dispatchOptions);
  } catch (error) {
    const sanitized = sanitizeError(error, "DISPATCH_FAILED", "The autonomy dispatcher failed.");
    return apiError(500, sanitized.code, sanitized.message);
  }

  if (!isNormalizedDispatchResult(dispatchResult) || !isJsonSerializable(dispatchResult)) {
    return apiError(500, "INVALID_DISPATCH_RESULT", "The autonomy dispatcher returned an invalid result.");
  }

  const status = dispatcherHttpStatus(dispatchResult);
  return apiJson({
    ok: status.ok,
    build: KAIROS_AUTONOMY_API_BUILD,
    result: dispatchResult,
  }, status.status);
}

async function handleRecentEvents(url, env, options) {
  const tenantId = validateIdentifier(url.searchParams.get("tenantId"));
  if (!tenantId) return apiError(400, "INVALID_TENANT_ID", "A valid tenantId query parameter is required.");

  const limit = parseLimit(url.searchParams.get("limit"));
  if (limit === null) return apiError(400, "INVALID_LIMIT", "limit must be an integer between 1 and 100.");

  const ledgerClient = resolveLedgerClient(env, options);
  if (!ledgerClient || typeof ledgerClient.listRecentEvents !== "function") {
    return apiError(503, "LEDGER_UNAVAILABLE", "The autonomy ledger is unavailable.");
  }

  let ledgerResult;
  try {
    ledgerResult = await ledgerClient.listRecentEvents(tenantId, limit);
  } catch {
    return apiError(503, "LEDGER_OPERATION_FAILED", "The autonomy ledger request failed.");
  }

  if (!ledgerResult?.ok) return ledgerFailureResponse(ledgerResult);
  if (!Array.isArray(ledgerResult.records)) {
    return apiError(503, "LEDGER_INVALID_RESPONSE", "The autonomy ledger returned an invalid response.");
  }

  const returnedLimit = Number.isInteger(ledgerResult.limit)
    && ledgerResult.limit >= 1
    && ledgerResult.limit <= MAX_LIST_LIMIT
    ? ledgerResult.limit
    : limit;
  return apiJson({
    ok: true,
    build: KAIROS_AUTONOMY_API_BUILD,
    tenantId,
    limit: returnedLimit,
    records: ledgerResult.records,
  });
}

async function handleEventRetrieval(encodedEventId, url, env, options) {
  const eventId = decodeEventId(encodedEventId);
  if (!eventId) return apiError(400, "INVALID_EVENT_ID", "A valid eventId path segment is required.");

  const tenantId = validateIdentifier(url.searchParams.get("tenantId"));
  if (!tenantId) return apiError(400, "INVALID_TENANT_ID", "A valid tenantId query parameter is required.");

  const ledgerClient = resolveLedgerClient(env, options);
  if (!ledgerClient || typeof ledgerClient.getEvent !== "function") {
    return apiError(503, "LEDGER_UNAVAILABLE", "The autonomy ledger is unavailable.");
  }

  let ledgerResult;
  try {
    ledgerResult = await ledgerClient.getEvent(tenantId, eventId);
  } catch {
    return apiError(503, "LEDGER_OPERATION_FAILED", "The autonomy ledger request failed.");
  }

  if (!ledgerResult?.ok) {
    if (ledgerResult?.code === "EVENT_NOT_FOUND") {
      return apiError(404, "EVENT_NOT_FOUND", "The autonomy event was not found.");
    }
    return ledgerFailureResponse(ledgerResult);
  }
  if (!isPlainObject(ledgerResult.record)) {
    return apiError(503, "LEDGER_INVALID_RESPONSE", "The autonomy ledger returned an invalid response.");
  }

  return apiJson({
    ok: true,
    build: KAIROS_AUTONOMY_API_BUILD,
    record: ledgerResult.record,
  });
}

function handleWorkflowListing(options) {
  const workflowLister = Object.hasOwn(options, "workflowLister") ? options.workflowLister : listActiveWorkflows;
  if (typeof workflowLister !== "function") {
    return apiError(500, "WORKFLOW_LISTER_UNAVAILABLE", "The workflow registry is unavailable.");
  }

  let workflows;
  try {
    workflows = workflowLister();
  } catch (error) {
    const sanitized = sanitizeError(error, "WORKFLOW_LIST_FAILED", "The workflow registry could not be read.");
    return apiError(500, sanitized.code, sanitized.message);
  }
  if (!Array.isArray(workflows)) {
    return apiError(500, "INVALID_WORKFLOW_LIST", "The workflow registry returned an invalid result.");
  }

  const projected = [];
  for (const workflow of workflows) {
    if (!isPlainObject(workflow) || workflow.status !== "active") continue;
    projected.push(projectWorkflow(workflow));
  }
  return apiJson({
    ok: true,
    build: KAIROS_AUTONOMY_API_BUILD,
    workflows: projected,
  });
}

function handleStatus(env) {
  const environment = normalizeEnvironment(env.KAIROS_ENVIRONMENT);
  const ledgerConfigured = Boolean(
    env.KAIROS_AUTONOMY_LEDGER
      && typeof env.KAIROS_AUTONOMY_LEDGER.idFromName === "function"
      && typeof env.KAIROS_AUTONOMY_LEDGER.get === "function",
  );
  return apiJson({
    ok: true,
    build: KAIROS_AUTONOMY_API_BUILD,
    status: ledgerConfigured ? "ready" : "degraded",
    environment,
    autonomousExecutionEnabled: env.KAIROS_KILL_SWITCH === "enabled",
    ledgerConfigured,
    builds: {
      api: KAIROS_AUTONOMY_API_BUILD,
      dispatcher: KAIROS_AUTONOMY_DISPATCHER_BUILD,
      ledgerClient: KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD,
    },
  });
}

function classifyRoute(pathname) {
  if (pathname === EVENTS_PATH) return { kind: "events" };
  if (pathname === WORKFLOWS_PATH) return { kind: "workflows" };
  if (pathname === STATUS_PATH) return { kind: "status" };
  if (pathname.startsWith(EVENT_DETAIL_PREFIX)) {
    const remainder = pathname.slice(EVENT_DETAIL_PREFIX.length);
    if (!remainder || remainder.includes("/")) return { kind: "event", encodedEventId: null };
    return { kind: "event", encodedEventId: remainder };
  }
  return { kind: "unknown" };
}

function isAutonomyPath(pathname) {
  return pathname === AUTONOMY_ROOT || pathname.startsWith(`${AUTONOMY_ROOT}/`);
}

function validateServerSecret(value) {
  if (typeof value !== "string" || value.length < 32 || value.length > 512) return null;
  if (value !== value.trim() || /[\s\u0000-\u001F\u007F]/u.test(value)) return null;
  return value;
}

function parseBearerHeader(value) {
  if (typeof value !== "string" || !value || value.length > 1024) return null;
  if (/[\r\n,]/u.test(value)) return null;
  const match = /^Bearer ([^\s]+)$/iu.exec(value);
  return match ? match[1] : null;
}

async function compareBearerTokens(supplied, configured, options) {
  const cryptoCandidate = Object.hasOwn(options, "cryptoImpl") ? options.cryptoImpl : globalThis.crypto;
  const subtle = cryptoCandidate?.subtle && typeof cryptoCandidate.subtle.digest === "function"
    ? cryptoCandidate.subtle
    : typeof cryptoCandidate?.digest === "function"
      ? cryptoCandidate
      : null;
  if (!subtle) throw new Error("crypto unavailable");

  const encoder = new TextEncoder();
  const [suppliedDigest, configuredDigest] = await Promise.all([
    subtle.digest("SHA-256", encoder.encode(supplied)),
    subtle.digest("SHA-256", encoder.encode(configured)),
  ]);
  const left = new Uint8Array(suppliedDigest);
  const right = new Uint8Array(configuredDigest);
  let difference = (left.length ^ 32) | (right.length ^ 32);
  for (let index = 0; index < 32; index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
}

function resolveLedgerClient(env, options) {
  if (Object.hasOwn(options, "ledgerClient")) return options.ledgerClient;
  const ledgerEnv = Object.hasOwn(options, "dispatchEnv") ? options.dispatchEnv : env;
  try {
    return createAutonomyLedgerClient(ledgerEnv);
  } catch {
    return null;
  }
}

function dispatcherHttpStatus(result) {
  if (result.disposition === "completed" || result.disposition === "duplicate") return { status: 200, ok: true };
  if (result.disposition === "in_progress") return { status: 202, ok: true };
  if (result.disposition === "rejected") return { status: 400, ok: false };
  if (result.disposition === "blocked") return { status: 403, ok: false };
  return { status: result.retriable ? 503 : 500, ok: false };
}

function isNormalizedDispatchResult(value) {
  if (!isPlainObject(value) || !DISPATCH_DISPOSITIONS.has(value.disposition)) return false;
  const requiredKeys = [
    "build", "eventId", "tenantId", "workflowId", "duplicate", "retriable",
    "record", "policyDecision", "workflowResult", "error",
  ];
  if (!requiredKeys.every((key) => Object.hasOwn(value, key))) return false;
  if (typeof value.build !== "string" || !value.build) return false;
  if (typeof value.duplicate !== "boolean" || typeof value.retriable !== "boolean") return false;
  for (const key of ["eventId", "tenantId", "workflowId"]) {
    if (value[key] !== null && typeof value[key] !== "string") return false;
  }
  for (const key of ["record", "policyDecision", "workflowResult", "error"]) {
    if (value[key] !== null && !isPlainObject(value[key])) return false;
  }
  return true;
}

function isJsonSerializable(value) {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

async function readBoundedBody(request, maxBytes) {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    const numericLength = Number(contentLength);
    if (!Number.isFinite(numericLength) || numericLength < 0 || !Number.isInteger(numericLength)) {
      return { ok: false, code: "INVALID_JSON_BODY" };
    }
    if (numericLength > maxBytes) return { ok: false, code: "REQUEST_TOO_LARGE" };
  }

  if (!request.body || typeof request.body.getReader !== "function") {
    let text;
    try {
      text = await request.text();
    } catch {
      return { ok: false, code: "INVALID_JSON_BODY" };
    }
    if (new TextEncoder().encode(text).byteLength > maxBytes) return { ok: false, code: "REQUEST_TOO_LARGE" };
    if (!text) return { ok: false, code: "INVALID_JSON_BODY" };
    return { ok: true, text };
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel("autonomy_request_limit_reached");
        } catch {
          // Best-effort cancellation only.
        }
        return { ok: false, code: "REQUEST_TOO_LARGE" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, code: "INVALID_JSON_BODY" };
  }
  if (totalBytes === 0) return { ok: false, code: "INVALID_JSON_BODY" };

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(combined) };
}

function isJsonContentType(value) {
  return typeof value === "string"
    && value.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function validateIdentifier(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_IDENTIFIER_LENGTH) return null;
  if (/[\u0000-\u001F\u007F]/u.test(normalized)) return null;
  return normalized;
}

function decodeEventId(value) {
  if (typeof value !== "string" || !value) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded.includes("/")) return null;
  return validateIdentifier(decoded);
}

function parseLimit(value) {
  if (value === null || value === "") return DEFAULT_LIST_LIMIT;
  if (!/^\d+$/u.test(value)) return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= MAX_LIST_LIMIT ? numeric : null;
}

function projectWorkflow(workflow) {
  return {
    workflowId: safeScalar(workflow.workflowId),
    version: typeof workflow.version === "number" || typeof workflow.version === "string" ? workflow.version : null,
    status: safeScalar(workflow.status),
    owner: safeScalar(workflow.owner),
    riskClass: safeScalar(workflow.riskClass),
    agents: safeStringArray(workflow.agents),
    environments: safeStringArray(workflow.environments),
    triggers: safeStringArray(workflow.triggers),
    autonomousActions: safeStringArray(workflow.autonomousActions),
    approvalRequiredActions: safeStringArray(workflow.approvalRequiredActions),
    blockedActions: safeStringArray(workflow.blockedActions),
  };
}

function safeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").map((item) => item.slice(0, MAX_IDENTIFIER_LENGTH))
    : [];
}

function safeScalar(value) {
  return typeof value === "string" ? value.slice(0, MAX_IDENTIFIER_LENGTH) : null;
}

function normalizeEnvironment(value) {
  const normalized = validateIdentifier(value);
  return normalized && /^[A-Za-z0-9._-]+$/u.test(normalized)
    ? normalized.slice(0, 64)
    : "production";
}

function ledgerFailureResponse(result) {
  const code = typeof result?.code === "string" ? result.code : "LEDGER_OPERATION_FAILED";
  const message = sanitizeMessage(result?.error || "The autonomy ledger request failed.");
  if (RETRIABLE_LEDGER_CODES.has(code)) return apiError(503, code, message);
  const status = validErrorStatus(result?.statusCode) ? result.statusCode : 500;
  return apiError(status, code, message);
}

function validErrorStatus(value) {
  return Number.isInteger(value) && value >= 400 && value <= 599;
}

function authenticationRequired() {
  return apiError(
    401,
    "AUTONOMY_AUTH_REQUIRED",
    "Valid autonomy API authentication is required.",
    { "WWW-Authenticate": "Bearer" },
  );
}

function methodNotAllowed(allow) {
  return apiError(405, "METHOD_NOT_ALLOWED", "The request method is not allowed for this endpoint.", { Allow: allow });
}

function apiError(status, code, message, headers = {}) {
  const sanitized = sanitizeError({ code, message }, code, message);
  return apiJson({
    ok: false,
    build: KAIROS_AUTONOMY_API_BUILD,
    error: sanitized,
  }, status, headers);
}

function apiJson(value, status = 200, headers = {}) {
  let body;
  try {
    body = JSON.stringify(value);
  } catch {
    body = JSON.stringify({
      ok: false,
      build: KAIROS_AUTONOMY_API_BUILD,
      error: {
        code: "RESPONSE_SERIALIZATION_FAILED",
        message: "The autonomy API response could not be serialized.",
      },
    });
    status = 500;
  }
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Kairos-Autonomy-API-Build": KAIROS_AUTONOMY_API_BUILD,
      ...headers,
    },
  });
}

function sanitizeError(error, fallbackCode, fallbackMessage) {
  const code = typeof error?.code === "string" && error.code.trim()
    ? error.code.trim().slice(0, 128)
    : fallbackCode;
  const sourceMessage = typeof error?.message === "string"
    ? error.message
    : typeof error === "string"
      ? error
      : fallbackMessage;
  return { code, message: sanitizeMessage(sourceMessage || fallbackMessage) };
}

function sanitizeMessage(value) {
  const firstLine = String(value || "An autonomy API operation failed.").split(/[\r\n]/u, 1)[0];
  return firstLine
    .replace(/Bearer\s+[^\s,;]+/giu, "Bearer [REDACTED]")
    .replace(/\b(?:sk|pk|api)[-_][A-Za-z0-9_-]{8,}\b/giu, "[REDACTED]")
    .replace(/\b(?:password|secret|token|api[_-]?key|authorization|cookie)\s*[:=]\s*[^\s,;]+/giu, "$1=[REDACTED]")
    .replace(/https:\/\/[^\s]*\.internal[^\s]*/giu, "[INTERNAL_URL_REDACTED]")
    .slice(0, MAX_ERROR_MESSAGE_LENGTH) || "An autonomy API operation failed.";
}

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(numeric)));
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
