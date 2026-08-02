import {
  handleAutonomyApiRequest as handleAutonomyApiV1Request,
} from "./kairos-autonomy-api-v1.js";
import {
  createAutonomyLedgerClient,
  KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD,
} from "./kairos-autonomy-ledger-client-v1.js";
import { KAIROS_AUTONOMY_DISPATCHER_BUILD } from "./kairos-autonomy-dispatcher-v1.js";
import {
  summarizeAutonomyRecords,
  KAIROS_AUTONOMY_OBSERVABILITY_BUILD,
} from "./kairos-autonomy-observability-v1.js";
import {
  KAIROS_AUTONOMY_SCHEDULER_BUILD,
  KAIROS_AUTONOMY_HEALTH_CRON,
  KAIROS_AUTONOMY_ACTIVATION_ID,
} from "./kairos-autonomy-scheduler-v1.js";

export const KAIROS_AUTONOMY_API_BUILD = "kairos-autonomy-api-20260802-2";

const AUTONOMY_ROOT = "/api/autonomy";
const STATUS_PATH = `${AUTONOMY_ROOT}/status`;
const OBSERVABILITY_PATH = `${AUTONOMY_ROOT}/observability`;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const AUTHORIZED_ENVIRONMENTS = new Set(["development", "staging", "production"]);

export async function handleAutonomyApiRequest(request, env = {}, ctx = {}, options = {}) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }

  if (url.pathname === STATUS_PATH) {
    return handleStatusRequest(request, env, ctx, options);
  }
  if (url.pathname === OBSERVABILITY_PATH) {
    return handleObservabilityRequest(request, url, env, ctx, options);
  }

  const response = await handleAutonomyApiV1Request(request, env, ctx, options);
  return response ? upgradeResponse(response) : null;
}

async function handleStatusRequest(request, env, ctx, options) {
  const response = await handleAutonomyApiV1Request(request, env, ctx, options);
  if (!response || response.status !== 200) return response ? upgradeResponse(response) : null;

  let body;
  try {
    body = await response.json();
  } catch {
    return apiError(500, "STATUS_RESPONSE_INVALID", "The autonomy status response is invalid.");
  }

  const ledgerConfigured = configuredLedger(env.KAIROS_AUTONOMY_LEDGER);
  const scheduledEnabled = env.KAIROS_AUTONOMY_SCHEDULED_ENABLED === "enabled";
  const activationGateMatched = env.KAIROS_AUTONOMY_ACTIVATION_GATE === KAIROS_AUTONOMY_ACTIVATION_ID;
  const killSwitchEnabled = env.KAIROS_KILL_SWITCH === "enabled";
  const environmentAuthorized = AUTHORIZED_ENVIRONMENTS.has(env.KAIROS_ENVIRONMENT);
  const authenticationConfigured = configuredSecret(env.KAIROS_AUTONOMY_API_TOKEN);

  return apiJson({
    ...body,
    build: KAIROS_AUTONOMY_API_BUILD,
    ledgerConfigured,
    builds: {
      ...(isPlainObject(body.builds) ? body.builds : {}),
      api: KAIROS_AUTONOMY_API_BUILD,
      dispatcher: KAIROS_AUTONOMY_DISPATCHER_BUILD,
      ledgerClient: KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD,
      observability: KAIROS_AUTONOMY_OBSERVABILITY_BUILD,
      scheduler: KAIROS_AUTONOMY_SCHEDULER_BUILD,
    },
    scheduledAutonomy: {
      cron: KAIROS_AUTONOMY_HEALTH_CRON,
      scheduledEnabled,
      activationGateMatched,
      killSwitchEnabled,
      ledgerConfigured,
      environmentAuthorized,
      ready: Boolean(
        authenticationConfigured
          && scheduledEnabled
          && activationGateMatched
          && killSwitchEnabled
          && ledgerConfigured
          && environmentAuthorized,
      ),
    },
  });
}

async function handleObservabilityRequest(request, url, env, ctx, options) {
  const authentication = await authenticateThroughV1(request, env, ctx, options);
  if (authentication.status !== 200) return upgradeResponse(authentication);
  if (request.method !== "GET") return methodNotAllowed("GET");

  const tenantId = validateTenantId(url.searchParams.get("tenantId"));
  if (!tenantId) {
    return apiError(400, "INVALID_TENANT_ID", "A valid tenantId query parameter is required.");
  }
  const limit = parseLimit(url.searchParams.get("limit"));
  if (limit === null) {
    return apiError(400, "INVALID_LIMIT", "limit must be an integer between 1 and 100.");
  }

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

  const summaryOptions = { limit };
  if (Object.hasOwn(options, "observabilityNow")) summaryOptions.now = options.observabilityNow;
  const observability = summarizeAutonomyRecords(ledgerResult.records, summaryOptions);
  if (!observability?.ok) {
    return apiError(
      500,
      observability?.error?.code || "OBSERVABILITY_SUMMARY_FAILED",
      "The autonomy observability summary could not be produced.",
    );
  }

  return apiJson({
    ok: true,
    build: KAIROS_AUTONOMY_API_BUILD,
    tenantId,
    observability,
  });
}

async function authenticateThroughV1(request, env, ctx, options) {
  const url = new URL(request.url);
  url.pathname = STATUS_PATH;
  url.search = "";
  const probe = new Request(url.toString(), {
    method: "GET",
    headers: request.headers,
  });
  return handleAutonomyApiV1Request(probe, env, ctx, options);
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

function configuredLedger(binding) {
  return Boolean(
    binding
      && typeof binding.idFromName === "function"
      && typeof binding.get === "function",
  );
}

function configuredSecret(value) {
  return typeof value === "string"
    && value.length >= 32
    && value.length <= 512
    && value === value.trim()
    && !/[\s\u0000-\u001F\u007F]/u.test(value);
}

function validateTenantId(value) {
  if (typeof value !== "string" || !value || value.length > 256) return null;
  if (value !== value.trim() || /[\s\u0000-\u001F\u007F]/u.test(value)) return null;
  return value;
}

function parseLimit(value) {
  if (value === null || value === "") return DEFAULT_LIST_LIMIT;
  if (!/^\d+$/u.test(value)) return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= MAX_LIST_LIMIT ? numeric : null;
}

function ledgerFailureResponse(result) {
  const code = typeof result?.code === "string" && result.code.trim()
    ? result.code.trim().slice(0, 128)
    : "LEDGER_OPERATION_FAILED";
  return apiError(503, code, "The autonomy ledger request failed.");
}

function methodNotAllowed(allow) {
  return apiError(
    405,
    "METHOD_NOT_ALLOWED",
    "The request method is not allowed for this endpoint.",
    { Allow: allow },
  );
}

async function upgradeResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Autonomy-API-Build", KAIROS_AUTONOMY_API_BUILD);
  const contentType = headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  let body;
  try {
    body = await response.json();
    if (isPlainObject(body)) body.build = KAIROS_AUTONOMY_API_BUILD;
  } catch {
    return apiError(500, "RESPONSE_UPGRADE_FAILED", "The autonomy API response could not be upgraded.");
  }
  return apiJson(body, response.status, Object.fromEntries(headers.entries()));
}

function apiError(status, code, message, headers = {}) {
  return apiJson({
    ok: false,
    build: KAIROS_AUTONOMY_API_BUILD,
    error: { code, message },
  }, status, headers);
}

function apiJson(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
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

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
