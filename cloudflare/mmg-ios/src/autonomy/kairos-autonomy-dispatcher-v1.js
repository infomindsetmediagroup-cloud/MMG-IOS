import { validateEventEnvelope } from "./kairos-event-v1.js";
import { getWorkflowDefinition } from "./kairos-workflow-registry-v1.js";
import { evaluatePolicy } from "./kairos-policy-engine-v1.js";
import { executeWebsiteHealthWorkflow } from "./website-health-workflow-v1.js";
import { createAutonomyLedgerClient } from "./kairos-autonomy-ledger-client-v1.js";

export const KAIROS_AUTONOMY_DISPATCHER_BUILD = "kairos-autonomy-dispatcher-20260802-1";

const WORKFLOW_ID = "website.health.v1";
const AGENT_ID = "website-operations-agent.v1";
const POLICY_ACTION = "website.inspect";
const DEFAULT_EXECUTION_TIMEOUT_MS = 12_000;
const MIN_EXECUTION_TIMEOUT_MS = 100;
const MAX_EXECUTION_TIMEOUT_MS = 30_000;
const DEFAULT_LEASE_DURATION_MS = 30_000;
const MIN_LEASE_DURATION_MS = 1_000;
const MAX_LEASE_DURATION_MS = 15 * 60_000;
const LEASE_SAFETY_MARGIN_MS = 1_000;
const MAX_ERROR_MESSAGE_LENGTH = 1_000;

const AUTHORIZED_EVENT_MAP = Object.freeze({
  "website.health.schedule": Object.freeze({
    workflowId: WORKFLOW_ID,
    agent: AGENT_ID,
    action: POLICY_ACTION,
  }),
  "website.health.manual": Object.freeze({
    workflowId: WORKFLOW_ID,
    agent: AGENT_ID,
    action: POLICY_ACTION,
  }),
});

const RETRIABLE_LEDGER_CODES = new Set([
  "LEDGER_UNAVAILABLE",
  "LEDGER_OPERATION_FAILED",
  "LEDGER_INVALID_RESPONSE",
]);

export async function dispatchAutonomyEvent(rawEvent, env = {}, ctx = {}, options = {}) {
  void ctx;

  let validation;
  try {
    validation = validateEventEnvelope(rawEvent, {
      now: options.now,
      randomUUID: options.randomUUID,
    });
  } catch {
    return result({
      disposition: "rejected",
      eventId: safeIdentifier(rawEvent?.eventId),
      tenantId: safeIdentifier(rawEvent?.tenantId),
      workflowId: safeIdentifier(rawEvent?.workflowId),
      error: safeError("EVENT_VALIDATION_FAILED", "The event envelope could not be validated."),
    });
  }

  if (!validation?.valid) {
    return result({
      disposition: "rejected",
      eventId: safeIdentifier(rawEvent?.eventId),
      tenantId: safeIdentifier(rawEvent?.tenantId),
      workflowId: safeIdentifier(rawEvent?.workflowId),
      error: safeError(
        validation?.code || "INVALID_EVENT_ENVELOPE",
        validation?.error || "The event envelope is invalid.",
      ),
    });
  }

  const validatedEvent = validation.event;
  const mapping = AUTHORIZED_EVENT_MAP[validatedEvent.eventType];
  if (!mapping) {
    return rejected(validatedEvent, "UNKNOWN_EVENT_TYPE", "The event type is not authorized for autonomous dispatch.");
  }

  if (validatedEvent.workflowId && validatedEvent.workflowId !== mapping.workflowId) {
    return rejected(validatedEvent, "WORKFLOW_EVENT_MISMATCH", "The supplied workflow does not match the authorized event mapping.");
  }

  const normalizedEvent = {
    ...validatedEvent,
    workflowId: mapping.workflowId,
  };
  const environment = typeof env.KAIROS_ENVIRONMENT === "string" && env.KAIROS_ENVIRONMENT.trim()
    ? env.KAIROS_ENVIRONMENT.trim()
    : "production";

  const workflowResolver = options.workflowResolver || getWorkflowDefinition;
  if (typeof workflowResolver !== "function") {
    return rejected(normalizedEvent, "WORKFLOW_NOT_REGISTERED", "The workflow registry is unavailable.");
  }

  let workflow;
  try {
    workflow = workflowResolver(mapping.workflowId);
  } catch {
    return rejected(normalizedEvent, "WORKFLOW_NOT_REGISTERED", "The workflow registry could not resolve the workflow.");
  }

  const registrationError = validateWorkflowRegistration(workflow, mapping, normalizedEvent.eventType, environment);
  if (registrationError) {
    return rejected(normalizedEvent, registrationError.code, registrationError.message);
  }

  const workflowExecutor = options.workflowExecutor || executeWebsiteHealthWorkflow;
  if (typeof workflowExecutor !== "function") {
    return rejected(normalizedEvent, "WORKFLOW_EXECUTOR_UNAVAILABLE", "The authorized workflow executor is unavailable.");
  }

  let ledgerClient;
  try {
    ledgerClient = options.ledgerClient || createAutonomyLedgerClient(env);
  } catch {
    ledgerClient = null;
  }
  if (!isLedgerClient(ledgerClient)) {
    return failed(normalizedEvent, {
      retriable: true,
      error: safeError("LEDGER_UNAVAILABLE", "The autonomy ledger client is unavailable or invalid."),
    });
  }

  const reservation = await invokeLedger(
    () => ledgerClient.reserveEvent(normalizedEvent),
    "LEDGER_OPERATION_FAILED",
    "The autonomy event could not be reserved.",
  );
  if (!reservation.ok) {
    return failed(normalizedEvent, {
      retriable: isRetriableLedgerCode(reservation.code),
      record: reservation.record,
      error: ledgerError(reservation, "LEDGER_OPERATION_FAILED", "The autonomy event could not be reserved."),
    });
  }
  if (!reservation.record || typeof reservation.record !== "object") {
    return failed(normalizedEvent, {
      retriable: false,
      error: safeError("LEDGER_INVALID_RESPONSE", "The ledger reservation did not include an event record."),
    });
  }

  const reservedRecord = reservation.record;
  const now = resolveNow(options.now);
  if (!now) {
    return failed(normalizedEvent, {
      retriable: false,
      record: reservedRecord,
      error: safeError("INVALID_DISPATCH_CLOCK", "The dispatcher clock returned an invalid timestamp."),
    });
  }

  const duplicateResult = classifyExistingRecord(normalizedEvent, reservedRecord, now);
  if (duplicateResult) return duplicateResult;

  const policyEvaluator = options.policyEvaluator || evaluatePolicy;
  let policyDecision;
  try {
    policyDecision = typeof policyEvaluator === "function"
      ? policyEvaluator({
        agent: mapping.agent,
        workflowId: mapping.workflowId,
        action: mapping.action,
        riskClass: normalizedEvent.riskClass,
        environment,
        globalKillSwitch: env.KAIROS_KILL_SWITCH,
      })
      : null;
  } catch {
    policyDecision = {
      decision: "DENY",
      policyId: mapping.workflowId,
      policyVersion: workflow.version || 1,
      reasonCode: "POLICY_EVALUATION_ERROR",
      explanation: "Policy evaluation failed closed.",
    };
  }

  if (policyDecision?.decision !== "ALLOW_AUTONOMOUS") {
    return persistPolicyBlock({
      event: normalizedEvent,
      record: reservedRecord,
      policyDecision: normalizePolicyDecision(policyDecision),
      ledgerClient,
      options,
    });
  }

  const executionTimeoutMs = boundedInteger(
    options.executionTimeoutMs,
    DEFAULT_EXECUTION_TIMEOUT_MS,
    MIN_EXECUTION_TIMEOUT_MS,
    MAX_EXECUTION_TIMEOUT_MS,
  );
  const requestedLeaseDurationMs = boundedInteger(
    options.leaseDurationMs,
    DEFAULT_LEASE_DURATION_MS,
    MIN_LEASE_DURATION_MS,
    MAX_LEASE_DURATION_MS,
  );
  const leaseDurationMs = Math.min(
    MAX_LEASE_DURATION_MS,
    Math.max(requestedLeaseDurationMs, executionTimeoutMs + LEASE_SAFETY_MARGIN_MS),
  );

  const lease = await invokeLedger(
    () => ledgerClient.acquireLease({
      tenantId: normalizedEvent.tenantId,
      eventId: normalizedEvent.eventId,
      leaseDurationMs,
    }),
    "LEDGER_OPERATION_FAILED",
    "The execution lease could not be acquired.",
  );

  if (!lease.ok) {
    if (lease.code === "ACTIVE_LEASE_EXISTS") {
      return result({
        disposition: "in_progress",
        event: normalizedEvent,
        duplicate: true,
        retriable: true,
        record: lease.record || reservedRecord,
        policyDecision,
        error: safeError("ACTIVE_LEASE_EXISTS", "Another executor holds an active lease."),
      });
    }
    return failed(normalizedEvent, {
      retriable: isRetriableLedgerCode(lease.code),
      record: lease.record || reservedRecord,
      policyDecision,
      error: ledgerError(lease, "LEASE_ACQUISITION_FAILED", "The execution lease could not be acquired."),
    });
  }

  const leaseToken = typeof lease.leaseToken === "string" && lease.leaseToken.trim()
    ? lease.leaseToken
    : typeof lease.record?.leaseToken === "string" && lease.record.leaseToken.trim()
      ? lease.record.leaseToken
      : null;
  if (!leaseToken) {
    return failed(normalizedEvent, {
      record: lease.record || reservedRecord,
      policyDecision,
      error: safeError("LEDGER_LEASE_TOKEN_MISSING", "The ledger did not return an execution lease token."),
    });
  }

  const workflowOptions = {
    fetchImpl: options.fetchImpl,
    timeoutMs: optionalBoundedInteger(options.websiteTimeoutMs, 100, 30_000),
    maxBodyBytes: optionalBoundedInteger(options.maxBodyBytes, 1_024, 1_048_576),
    now: options.now,
    randomUUID: options.randomUUID,
  };
  for (const key of Object.keys(workflowOptions)) {
    if (workflowOptions[key] === undefined) delete workflowOptions[key];
  }

  const execution = await executeWithDeadline(
    () => workflowExecutor(normalizedEvent.payload, env, workflowOptions),
    executionTimeoutMs,
  );

  if (execution.status === "timeout") {
    return persistExecutionFailure({
      event: normalizedEvent,
      ledgerClient,
      leaseToken,
      policyDecision,
      fallbackRecord: lease.record || reservedRecord,
      retriable: true,
      error: safeError("DISPATCH_TIMEOUT", "The autonomy workflow exceeded its execution deadline."),
    });
  }

  if (execution.status === "rejected") {
    const sanitized = sanitizeThrownError(execution.error);
    return persistExecutionFailure({
      event: normalizedEvent,
      ledgerClient,
      leaseToken,
      policyDecision,
      fallbackRecord: lease.record || reservedRecord,
      retriable: sanitized.retriable === true,
      error: safeError(sanitized.code, sanitized.message),
    });
  }

  const workflowResult = execution.value;
  if (!isPlainObject(workflowResult)) {
    return persistExecutionFailure({
      event: normalizedEvent,
      ledgerClient,
      leaseToken,
      policyDecision,
      workflowResult,
      fallbackRecord: lease.record || reservedRecord,
      error: safeError("INVALID_WORKFLOW_RESULT", "The workflow returned an invalid or unsupported result."),
    });
  }

  if (workflowResult.status === "passed" || workflowResult.status === "degraded") {
    const completion = await invokeLedger(
      () => ledgerClient.markCompleted({
        tenantId: normalizedEvent.tenantId,
        eventId: normalizedEvent.eventId,
        leaseToken,
        result: workflowResult,
      }),
      "LEDGER_OPERATION_FAILED",
      "The completed workflow result could not be persisted.",
    );
    if (!completion.ok) {
      return failed(normalizedEvent, {
        retriable: isRetriableLedgerCode(completion.code),
        record: completion.record || lease.record || reservedRecord,
        policyDecision,
        workflowResult,
        error: ledgerError(completion, "COMPLETION_WRITE_FAILED", "The completed workflow result could not be persisted."),
      });
    }
    return result({
      disposition: "completed",
      event: normalizedEvent,
      record: completion.record,
      policyDecision,
      workflowResult,
    });
  }

  if (workflowResult.status === "blocked") {
    const workflowPolicy = normalizePolicyDecision(workflowResult.policyDecision, {
      decision: "DENY",
      reasonCode: "WORKFLOW_RETURNED_BLOCKED",
      explanation: "The workflow declined execution.",
    });
    const blocked = await invokeLedger(
      () => ledgerClient.markBlocked({
        tenantId: normalizedEvent.tenantId,
        eventId: normalizedEvent.eventId,
        leaseToken,
        policyDecision: workflowPolicy,
      }),
      "LEDGER_OPERATION_FAILED",
      "The workflow block could not be persisted.",
    );
    if (!blocked.ok) {
      return failed(normalizedEvent, {
        retriable: isRetriableLedgerCode(blocked.code),
        record: blocked.record || lease.record || reservedRecord,
        policyDecision: workflowPolicy,
        workflowResult,
        error: ledgerError(blocked, "BLOCK_WRITE_FAILED", "The workflow block could not be persisted."),
      });
    }
    return result({
      disposition: "blocked",
      event: normalizedEvent,
      record: blocked.record,
      policyDecision: workflowPolicy,
      workflowResult,
    });
  }

  if (workflowResult.status === "rejected") {
    return persistExecutionFailure({
      event: normalizedEvent,
      ledgerClient,
      leaseToken,
      policyDecision,
      workflowResult,
      fallbackRecord: lease.record || reservedRecord,
      retriable: workflowResult.error?.retriable === true,
      error: safeError(
        workflowResult.error?.code || "WORKFLOW_REJECTED",
        workflowResult.error?.message || "The workflow rejected the supplied input.",
      ),
    });
  }

  return persistExecutionFailure({
    event: normalizedEvent,
    ledgerClient,
    leaseToken,
    policyDecision,
    workflowResult,
    fallbackRecord: lease.record || reservedRecord,
    error: safeError("INVALID_WORKFLOW_RESULT", "The workflow returned an invalid or unsupported result."),
  });
}

async function persistPolicyBlock({ event, record, policyDecision, ledgerClient, options }) {
  let leaseToken = null;
  let currentRecord = record;

  if (record.status === "running") {
    const executionTimeoutMs = boundedInteger(
      options.executionTimeoutMs,
      DEFAULT_EXECUTION_TIMEOUT_MS,
      MIN_EXECUTION_TIMEOUT_MS,
      MAX_EXECUTION_TIMEOUT_MS,
    );
    const requestedLeaseDurationMs = boundedInteger(
      options.leaseDurationMs,
      DEFAULT_LEASE_DURATION_MS,
      MIN_LEASE_DURATION_MS,
      MAX_LEASE_DURATION_MS,
    );
    const leaseDurationMs = Math.min(
      MAX_LEASE_DURATION_MS,
      Math.max(requestedLeaseDurationMs, executionTimeoutMs + LEASE_SAFETY_MARGIN_MS),
    );
    const recovery = await invokeLedger(
      () => ledgerClient.acquireLease({
        tenantId: event.tenantId,
        eventId: event.eventId,
        leaseDurationMs,
      }),
      "LEDGER_OPERATION_FAILED",
      "The expired lease could not be recovered for policy blocking.",
    );
    if (!recovery.ok) {
      if (recovery.code === "ACTIVE_LEASE_EXISTS") {
        return result({
          disposition: "in_progress",
          event,
          duplicate: true,
          retriable: true,
          record: recovery.record || record,
          policyDecision,
          error: safeError("ACTIVE_LEASE_EXISTS", "Another executor recovered the event lease."),
        });
      }
      return failed(event, {
        retriable: isRetriableLedgerCode(recovery.code),
        record: recovery.record || record,
        policyDecision,
        error: ledgerError(recovery, "LEASE_RECOVERY_FAILED", "The expired lease could not be recovered for policy blocking."),
      });
    }
    leaseToken = recovery.leaseToken || recovery.record?.leaseToken || null;
    currentRecord = recovery.record || record;
    if (typeof leaseToken !== "string" || !leaseToken.trim()) {
      return failed(event, {
        record: currentRecord,
        policyDecision,
        error: safeError("LEDGER_LEASE_TOKEN_MISSING", "The recovered lease did not include a lease token."),
      });
    }
  }

  const blocked = await invokeLedger(
    () => ledgerClient.markBlocked({
      tenantId: event.tenantId,
      eventId: event.eventId,
      ...(leaseToken ? { leaseToken } : {}),
      policyDecision,
    }),
    "LEDGER_OPERATION_FAILED",
    "The policy block could not be persisted.",
  );
  if (!blocked.ok) {
    return failed(event, {
      retriable: isRetriableLedgerCode(blocked.code),
      record: blocked.record || currentRecord,
      policyDecision,
      error: ledgerError(blocked, "BLOCK_WRITE_FAILED", "The policy block could not be persisted."),
    });
  }

  return result({
    disposition: "blocked",
    event,
    record: blocked.record,
    policyDecision,
  });
}

async function persistExecutionFailure({
  event,
  ledgerClient,
  leaseToken,
  policyDecision,
  workflowResult = null,
  fallbackRecord = null,
  retriable = false,
  error,
}) {
  const failureWrite = await invokeLedger(
    () => ledgerClient.markFailed({
      tenantId: event.tenantId,
      eventId: event.eventId,
      leaseToken,
      error: {
        code: error.code,
        message: error.message,
        retriable,
      },
    }),
    "LEDGER_OPERATION_FAILED",
    "The workflow failure could not be persisted.",
  );

  if (!failureWrite.ok) {
    return failed(event, {
      retriable: isRetriableLedgerCode(failureWrite.code),
      record: failureWrite.record || fallbackRecord,
      policyDecision,
      workflowResult,
      error: ledgerError(failureWrite, "FAILURE_WRITE_FAILED", "The workflow failure could not be persisted."),
    });
  }

  return failed(event, {
    retriable,
    record: failureWrite.record,
    policyDecision,
    workflowResult,
    error,
  });
}

function classifyExistingRecord(event, record, now) {
  if (record.status === "completed") {
    return result({
      disposition: "duplicate",
      event,
      duplicate: true,
      record,
      policyDecision: record.policyDecision || null,
      workflowResult: record.result || null,
    });
  }
  if (record.status === "blocked") {
    return result({
      disposition: "duplicate",
      event,
      duplicate: true,
      record,
      policyDecision: record.policyDecision || null,
    });
  }
  if (record.status === "running" && isActiveLease(record, now)) {
    return result({
      disposition: "in_progress",
      event,
      duplicate: true,
      retriable: true,
      record,
      error: safeError("ACTIVE_LEASE_EXISTS", "Another executor holds an active lease."),
    });
  }
  if (record.status === "accepted" || record.status === "failed") return null;
  if (record.status === "running" && !isActiveLease(record, now)) return null;
  return failed(event, {
    record,
    error: safeError("UNKNOWN_LEDGER_STATE", "The ledger record has an unsupported state."),
  });
}

function validateWorkflowRegistration(workflow, mapping, eventType, environment) {
  if (!workflow) return safeError("WORKFLOW_NOT_REGISTERED", "The workflow is not registered.");
  if (workflow.status !== "active") return safeError("WORKFLOW_INACTIVE", "The workflow is not active.");
  if (workflow.workflowId !== mapping.workflowId) return safeError("WORKFLOW_NOT_REGISTERED", "The workflow registry returned the wrong workflow.");
  if (!Array.isArray(workflow.triggers) || !workflow.triggers.includes(eventType)) {
    return safeError("WORKFLOW_TRIGGER_NOT_REGISTERED", "The event trigger is not registered for the workflow.");
  }
  if (!Array.isArray(workflow.agents) || !workflow.agents.includes(mapping.agent)) {
    return safeError("WORKFLOW_AGENT_NOT_AUTHORIZED", "The agent is not authorized for the workflow.");
  }
  if (!Array.isArray(workflow.environments) || !workflow.environments.includes(environment)) {
    return safeError("WORKFLOW_ENVIRONMENT_NOT_AUTHORIZED", "The environment is not authorized for the workflow.");
  }
  if (!Array.isArray(workflow.autonomousActions) || !workflow.autonomousActions.includes(mapping.action)) {
    return safeError("WORKFLOW_ACTION_NOT_AUTHORIZED", "The workflow action is not authorized for autonomous execution.");
  }
  return null;
}

async function invokeLedger(operation, fallbackCode, fallbackMessage) {
  try {
    const response = await operation();
    if (!response || typeof response !== "object" || Array.isArray(response) || typeof response.ok !== "boolean") {
      return {
        ok: false,
        code: "LEDGER_INVALID_RESPONSE",
        error: "The ledger returned an invalid operation result.",
        record: null,
      };
    }
    return response;
  } catch {
    return {
      ok: false,
      code: fallbackCode,
      error: fallbackMessage,
      record: null,
    };
  }
}

async function executeWithDeadline(executor, timeoutMs) {
  let timer = null;
  const observedExecution = Promise.resolve()
    .then(executor)
    .then(
      (value) => ({ status: "fulfilled", value }),
      (error) => ({ status: "rejected", error }),
    );
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
  });
  const settled = await Promise.race([observedExecution, timeout]);
  if (timer) clearTimeout(timer);
  return settled;
}

function sanitizeThrownError(value) {
  const source = value instanceof Error
    ? { code: value.code, message: value.message, retriable: value.retriable }
    : isPlainObject(value)
      ? { code: value.code, message: value.message, retriable: value.retriable }
      : typeof value === "string"
        ? { message: value }
        : {};
  return {
    code: safeIdentifier(source.code) || "WORKFLOW_EXCEPTION",
    message: sanitizeMessage(source.message || "The autonomy workflow failed."),
    retriable: source.retriable === true,
  };
}

function normalizePolicyDecision(value, fallback = null) {
  if (isPlainObject(value)) {
    return {
      decision: safeIdentifier(value.decision) || "DENY",
      policyId: safeIdentifier(value.policyId),
      policyVersion: Number.isFinite(Number(value.policyVersion)) ? Number(value.policyVersion) : null,
      reasonCode: safeIdentifier(value.reasonCode) || "POLICY_DENIED",
      explanation: sanitizeMessage(value.explanation || "Autonomous execution was not authorized."),
    };
  }
  if (fallback) return normalizePolicyDecision(fallback);
  return {
    decision: "DENY",
    policyId: null,
    policyVersion: null,
    reasonCode: "POLICY_DECISION_INVALID",
    explanation: "Autonomous execution was not authorized.",
  };
}

function isLedgerClient(client) {
  return Boolean(client)
    && typeof client.reserveEvent === "function"
    && typeof client.acquireLease === "function"
    && typeof client.markCompleted === "function"
    && typeof client.markFailed === "function"
    && typeof client.markBlocked === "function";
}

function isActiveLease(record, now) {
  const expiresAt = Date.parse(record?.leaseExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

function resolveNow(nowOption) {
  try {
    const value = nowOption instanceof Date
      ? nowOption
      : typeof nowOption === "function"
        ? nowOption()
        : new Date();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

function rejected(event, code, message) {
  return result({
    disposition: "rejected",
    event,
    error: safeError(code, message),
  });
}

function failed(event, overrides = {}) {
  return result({
    disposition: "failed",
    event,
    ...overrides,
  });
}

function result({
  disposition,
  event = null,
  eventId = null,
  tenantId = null,
  workflowId = null,
  duplicate = false,
  retriable = false,
  record = null,
  policyDecision = null,
  workflowResult = null,
  error = null,
}) {
  return {
    build: KAIROS_AUTONOMY_DISPATCHER_BUILD,
    disposition,
    eventId: event?.eventId || eventId || null,
    tenantId: event?.tenantId || tenantId || null,
    workflowId: event?.workflowId || workflowId || null,
    duplicate: duplicate === true,
    retriable: retriable === true,
    record,
    policyDecision,
    workflowResult,
    error: error ? safeError(error.code, error.message) : null,
  };
}

function ledgerError(value, fallbackCode, fallbackMessage) {
  return safeError(value?.code || fallbackCode, value?.error || fallbackMessage);
}

function safeError(code, message) {
  return {
    code: safeIdentifier(code) || "ERROR",
    message: sanitizeMessage(message || "An autonomy operation failed."),
  };
}

function sanitizeMessage(value) {
  const firstLine = String(value || "").split(/\r?\n/, 1)[0];
  return firstLine
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|pk|api)[-_][A-Za-z0-9_-]{8,}\b/gi, "[REDACTED]")
    .replace(/\b(?:password|secret|token|api[_-]?key|authorization|cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, MAX_ERROR_MESSAGE_LENGTH) || "An autonomy operation failed.";
}

function safeIdentifier(value) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 256) : null;
}

function isRetriableLedgerCode(code) {
  return RETRIABLE_LEDGER_CODES.has(code);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(numeric)));
}

function optionalBoundedInteger(value, minimum, maximum) {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.min(maximum, Math.max(minimum, Math.trunc(numeric)));
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
