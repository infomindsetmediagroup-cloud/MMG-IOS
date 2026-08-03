/**
 * ============================================================================
 * KAIROS AUTONOMOUS BUSINESS OPERATIONS
 * DETERMINISTIC BUSINESS-STATE PRIORITIZER V1
 * Organization: Mindset Media Group / The Legacy, LLC
 * ============================================================================
 */

export const KAIROS_BUSINESS_PRIORITIZER_BUILD =
  "kairos-business-prioritizer-20260802-1";
export const KAIROS_BUSINESS_PRIORITIZER_SCHEMA_VERSION = 1;

const MAX_TASKS = 8;
const MAX_IDENTIFIER_LENGTH = 256;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/u;
const CANONICAL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const VALID_STATUS = new Set([
  "failed",
  "blocked",
  "degraded",
  "attention",
  "unknown",
  "healthy",
]);
const VALID_SEVERITY = new Set(["critical", "high", "medium", "low", "info"]);

export function prioritizeBusinessState(businessState) {
  try {
    const validated = validateBusinessState(businessState);
    if (!validated.ok) return failure(validated.code, validated.message);

    const { snapshot } = businessState;
    const websiteDomain = snapshot.domains.find((domain) => domain.domain === "website") || null;
    const tasks = [];
    const reasons = new Set();

    if (!snapshot.coverage.complete || snapshot.counts.stale > 0) {
      reasons.add(!snapshot.coverage.complete ? "SOURCE_COVERAGE_INCOMPLETE" : "STALE_OBSERVATIONS_PRESENT");
      tasks.push(task({
        planSeed: snapshot.snapshotId,
        sequence: tasks.length + 1,
        action: "collector.refresh",
        domain: "governance",
        priority: !snapshot.coverage.complete ? 88 : 72,
        riskClass: "low",
        executionMode: "autonomous",
        reasonCode: !snapshot.coverage.complete
          ? "SOURCE_COVERAGE_INCOMPLETE"
          : "STALE_OBSERVATIONS_PRESENT",
        parameters: {
          collectorId: "website.health.v1",
          requestedSources: [...snapshot.coverage.requiredSources],
        },
      }));
    }

    if (websiteDomain && ["failed", "blocked", "degraded", "attention", "unknown"].includes(websiteDomain.status)) {
      reasons.add("WEBSITE_REINSPECTION_REQUIRED");
      tasks.push(task({
        planSeed: snapshot.snapshotId,
        sequence: tasks.length + 1,
        action: "website.reinspect",
        domain: "website",
        priority: priorityForWebsite(websiteDomain.status, websiteDomain.highestSeverity),
        riskClass: "low",
        executionMode: "autonomous",
        reasonCode: "WEBSITE_REINSPECTION_REQUIRED",
        parameters: {
          expectedStatus: websiteDomain.status,
          expectedSeverity: websiteDomain.highestSeverity,
        },
      }));
    }

    if (
      snapshot.health.hasFailures
      || snapshot.health.hasBlocked
      || snapshot.health.hasCritical
      || snapshot.health.highestSeverity === "high"
    ) {
      reasons.add("INCIDENT_RECORD_REQUIRED");
      tasks.push(task({
        planSeed: snapshot.snapshotId,
        sequence: tasks.length + 1,
        action: "incident.record",
        domain: websiteDomain?.status === "failed" || websiteDomain?.status === "blocked"
          ? "website"
          : "governance",
        priority: snapshot.health.hasCritical ? 100 : snapshot.health.hasFailures ? 96 : 92,
        riskClass: "low",
        executionMode: "autonomous",
        reasonCode: "INCIDENT_RECORD_REQUIRED",
        parameters: {
          overallStatus: snapshot.health.overallStatus,
          highestSeverity: snapshot.health.highestSeverity,
          failureCount: snapshot.counts.byStatus.failed,
          blockedCount: snapshot.counts.byStatus.blocked,
        },
      }));
    }

    if (
      snapshot.health.attentionRequired
      && websiteDomain
      && ["failed", "blocked", "degraded", "attention"].includes(websiteDomain.status)
    ) {
      reasons.add("REPAIR_PROPOSAL_REQUIRED");
      tasks.push(task({
        planSeed: snapshot.snapshotId,
        sequence: tasks.length + 1,
        action: "repair.propose",
        domain: "website",
        priority: websiteDomain.status === "failed" ? 94 : 76,
        riskClass: "low",
        executionMode: "autonomous",
        reasonCode: "REPAIR_PROPOSAL_REQUIRED",
        parameters: {
          observedStatus: websiteDomain.status,
          observedSeverity: websiteDomain.highestSeverity,
          executionAuthorized: false,
        },
      }));
    }

    if (snapshot.health.hasCritical || snapshot.health.highestSeverity === "high") {
      reasons.add("EXECUTIVE_REVIEW_REQUIRED");
      tasks.push(task({
        planSeed: snapshot.snapshotId,
        sequence: tasks.length + 1,
        action: "executive.review.request",
        domain: "governance",
        priority: snapshot.health.hasCritical ? 100 : 90,
        riskClass: "medium",
        executionMode: "approval",
        reasonCode: "EXECUTIVE_REVIEW_REQUIRED",
        parameters: {
          overallStatus: snapshot.health.overallStatus,
          highestSeverity: snapshot.health.highestSeverity,
        },
      }));
    }

    const boundedTasks = tasks
      .sort(compareTasks)
      .slice(0, MAX_TASKS)
      .map((value, index) => deepFreeze({ ...value, rank: index + 1 }));
    const autonomousCount = boundedTasks.filter((value) => value.executionMode === "autonomous").length;
    const approvalCount = boundedTasks.length - autonomousCount;
    const planId = `plan_${compactTimestamp(snapshot.generatedAt)}_${hashHex([
      snapshot.tenantId,
      snapshot.snapshotId,
      boundedTasks.map((value) => value.taskId).join("|"),
    ].join("\n"))}`;

    return deepFreeze({
      ok: true,
      build: KAIROS_BUSINESS_PRIORITIZER_BUILD,
      schemaVersion: KAIROS_BUSINESS_PRIORITIZER_SCHEMA_VERSION,
      planId,
      tenantId: snapshot.tenantId,
      snapshotId: snapshot.snapshotId,
      generatedAt: snapshot.generatedAt,
      status: boundedTasks.length === 0
        ? "steady"
        : approvalCount > 0
          ? "approval_required"
          : "ready",
      taskCount: boundedTasks.length,
      autonomousCount,
      approvalCount,
      highestPriority: boundedTasks.length > 0 ? boundedTasks[0].priority : 0,
      reasonCodes: [...reasons].sort(compareStrings),
      tasks: boundedTasks,
    });
  } catch {
    return failure("PRIORITIZATION_FAILED", "The business state could not be prioritized.");
  }
}

function validateBusinessState(value) {
  if (!isPlainDataObject(value)) {
    return invalid("INVALID_BUSINESS_STATE", "Business state must be a plain data object.");
  }
  if (readData(value, "ok") !== true) {
    return invalid("INVALID_BUSINESS_STATE", "Business state is not successful.");
  }
  const snapshot = readData(value, "snapshot");
  if (!isPlainDataObject(snapshot)) {
    return invalid("INVALID_SNAPSHOT", "Business state does not contain a valid snapshot.");
  }
  const tenantId = readData(snapshot, "tenantId");
  const snapshotId = readData(snapshot, "snapshotId");
  const generatedAt = readData(snapshot, "generatedAt");
  if (!isIdentifier(tenantId) || !isIdentifier(snapshotId)) {
    return invalid("INVALID_SNAPSHOT_IDENTITY", "Snapshot identity is invalid.");
  }
  if (!isCanonicalTimestamp(generatedAt)) {
    return invalid("INVALID_SNAPSHOT_TIMESTAMP", "Snapshot timestamp is invalid.");
  }
  const health = readData(snapshot, "health");
  const coverage = readData(snapshot, "coverage");
  const counts = readData(snapshot, "counts");
  const domains = readData(snapshot, "domains");
  if (!isValidHealth(health) || !isValidCoverage(coverage) || !isValidCounts(counts)) {
    return invalid("INVALID_SNAPSHOT_PROJECTION", "Snapshot projections are invalid.");
  }
  if (!Array.isArray(domains) || domains.length > 32 || !domains.every(isValidDomainProjection)) {
    return invalid("INVALID_DOMAIN_PROJECTION", "Snapshot domain projections are invalid.");
  }
  return { ok: true };
}

function isValidHealth(value) {
  if (!isPlainDataObject(value)) return false;
  return VALID_STATUS.has(readData(value, "overallStatus"))
    && VALID_SEVERITY.has(readData(value, "highestSeverity"))
    && ["attentionRequired", "hasFailures", "hasBlocked", "hasCritical", "coverageComplete"]
      .every((key) => typeof readData(value, key) === "boolean");
}

function isValidCoverage(value) {
  if (!isPlainDataObject(value) || typeof readData(value, "complete") !== "boolean") return false;
  return ["requiredSources", "observedSources", "missingSources"].every((key) => {
    const list = readData(value, key);
    return Array.isArray(list)
      && list.length <= 64
      && list.every((item) => isIdentifier(item, 160));
  });
}

function isValidCounts(value) {
  if (!isPlainDataObject(value)) return false;
  if (!isNonNegativeInteger(readData(value, "total")) || !isNonNegativeInteger(readData(value, "stale"))) {
    return false;
  }
  const byStatus = readData(value, "byStatus");
  return isPlainDataObject(byStatus)
    && [...VALID_STATUS].every((status) => isNonNegativeInteger(readData(byStatus, status)));
}

function isValidDomainProjection(value) {
  if (!isPlainDataObject(value)) return false;
  const domain = readData(value, "domain");
  return isIdentifier(domain, 64)
    && VALID_STATUS.has(readData(value, "status"))
    && VALID_SEVERITY.has(readData(value, "highestSeverity"))
    && isNonNegativeInteger(readData(value, "signalCount"))
    && isNonNegativeInteger(readData(value, "staleCount"));
}

function task({
  planSeed,
  sequence,
  action,
  domain,
  priority,
  riskClass,
  executionMode,
  reasonCode,
  parameters,
}) {
  const taskId = `task_${hashHex(`${planSeed}\n${sequence}\n${action}\n${domain}`)}`;
  return deepFreeze({
    taskId,
    action,
    domain,
    priority,
    riskClass,
    executionMode,
    reasonCode,
    parameters: deepFreeze(cloneJson(parameters)),
  });
}

function priorityForWebsite(status, severity) {
  if (status === "failed" || severity === "critical") return 98;
  if (status === "blocked" || severity === "high") return 92;
  if (status === "degraded") return 78;
  if (status === "attention") return 68;
  return 58;
}

function compareTasks(left, right) {
  if (left.priority !== right.priority) return right.priority - left.priority;
  return compareStrings(left.taskId, right.taskId);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compactTimestamp(value) {
  return value.replace(/[-:.]/gu, "").replace("000Z", "Z").toLowerCase();
}

function hashHex(value) {
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(value);
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
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
  for (const key of keys) {
    if (typeof key !== "string") return false;
    const descriptor = safeDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      return false;
    }
  }
  return true;
}

function readData(value, key) {
  const descriptor = safeDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function safeDescriptor(value, key) {
  try {
    return Object.getOwnPropertyDescriptor(value, key) || null;
  } catch {
    return null;
  }
}

function isIdentifier(value, maximum = MAX_IDENTIFIER_LENGTH) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && IDENTIFIER_PATTERN.test(value);
}

function isCanonicalTimestamp(value) {
  return typeof value === "string"
    && CANONICAL_TIMESTAMP_PATTERN.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function invalid(code, message) {
  return { ok: false, code, message };
}

function failure(code, message) {
  return deepFreeze({
    ok: false,
    build: KAIROS_BUSINESS_PRIORITIZER_BUILD,
    schemaVersion: KAIROS_BUSINESS_PRIORITIZER_SCHEMA_VERSION,
    error: { code, message },
  });
}
