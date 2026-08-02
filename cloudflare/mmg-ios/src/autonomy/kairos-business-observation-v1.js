/**
 * ============================================================================
 * KAIROS BUSINESS OBSERVATION CORE — SLICE 5A
 * DETERMINISTIC BUSINESS OBSERVATION MODULE
 * Organization: Mindset Media Group / The Legacy, LLC
 * ============================================================================
 */

export const KAIROS_BUSINESS_OBSERVATION_BUILD =
  "kairos-business-observation-20260802-1";

export const KAIROS_BUSINESS_OBSERVATION_SCHEMA_VERSION = 1;

export const KAIROS_BUSINESS_DOMAINS = Object.freeze([
  "website",
  "commerce",
  "publishing",
  "customer_operations",
  "creator_growth",
  "revenue",
  "platform",
  "governance",
]);

const STATUS_ORDER = Object.freeze([
  "failed",
  "blocked",
  "degraded",
  "attention",
  "unknown",
  "healthy",
]);

const SEVERITY_ORDER = Object.freeze([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

const ALLOWED_SIGNAL_FIELDS = new Set([
  "signalId",
  "tenantId",
  "observedAt",
  "expiresAt",
  "source",
  "domain",
  "type",
  "status",
  "severity",
  "summary",
  "metrics",
  "labels",
  "references",
]);

const REQUIRED_SIGNAL_FIELDS = Object.freeze([
  "signalId",
  "tenantId",
  "observedAt",
  "source",
  "domain",
  "type",
  "status",
  "severity",
]);

const CANONICAL_SIGNAL_FIELDS = Object.freeze([
  "signalId",
  "tenantId",
  "observedAt",
  "expiresAt",
  "source",
  "domain",
  "type",
  "status",
  "severity",
  "summary",
  "metrics",
  "labels",
  "references",
]);

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/u;
const CANONICAL_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,63}/iu;
const URL_PATTERN = /https?:\/\//iu;
const TOKEN_LIKE_PATTERN = /[a-z0-9._~-]{32,}/iu;
const UNSAFE_SUMMARY_TERMS = Object.freeze([
  "authorization",
  "bearer",
  "api key",
  "api-key",
  "api_key",
  "access token",
  "access-token",
  "access_token",
  "refresh token",
  "refresh-token",
  "refresh_token",
  "auth token",
  "auth-token",
  "auth_token",
  "client secret",
  "client-secret",
  "client_secret",
  "password",
  "credential",
  "cookie",
  "private key",
  "secret key",
]);

const MAX_FUTURE_SKEW_MS = 300_000;
const DEFAULT_WINDOW_MS = 86_400_000;
const MIN_WINDOW_MS = 60_000;
const MAX_WINDOW_MS = 2_592_000_000;
const DEFAULT_RECENT_LIMIT = 20;
const MAX_RECENT_LIMIT = 100;
const MAX_SIGNALS = 1_000;
const MAX_REQUIRED_SOURCES = 32;

export function normalizeBusinessSignal(rawSignal, options = {}) {
  try {
    if (!isPlainObject(rawSignal)) {
      return signalFailure("INVALID_SIGNAL", "Signal must be a plain object.", null);
    }
    const clock = resolveClock(normalizeLooseOptions(options));
    if (!clock.ok) return signalFailure("INVALID_CLOCK", "The observation clock is invalid.", null);
    return normalizeSignalAt(rawSignal, clock.now, false);
  } catch {
    return signalFailure("INVALID_SIGNAL", "Signal validation failed.", null);
  }
}

export function projectBusinessSignal(signal, options = {}) {
  try {
    if (!isPlainObject(signal)) return null;
    const clock = resolveClock(normalizeLooseOptions(options));
    if (!clock.ok) return null;
    const normalized = normalizeSignalAt(signal, clock.now, true);
    if (!normalized.valid) return null;
    return projectSignalAt(normalized.signal, clock.now);
  } catch {
    return null;
  }
}

export function buildBusinessStateSnapshot(rawSignals, options = {}) {
  try {
    if (!Array.isArray(rawSignals)) {
      return snapshotFailure("INVALID_SIGNAL_COLLECTION", "Signals must be provided as an array.", null, null);
    }
    if (rawSignals.length > MAX_SIGNALS) {
      return snapshotFailure("SIGNAL_COLLECTION_TOO_LARGE", "The signal collection exceeds the supported limit.", null, null);
    }
    if (!isPlainObject(options)) {
      return snapshotFailure("INVALID_OPTIONS", "Snapshot options must be a plain object.", "options", null);
    }

    const tenantIdRead = readOwnDataProperty(options, "tenantId", true);
    if (!tenantIdRead.ok || !isValidIdentifier(tenantIdRead.value, 256)) {
      return snapshotFailure("INVALID_TENANT_ID", "A valid tenantId is required.", "tenantId", null);
    }
    const tenantId = tenantIdRead.value;

    const windowRead = readOwnDataProperty(options, "windowMs", false);
    if (!windowRead.ok) {
      return snapshotFailure("INVALID_WINDOW_MS", "windowMs is invalid.", "windowMs", null);
    }
    const windowMs = windowRead.present ? windowRead.value : DEFAULT_WINDOW_MS;
    if (!Number.isInteger(windowMs) || windowMs < MIN_WINDOW_MS || windowMs > MAX_WINDOW_MS) {
      return snapshotFailure("INVALID_WINDOW_MS", "windowMs is invalid.", "windowMs", null);
    }

    const recentRead = readOwnDataProperty(options, "recentLimit", false);
    if (!recentRead.ok) {
      return snapshotFailure("INVALID_RECENT_LIMIT", "recentLimit is invalid.", "recentLimit", null);
    }
    const recentLimit = recentRead.present ? recentRead.value : DEFAULT_RECENT_LIMIT;
    if (!Number.isInteger(recentLimit) || recentLimit < 1 || recentLimit > MAX_RECENT_LIMIT) {
      return snapshotFailure("INVALID_RECENT_LIMIT", "recentLimit is invalid.", "recentLimit", null);
    }

    const sourcesRead = readOwnDataProperty(options, "requiredSources", false);
    if (!sourcesRead.ok) {
      return snapshotFailure("INVALID_REQUIRED_SOURCES", "requiredSources is invalid.", "requiredSources", null);
    }
    const requiredSourcesResult = normalizeRequiredSources(
      sourcesRead.present ? sourcesRead.value : [],
    );
    if (!requiredSourcesResult.ok) {
      return snapshotFailure("INVALID_REQUIRED_SOURCES", "requiredSources is invalid.", "requiredSources", null);
    }
    const requiredSources = requiredSourcesResult.sources;

    const clock = resolveClock(options);
    if (!clock.ok) {
      return snapshotFailure("INVALID_CLOCK", "The snapshot clock is invalid.", "now", null);
    }
    const now = clock.now;
    const nowMs = now.getTime();
    const generatedAt = now.toISOString();
    const windowStartMs = nowMs - windowMs;
    const windowStart = new Date(windowStartMs).toISOString();

    const normalizedSignals = [];
    const seenSignalIds = new Set();
    for (let index = 0; index < rawSignals.length; index += 1) {
      const normalized = normalizeSignalAt(rawSignals[index], now, false);
      if (!normalized.valid) {
        return snapshotFailure(
          normalized.code,
          normalized.error,
          normalized.field,
          index,
        );
      }
      const signal = normalized.signal;
      if (signal.tenantId !== tenantId) {
        return snapshotFailure("TENANT_MISMATCH", "A signal belongs to a different tenant.", "tenantId", index);
      }
      if (seenSignalIds.has(signal.signalId)) {
        return snapshotFailure("DUPLICATE_SIGNAL_ID", "Duplicate signal identifiers are not allowed.", "signalId", index);
      }
      seenSignalIds.add(signal.signalId);
      normalizedSignals.push(signal);
    }

    const includedSignals = [];
    let excludedOutOfWindowCount = 0;
    const latestAllowedMs = nowMs + MAX_FUTURE_SKEW_MS;
    for (const signal of normalizedSignals) {
      const observedMs = Date.parse(signal.observedAt);
      if (observedMs >= windowStartMs && observedMs <= latestAllowedMs) {
        includedSignals.push(signal);
      } else {
        excludedOutOfWindowCount += 1;
      }
    }

    includedSignals.sort(compareSignals);

    const byDomain = createZeroCounts(KAIROS_BUSINESS_DOMAINS);
    const byStatus = createZeroCounts(STATUS_ORDER);
    const bySeverity = createZeroCounts(SEVERITY_ORDER);
    const domainSignals = new Map(KAIROS_BUSINESS_DOMAINS.map((domain) => [domain, []]));
    const sourceSignals = new Map();
    let staleCount = 0;

    for (const signal of includedSignals) {
      byDomain[signal.domain] += 1;
      byStatus[signal.status] += 1;
      bySeverity[signal.severity] += 1;
      domainSignals.get(signal.domain).push(signal);
      if (!sourceSignals.has(signal.source)) sourceSignals.set(signal.source, []);
      sourceSignals.get(signal.source).push(signal);
      if (isStale(signal, nowMs)) staleCount += 1;
    }

    const observedSources = [...sourceSignals.keys()].sort(compareStrings);
    const missingSources = requiredSources.filter((source) => !sourceSignals.has(source));
    const coverageComplete = missingSources.length === 0;

    const coverage = {
      requiredSources: [...requiredSources],
      observedSources,
      missingSources,
      complete: coverageComplete,
    };

    const domains = KAIROS_BUSINESS_DOMAINS.map((domain) => {
      const signals = domainSignals.get(domain);
      const statusCounts = createZeroCounts(STATUS_ORDER);
      const severityCounts = createZeroCounts(SEVERITY_ORDER);
      let domainStale = 0;
      for (const signal of signals) {
        statusCounts[signal.status] += 1;
        severityCounts[signal.severity] += 1;
        if (isStale(signal, nowMs)) domainStale += 1;
      }
      const latest = signals.length > 0 ? signals[0] : null;
      return {
        domain,
        signalCount: signals.length,
        staleCount: domainStale,
        status: signals.length > 0 ? worstPresent(STATUS_ORDER, statusCounts, "unknown") : "unknown",
        highestSeverity: signals.length > 0 ? worstPresent(SEVERITY_ORDER, severityCounts, "info") : "info",
        latestObservedAt: latest ? latest.observedAt : null,
        statusCounts,
        severityCounts,
        latestSignal: latest ? projectSignalAt(latest, now) : null,
      };
    });

    const sources = observedSources.map((source) => {
      const signals = sourceSignals.get(source);
      let sourceStale = 0;
      for (const signal of signals) {
        if (isStale(signal, nowMs)) sourceStale += 1;
      }
      return {
        source,
        signalCount: signals.length,
        staleCount: sourceStale,
        latestObservedAt: signals[0].observedAt,
      };
    });

    const overallStatus = includedSignals.length > 0
      ? worstPresent(STATUS_ORDER, byStatus, "unknown")
      : "unknown";
    const highestSeverity = includedSignals.length > 0
      ? worstPresent(SEVERITY_ORDER, bySeverity, "info")
      : "info";

    const counts = {
      total: includedSignals.length,
      stale: staleCount,
      byDomain,
      byStatus,
      bySeverity,
    };

    const health = {
      overallStatus,
      highestSeverity,
      attentionRequired: overallStatus !== "healthy" || staleCount > 0 || !coverageComplete,
      hasFailures: byStatus.failed > 0,
      hasBlocked: byStatus.blocked > 0,
      hasCritical: bySeverity.critical > 0,
      coverageComplete,
    };

    const recent = includedSignals
      .slice(0, recentLimit)
      .map((signal) => projectSignalAt(signal, now));

    const snapshotId = createSnapshotId(
      tenantId,
      generatedAt,
      windowMs,
      includedSignals,
    );

    return deepFreeze({
      ok: true,
      build: KAIROS_BUSINESS_OBSERVATION_BUILD,
      schemaVersion: KAIROS_BUSINESS_OBSERVATION_SCHEMA_VERSION,
      snapshotId,
      tenantId,
      generatedAt,
      window: {
        start: windowStart,
        end: generatedAt,
        durationMs: windowMs,
      },
      inputCount: rawSignals.length,
      includedCount: includedSignals.length,
      excludedOutOfWindowCount,
      counts,
      health,
      coverage,
      domains,
      sources,
      recent,
    });
  } catch {
    return snapshotFailure("INVALID_SIGNAL", "Snapshot validation failed.", null, null);
  }
}

function normalizeSignalAt(rawSignal, now, requireCanonical) {
  if (!isPlainObject(rawSignal)) {
    return signalFailure("INVALID_SIGNAL", "Signal must be a plain object.", null);
  }

  const shape = inspectSignalShape(rawSignal, requireCanonical);
  if (!shape.ok) return shape.failure;

  const signalId = shape.values.signalId;
  if (!isValidIdentifier(signalId, 256)) {
    return signalFailure("INVALID_SIGNAL_ID", "signalId is invalid.", "signalId");
  }
  const tenantId = shape.values.tenantId;
  if (!isValidIdentifier(tenantId, 256)) {
    return signalFailure("INVALID_TENANT_ID", "tenantId is invalid.", "tenantId");
  }
  const source = shape.values.source;
  if (!isValidIdentifier(source, 160)) {
    return signalFailure("INVALID_SOURCE", "source is invalid.", "source");
  }
  const type = shape.values.type;
  if (!isValidIdentifier(type, 160)) {
    return signalFailure("INVALID_TYPE", "type is invalid.", "type");
  }
  const domain = shape.values.domain;
  if (typeof domain !== "string" || !KAIROS_BUSINESS_DOMAINS.includes(domain)) {
    return signalFailure("INVALID_DOMAIN", "domain is invalid.", "domain");
  }
  const status = shape.values.status;
  if (typeof status !== "string" || !STATUS_ORDER.includes(status)) {
    return signalFailure("INVALID_STATUS", "status is invalid.", "status");
  }
  const severity = shape.values.severity;
  if (typeof severity !== "string" || !SEVERITY_ORDER.includes(severity)) {
    return signalFailure("INVALID_SEVERITY", "severity is invalid.", "severity");
  }

  const observed = validateCanonicalTimestamp(shape.values.observedAt);
  if (!observed.ok) {
    return signalFailure("INVALID_OBSERVED_AT", "observedAt is invalid.", "observedAt");
  }
  if (observed.ms > now.getTime() + MAX_FUTURE_SKEW_MS) {
    return signalFailure("OBSERVED_AT_IN_FUTURE", "observedAt exceeds the allowed future skew.", "observedAt");
  }

  let expiresAt = null;
  if (shape.present.expiresAt) {
    if (shape.values.expiresAt === null) {
      expiresAt = null;
    } else {
      const expires = validateCanonicalTimestamp(shape.values.expiresAt);
      if (!expires.ok || expires.ms < observed.ms) {
        return signalFailure("INVALID_EXPIRES_AT", "expiresAt is invalid.", "expiresAt");
      }
      expiresAt = shape.values.expiresAt;
    }
  } else if (requireCanonical) {
    return signalFailure("INVALID_EXPIRES_AT", "expiresAt is required in a normalized signal.", "expiresAt");
  }

  const summary = validateSummary(shape.present.summary, shape.values.summary);
  if (!summary.ok) return signalFailure(summary.code, summary.message, "summary");

  const metrics = validateMetrics(shape.present.metrics, shape.values.metrics, requireCanonical);
  if (!metrics.ok) return signalFailure("INVALID_METRICS", "metrics is invalid.", "metrics");

  const labels = validateLabels(shape.present.labels, shape.values.labels, requireCanonical);
  if (!labels.ok) return signalFailure("INVALID_LABELS", "labels is invalid.", "labels");

  const references = validateReferences(shape.present.references, shape.values.references, requireCanonical);
  if (!references.ok) return signalFailure("INVALID_REFERENCES", "references is invalid.", "references");

  const signal = deepFreeze({
    signalId,
    tenantId,
    observedAt: shape.values.observedAt,
    expiresAt,
    source,
    domain,
    type,
    status,
    severity,
    summary: summary.value,
    metrics: metrics.value,
    labels: labels.value,
    references: references.value,
  });

  return deepFreeze({
    valid: true,
    build: KAIROS_BUSINESS_OBSERVATION_BUILD,
    schemaVersion: KAIROS_BUSINESS_OBSERVATION_SCHEMA_VERSION,
    signal,
  });
}

function inspectSignalShape(rawSignal, requireCanonical) {
  let keys;
  try {
    keys = Reflect.ownKeys(rawSignal);
  } catch {
    return { ok: false, failure: signalFailure("INVALID_SIGNAL", "Signal shape is invalid.", null) };
  }

  const expectedCount = requireCanonical ? CANONICAL_SIGNAL_FIELDS.length : null;
  if (requireCanonical && keys.length !== expectedCount) {
    return { ok: false, failure: signalFailure("INVALID_SIGNAL", "Normalized signal shape is invalid.", null) };
  }

  const values = Object.create(null);
  const present = Object.create(null);
  for (const key of keys) {
    if (typeof key !== "string" || !ALLOWED_SIGNAL_FIELDS.has(key)) {
      return {
        ok: false,
        failure: signalFailure(
          "UNKNOWN_SIGNAL_FIELD",
          "Signal contains an unsupported field.",
          typeof key === "string" ? key : null,
        ),
      };
    }
    const descriptor = safeOwnPropertyDescriptor(rawSignal, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      return { ok: false, failure: signalFailure("INVALID_SIGNAL", "Signal fields must be enumerable data properties.", key) };
    }
    present[key] = true;
    values[key] = descriptor.value;
  }

  const required = requireCanonical ? CANONICAL_SIGNAL_FIELDS : REQUIRED_SIGNAL_FIELDS;
  for (const field of required) {
    if (!present[field]) {
      return { ok: false, failure: signalFailure("INVALID_SIGNAL", "A required signal field is missing.", field) };
    }
  }

  return { ok: true, values, present };
}

function validateSummary(present, value) {
  if (!present) return { ok: true, value: null };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 280) {
    return { ok: false, code: "INVALID_SUMMARY", message: "summary is invalid." };
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) {
      return { ok: false, code: "INVALID_SUMMARY", message: "summary is invalid." };
    }
  }
  const lower = value.toLowerCase();
  if (
    UNSAFE_SUMMARY_TERMS.some((term) => lower.includes(term))
    || EMAIL_PATTERN.test(value)
    || URL_PATTERN.test(value)
    || TOKEN_LIKE_PATTERN.test(value)
  ) {
    return { ok: false, code: "UNSAFE_SUMMARY", message: "summary contains unsafe content." };
  }
  return { ok: true, value };
}

function validateMetrics(present, value, requireCanonical) {
  if (!present) {
    return requireCanonical ? { ok: false } : { ok: true, value: {} };
  }
  if (!isPlainObject(value)) return { ok: false };
  const inspected = inspectEnumerableDataObject(value, 16);
  if (!inspected.ok) return { ok: false };
  const output = {};
  const entries = inspected.entries.sort(([left], [right]) => compareStrings(left, right));
  for (const [key, metric] of entries) {
    if (!isValidIdentifier(key, 64)) return { ok: false };
    if (metric === null || typeof metric === "boolean") {
      output[key] = metric;
      continue;
    }
    if (typeof metric === "number" && Number.isFinite(metric)) {
      output[key] = metric;
      continue;
    }
    return { ok: false };
  }
  return { ok: true, value: output };
}

function validateLabels(present, value, requireCanonical) {
  if (!present) {
    return requireCanonical ? { ok: false } : { ok: true, value: [] };
  }
  if (!Array.isArray(value) || value.length > 16 || !hasCanonicalArrayShape(value)) return { ok: false };
  const output = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = safeOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")) return { ok: false };
    const label = descriptor.value;
    if (!isValidIdentifier(label, 64) || seen.has(label)) return { ok: false };
    seen.add(label);
    output.push(label);
  }
  output.sort(compareStrings);
  return { ok: true, value: output };
}

function validateReferences(present, value, requireCanonical) {
  if (!present) {
    return requireCanonical ? { ok: false } : { ok: true, value: [] };
  }
  if (!Array.isArray(value) || value.length > 16 || !hasCanonicalArrayShape(value)) return { ok: false };
  const output = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const itemDescriptor = safeOwnPropertyDescriptor(value, String(index));
    if (!itemDescriptor || !Object.hasOwn(itemDescriptor, "value")) return { ok: false };
    const reference = itemDescriptor.value;
    if (!isPlainObject(reference)) return { ok: false };
    let keys;
    try {
      keys = Reflect.ownKeys(reference);
    } catch {
      return { ok: false };
    }
    if (keys.length !== 2 || !keys.includes("kind") || !keys.includes("id")) return { ok: false };
    if (keys.some((key) => typeof key !== "string")) return { ok: false };
    const kindDescriptor = safeOwnPropertyDescriptor(reference, "kind");
    const idDescriptor = safeOwnPropertyDescriptor(reference, "id");
    if (
      !kindDescriptor
      || !idDescriptor
      || !Object.hasOwn(kindDescriptor, "value")
      || !Object.hasOwn(idDescriptor, "value")
      || kindDescriptor.enumerable !== true
      || idDescriptor.enumerable !== true
    ) {
      return { ok: false };
    }
    const kind = kindDescriptor.value;
    const id = idDescriptor.value;
    if (!isValidIdentifier(kind, 64) || !isValidIdentifier(id, 256)) return { ok: false };
    const pair = `${kind}\u001f${id}`;
    if (seen.has(pair)) return { ok: false };
    seen.add(pair);
    output.push({ kind, id });
  }
  output.sort((left, right) => compareStrings(left.kind, right.kind) || compareStrings(left.id, right.id));
  return { ok: true, value: output };
}

function inspectEnumerableDataObject(value, maxEntries) {
  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return { ok: false };
  }
  if (keys.length > maxEntries) return { ok: false };
  const entries = [];
  for (const key of keys) {
    if (typeof key !== "string") return { ok: false };
    const descriptor = safeOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      return { ok: false };
    }
    entries.push([key, descriptor.value]);
  }
  return { ok: true, entries };
}

function projectSignalAt(signal, now) {
  return deepFreeze({
    signalId: signal.signalId,
    tenantId: signal.tenantId,
    observedAt: signal.observedAt,
    expiresAt: signal.expiresAt,
    source: signal.source,
    domain: signal.domain,
    type: signal.type,
    status: signal.status,
    severity: signal.severity,
    summary: signal.summary,
    metrics: clonePlainRecord(signal.metrics),
    labels: [...signal.labels],
    references: signal.references.map((reference) => ({ kind: reference.kind, id: reference.id })),
    stale: isStale(signal, now.getTime()),
  });
}

function normalizeRequiredSources(value) {
  if (!Array.isArray(value) || value.length > MAX_REQUIRED_SOURCES || !hasCanonicalArrayShape(value)) return { ok: false };
  const output = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = safeOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")) return { ok: false };
    const source = descriptor.value;
    if (!isValidIdentifier(source, 160) || seen.has(source)) return { ok: false };
    seen.add(source);
    output.push(source);
  }
  output.sort(compareStrings);
  return { ok: true, sources: output };
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
  return keys.every((key) => key === "length" || (typeof key === "string" && /^(0|[1-9]\d*)$/u.test(key) && Number(key) < value.length));
}

function resolveClock(options) {
  const nowRead = readOwnDataProperty(options, "now", false);
  if (!nowRead.ok) return { ok: false };
  if (!nowRead.present) return { ok: true, now: new Date() };
  const candidate = nowRead.value;
  if (isValidDate(candidate)) return { ok: true, now: new Date(candidate.getTime()) };
  if (typeof candidate !== "function") return { ok: false };
  let result;
  try {
    result = candidate();
  } catch {
    return { ok: false };
  }
  if (!isValidDate(result)) return { ok: false };
  return { ok: true, now: new Date(result.getTime()) };
}

function normalizeLooseOptions(options) {
  return isPlainObject(options) ? options : {};
}

function readOwnDataProperty(object, key, required) {
  const descriptor = safeOwnPropertyDescriptor(object, key);
  if (!descriptor) return required ? { ok: false, present: false } : { ok: true, present: false };
  if (!Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
    return { ok: false, present: true };
  }
  return { ok: true, present: true, value: descriptor.value };
}

function validateCanonicalTimestamp(value) {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP_PATTERN.test(value)) return { ok: false };
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return { ok: false };
  try {
    if (new Date(ms).toISOString() !== value) return { ok: false };
  } catch {
    return { ok: false };
  }
  return { ok: true, ms };
}

function isValidIdentifier(value, maxLength) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value === value.trim()
    && IDENTIFIER_PATTERN.test(value);
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
  return value instanceof Date && Number.isFinite(value.getTime());
}

function safeOwnPropertyDescriptor(value, key) {
  try {
    return Object.getOwnPropertyDescriptor(value, key) || null;
  } catch {
    return null;
  }
}

function clonePlainRecord(record) {
  const output = {};
  for (const key of Object.keys(record)) output[key] = record[key];
  return output;
}

function isStale(signal, nowMs) {
  return signal.expiresAt !== null && Date.parse(signal.expiresAt) <= nowMs;
}

function createZeroCounts(keys) {
  const output = {};
  for (const key of keys) output[key] = 0;
  return output;
}

function worstPresent(order, counts, fallback) {
  for (const value of order) {
    if (counts[value] > 0) return value;
  }
  return fallback;
}

function compareSignals(left, right) {
  if (left.observedAt > right.observedAt) return -1;
  if (left.observedAt < right.observedAt) return 1;
  return compareStrings(left.signalId, right.signalId);
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function createSnapshotId(tenantId, generatedAt, windowMs, signals) {
  const tuples = signals.map((signal) => [
    signal.signalId,
    signal.observedAt,
    signal.source,
    signal.domain,
    signal.type,
    signal.status,
    signal.severity,
    signal.expiresAt || "",
  ].join("\u001f"));
  const canonical = `${tenantId}|${generatedAt}|${String(windowMs)}|${tuples.join("\u001e")}`;
  const compactTimestamp = `${generatedAt.slice(0, 10).replace(/-/gu, "")}T${generatedAt.slice(11, 19).replace(/:/gu, "")}Z`;
  return `bss_${compactTimestamp}_${fnv1a32(canonical)}`;
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function signalFailure(code, error, field) {
  return deepFreeze({
    valid: false,
    build: KAIROS_BUSINESS_OBSERVATION_BUILD,
    schemaVersion: KAIROS_BUSINESS_OBSERVATION_SCHEMA_VERSION,
    code,
    error,
    field,
  });
}

function snapshotFailure(code, message, field, index) {
  return deepFreeze({
    ok: false,
    build: KAIROS_BUSINESS_OBSERVATION_BUILD,
    schemaVersion: KAIROS_BUSINESS_OBSERVATION_SCHEMA_VERSION,
    error: {
      code,
      message,
      field,
      index,
    },
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, "value")) deepFreeze(descriptor.value);
  }
  return Object.freeze(value);
}
