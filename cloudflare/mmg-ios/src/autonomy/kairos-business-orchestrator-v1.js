/**
 * ============================================================================
 * KAIROS AUTONOMOUS BUSINESS OPERATIONS
 * GOVERNED BUSINESS ORCHESTRATOR V1
 * Organization: Mindset Media Group / The Legacy, LLC
 * ============================================================================
 */

import { evaluatePolicy } from "./kairos-policy-engine-v1.js";
import { createAutonomyLedgerClient } from "./kairos-autonomy-ledger-client-v1.js";
import { executeWebsiteHealthWorkflow } from "./website-health-workflow-v1.js";
import { collectBusinessState } from "./kairos-business-collector-v1.js";
import { KAIROS_BUSINESS_PRIORITIZER_BUILD } from "./kairos-business-prioritizer-v1.js";

export const KAIROS_BUSINESS_ORCHESTRATOR_BUILD =
  "kairos-business-orchestrator-20260802-1";
export const KAIROS_BUSINESS_ORCHESTRATOR_SCHEMA_VERSION = 1;

const WORKFLOW_ID = "business.operations.v1";
const AGENT_ID = "business-operations-agent.v1";
const DEFAULT_TASK_TIMEOUT_MS = 15_000;
const MIN_TASK_TIMEOUT_MS = 100;
const MAX_TASK_TIMEOUT_MS = 30_000;
const DEFAULT_LEASE_DURATION_MS = 45_000;
const MAX_LEASE_DURATION_MS = 15 * 60_000;
const TERMINAL_STATUSES = new Set(["completed", "blocked"]);
const ALLOWED_PLAN_STATUS = new Set(["steady", "ready", "approval_required"]);
const ALLOWED_ACTIONS = new Set([
  "collector.refresh",
  "website.reinspect",
  "incident.record",
  "repair.propose",
  "executive.review.request",
]);

export async function orchestrateBusinessOperations(plan, businessState, env = {}, ctx = {}, options = {}) {
  void ctx;
  try {
    const validation = validateInputs(plan, businessState);
    if (!validation.ok) return failure(validation.code, validation.message);

    const ledgerClient = resolveLedgerClient(env, options);
    if (!isLedgerClient(ledgerClient)) {
      return failure("LEDGER_UNAVAILABLE", "The autonomy ledger client is unavailable.", true);
    }

    if (plan.tasks.length === 0) {
      return success(plan, [], {
        completed: 0,
        blocked: 0,
        failed: 0,
        duplicate: 0,
        inProgress: 0,
      });
    }

    const outcomes = [];
    for (const task of plan.tasks) {
      outcomes.push(await executeTask({
        task,
        plan,
        businessState,
        env,
        options,
        ledgerClient,
      }));
    }

    const counts = {
      completed: outcomes.filter((outcome) => outcome.disposition === "completed").length,
      blocked: outcomes.filter((outcome) => outcome.disposition === "blocked").length,
      failed: outcomes.filter((outcome) => outcome.disposition === "failed").length,
      duplicate: outcomes.filter((outcome) => outcome.duplicate === true).length,
      inProgress: outcomes.filter((outcome) => outcome.disposition === "in_progress").length,
    };

    return success(plan, outcomes, counts);
  } catch {
    return failure("ORCHESTRATION_FAILED", "The autonomous operations plan could not be orchestrated.");
  }
}

async function executeTask({ task, plan, businessState, env, options, ledgerClient }) {
  const event = createTaskEvent(task, plan);
  let reservation;
  try {
    reservation = await ledgerClient.reserveEvent(event);
  } catch {
    return taskFailure(task, "LEDGER_UNAVAILABLE", "The operation could not be reserved.", true);
  }
  if (!reservation?.ok || !isRecord(reservation.record)) {
    return taskFailure(
      task,
      reservation?.code || "RESERVATION_FAILED",
      "The operation could not be reserved.",
      true,
    );
  }

  const existing = reservation.record;
  if (TERMINAL_STATUSES.has(existing.status)) {
    return deepFreeze({
      taskId: task.taskId,
      action: task.action,
      disposition: existing.status === "completed" ? "completed" : "blocked",
      duplicate: true,
      retriable: false,
      recordStatus: existing.status,
      error: null,
    });
  }
  if (existing.status === "running" && hasActiveLease(existing)) {
    return deepFreeze({
      taskId: task.taskId,
      action: task.action,
      disposition: "in_progress",
      duplicate: true,
      retriable: true,
      recordStatus: existing.status,
      error: null,
    });
  }

  const policyEvaluator = readOption(options, "policyEvaluator") || evaluatePolicy;
  let policyDecision;
  try {
    policyDecision = policyEvaluator({
      agent: AGENT_ID,
      workflowId: WORKFLOW_ID,
      action: task.action,
      riskClass: task.riskClass,
      environment: normalizedEnvironment(env.KAIROS_ENVIRONMENT),
      globalKillSwitch: env.KAIROS_KILL_SWITCH,
    });
  } catch {
    policyDecision = {
      decision: "DENY",
      policyId: WORKFLOW_ID,
      policyVersion: 1,
      reasonCode: "POLICY_EVALUATION_ERROR",
      explanation: "Policy evaluation failed closed.",
    };
  }

  if (policyDecision?.decision !== "ALLOW_AUTONOMOUS") {
    let blocked;
    try {
      blocked = await ledgerClient.markBlocked({
        tenantId: plan.tenantId,
        eventId: event.eventId,
        leaseToken: null,
        policyDecision: safePolicyDecision(policyDecision),
      });
    } catch {
      blocked = null;
    }
    if (!blocked?.ok) {
      return taskFailure(task, "BLOCK_WRITE_FAILED", "The policy block could not be recorded.", true);
    }
    return deepFreeze({
      taskId: task.taskId,
      action: task.action,
      disposition: "blocked",
      duplicate: false,
      retriable: false,
      recordStatus: blocked.record?.status || "blocked",
      policyDecision: safePolicyDecision(policyDecision),
      error: null,
    });
  }

  const timeoutMs = boundedInteger(
    readOption(options, "taskTimeoutMs"),
    DEFAULT_TASK_TIMEOUT_MS,
    MIN_TASK_TIMEOUT_MS,
    MAX_TASK_TIMEOUT_MS,
  );
  const leaseDurationMs = Math.min(
    MAX_LEASE_DURATION_MS,
    Math.max(DEFAULT_LEASE_DURATION_MS, timeoutMs + 1_000),
  );

  let lease;
  try {
    lease = await ledgerClient.acquireLease({
      tenantId: plan.tenantId,
      eventId: event.eventId,
      leaseDurationMs,
    });
  } catch {
    lease = null;
  }
  if (!lease?.ok) {
    if (lease?.code === "ACTIVE_LEASE_EXISTS") {
      return deepFreeze({
        taskId: task.taskId,
        action: task.action,
        disposition: "in_progress",
        duplicate: true,
        retriable: true,
        recordStatus: lease.record?.status || "running",
        error: null,
      });
    }
    return taskFailure(task, "LEASE_ACQUISITION_FAILED", "The operation lease could not be acquired.", true);
  }

  const leaseToken = typeof lease.leaseToken === "string" && lease.leaseToken
    ? lease.leaseToken
    : typeof lease.record?.leaseToken === "string"
      ? lease.record.leaseToken
      : null;
  if (!leaseToken) {
    return taskFailure(task, "LEASE_TOKEN_MISSING", "The operation lease token is missing.", false);
  }

  const execution = await withDeadline(
    () => executeCertifiedAction(task, businessState, env, options),
    timeoutMs,
  );

  if (!execution.ok) {
    let failedWrite;
    try {
      failedWrite = await ledgerClient.markFailed({
        tenantId: plan.tenantId,
        eventId: event.eventId,
        leaseToken,
        error: {
          code: execution.code,
          message: execution.message,
          retriable: execution.retriable,
        },
      });
    } catch {
      failedWrite = null;
    }
    return deepFreeze({
      taskId: task.taskId,
      action: task.action,
      disposition: "failed",
      duplicate: false,
      retriable: execution.retriable,
      recordStatus: failedWrite?.record?.status || "failed",
      error: { code: execution.code, message: execution.message },
    });
  }

  let completion;
  try {
    completion = await ledgerClient.markCompleted({
      tenantId: plan.tenantId,
      eventId: event.eventId,
      leaseToken,
      result: execution.result,
    });
  } catch {
    completion = null;
  }
  if (!completion?.ok) {
    return taskFailure(task, "COMPLETION_WRITE_FAILED", "The operation result could not be recorded.", true);
  }

  return deepFreeze({
    taskId: task.taskId,
    action: task.action,
    disposition: "completed",
    duplicate: false,
    retriable: false,
    recordStatus: completion.record?.status || "completed",
    result: execution.result,
    error: null,
  });
}

async function executeCertifiedAction(task, businessState, env, options) {
  if (task.action === "incident.record") {
    return actionSuccess({
      status: "recorded",
      action: task.action,
      incident: {
        incidentId: `incident_${task.taskId.slice(5)}`,
        domain: task.domain,
        snapshotId: businessState.snapshot.snapshotId,
        overallStatus: businessState.snapshot.health.overallStatus,
        highestSeverity: businessState.snapshot.health.highestSeverity,
      },
      externalMutation: false,
    });
  }

  if (task.action === "repair.propose") {
    return actionSuccess({
      status: "proposed",
      action: task.action,
      proposal: {
        proposalId: `proposal_${task.taskId.slice(5)}`,
        domain: task.domain,
        reasonCode: task.reasonCode,
        executionAuthorized: false,
        requiresApproval: true,
      },
      externalMutation: false,
    });
  }

  if (task.action === "website.reinspect") {
    const executor = readOption(options, "websiteHealthExecutor") || executeWebsiteHealthWorkflow;
    if (typeof executor !== "function") {
      return actionFailure("WEBSITE_EXECUTOR_UNAVAILABLE", "The website inspection executor is unavailable.", true);
    }
    let result;
    try {
      result = await executor({}, env, buildWebsiteOptions(options));
    } catch {
      return actionFailure("WEBSITE_REINSPECTION_FAILED", "The website reinspection failed.", true);
    }
    if (!isPlainDataObject(result) || typeof result.status !== "string") {
      return actionFailure("INVALID_WEBSITE_RESULT", "The website reinspection returned an invalid result.", false);
    }
    return actionSuccess({
      status: result.status,
      action: task.action,
      workflowBuild: safeString(result.build, 256),
      incidentDetected: result.status !== "passed",
      proposalAvailable: Boolean(result.repairProposal),
      externalMutation: false,
    });
  }

  if (task.action === "collector.refresh") {
    const collector = readOption(options, "businessCollector") || collectBusinessState;
    if (typeof collector !== "function") {
      return actionFailure("COLLECTOR_UNAVAILABLE", "The business collector is unavailable.", true);
    }
    let result;
    try {
      result = await collector(
        { tenantId: businessState.tenantId, collectors: ["website.health.v1"] },
        env,
        buildCollectorOptions(options),
      );
    } catch {
      return actionFailure("COLLECTOR_REFRESH_FAILED", "The business collector refresh failed.", true);
    }
    if (!isPlainDataObject(result) || result.ok !== true || !isPlainDataObject(result.snapshot)) {
      return actionFailure("INVALID_COLLECTOR_RESULT", "The collector refresh returned an invalid result.", false);
    }
    return actionSuccess({
      status: "refreshed",
      action: task.action,
      snapshotId: result.snapshot.snapshotId,
      generatedAt: result.generatedAt,
      collectedCount: result.collectedCount,
      blockedCount: result.blockedCount,
      failedCount: result.failedCount,
      externalMutation: false,
    });
  }

  return actionFailure("ACTION_NOT_CERTIFIED", "The operation action is not certified for autonomous execution.", false);
}

function createTaskEvent(task, plan) {
  return {
    eventId: `evt_${task.taskId}`,
    eventType: plan.status === "steady" ? "business.operations.manual" : "business.operations.schedule",
    source: "kairos.business.prioritizer",
    occurredAt: plan.generatedAt,
    correlationId: plan.planId,
    tenantId: plan.tenantId,
    projectId: null,
    workflowId: WORKFLOW_ID,
    riskClass: task.riskClass,
    payload: {
      taskId: task.taskId,
      action: task.action,
      domain: task.domain,
      priority: task.priority,
      reasonCode: task.reasonCode,
      snapshotId: plan.snapshotId,
    },
    metadata: {
      prioritizerBuild: KAIROS_BUSINESS_PRIORITIZER_BUILD,
      orchestratorBuild: KAIROS_BUSINESS_ORCHESTRATOR_BUILD,
      executionMode: task.executionMode,
    },
  };
}

function validateInputs(plan, businessState) {
  if (!isPlainDataObject(plan) || plan.ok !== true) {
    return invalid("INVALID_PLAN", "The priority plan is invalid.");
  }
  if (plan.build !== KAIROS_BUSINESS_PRIORITIZER_BUILD || !ALLOWED_PLAN_STATUS.has(plan.status)) {
    return invalid("INCOMPATIBLE_PLAN", "The priority plan is incompatible.");
  }
  if (!isIdentifier(plan.planId) || !isIdentifier(plan.tenantId) || !isIdentifier(plan.snapshotId)) {
    return invalid("INVALID_PLAN_IDENTITY", "The priority plan identity is invalid.");
  }
  if (!Array.isArray(plan.tasks) || plan.tasks.length > 8 || !plan.tasks.every(isValidTask)) {
    return invalid("INVALID_PLAN_TASKS", "The priority plan tasks are invalid.");
  }
  if (!isPlainDataObject(businessState) || businessState.ok !== true || !isPlainDataObject(businessState.snapshot)) {
    return invalid("INVALID_BUSINESS_STATE", "The business state is invalid.");
  }
  if (
    businessState.tenantId !== plan.tenantId
    || businessState.snapshot.snapshotId !== plan.snapshotId
  ) {
    return invalid("PLAN_SNAPSHOT_MISMATCH", "The plan does not match the business-state snapshot.");
  }
  return { ok: true };
}

function isValidTask(task) {
  return isPlainDataObject(task)
    && isIdentifier(task.taskId)
    && ALLOWED_ACTIONS.has(task.action)
    && isIdentifier(task.domain, 64)
    && Number.isInteger(task.priority)
    && task.priority >= 0
    && task.priority <= 100
    && ["low", "medium"].includes(task.riskClass)
    && ["autonomous", "approval"].includes(task.executionMode)
    && isIdentifier(task.reasonCode.toLowerCase().replace(/_/gu, "."), 160);
}

function resolveLedgerClient(env, options) {
  const injected = readOption(options, "ledgerClient");
  if (injected) return injected;
  try {
    return createAutonomyLedgerClient(env);
  } catch {
    return null;
  }
}

function isLedgerClient(value) {
  return value
    && ["reserveEvent", "acquireLease", "markCompleted", "markFailed", "markBlocked"]
      .every((method) => typeof value[method] === "function");
}

function isRecord(value) {
  return isPlainDataObject(value) && typeof value.status === "string";
}

function hasActiveLease(record) {
  if (typeof record.leaseExpiresAt !== "string") return true;
  const expires = Date.parse(record.leaseExpiresAt);
  return Number.isFinite(expires) && expires > Date.now();
}

function safePolicyDecision(value) {
  return {
    decision: safeString(value?.decision, 64) || "DENY",
    policyId: safeString(value?.policyId, 256) || WORKFLOW_ID,
    policyVersion: Number.isInteger(value?.policyVersion) ? value.policyVersion : 1,
    reasonCode: safeString(value?.reasonCode, 160) || "DEFAULT_FAIL_CLOSED",
    explanation: safeString(value?.explanation, 500) || "The action is not authorized for autonomous execution.",
  };
}

function buildWebsiteOptions(options) {
  const output = {};
  const fetchImpl = readOption(options, "fetchImpl");
  if (typeof fetchImpl === "function") output.fetchImpl = fetchImpl;
  const timeoutMs = readOption(options, "websiteHealthTimeoutMs");
  if (Number.isInteger(timeoutMs)) output.timeoutMs = timeoutMs;
  const maxBodyBytes = readOption(options, "websiteHealthMaxBodyBytes");
  if (Number.isInteger(maxBodyBytes)) output.maxBodyBytes = maxBodyBytes;
  return output;
}

function buildCollectorOptions(options) {
  const output = {};
  const fetchImpl = readOption(options, "fetchImpl");
  if (typeof fetchImpl === "function") output.fetchImpl = fetchImpl;
  const websiteHealthExecutor = readOption(options, "websiteHealthExecutor");
  if (typeof websiteHealthExecutor === "function") output.websiteHealthExecutor = websiteHealthExecutor;
  return output;
}

async function withDeadline(operation, timeoutMs) {
  let timer = null;
  const observed = Promise.resolve()
    .then(operation)
    .then(
      (result) => ({ type: "result", result }),
      () => ({ type: "error" }),
    );
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ type: "timeout" }), timeoutMs);
  });
  const settled = await Promise.race([observed, deadline]);
  if (timer) clearTimeout(timer);
  if (settled.type === "timeout") {
    return actionFailure("TASK_TIMEOUT", "The autonomous operation exceeded its deadline.", true);
  }
  if (settled.type === "error") {
    return actionFailure("TASK_EXECUTION_FAILED", "The autonomous operation failed.", true);
  }
  return settled.result?.ok === true
    ? settled.result
    : actionFailure(
      settled.result?.code || "TASK_EXECUTION_FAILED",
      settled.result?.message || "The autonomous operation failed.",
      settled.result?.retriable === true,
    );
}

function success(plan, outcomes, counts) {
  return deepFreeze({
    ok: counts.failed === 0,
    build: KAIROS_BUSINESS_ORCHESTRATOR_BUILD,
    schemaVersion: KAIROS_BUSINESS_ORCHESTRATOR_SCHEMA_VERSION,
    planId: plan.planId,
    tenantId: plan.tenantId,
    snapshotId: plan.snapshotId,
    status: counts.failed > 0
      ? "completed_with_failures"
      : counts.blocked > 0
        ? "completed_with_approvals"
        : "completed",
    taskCount: outcomes.length,
    counts,
    outcomes,
    error: counts.failed > 0
      ? { code: "TASK_FAILURES_PRESENT", message: "One or more autonomous tasks failed." }
      : null,
  });
}

function taskFailure(task, code, message, retriable) {
  return deepFreeze({
    taskId: task.taskId,
    action: task.action,
    disposition: "failed",
    duplicate: false,
    retriable,
    recordStatus: null,
    error: { code, message },
  });
}

function actionSuccess(result) {
  return { ok: true, result: deepFreeze(result) };
}

function actionFailure(code, message, retriable) {
  return { ok: false, code, message, retriable };
}

function normalizedEnvironment(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "production";
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

function boundedInteger(value, fallback, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function safeString(value, maximum) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum ? value : null;
}

function isIdentifier(value, maximum = 256) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && /^[a-z0-9][a-z0-9._:-]*$/u.test(value);
}

function isPlainDataObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  let prototype;
  let keys;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (prototype !== Object.prototype && prototype !== null) return false;
  return keys.every((key) => {
    if (typeof key !== "string") return false;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return Boolean(descriptor && Object.hasOwn(descriptor, "value") && descriptor.enumerable === true);
    } catch {
      return false;
    }
  });
}

function invalid(code, message) {
  return { ok: false, code, message };
}

function failure(code, message, retriable = false) {
  return deepFreeze({
    ok: false,
    build: KAIROS_BUSINESS_ORCHESTRATOR_BUILD,
    schemaVersion: KAIROS_BUSINESS_ORCHESTRATOR_SCHEMA_VERSION,
    status: "failed",
    planId: null,
    tenantId: null,
    snapshotId: null,
    taskCount: 0,
    counts: { completed: 0, blocked: 0, failed: 0, duplicate: 0, inProgress: 0 },
    outcomes: [],
    error: { code, message, retriable },
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
