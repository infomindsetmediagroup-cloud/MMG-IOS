export const KAIROS_AUTONOMY_OBSERVABILITY_BUILD =
  "kairos-autonomy-observability-20260802-1";

const KNOWN_STATUSES = new Set([
  "accepted",
  "running",
  "completed",
  "failed",
  "blocked",
]);
const KNOWN_DISPOSITIONS = new Set([
  "completed",
  "duplicate",
  "in_progress",
  "blocked",
  "rejected",
  "failed",
]);
const SUPPORTED_OBSERVATION_TYPES = new Set([
  "scheduler.invoked",
  "scheduler.ignored",
  "activation.blocked",
  "dispatch.completed",
  "dispatch.duplicate",
  "dispatch.in_progress",
  "dispatch.blocked",
  "dispatch.rejected",
  "dispatch.failed",
  "scheduler.exception",
]);
const AUTHORIZED_ENVIRONMENTS = new Set(["development", "staging", "production"]);
const SECRET_PATTERN = /(authorization|bearer|cookie|password|credential|api[\s_-]?key|access[\s_-]?token|auth[\s_-]?token|client[\s_-]?secret|token|secret)/iu;
const SAFE_CODE_PATTERN = /^[A-Za-z0-9_.-]+$/u;
const MAX_ATTEMPT = 1_000_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const FALLBACK_OBSERVED_AT = "2026-08-02T00:00:00.000Z";

export function summarizeAutonomyRecords(records, options = {}) {
  if (!Array.isArray(records)) {
    return failure(
      "INVALID_OBSERVABILITY_RECORDS",
      "Autonomy observability requires an array of ledger records.",
    );
  }

  const clock = resolveClock(options.now);
  if (!clock.ok) {
    return failure(
      "INVALID_OBSERVABILITY_CLOCK",
      "The observability clock is invalid.",
    );
  }

  const limit = boundedInteger(options.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const generatedAt = clock.date.toISOString();
  const generatedAtMs = clock.date.getTime();
  const projected = records.map((record) => projectAutonomyRecord(record));
  projected.sort((left, right) => timestampMs(right.updatedAt) - timestampMs(left.updatedAt));

  const counts = {
    accepted: 0,
    running: 0,
    completed: 0,
    failed: 0,
    blocked: 0,
    unknown: 0,
  };
  let staleRunningCount = 0;

  for (const record of projected) {
    counts[record.status] += 1;
    if (
      record.status === "running"
      && record.leaseExpiresAt
      && timestampMs(record.leaseExpiresAt) <= generatedAtMs
    ) {
      staleRunningCount += 1;
    }
  }

  const latestEvent = projected.find((record) => record.updatedAt !== null) || null;
  const latestUpdatedAt = latestEvent?.updatedAt || null;

  return {
    ok: true,
    build: KAIROS_AUTONOMY_OBSERVABILITY_BUILD,
    generatedAt,
    total: projected.length,
    counts,
    terminalCount: counts.completed + counts.blocked,
    activeCount: counts.accepted + counts.running + counts.failed,
    staleRunningCount,
    latestUpdatedAt,
    latestEvent,
    recent: projected.slice(0, limit),
  };
}

export function projectAutonomyRecord(record) {
  if (!isPlainObject(record)) return emptyProjection();

  const policyDecision = projectPolicyDecision(record.policyDecision);
  return {
    eventId: safeString(record.eventId, 256),
    tenantId: safeString(record.tenantId, 256),
    workflowId: safeString(record.workflowId, 256),
    eventType: safeString(record.eventType, 160),
    riskClass: safeString(record.riskClass, 32),
    status: normalizeStatus(record.status),
    attempt: safeAttempt(record.attempt),
    acceptedAt: safeTimestamp(record.acceptedAt),
    startedAt: safeTimestamp(record.startedAt),
    completedAt: safeTimestamp(record.completedAt),
    failedAt: safeTimestamp(record.failedAt),
    leaseExpiresAt: safeTimestamp(record.leaseExpiresAt),
    updatedAt: safeTimestamp(record.updatedAt),
    errorCode: projectErrorCode(record.error),
    policyDecision,
  };
}

export function emitAutonomyObservation(type, input = {}, options = {}) {
  const clock = resolveClock(options.now);
  const source = isPlainObject(input) ? input : {};
  const observation = {
    build: KAIROS_AUTONOMY_OBSERVABILITY_BUILD,
    type: SUPPORTED_OBSERVATION_TYPES.has(type) ? type : "autonomy.unknown",
    observedAt: clock.ok ? clock.date.toISOString() : FALLBACK_OBSERVED_AT,
    eventId: safeString(source.eventId, 256),
    tenantId: safeString(source.tenantId, 256),
    workflowId: safeString(source.workflowId, 256),
    eventType: safeString(source.eventType, 160),
    disposition: normalizeDisposition(source.disposition),
    status: normalizeObservationStatus(source.status),
    retriable: typeof source.retriable === "boolean" ? source.retriable : null,
    duplicate: typeof source.duplicate === "boolean" ? source.duplicate : null,
    attempt: safeAttempt(source.attempt),
    cron: safeString(source.cron, 80),
    environment: AUTHORIZED_ENVIRONMENTS.has(source.environment) ? source.environment : null,
    code: projectObservationCode(source),
  };

  const logger = options.logger || console;
  if (logger && typeof logger.log === "function") {
    try {
      logger.log(JSON.stringify(observation));
    } catch {
      // Observability logging is best effort and must never alter execution.
    }
  }

  return observation;
}

function projectPolicyDecision(value) {
  if (!isPlainObject(value)) return null;
  const decision = safeCode(value.decision, 80);
  const policyId = safeString(value.policyId, 256);
  const policyVersion = safePolicyVersion(value.policyVersion);
  const reasonCode = safeCode(value.reasonCode, 160);
  if (decision === null && policyId === null && policyVersion === null && reasonCode === null) return null;
  return { decision, policyId, policyVersion, reasonCode };
}

function projectErrorCode(value) {
  if (isPlainObject(value)) return safeCode(value.code, 160);
  return typeof value === "string" ? safeCode(value, 160) : null;
}

function projectObservationCode(source) {
  const direct = safeCode(source.code, 160);
  if (direct) return direct;
  return isPlainObject(source.error) ? safeCode(source.error.code, 160) : null;
}

function safePolicyVersion(value) {
  if (Number.isInteger(value) && value >= 0 && value <= MAX_ATTEMPT) return value;
  return safeCode(value, 80);
}

function safeAttempt(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_ATTEMPT ? value : null;
}

function safeTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function timestampMs(value) {
  if (typeof value !== "string") return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function safeCode(value, maximum) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || !SAFE_CODE_PATTERN.test(normalized)) return null;
  if (SECRET_PATTERN.test(normalized)) return null;
  return normalized;
}

function safeString(value, maximum) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || SECRET_PATTERN.test(normalized)) return null;
  return normalized.slice(0, maximum);
}

function normalizeStatus(value) {
  return typeof value === "string" && KNOWN_STATUSES.has(value) ? value : "unknown";
}

function normalizeObservationStatus(value) {
  if (typeof value !== "string") return null;
  if (KNOWN_STATUSES.has(value) || KNOWN_DISPOSITIONS.has(value)) return value;
  return null;
}

function normalizeDisposition(value) {
  return typeof value === "string" && KNOWN_DISPOSITIONS.has(value) ? value : null;
}

function boundedInteger(value, fallback, minimum, maximum) {
  if (value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(numeric)));
}

function resolveClock(nowOption) {
  try {
    if (nowOption === undefined) return validDate(new Date());
    if (nowOption instanceof Date) return validDate(new Date(nowOption.getTime()));
    if (typeof nowOption === "function") {
      const value = nowOption();
      return value instanceof Date ? validDate(new Date(value.getTime())) : { ok: false };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

function validDate(date) {
  return Number.isFinite(date.getTime()) ? { ok: true, date } : { ok: false };
}

function emptyProjection() {
  return {
    eventId: null,
    tenantId: null,
    workflowId: null,
    eventType: null,
    riskClass: null,
    status: "unknown",
    attempt: null,
    acceptedAt: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    leaseExpiresAt: null,
    updatedAt: null,
    errorCode: null,
    policyDecision: null,
  };
}

function failure(code, message) {
  return {
    ok: false,
    build: KAIROS_AUTONOMY_OBSERVABILITY_BUILD,
    error: { code, message },
  };
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
