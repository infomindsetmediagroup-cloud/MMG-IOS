import {
  dispatchAutonomyEvent,
  KAIROS_AUTONOMY_DISPATCHER_BUILD,
} from "./kairos-autonomy-dispatcher-v1.js";
import { getWorkflowDefinition } from "./kairos-workflow-registry-v1.js";
import {
  emitAutonomyObservation,
  KAIROS_AUTONOMY_OBSERVABILITY_BUILD,
} from "./kairos-autonomy-observability-v1.js";

export const KAIROS_AUTONOMY_SCHEDULER_BUILD =
  "kairos-autonomy-scheduler-20260802-1";
export const KAIROS_AUTONOMY_HEALTH_CRON = "0 * * * *";
export const KAIROS_AUTONOMY_ACTIVATION_ID = "website-health-v1";

const WORKFLOW_ID = "website.health.v1";
const EVENT_TYPE = "website.health.schedule";
const TENANT_ID = "mmg";
const AUTHORIZED_ENVIRONMENTS = new Set(["development", "staging", "production"]);
const DISPATCH_DISPOSITIONS = new Set([
  "completed",
  "duplicate",
  "in_progress",
  "blocked",
  "rejected",
  "failed",
]);

export async function handleAutonomyScheduledEvent(
  controller,
  env = {},
  ctx = {},
  options = {},
) {
  const cron = typeof controller?.cron === "string" ? controller.cron : null;
  if (cron !== KAIROS_AUTONOMY_HEALTH_CRON) {
    observe("scheduler.ignored", { cron, environment: env.KAIROS_ENVIRONMENT }, options);
    return schedulerResult({ handled: false, status: "ignored", cron });
  }

  const activation = evaluateActivation(env, options);
  if (!activation.ready) {
    observe("activation.blocked", { cron, environment: env.KAIROS_ENVIRONMENT }, options);
    return schedulerResult({
      handled: true,
      status: "blocked",
      cron,
      activation: activation.projection,
      error: {
        code: "AUTONOMY_ACTIVATION_BLOCKED",
        message: "Scheduled autonomy is not fully activated.",
      },
    });
  }

  const scheduledDate = parseScheduledDate(controller?.scheduledTime);
  if (!scheduledDate) {
    observe("scheduler.exception", {
      cron,
      environment: env.KAIROS_ENVIRONMENT,
      code: "INVALID_SCHEDULED_TIME",
    }, options);
    return schedulerResult({
      handled: true,
      status: "failed",
      cron,
      activation: activation.projection,
      error: {
        code: "INVALID_SCHEDULED_TIME",
        message: "The scheduled invocation time is invalid.",
      },
    });
  }

  const compactTimestamp = compactUtcTimestamp(scheduledDate);
  const event = {
    eventId: `evt_website_health_${compactTimestamp}`,
    eventType: EVENT_TYPE,
    source: "cloudflare.cron",
    occurredAt: scheduledDate.toISOString(),
    correlationId: `corr_website_health_${compactTimestamp}`,
    tenantId: TENANT_ID,
    projectId: null,
    workflowId: WORKFLOW_ID,
    riskClass: "low",
    payload: scheduledPayload(env.KAIROS_WEBSITE_HEALTH_TARGET_URL),
    metadata: {
      schedulerBuild: KAIROS_AUTONOMY_SCHEDULER_BUILD,
      dispatcherBuild: KAIROS_AUTONOMY_DISPATCHER_BUILD,
      observabilityBuild: KAIROS_AUTONOMY_OBSERVABILITY_BUILD,
      cron,
    },
  };

  observe("scheduler.invoked", observationInput(event, cron, env), options);

  const dispatcher = Object.hasOwn(options, "dispatcher")
    ? options.dispatcher
    : dispatchAutonomyEvent;
  if (typeof dispatcher !== "function") {
    observe("scheduler.exception", {
      ...observationInput(event, cron, env),
      code: "DISPATCHER_UNAVAILABLE",
    }, options);
    return schedulerResult({
      handled: true,
      status: "failed",
      cron,
      eventId: event.eventId,
      activation: activation.projection,
      error: {
        code: "DISPATCHER_UNAVAILABLE",
        message: "The autonomy dispatcher is unavailable.",
      },
    });
  }

  const dispatchEnv = Object.hasOwn(options, "dispatchEnv") ? options.dispatchEnv : env;
  const dispatchOptions = Object.hasOwn(options, "dispatchOptions") ? options.dispatchOptions : {};
  let result;
  try {
    result = await dispatcher(event, dispatchEnv, ctx, dispatchOptions);
  } catch {
    observe("scheduler.exception", {
      ...observationInput(event, cron, env),
      code: "DISPATCHER_EXCEPTION",
    }, options);
    return schedulerResult({
      handled: true,
      status: "failed",
      cron,
      eventId: event.eventId,
      activation: activation.projection,
      error: {
        code: "DISPATCHER_EXCEPTION",
        message: "The autonomy dispatcher threw an exception.",
      },
    });
  }

  if (!isNormalizedDispatchResult(result) || !isJsonSerializable(result)) {
    observe("scheduler.exception", {
      ...observationInput(event, cron, env),
      code: "MALFORMED_DISPATCH_RESULT",
    }, options);
    return schedulerResult({
      handled: true,
      status: "failed",
      cron,
      eventId: event.eventId,
      activation: activation.projection,
      error: {
        code: "MALFORMED_DISPATCH_RESULT",
        message: "The autonomy dispatcher returned a malformed result.",
      },
    });
  }

  observe(`dispatch.${result.disposition}`, {
    ...observationInput(event, cron, env),
    disposition: result.disposition,
    status: result.record?.status || null,
    retriable: result.retriable,
    duplicate: result.duplicate,
    attempt: result.record?.attempt,
    code: result.error?.code,
  }, options);

  return schedulerResult({
    handled: true,
    status: "dispatched",
    cron,
    eventId: event.eventId,
    activation: activation.projection,
    result,
  });
}

function evaluateActivation(env, options) {
  const scheduledEnabled = env.KAIROS_AUTONOMY_SCHEDULED_ENABLED === "enabled";
  const activationGateMatched = env.KAIROS_AUTONOMY_ACTIVATION_GATE === KAIROS_AUTONOMY_ACTIVATION_ID;
  const killSwitchEnabled = env.KAIROS_KILL_SWITCH === "enabled";
  const ledgerConfigured = Boolean(
    env.KAIROS_AUTONOMY_LEDGER
      && typeof env.KAIROS_AUTONOMY_LEDGER.idFromName === "function"
      && typeof env.KAIROS_AUTONOMY_LEDGER.get === "function",
  );
  const environmentAuthorized = AUTHORIZED_ENVIRONMENTS.has(env.KAIROS_ENVIRONMENT);
  const resolver = Object.hasOwn(options, "workflowResolver")
    ? options.workflowResolver
    : getWorkflowDefinition;
  let workflow = null;
  if (typeof resolver === "function") {
    try {
      workflow = resolver(WORKFLOW_ID);
    } catch {
      workflow = null;
    }
  }
  const workflowAuthorized = Boolean(
    workflow
      && workflow.status === "active"
      && workflow.workflowId === WORKFLOW_ID
      && Array.isArray(workflow.triggers)
      && workflow.triggers.includes(EVENT_TYPE),
  );
  const projection = {
    scheduledEnabled,
    activationGateMatched,
    killSwitchEnabled,
    ledgerConfigured,
    environmentAuthorized,
    workflowAuthorized,
  };
  return {
    projection,
    ready: Object.values(projection).every(Boolean),
  };
}

function scheduledPayload(value) {
  if (typeof value !== "string") return {};
  const targetUrl = value.trim();
  return targetUrl && targetUrl.length <= 2048 ? { targetUrl } : {};
}

function parseScheduledDate(value) {
  if (value instanceof Date) {
    const cloned = new Date(value.getTime());
    return Number.isFinite(cloned.getTime()) ? cloned : null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function compactUtcTimestamp(date) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10).replace(/-/gu, "")}T${iso.slice(11, 19).replace(/:/gu, "")}Z`;
}

function observationInput(event, cron, env) {
  return {
    eventId: event.eventId,
    tenantId: event.tenantId,
    workflowId: event.workflowId,
    eventType: event.eventType,
    cron,
    environment: env.KAIROS_ENVIRONMENT,
  };
}

function observe(type, input, options) {
  return emitAutonomyObservation(type, input, { logger: options.logger });
}

function schedulerResult({
  handled,
  status,
  cron,
  eventId = null,
  activation,
  result = null,
  error = null,
}) {
  const value = {
    build: KAIROS_AUTONOMY_SCHEDULER_BUILD,
    handled,
    status,
    cron,
    eventId,
  };
  if (activation !== undefined) value.activation = activation;
  value.result = result;
  value.error = error;
  return value;
}

function isNormalizedDispatchResult(value) {
  if (!isPlainObject(value) || !DISPATCH_DISPOSITIONS.has(value.disposition)) return false;
  const required = [
    "build",
    "eventId",
    "tenantId",
    "workflowId",
    "duplicate",
    "retriable",
    "record",
    "policyDecision",
    "workflowResult",
    "error",
  ];
  if (!required.every((key) => Object.hasOwn(value, key))) return false;
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

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
