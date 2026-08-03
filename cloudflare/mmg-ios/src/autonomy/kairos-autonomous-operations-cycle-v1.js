/**
 * ============================================================================
 * KAIROS AUTONOMOUS BUSINESS OPERATIONS
 * COMPLETE GOVERNED OPERATIONS CYCLE V1
 * Organization: Mindset Media Group / The Legacy, LLC
 * ============================================================================
 */

import { collectBusinessState } from "./kairos-business-collector-v1.js";
import { prioritizeBusinessState } from "./kairos-business-prioritizer-v1.js";
import { orchestrateBusinessOperations } from "./kairos-business-orchestrator-v1.js";
import { createAutonomyLedgerClient } from "./kairos-autonomy-ledger-client-v1.js";
import { getWorkflowDefinition } from "./kairos-workflow-registry-v1.js";

export const KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD =
  "kairos-autonomous-operations-cycle-20260802-1";
export const KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_SCHEMA_VERSION = 1;
export const KAIROS_AUTONOMOUS_OPERATIONS_ACTIVATION_ID = "business-operations-v1";

const DEFAULT_TENANT_ID = "mmg";
const AUTHORIZED_ENVIRONMENTS = new Set(["development", "staging", "production"]);

export async function runAutonomousOperationsCycle(input = {}, env = {}, ctx = {}, options = {}) {
  void ctx;
  try {
    const activation = evaluateAutonomousOperationsActivation(env, options);
    if (!activation.ready) {
      return cycleFailure(
        "AUTONOMOUS_OPERATIONS_BLOCKED",
        "Autonomous business operations are not fully activated.",
        false,
        activation.projection,
      );
    }

    const normalized = normalizeCycleInput(input);
    if (!normalized.ok) {
      return cycleFailure(normalized.code, normalized.message, false, activation.projection);
    }

    const ledgerClient = resolveLedgerClient(env, options);
    if (!ledgerClient || typeof ledgerClient.storeBusinessSnapshot !== "function") {
      return cycleFailure(
        "LEDGER_UNAVAILABLE",
        "The business-state ledger client is unavailable.",
        true,
        activation.projection,
      );
    }

    let businessState = normalized.businessState;
    let collection = null;
    if (!businessState) {
      const collector = readOption(options, "businessCollector") || collectBusinessState;
      if (typeof collector !== "function") {
        return cycleFailure(
          "COLLECTOR_UNAVAILABLE",
          "The business-state collector is unavailable.",
          true,
          activation.projection,
        );
      }
      const collectorOptions = buildCollectorOptions(options);
      try {
        businessState = await collector(
          buildCollectionInput(normalized.tenantId, env),
          env,
          collectorOptions,
        );
      } catch {
        return cycleFailure(
          "BUSINESS_COLLECTION_FAILED",
          "Business-state collection failed.",
          true,
          activation.projection,
        );
      }
      collection = summarizeCollection(businessState);
    }

    if (!isValidBusinessState(businessState, normalized.tenantId)) {
      return cycleFailure(
        "INVALID_BUSINESS_STATE",
        "The collected business state is invalid.",
        false,
        activation.projection,
      );
    }

    let persistence;
    try {
      persistence = await ledgerClient.storeBusinessSnapshot(businessState);
    } catch {
      persistence = null;
    }
    const persistenceSummary = validatePersistence(persistence, businessState);
    if (!persistenceSummary.ok) {
      return cycleFailure(
        persistenceSummary.code,
        persistenceSummary.message,
        persistenceSummary.retriable,
        activation.projection,
        { collection, businessState: summarizeBusinessState(businessState) },
      );
    }

    const prioritizer = readOption(options, "prioritizer") || prioritizeBusinessState;
    let plan;
    try {
      plan = prioritizer(businessState);
    } catch {
      plan = null;
    }
    if (!plan?.ok) {
      return cycleFailure(
        "PRIORITIZATION_FAILED",
        "The business state could not be prioritized.",
        false,
        activation.projection,
        {
          collection,
          persistence: persistenceSummary.value,
          businessState: summarizeBusinessState(businessState),
        },
      );
    }

    const orchestrator = readOption(options, "orchestrator") || orchestrateBusinessOperations;
    if (typeof orchestrator !== "function") {
      return cycleFailure(
        "ORCHESTRATOR_UNAVAILABLE",
        "The autonomous operations orchestrator is unavailable.",
        true,
        activation.projection,
      );
    }

    let orchestration;
    try {
      orchestration = await orchestrator(
        plan,
        businessState,
        env,
        ctx,
        {
          ledgerClient,
          policyEvaluator: readOption(options, "policyEvaluator"),
          businessCollector: readOption(options, "businessCollector"),
          websiteHealthExecutor: readOption(options, "websiteHealthExecutor"),
          fetchImpl: readOption(options, "fetchImpl"),
          taskTimeoutMs: readOption(options, "taskTimeoutMs"),
          websiteHealthTimeoutMs: readOption(options, "websiteHealthTimeoutMs"),
          websiteHealthMaxBodyBytes: readOption(options, "websiteHealthMaxBodyBytes"),
        },
      );
    } catch {
      orchestration = null;
    }
    if (!orchestration || typeof orchestration.ok !== "boolean") {
      return cycleFailure(
        "ORCHESTRATION_FAILED",
        "The autonomous operations plan could not be orchestrated.",
        true,
        activation.projection,
        {
          collection,
          persistence: persistenceSummary.value,
          businessState: summarizeBusinessState(businessState),
          plan: summarizePlan(plan),
        },
      );
    }

    return deepFreeze({
      ok: orchestration.ok,
      build: KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD,
      schemaVersion: KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_SCHEMA_VERSION,
      status: orchestration.ok ? "completed" : "completed_with_failures",
      mode: normalized.mode,
      tenantId: businessState.tenantId,
      snapshotId: businessState.snapshot.snapshotId,
      generatedAt: businessState.generatedAt,
      activation: activation.projection,
      collection,
      persistence: persistenceSummary.value,
      businessState: summarizeBusinessState(businessState),
      plan: summarizePlan(plan),
      orchestration,
      error: orchestration.ok ? null : orchestration.error,
    });
  } catch {
    return cycleFailure(
      "AUTONOMOUS_OPERATIONS_FAILED",
      "The autonomous operations cycle failed.",
      true,
      null,
    );
  }
}

export function executeBusinessStateOperations(businessState, env = {}, ctx = {}, options = {}) {
  return runAutonomousOperationsCycle({
    mode: "manual",
    tenantId: businessState?.tenantId || DEFAULT_TENANT_ID,
    businessState,
  }, env, ctx, options);
}

export function evaluateAutonomousOperationsActivation(env = {}, options = {}) {
  const workflowResolver = readOption(options, "workflowResolver") || getWorkflowDefinition;
  let workflow = null;
  try {
    workflow = typeof workflowResolver === "function"
      ? workflowResolver("business.operations.v1")
      : null;
  } catch {
    workflow = null;
  }
  const ledger = safeData(env, "KAIROS_AUTONOMY_LEDGER");
  const environment = safeData(env, "KAIROS_ENVIRONMENT");
  const projection = {
    operationsEnabled: safeData(env, "KAIROS_AUTONOMOUS_OPERATIONS_ENABLED") === "enabled",
    scheduledEnabled: safeData(env, "KAIROS_AUTONOMY_SCHEDULED_ENABLED") === "enabled",
    activationGateMatched:
      safeData(env, "KAIROS_AUTONOMY_ACTIVATION_GATE")
      === KAIROS_AUTONOMOUS_OPERATIONS_ACTIVATION_ID,
    killSwitchEnabled: safeData(env, "KAIROS_KILL_SWITCH") === "enabled",
    environmentAuthorized: AUTHORIZED_ENVIRONMENTS.has(environment),
    ledgerConfigured: Boolean(
      ledger
      && typeof safeMethod(ledger, "idFromName") === "function"
      && typeof safeMethod(ledger, "get") === "function"
    ),
    workflowAuthorized: Boolean(
      workflow
      && workflow.status === "active"
      && workflow.workflowId === "business.operations.v1"
      && Array.isArray(workflow.triggers)
      && workflow.triggers.includes("business.operations.schedule")
      && workflow.triggers.includes("business.operations.manual")
    ),
  };
  return deepFreeze({
    ready: Object.values(projection).every(Boolean),
    projection,
  });
}

function normalizeCycleInput(input) {
  if (!isPlainDataObject(input)) {
    return invalid("INVALID_CYCLE_INPUT", "Cycle input must be a plain data object.");
  }
  const allowed = new Set(["mode", "tenantId", "businessState"]);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      return invalid("UNKNOWN_CYCLE_FIELD", "Cycle input contains an unsupported field.");
    }
  }
  const mode = input.mode === undefined ? "scheduled" : input.mode;
  if (!new Set(["scheduled", "manual"]).has(mode)) {
    return invalid("INVALID_CYCLE_MODE", "Cycle mode is invalid.");
  }
  const tenantId = input.tenantId === undefined ? DEFAULT_TENANT_ID : input.tenantId;
  if (!isIdentifier(tenantId)) {
    return invalid("INVALID_TENANT_ID", "Cycle tenantId is invalid.");
  }
  if (input.businessState !== undefined && !isPlainDataObject(input.businessState)) {
    return invalid("INVALID_BUSINESS_STATE", "Cycle businessState is invalid.");
  }
  return { ok: true, mode, tenantId, businessState: input.businessState || null };
}

function buildCollectionInput(tenantId, env) {
  const input = { tenantId, collectors: ["website.health.v1"] };
  const targetUrl = safeData(env, "KAIROS_WEBSITE_HEALTH_TARGET_URL");
  if (typeof targetUrl === "string" && targetUrl.length > 0 && targetUrl.length <= 2_048) {
    input.website = { targetUrl };
  }
  return input;
}

function buildCollectorOptions(options) {
  const output = {};
  const mappings = [
    ["fetchImpl", "fetchImpl"],
    ["websiteHealthExecutor", "websiteHealthExecutor"],
    ["websiteHealthTimeoutMs", "websiteHealthTimeoutMs"],
    ["websiteHealthMaxBodyBytes", "websiteHealthMaxBodyBytes"],
  ];
  for (const [source, target] of mappings) {
    const value = readOption(options, source);
    if (value !== undefined) output[target] = value;
  }
  return output;
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

function validatePersistence(value, businessState) {
  if (!value || value.ok !== true) {
    return {
      ok: false,
      code: value?.code === "LEDGER_UNAVAILABLE"
        ? "LEDGER_UNAVAILABLE"
        : value?.code === "SNAPSHOT_IDENTITY_CONFLICT"
          ? "SNAPSHOT_IDENTITY_CONFLICT"
          : "BUSINESS_SNAPSHOT_PERSISTENCE_FAILED",
      message: "The business-state snapshot could not be persisted.",
      retriable: value?.code !== "SNAPSHOT_IDENTITY_CONFLICT",
    };
  }
  const stored = value.disposition === "stored" && value.duplicate === false;
  const duplicate = value.disposition === "duplicate" && value.duplicate === true;
  if ((!stored && !duplicate) || !isPlainDataObject(value.record)) {
    return {
      ok: false,
      code: "BUSINESS_SNAPSHOT_PERSISTENCE_FAILED",
      message: "The business-state snapshot persistence result is invalid.",
      retriable: false,
    };
  }
  if (
    value.record.tenantId !== businessState.tenantId
    || value.record.snapshotId !== businessState.snapshot.snapshotId
    || value.record.generatedAt !== businessState.generatedAt
  ) {
    return {
      ok: false,
      code: "SNAPSHOT_IDENTITY_CONFLICT",
      message: "The persisted snapshot identity does not match the collected state.",
      retriable: false,
    };
  }
  return {
    ok: true,
    value: deepFreeze({
      ok: true,
      disposition: value.disposition,
      duplicate: value.duplicate,
      tenantId: value.record.tenantId,
      snapshotId: value.record.snapshotId,
      generatedAt: value.record.generatedAt,
      storedAt: value.record.storedAt,
    }),
  };
}

function isValidBusinessState(value, tenantId) {
  return isPlainDataObject(value)
    && value.ok === true
    && value.tenantId === tenantId
    && typeof value.generatedAt === "string"
    && isPlainDataObject(value.snapshot)
    && value.snapshot.ok === true
    && value.snapshot.tenantId === tenantId
    && value.snapshot.generatedAt === value.generatedAt
    && isIdentifier(value.snapshot.snapshotId);
}

function summarizeCollection(value) {
  if (!isPlainDataObject(value)) return null;
  return deepFreeze({
    build: typeof value.build === "string" ? value.build : null,
    collectorCount: integerOrZero(value.collectorCount),
    collectedCount: integerOrZero(value.collectedCount),
    blockedCount: integerOrZero(value.blockedCount),
    failedCount: integerOrZero(value.failedCount),
  });
}

function summarizeBusinessState(value) {
  return deepFreeze({
    tenantId: value.tenantId,
    snapshotId: value.snapshot.snapshotId,
    generatedAt: value.generatedAt,
    overallStatus: value.snapshot.health?.overallStatus || "unknown",
    highestSeverity: value.snapshot.health?.highestSeverity || "info",
    attentionRequired: value.snapshot.health?.attentionRequired === true,
    coverageComplete: value.snapshot.coverage?.complete === true,
    signalCount: integerOrZero(value.snapshot.includedCount),
  });
}

function summarizePlan(plan) {
  return deepFreeze({
    build: plan.build,
    planId: plan.planId,
    status: plan.status,
    taskCount: plan.taskCount,
    autonomousCount: plan.autonomousCount,
    approvalCount: plan.approvalCount,
    highestPriority: plan.highestPriority,
    reasonCodes: [...plan.reasonCodes],
  });
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

function safeData(object, key) {
  if (!object || typeof object !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function safeMethod(object, key) {
  const value = safeData(object, key);
  return typeof value === "function" ? value : undefined;
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
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && Object.hasOwn(descriptor, "value") && descriptor.enumerable === true);
  });
}

function isIdentifier(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && /^[a-z0-9][a-z0-9._:-]*$/u.test(value);
}

function integerOrZero(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function invalid(code, message) {
  return { ok: false, code, message };
}

function cycleFailure(code, message, retriable, activation, partial = {}) {
  return deepFreeze({
    ok: false,
    build: KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD,
    schemaVersion: KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_SCHEMA_VERSION,
    status: "failed",
    mode: null,
    tenantId: partial.businessState?.tenantId || null,
    snapshotId: partial.businessState?.snapshotId || null,
    generatedAt: partial.businessState?.generatedAt || null,
    activation,
    collection: partial.collection || null,
    persistence: partial.persistence || null,
    businessState: partial.businessState || null,
    plan: partial.plan || null,
    orchestration: null,
    error: { code, message, retriable },
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
