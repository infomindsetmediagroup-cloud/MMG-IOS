import {
  runAutonomousOperationsCycle,
  KAIROS_AUTONOMOUS_OPERATIONS_ACTIVATION_ID,
  KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD,
} from "./kairos-autonomous-operations-cycle-v1.js";
import {
  emitAutonomyObservation,
  KAIROS_AUTONOMY_OBSERVABILITY_BUILD,
} from "./kairos-autonomy-observability-v1.js";

export const KAIROS_AUTONOMY_SCHEDULER_BUILD =
  "kairos-autonomy-scheduler-20260802-2-complete-operations";
export const KAIROS_AUTONOMY_HEALTH_CRON = "0 * * * *";
export const KAIROS_AUTONOMY_ACTIVATION_ID =
  KAIROS_AUTONOMOUS_OPERATIONS_ACTIVATION_ID;

export async function handleAutonomyScheduledEvent(
  controller,
  env = {},
  ctx = {},
  options = {},
) {
  const cron = typeof controller?.cron === "string" ? controller.cron : null;
  if (cron !== KAIROS_AUTONOMY_HEALTH_CRON) {
    observe("scheduler.ignored", { cron, environment: safeString(env.KAIROS_ENVIRONMENT) }, options);
    return schedulerResult({ handled: false, status: "ignored", cron });
  }

  const scheduledAt = parseScheduledDate(controller?.scheduledTime);
  if (!scheduledAt) {
    observe("scheduler.exception", {
      cron,
      environment: safeString(env.KAIROS_ENVIRONMENT),
      code: "INVALID_SCHEDULED_TIME",
    }, options);
    return schedulerResult({
      handled: true,
      status: "failed",
      cron,
      error: {
        code: "INVALID_SCHEDULED_TIME",
        message: "The scheduled invocation time is invalid.",
      },
    });
  }

  observe("scheduler.invoked", {
    cron,
    scheduledAt: scheduledAt.toISOString(),
    environment: safeString(env.KAIROS_ENVIRONMENT),
    cycleBuild: KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD,
    observabilityBuild: KAIROS_AUTONOMY_OBSERVABILITY_BUILD,
  }, options);

  const cycleRunner = readOption(options, "cycleRunner") || runAutonomousOperationsCycle;
  if (typeof cycleRunner !== "function") {
    return schedulerResult({
      handled: true,
      status: "failed",
      cron,
      error: {
        code: "OPERATIONS_CYCLE_UNAVAILABLE",
        message: "The autonomous operations cycle is unavailable.",
      },
    });
  }

  let cycle;
  try {
    cycle = await cycleRunner(
      { mode: "scheduled", tenantId: "mmg" },
      env,
      ctx,
      buildCycleOptions(options, scheduledAt),
    );
  } catch {
    cycle = null;
  }

  if (!cycle || typeof cycle.ok !== "boolean") {
    observe("scheduler.exception", {
      cron,
      scheduledAt: scheduledAt.toISOString(),
      environment: safeString(env.KAIROS_ENVIRONMENT),
      code: "MALFORMED_OPERATIONS_CYCLE_RESULT",
    }, options);
    return schedulerResult({
      handled: true,
      status: "failed",
      cron,
      error: {
        code: "MALFORMED_OPERATIONS_CYCLE_RESULT",
        message: "The autonomous operations cycle returned an invalid result.",
      },
    });
  }

  observe(cycle.ok ? "operations.completed" : "operations.failed", {
    cron,
    scheduledAt: scheduledAt.toISOString(),
    environment: safeString(env.KAIROS_ENVIRONMENT),
    snapshotId: cycle.snapshotId,
    planId: cycle.plan?.planId,
    taskCount: cycle.plan?.taskCount,
    completedCount: cycle.orchestration?.counts?.completed,
    blockedCount: cycle.orchestration?.counts?.blocked,
    failedCount: cycle.orchestration?.counts?.failed,
    code: cycle.error?.code,
  }, options);

  return schedulerResult({
    handled: true,
    status: cycle.ok ? "completed" : cycle.status === "failed" ? "blocked" : "completed_with_failures",
    cron,
    snapshotId: cycle.snapshotId || null,
    planId: cycle.plan?.planId || null,
    cycle,
    activation: cycle.activation,
    error: cycle.ok ? null : cycle.error,
  });
}

function buildCycleOptions(options, scheduledAt) {
  const output = { now: new Date(scheduledAt.getTime()) };
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

function parseScheduledDate(value) {
  if (value instanceof Date) {
    const clone = new Date(value.getTime());
    return Number.isFinite(clone.getTime()) ? clone : null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function schedulerResult({
  handled,
  status,
  cron,
  snapshotId = null,
  planId = null,
  cycle = null,
  activation,
  error = null,
}) {
  const value = {
    build: KAIROS_AUTONOMY_SCHEDULER_BUILD,
    handled,
    status,
    cron,
    snapshotId,
    planId,
    cycle,
    error,
  };
  if (activation !== undefined) value.activation = activation;
  return deepFreeze(value);
}

function observe(type, input, options) {
  try {
    return emitAutonomyObservation(type, input, { logger: readOption(options, "logger") });
  } catch {
    return null;
  }
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

function safeString(value) {
  return typeof value === "string" && value.length <= 256 ? value : null;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
