/**
 * ============================================================================
 * KAIROS AUTONOMOUS BUSINESS OPERATIONS — SLICE 5C-1
 * GOVERNED WEBSITE COLLECTOR AND BUSINESS SNAPSHOT ASSEMBLER
 * Organization: Mindset Media Group / The Legacy, LLC
 * ============================================================================
 */

import {
  executeWebsiteHealthWorkflow,
  KAIROS_WEBSITE_HEALTH_WORKFLOW_BUILD,
} from "./website-health-workflow-v1.js";

import {
  buildBusinessStateSnapshot,
  KAIROS_BUSINESS_OBSERVATION_BUILD,
} from "./kairos-business-observation-v1.js";

export const KAIROS_BUSINESS_COLLECTOR_BUILD =
  "kairos-business-collector-20260802-1";

export const KAIROS_BUSINESS_COLLECTOR_SCHEMA_VERSION = 1;

export const KAIROS_BUSINESS_COLLECTOR_IDS = Object.freeze([
  "website.health.v1",
]);

const WEBSITE_COLLECTOR_ID = "website.health.v1";
const WEBSITE_SOURCE = "website.health.workflow";
const MAX_FUTURE_SKEW_MS = 300_000;
const SIGNAL_TTL_MS = 5_400_000;
const DEFAULT_SNAPSHOT_WINDOW_MS = 86_400_000;
const DEFAULT_SNAPSHOT_RECENT_LIMIT = 20;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/u;
const SAFE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_]*$/u;
const CANONICAL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const INPUT_FIELDS = new Set(["tenantId", "collectors", "website"]);
const WEBSITE_FIELDS = new Set(["targetUrl"]);
const OPTION_FIELDS = new Set([
  "now",
  "websiteHealthExecutor",
  "fetchImpl",
  "websiteHealthTimeoutMs",
  "websiteHealthMaxBodyBytes",
  "snapshotWindowMs",
  "snapshotRecentLimit",
]);

export async function collectBusinessState(input = {}, env = {}, options = {}) {
  try {
    const inputShape = inspectDataObject(input, INPUT_FIELDS);
    if (!inputShape.ok) {
      return failure(
        inputShape.unknown ? "UNKNOWN_INPUT_FIELD" : "INVALID_INPUT",
        inputShape.unknown ? "Input contains an unsupported field." : "Input must contain enumerable data properties.",
        inputShape.field,
        null,
      );
    }

    if (!inputShape.present.has("tenantId") || !isValidIdentifier(inputShape.values.tenantId, 256)) {
      return failure("INVALID_TENANT_ID", "A valid tenantId is required.", "tenantId", null);
    }
    const tenantId = inputShape.values.tenantId;

    const collectorsResult = normalizeCollectors(
      inputShape.present.has("collectors")
        ? inputShape.values.collectors
        : [WEBSITE_COLLECTOR_ID],
    );
    if (!collectorsResult.ok) {
      return failure(
        collectorsResult.code,
        collectorsResult.message,
        "collectors",
        collectorsResult.index,
      );
    }
    const selectedCollectors = collectorsResult.collectors;

    const websiteResult = normalizeWebsiteInput(
      inputShape.present.has("website") ? inputShape.values.website : {},
    );
    if (!websiteResult.ok) {
      return failure(
        websiteResult.code,
        websiteResult.message,
        websiteResult.field,
        null,
      );
    }
    const websiteInput = websiteResult.website;

    const optionShape = inspectDataObject(options, OPTION_FIELDS);
    if (!optionShape.ok) {
      return failure(
        optionShape.unknown ? "UNKNOWN_OPTION_FIELD" : "INVALID_OPTIONS",
        optionShape.unknown ? "Options contain an unsupported field." : "Options must contain enumerable data properties.",
        optionShape.field,
        null,
      );
    }

    const clock = resolveClock(
      optionShape.present.has("now") ? optionShape.values.now : undefined,
    );
    if (!clock.ok) {
      return failure("INVALID_CLOCK", "The collector clock is invalid.", "now", null);
    }
    const resolvedNow = clock.now;
    const generatedAt = resolvedNow.toISOString();

    const executor = optionShape.present.has("websiteHealthExecutor")
      ? optionShape.values.websiteHealthExecutor
      : executeWebsiteHealthWorkflow;
    if (typeof executor !== "function") {
      return failure(
        "INVALID_WEBSITE_EXECUTOR",
        "websiteHealthExecutor must be a function.",
        "websiteHealthExecutor",
        null,
      );
    }

    const fetchImpl = optionShape.present.has("fetchImpl")
      ? optionShape.values.fetchImpl
      : undefined;
    if (fetchImpl !== undefined && typeof fetchImpl !== "function") {
      return failure("INVALID_FETCH_IMPL", "fetchImpl must be a function.", "fetchImpl", null);
    }

    const timeoutResult = optionalBoundedInteger(
      optionShape,
      "websiteHealthTimeoutMs",
      100,
      30_000,
      "INVALID_WEBSITE_TIMEOUT",
    );
    if (!timeoutResult.ok) return timeoutResult.failure;

    const bodyLimitResult = optionalBoundedInteger(
      optionShape,
      "websiteHealthMaxBodyBytes",
      1_024,
      1_048_576,
      "INVALID_WEBSITE_BODY_LIMIT",
    );
    if (!bodyLimitResult.ok) return bodyLimitResult.failure;

    const snapshotWindowResult = boundedIntegerWithDefault(
      optionShape,
      "snapshotWindowMs",
      DEFAULT_SNAPSHOT_WINDOW_MS,
      60_000,
      2_592_000_000,
      "INVALID_SNAPSHOT_WINDOW",
    );
    if (!snapshotWindowResult.ok) return snapshotWindowResult.failure;

    const snapshotRecentResult = boundedIntegerWithDefault(
      optionShape,
      "snapshotRecentLimit",
      DEFAULT_SNAPSHOT_RECENT_LIMIT,
      1,
      100,
      "INVALID_SNAPSHOT_RECENT_LIMIT",
    );
    if (!snapshotRecentResult.ok) return snapshotRecentResult.failure;

    const collectorEnvironment = buildCollectorEnvironment(env);
    const generatedSignals = [];
    const collectorSummaries = [];

    if (selectedCollectors.includes(WEBSITE_COLLECTOR_ID)) {
      const workflowOptions = {
        now: new Date(resolvedNow.getTime()),
      };
      if (fetchImpl !== undefined) workflowOptions.fetchImpl = fetchImpl;
      if (timeoutResult.present) workflowOptions.timeoutMs = timeoutResult.value;
      if (bodyLimitResult.present) workflowOptions.maxBodyBytes = bodyLimitResult.value;

      let outcome;
      try {
        const workflowResult = await executor(
          cloneWebsiteInput(websiteInput),
          clonePlainRecord(collectorEnvironment),
          workflowOptions,
        );
        outcome = mapWebsiteWorkflowResult(
          workflowResult,
          tenantId,
          resolvedNow,
          collectorEnvironment,
        );
      } catch {
        outcome = createWebsiteFailureOutcome(
          "execution_failed",
          tenantId,
          generatedAt,
          collectorEnvironment,
        );
      }

      generatedSignals.push(outcome.signal);
      collectorSummaries.push(outcome.summary);
    }

    const requiredSources = selectedCollectors.includes(WEBSITE_COLLECTOR_ID)
      ? [WEBSITE_SOURCE]
      : [];

    let snapshot;
    try {
      snapshot = buildBusinessStateSnapshot(generatedSignals, {
        tenantId,
        now: new Date(resolvedNow.getTime()),
        windowMs: snapshotWindowResult.value,
        recentLimit: snapshotRecentResult.value,
        requiredSources,
      });
    } catch {
      return failure(
        "SNAPSHOT_BUILD_FAILED",
        "The business-state snapshot could not be assembled.",
        null,
        null,
      );
    }

    if (!isPlainObject(snapshot) || readOwnData(snapshot, "ok") !== true) {
      const snapshotError = isPlainObject(snapshot)
        ? readOwnData(snapshot, "error")
        : undefined;
      const safeField = isPlainObject(snapshotError)
        ? normalizeFailureField(readOwnData(snapshotError, "field"))
        : null;
      const safeIndex = isPlainObject(snapshotError)
        ? normalizeFailureIndex(readOwnData(snapshotError, "index"))
        : null;
      return failure(
        "SNAPSHOT_BUILD_FAILED",
        "The business-state snapshot could not be assembled.",
        safeField,
        safeIndex,
      );
    }

    let collectedCount = 0;
    let blockedCount = 0;
    let failedCount = 0;
    for (const summary of collectorSummaries) {
      if (summary.status === "collected") collectedCount += 1;
      else if (summary.status === "blocked") blockedCount += 1;
      else if (summary.status === "failed") failedCount += 1;
    }

    return deepFreeze({
      ok: true,
      build: KAIROS_BUSINESS_COLLECTOR_BUILD,
      schemaVersion: KAIROS_BUSINESS_COLLECTOR_SCHEMA_VERSION,
      generatedAt,
      tenantId,
      observationBuild: KAIROS_BUSINESS_OBSERVATION_BUILD,
      websiteWorkflowBuild: KAIROS_WEBSITE_HEALTH_WORKFLOW_BUILD,
      selectedCollectors: [...selectedCollectors],
      collectorCount: selectedCollectors.length,
      collectedCount,
      blockedCount,
      failedCount,
      collectors: collectorSummaries.map((summary) => ({ ...summary })),
      snapshot,
    });
  } catch {
    return failure(
      "INVALID_INPUT",
      "The collection request could not be processed.",
      null,
      null,
    );
  }
}

function normalizeCollectors(value) {
  if (!Array.isArray(value) || value.length > 8 || !hasCanonicalArrayShape(value)) {
    return {
      ok: false,
      code: "INVALID_COLLECTORS",
      message: "collectors must be a bounded canonical array.",
      index: null,
    };
  }

  const selected = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = safeOwnDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      return {
        ok: false,
        code: "INVALID_COLLECTORS",
        message: "collectors contains an invalid entry.",
        index,
      };
    }
    const collectorId = descriptor.value;
    if (typeof collectorId !== "string") {
      return {
        ok: false,
        code: "INVALID_COLLECTORS",
        message: "Collector identifiers must be strings.",
        index,
      };
    }
    if (!KAIROS_BUSINESS_COLLECTOR_IDS.includes(collectorId)) {
      return {
        ok: false,
        code: "UNSUPPORTED_COLLECTOR",
        message: "The requested collector is not registered.",
        index,
      };
    }
    if (selected.has(collectorId)) {
      return {
        ok: false,
        code: "DUPLICATE_COLLECTOR",
        message: "Duplicate collectors are not allowed.",
        index,
      };
    }
    selected.add(collectorId);
  }

  return {
    ok: true,
    collectors: KAIROS_BUSINESS_COLLECTOR_IDS.filter((id) => selected.has(id)),
  };
}

function normalizeWebsiteInput(value) {
  const shape = inspectDataObject(value, WEBSITE_FIELDS);
  if (!shape.ok) {
    return {
      ok: false,
      code: shape.unknown ? "UNKNOWN_WEBSITE_FIELD" : "INVALID_WEBSITE_INPUT",
      message: shape.unknown
        ? "website contains an unsupported field."
        : "website must contain enumerable data properties.",
      field: shape.field === null ? "website" : shape.field,
    };
  }

  if (!shape.present.has("targetUrl")) return { ok: true, website: {} };
  const targetUrl = shape.values.targetUrl;
  if (!isValidBoundedString(targetUrl, 2_048)) {
    return {
      ok: false,
      code: "INVALID_TARGET_URL_INPUT",
      message: "targetUrl is invalid.",
      field: "website.targetUrl",
    };
  }
  return { ok: true, website: { targetUrl } };
}

function inspectDataObject(value, allowedFields) {
  if (!isPlainObject(value)) {
    return { ok: false, unknown: false, field: null };
  }

  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return { ok: false, unknown: false, field: null };
  }

  const values = Object.create(null);
  const present = new Set();
  for (const key of keys) {
    if (typeof key !== "string" || !allowedFields.has(key)) {
      return {
        ok: false,
        unknown: true,
        field: typeof key === "string" ? key : null,
      };
    }
    const descriptor = safeOwnDescriptor(value, key);
    if (
      !descriptor
      || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      return { ok: false, unknown: false, field: key };
    }
    present.add(key);
    values[key] = descriptor.value;
  }
  return { ok: true, values, present };
}

function resolveClock(candidate) {
  if (candidate === undefined) {
    return { ok: true, now: new Date() };
  }
  if (isValidDate(candidate)) {
    return { ok: true, now: new Date(candidate.getTime()) };
  }
  if (typeof candidate !== "function") return { ok: false };
  let returned;
  try {
    returned = candidate();
  } catch {
    return { ok: false };
  }
  if (!isValidDate(returned)) return { ok: false };
  return { ok: true, now: new Date(returned.getTime()) };
}

function optionalBoundedInteger(shape, field, minimum, maximum, code) {
  if (!shape.present.has(field)) return { ok: true, present: false, value: undefined };
  const value = shape.values[field];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    return {
      ok: false,
      failure: failure(code, `${field} is invalid.`, field, null),
    };
  }
  return { ok: true, present: true, value };
}

function boundedIntegerWithDefault(shape, field, fallback, minimum, maximum, code) {
  if (!shape.present.has(field)) return { ok: true, value: fallback };
  const value = shape.values[field];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    return {
      ok: false,
      failure: failure(code, `${field} is invalid.`, field, null),
    };
  }
  return { ok: true, value };
}

function buildCollectorEnvironment(env) {
  const output = {};
  copySafeEnvironmentString(env, output, "KAIROS_ENVIRONMENT", 64);
  copySafeEnvironmentString(env, output, "KAIROS_KILL_SWITCH", 64);
  copySafeEnvironmentString(
    env,
    output,
    "KAIROS_WEBSITE_HEALTH_ALLOWED_ORIGINS",
    4_096,
  );
  copySafeEnvironmentInteger(
    env,
    output,
    "KAIROS_WEBSITE_HEALTH_TIMEOUT_MS",
    100,
    30_000,
  );
  copySafeEnvironmentInteger(
    env,
    output,
    "KAIROS_WEBSITE_HEALTH_MAX_BODY_BYTES",
    1_024,
    1_048_576,
  );
  return output;
}

function copySafeEnvironmentString(env, output, key, maximumLength) {
  const value = readOwnData(env, key);
  if (isValidBoundedString(value, maximumLength)) output[key] = value;
}

function copySafeEnvironmentInteger(env, output, key, minimum, maximum) {
  const value = readOwnData(env, key);
  if (Number.isInteger(value) && value >= minimum && value <= maximum) {
    output[key] = value;
    return;
  }
  if (typeof value !== "string" || !/^\d{1,10}$/u.test(value)) return;
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum) {
    output[key] = value;
  }
}

function mapWebsiteWorkflowResult(result, tenantId, resolvedNow, collectorEnvironment) {
  if (!isPlainObject(result)) {
    return createWebsiteFailureOutcome(
      "invalid_result",
      tenantId,
      resolvedNow.toISOString(),
      collectorEnvironment,
    );
  }

  const workflowStatus = readOwnData(result, "status");
  if (
    workflowStatus !== "passed"
    && workflowStatus !== "degraded"
    && workflowStatus !== "blocked"
    && workflowStatus !== "rejected"
  ) {
    return createWebsiteFailureOutcome(
      "invalid_result",
      tenantId,
      resolvedNow.toISOString(),
      collectorEnvironment,
    );
  }

  const timestampField = workflowStatus === "degraded" ? "recordedAt" : "checkedAt";
  const workflowTimestamp = readOwnData(result, timestampField);
  const observedAt = isAcceptedWorkflowTimestamp(workflowTimestamp, resolvedNow)
    ? workflowTimestamp
    : resolvedNow.toISOString();

  if (workflowStatus === "passed") {
    const metrics = {
      collector_completed: true,
      reachable: true,
    };
    addIntegerMetric(metrics, "incidents_detected", readOwnData(result, "incidentsDetected"), 0, 1_000);
    const healthCheck = readOwnData(result, "healthCheck");
    if (isPlainObject(healthCheck)) {
      addIntegerMetric(metrics, "status_code", readOwnData(healthCheck, "statusCode"), 100, 599);
      addNumberMetric(metrics, "latency_ms", readOwnData(healthCheck, "latencyMs"), 0, 300_000);
      addIntegerMetric(
        metrics,
        "body_bytes_inspected",
        readOwnData(healthCheck, "bodyBytesInspected"),
        0,
        1_048_576,
      );
      addBooleanMetric(metrics, "body_truncated", readOwnData(healthCheck, "bodyTruncated"));
    }
    return createWebsiteOutcome({
      outcome: "passed",
      tenantId,
      observedAt,
      status: "healthy",
      severity: "info",
      signalSummary: "Website health inspection completed successfully.",
      collectorStatus: "collected",
      collectorCode: null,
      metrics,
      labels: createLabels("healthy", collectorEnvironment),
      references: [{ kind: "workflow", id: WEBSITE_COLLECTOR_ID }],
    });
  }

  if (workflowStatus === "degraded") {
    const incident = readOwnData(result, "incident");
    const rawCode = isPlainObject(incident) ? readOwnData(incident, "reason") : undefined;
    const collectorCode = isSafeCode(rawCode) ? rawCode : "WEBSITE_DEGRADED";
    const proposalDescriptor = safeOwnDescriptor(result, "proposal");
    const proposalPresent = Boolean(
      proposalDescriptor
      && Object.hasOwn(proposalDescriptor, "value")
      && isPlainObject(proposalDescriptor.value),
    );
    const metrics = {
      collector_completed: true,
      reachable: false,
      incidents_detected: 1,
      repair_proposal_present: proposalPresent,
    };
    const references = [{ kind: "workflow", id: WEBSITE_COLLECTOR_ID }];
    if (isPlainObject(incident)) {
      const details = readOwnData(incident, "details");
      if (isPlainObject(details)) {
        addIntegerMetric(metrics, "status_code", readOwnData(details, "statusCode"), 100, 599);
        addNumberMetric(metrics, "latency_ms", readOwnData(details, "latencyMs"), 0, 300_000);
        addIntegerMetric(
          metrics,
          "body_bytes_inspected",
          readOwnData(details, "bodyBytes"),
          0,
          1_048_576,
        );
        addBooleanMetric(metrics, "body_truncated", readOwnData(details, "bodyTruncated"));
      }
      const incidentId = readOwnData(incident, "incidentId");
      if (isValidIdentifier(incidentId, 256)) {
        references.push({ kind: "incident", id: incidentId });
      }
    }
    references.sort(compareReferences);
    return createWebsiteOutcome({
      outcome: "degraded",
      tenantId,
      observedAt,
      status: "degraded",
      severity: "high",
      signalSummary: "Website health inspection detected a degraded condition.",
      collectorStatus: "collected",
      collectorCode,
      metrics,
      labels: createLabels("degraded", collectorEnvironment),
      references,
    });
  }

  if (workflowStatus === "blocked") {
    const policyDecision = readOwnData(result, "policyDecision");
    const rawCode = isPlainObject(policyDecision)
      ? readOwnData(policyDecision, "reasonCode")
      : undefined;
    const collectorCode = isSafeCode(rawCode) ? rawCode : "COLLECTOR_BLOCKED";
    return createWebsiteOutcome({
      outcome: "blocked",
      tenantId,
      observedAt,
      status: "blocked",
      severity: "high",
      signalSummary: "Website health inspection was blocked by governance policy.",
      collectorStatus: "blocked",
      collectorCode,
      metrics: {
        collector_completed: false,
        reachable: false,
      },
      labels: createLabels("governance_blocked", collectorEnvironment),
      references: [{ kind: "workflow", id: WEBSITE_COLLECTOR_ID }],
    });
  }

  const error = readOwnData(result, "error");
  const rawCode = isPlainObject(error) ? readOwnData(error, "code") : undefined;
  const collectorCode = isSafeCode(rawCode) ? rawCode : "COLLECTOR_REJECTED";
  return createWebsiteOutcome({
    outcome: "rejected",
    tenantId,
    observedAt,
    status: "failed",
    severity: "high",
    signalSummary: "Website health inspection input was rejected.",
    collectorStatus: "failed",
    collectorCode,
    metrics: {
      collector_completed: false,
      reachable: false,
    },
    labels: createLabels("rejected", collectorEnvironment),
    references: [{ kind: "workflow", id: WEBSITE_COLLECTOR_ID }],
  });
}

function createWebsiteFailureOutcome(outcome, tenantId, observedAt, collectorEnvironment) {
  const invalid = outcome === "invalid_result";
  return createWebsiteOutcome({
    outcome,
    tenantId,
    observedAt,
    status: "failed",
    severity: "high",
    signalSummary: invalid
      ? "Website health inspection returned an invalid result."
      : "Website health inspection could not be completed.",
    collectorStatus: "failed",
    collectorCode: invalid
      ? "INVALID_COLLECTOR_RESULT"
      : "COLLECTOR_EXECUTION_FAILED",
    metrics: {
      collector_completed: false,
      reachable: false,
    },
    labels: createLabels(
      invalid ? "invalid_result" : "collection_failed",
      collectorEnvironment,
    ),
    references: [{ kind: "workflow", id: WEBSITE_COLLECTOR_ID }],
  });
}

function createWebsiteOutcome(config) {
  const expiresAt = new Date(Date.parse(config.observedAt) + SIGNAL_TTL_MS).toISOString();
  const safeCode = config.collectorCode === null ? "" : config.collectorCode;
  const hash = fnv1a32(
    `${config.tenantId}|${WEBSITE_COLLECTOR_ID}|${config.observedAt}|${config.outcome}|${safeCode}`,
  );
  const signalId =
    `sig_website_health_${compactTimestamp(config.observedAt)}_${hash}`;

  return {
    signal: {
      signalId,
      tenantId: config.tenantId,
      observedAt: config.observedAt,
      expiresAt,
      source: WEBSITE_SOURCE,
      domain: "website",
      type: "website.health",
      status: config.status,
      severity: config.severity,
      summary: config.signalSummary,
      metrics: { ...config.metrics },
      labels: [...config.labels],
      references: config.references.map((reference) => ({ ...reference })),
    },
    summary: {
      collectorId: WEBSITE_COLLECTOR_ID,
      source: WEBSITE_SOURCE,
      status: config.collectorStatus,
      code: config.collectorCode,
      observedAt: config.observedAt,
      signalId,
    },
  };
}

function createLabels(outcomeLabel, collectorEnvironment) {
  const environment = readOwnData(collectorEnvironment, "KAIROS_ENVIRONMENT");
  const environmentLabel =
    environment === "development"
    || environment === "staging"
    || environment === "production"
      ? environment
      : "environment_unknown";
  return ["website", "collector", outcomeLabel, environmentLabel].sort(compareStrings);
}

function isAcceptedWorkflowTimestamp(value, resolvedNow) {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP_PATTERN.test(value)) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  try {
    if (new Date(parsed).toISOString() !== value) return false;
  } catch {
    return false;
  }
  return parsed <= resolvedNow.getTime() + MAX_FUTURE_SKEW_MS;
}

function addIntegerMetric(target, key, value, minimum, maximum) {
  if (Number.isInteger(value) && value >= minimum && value <= maximum) {
    target[key] = value;
  }
}

function addNumberMetric(target, key, value, minimum, maximum) {
  if (
    typeof value === "number"
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum
  ) {
    target[key] = value;
  }
}

function addBooleanMetric(target, key, value) {
  if (typeof value === "boolean") target[key] = value;
}

function isSafeCode(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 64
    && value === value.trim()
    && SAFE_CODE_PATTERN.test(value);
}

function isValidIdentifier(value, maximumLength) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximumLength
    && value === value.trim()
    && IDENTIFIER_PATTERN.test(value);
}

function isValidBoundedString(value, maximumLength) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximumLength
    || value !== value.trim()
  ) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) {
      return false;
    }
  }
  return true;
}

function hasCanonicalArrayShape(value) {
  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!keys.includes(String(index))) return false;
  }
  return keys.every(
    (key) =>
      key === "length"
      || (
        typeof key === "string"
        && /^(0|[1-9]\d*)$/u.test(key)
        && Number(key) < value.length
      ),
  );
}

function cloneWebsiteInput(website) {
  return Object.hasOwn(website, "targetUrl")
    ? { targetUrl: website.targetUrl }
    : {};
}

function clonePlainRecord(record) {
  const output = {};
  for (const key of Object.keys(record)) output[key] = record[key];
  return output;
}

function compactTimestamp(value) {
  return `${value.slice(0, 10).replace(/-/gu, "")}t${value
    .slice(11, 19)
    .replace(/:/gu, "")}z`;
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareReferences(left, right) {
  return compareStrings(left.kind, right.kind) || compareStrings(left.id, right.id);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isValidDate(value) {
  try {
    return value instanceof Date && Number.isFinite(value.getTime());
  } catch {
    return false;
  }
}

function safeOwnDescriptor(value, key) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return null;
  try {
    return Object.getOwnPropertyDescriptor(value, key) || null;
  } catch {
    return null;
  }
}

function readOwnData(value, key) {
  const descriptor = safeOwnDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value")) return undefined;
  return descriptor.value;
}

function normalizeFailureField(value) {
  return typeof value === "string" && value.length <= 160 ? value : null;
}

function normalizeFailureIndex(value) {
  return Number.isInteger(value) && value >= 0 && value <= 1_000 ? value : null;
}

function failure(code, message, field, index) {
  return deepFreeze({
    ok: false,
    build: KAIROS_BUSINESS_COLLECTOR_BUILD,
    schemaVersion: KAIROS_BUSINESS_COLLECTOR_SCHEMA_VERSION,
    error: {
      code,
      message,
      field,
      index,
    },
  });
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || value instanceof Date || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = safeOwnDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}
