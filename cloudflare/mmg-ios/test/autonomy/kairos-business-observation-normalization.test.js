import test from "node:test";
import assert from "node:assert/strict";

import {
  KAIROS_BUSINESS_OBSERVATION_BUILD,
  KAIROS_BUSINESS_OBSERVATION_SCHEMA_VERSION,
  KAIROS_BUSINESS_DOMAINS,
  normalizeBusinessSignal,
  projectBusinessSignal,
} from "../../src/autonomy/kairos-business-observation-v1.js";

const NOW = new Date("2026-08-02T19:00:00.000Z");

function rawSignal(overrides = {}) {
  return {
    signalId: "sig_website_health_001",
    tenantId: "mmg",
    observedAt: "2026-08-02T18:59:00.000Z",
    expiresAt: "2026-08-02T19:04:00.000Z",
    source: "website.monitor",
    domain: "website",
    type: "website.health",
    status: "healthy",
    severity: "info",
    summary: "Website health checks completed normally.",
    metrics: { status_code: 200, reachable: true, response_ms: 142 },
    labels: ["production", "website"],
    references: [{ kind: "workflow", id: "website.health.v1" }],
    ...overrides,
  };
}

function mutableCanonicalSignal(overrides = {}) {
  const normalized = normalizeBusinessSignal(rawSignal(), { now: NOW }).signal;
  return {
    signalId: normalized.signalId,
    tenantId: normalized.tenantId,
    observedAt: normalized.observedAt,
    expiresAt: normalized.expiresAt,
    source: normalized.source,
    domain: normalized.domain,
    type: normalized.type,
    status: normalized.status,
    severity: normalized.severity,
    summary: normalized.summary,
    metrics: { ...normalized.metrics },
    labels: [...normalized.labels],
    references: normalized.references.map((reference) => ({ ...reference })),
    ...overrides,
  };
}

function isDeepFrozen(value, seen = new WeakSet()) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, "value") && !isDeepFrozen(descriptor.value, seen)) return false;
  }
  return true;
}

test("exports the exact observation contract", () => {
  assert.equal(KAIROS_BUSINESS_OBSERVATION_BUILD, "kairos-business-observation-20260802-1");
  assert.equal(KAIROS_BUSINESS_OBSERVATION_SCHEMA_VERSION, 1);
  assert.deepEqual(KAIROS_BUSINESS_DOMAINS, [
    "website",
    "commerce",
    "publishing",
    "customer_operations",
    "creator_growth",
    "revenue",
    "platform",
    "governance",
  ]);
  assert.equal(Object.isFrozen(KAIROS_BUSINESS_DOMAINS), true);
});

test("normalizes, clones, and deeply freezes a valid signal", () => {
  const input = rawSignal();
  const result = normalizeBusinessSignal(input, { now: NOW });
  assert.equal(result.valid, true);
  assert.deepEqual(Object.keys(result).sort(), ["build", "schemaVersion", "signal", "valid"]);
  assert.deepEqual(Object.keys(result.signal).sort(), [
    "domain", "expiresAt", "labels", "metrics", "observedAt", "references",
    "severity", "signalId", "source", "status", "summary", "tenantId", "type",
  ]);
  assert.equal(isDeepFrozen(result), true);
  assert.notEqual(result.signal.metrics, input.metrics);
  assert.notEqual(result.signal.labels, input.labels);
  assert.notEqual(result.signal.references, input.references);
  assert.notEqual(result.signal.references[0], input.references[0]);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.metrics), false);
});

test("accepts null-prototype signal and nested metrics objects", () => {
  const signal = Object.assign(Object.create(null), rawSignal());
  signal.metrics = Object.assign(Object.create(null), { count: 1 });
  const result = normalizeBusinessSignal(signal, { now: NOW });
  assert.equal(result.valid, true);
  assert.equal(result.signal.metrics.count, 1);
});

for (const [name, value] of [
  ["null", null],
  ["string", "signal"],
  ["number", 1],
  ["array", []],
  ["class instance", new (class Signal {})()],
]) {
  test(`rejects ${name} signal input`, () => {
    const result = normalizeBusinessSignal(value, { now: NOW });
    assert.equal(result.valid, false);
    assert.equal(result.code, "INVALID_SIGNAL");
    assert.equal(isDeepFrozen(result), true);
  });
}

for (const field of ["signalId", "tenantId", "observedAt", "source", "domain", "type", "status", "severity"]) {
  test(`rejects missing required field ${field}`, () => {
    const signal = rawSignal();
    delete signal[field];
    const result = normalizeBusinessSignal(signal, { now: NOW });
    assert.equal(result.valid, false);
    assert.equal(result.field, field);
  });
}

test("rejects enumerable, non-enumerable, and symbol unknown fields without leaking values", () => {
  for (const mode of ["enumerable", "hidden", "symbol"]) {
    const signal = rawSignal();
    const marker = `secret-${mode}`;
    if (mode === "enumerable") signal.unknown = marker;
    if (mode === "hidden") Object.defineProperty(signal, "unknown", { value: marker });
    if (mode === "symbol") signal[Symbol("unknown")] = marker;
    const result = normalizeBusinessSignal(signal, { now: NOW });
    assert.equal(result.valid, false);
    assert.equal(result.code, "UNKNOWN_SIGNAL_FIELD");
    assert.equal(JSON.stringify(result).includes(marker), false);
  }
});

test("rejects accessors without invoking them", () => {
  for (const field of ["signalId", "summary", "metrics"]) {
    let calls = 0;
    const signal = rawSignal();
    Object.defineProperty(signal, field, {
      enumerable: true,
      get() {
        calls += 1;
        return "unsafe";
      },
    });
    const result = normalizeBusinessSignal(signal, { now: NOW });
    assert.equal(result.valid, false);
    assert.equal(calls, 0);
  }
});

test("handles loose options without throwing", () => {
  assert.doesNotThrow(() => normalizeBusinessSignal(rawSignal(), null));
  assert.doesNotThrow(() => normalizeBusinessSignal(rawSignal(), []));
});

test("uses Date clocks and calls clock functions exactly once", () => {
  const direct = new Date(NOW.getTime());
  assert.equal(normalizeBusinessSignal(rawSignal(), { now: direct }).valid, true);
  assert.equal(direct.getTime(), NOW.getTime());

  let calls = 0;
  const returned = new Date(NOW.getTime());
  const result = normalizeBusinessSignal(rawSignal(), {
    now() {
      calls += 1;
      return returned;
    },
  });
  assert.equal(result.valid, true);
  assert.equal(calls, 1);
  assert.equal(returned.getTime(), NOW.getTime());
});

for (const invalidClock of [
  "2026-08-02T19:00:00.000Z",
  NOW.getTime(),
  new Date(Number.NaN),
  () => "2026-08-02T19:00:00.000Z",
  () => NOW.getTime(),
  () => new Date(Number.NaN),
  () => { throw new Error("clock"); },
]) {
  test("rejects an invalid observation clock", () => {
    const result = normalizeBusinessSignal(rawSignal(), { now: invalidClock });
    assert.equal(result.valid, false);
    assert.equal(result.code, "INVALID_CLOCK");
  });
}

for (const invalid of [
  "", " signal", "signal ", "signal id", "SIGNAL", "signal/id", "signal\\id",
  "signal|id", "signal\u0000id", "_signal", "-signal", "a".repeat(257), 123,
]) {
  test(`rejects invalid signal identifier ${String(invalid).slice(0, 20)}`, () => {
    const result = normalizeBusinessSignal(rawSignal({ signalId: invalid }), { now: NOW });
    assert.equal(result.valid, false);
    assert.equal(result.code, "INVALID_SIGNAL_ID");
  });
}

test("accepts valid identifier punctuation and constructor collision key", () => {
  for (const source of ["a.b", "a_b", "a-b", "a:b", "constructor"]) {
    assert.equal(normalizeBusinessSignal(rawSignal({ source }), { now: NOW }).valid, true);
  }
  assert.equal(normalizeBusinessSignal(rawSignal({ source: "toString" }), { now: NOW }).valid, false);
  assert.equal(normalizeBusinessSignal(rawSignal({ source: "hasOwnProperty" }), { now: NOW }).valid, false);
});

test("accepts only certified domains, statuses, and severities", () => {
  for (const domain of KAIROS_BUSINESS_DOMAINS) {
    assert.equal(normalizeBusinessSignal(rawSignal({ domain }), { now: NOW }).valid, true);
  }
  for (const status of ["failed", "blocked", "degraded", "attention", "unknown", "healthy"]) {
    assert.equal(normalizeBusinessSignal(rawSignal({ status }), { now: NOW }).valid, true);
  }
  for (const severity of ["critical", "high", "medium", "low", "info"]) {
    assert.equal(normalizeBusinessSignal(rawSignal({ severity }), { now: NOW }).valid, true);
  }
  assert.equal(normalizeBusinessSignal(rawSignal({ domain: "finance" }), { now: NOW }).code, "INVALID_DOMAIN");
  assert.equal(normalizeBusinessSignal(rawSignal({ status: "HEALTHY" }), { now: NOW }).code, "INVALID_STATUS");
  assert.equal(normalizeBusinessSignal(rawSignal({ severity: "INFO" }), { now: NOW }).code, "INVALID_SEVERITY");
});

test("enforces canonical timestamps and future skew", () => {
  assert.equal(normalizeBusinessSignal(rawSignal(), { now: NOW }).valid, true);
  for (const observedAt of [
    new Date("2026-08-02T18:59:00.000Z"),
    1,
    "2026-08-02T18:59:00Z",
    "2026-08-02T18:59:00.000+00:00",
    "2026-08-02 18:59:00.000Z",
    "not-a-date",
  ]) {
    assert.equal(normalizeBusinessSignal(rawSignal({ observedAt }), { now: NOW }).code, "INVALID_OBSERVED_AT");
  }
  const exactSkew = new Date(NOW.getTime() + 300_000).toISOString();
  assert.equal(normalizeBusinessSignal(rawSignal({ observedAt: exactSkew, expiresAt: exactSkew }), { now: NOW }).valid, true);
  const excessiveSkew = new Date(NOW.getTime() + 300_001).toISOString();
  assert.equal(normalizeBusinessSignal(rawSignal({ observedAt: excessiveSkew }), { now: NOW }).code, "OBSERVED_AT_IN_FUTURE");
});

test("normalizes omitted nullable fields and rejects malformed expiry", () => {
  const omitted = rawSignal();
  delete omitted.expiresAt;
  delete omitted.summary;
  const result = normalizeBusinessSignal(omitted, { now: NOW });
  assert.equal(result.signal.expiresAt, null);
  assert.equal(result.signal.summary, null);
  assert.equal(normalizeBusinessSignal(rawSignal({ expiresAt: null }), { now: NOW }).valid, true);
  assert.equal(normalizeBusinessSignal(rawSignal({ expiresAt: undefined }), { now: NOW }).code, "INVALID_EXPIRES_AT");
  assert.equal(normalizeBusinessSignal(rawSignal({ expiresAt: "2026-08-02T18:58:00.000Z" }), { now: NOW }).code, "INVALID_EXPIRES_AT");
});

test("rejects unsafe summaries and never echoes them", () => {
  const unsafe = [
    "Authorization header found", "Bearer token present", "api_key exposed", "password invalid",
    "credential found", "cookie set", "private key exposed", "secret key exposed",
    "person@example.museum", "https://example.com", "abcdef0123456789abcdef0123456789",
    "abc.def.0123456789abcdef0123456789",
  ];
  for (const summary of unsafe) {
    const result = normalizeBusinessSignal(rawSignal({ summary }), { now: NOW });
    assert.equal(result.valid, false);
    assert.equal(result.code, "UNSAFE_SUMMARY");
    assert.equal(JSON.stringify(result).includes(summary), false);
  }
});

test("rejects invalid summary formatting and controls", () => {
  for (const summary of ["", "   ", " leading", "trailing ", "a".repeat(281), "nul\u0000", "del\u007f", "c1\u0080", "line\u2028separator"]) {
    const result = normalizeBusinessSignal(rawSignal({ summary }), { now: NOW });
    assert.equal(result.valid, false);
    assert.equal(result.code, "INVALID_SUMMARY");
  }
});

test("normalizes valid metrics and rejects unsafe metric values", () => {
  const omitted = rawSignal();
  delete omitted.metrics;
  assert.deepEqual(normalizeBusinessSignal(omitted, { now: NOW }).signal.metrics, {});
  assert.equal(normalizeBusinessSignal(rawSignal({ metrics: { constructor: 1 } }), { now: NOW }).valid, true);
  for (const value of ["1", [], {}, Number.NaN, Infinity, -Infinity, 1n, undefined, Symbol("x")]) {
    assert.equal(normalizeBusinessSignal(rawSignal({ metrics: { value } }), { now: NOW }).code, "INVALID_METRICS");
  }
  let calls = 0;
  const fn = () => { calls += 1; };
  assert.equal(normalizeBusinessSignal(rawSignal({ metrics: { value: fn } }), { now: NOW }).code, "INVALID_METRICS");
  assert.equal(calls, 0);
  assert.equal(normalizeBusinessSignal(rawSignal({ metrics: null }), { now: NOW }).code, "INVALID_METRICS");
  assert.equal(normalizeBusinessSignal(rawSignal({ metrics: undefined }), { now: NOW }).code, "INVALID_METRICS");
});

test("bounds and sorts labels without mutating caller arrays", () => {
  const labels = ["zeta", "alpha"];
  const result = normalizeBusinessSignal(rawSignal({ labels }), { now: NOW });
  assert.deepEqual(result.signal.labels, ["alpha", "zeta"]);
  assert.deepEqual(labels, ["zeta", "alpha"]);
  assert.equal(normalizeBusinessSignal(rawSignal({ labels: ["same", "same"] }), { now: NOW }).code, "INVALID_LABELS");
  assert.equal(normalizeBusinessSignal(rawSignal({ labels: null }), { now: NOW }).code, "INVALID_LABELS");
  const tooMany = Array.from({ length: 17 }, (_, index) => `label${index}`);
  assert.equal(normalizeBusinessSignal(rawSignal({ labels: tooMany }), { now: NOW }).code, "INVALID_LABELS");
});

test("validates, sorts, and clones references", () => {
  const references = [
    { kind: "workflow", id: "z" },
    { kind: "asset", id: "a" },
  ];
  const result = normalizeBusinessSignal(rawSignal({ references }), { now: NOW });
  assert.deepEqual(result.signal.references, [
    { kind: "asset", id: "a" },
    { kind: "workflow", id: "z" },
  ]);
  assert.notEqual(result.signal.references[0], references[1]);
  assert.equal(normalizeBusinessSignal(rawSignal({ references: [{ kind: "workflow", id: "a", extra: 1 }] }), { now: NOW }).code, "INVALID_REFERENCES");
  assert.equal(normalizeBusinessSignal(rawSignal({ references: [{ kind: "workflow", id: "a" }, { kind: "workflow", id: "a" }] }), { now: NOW }).code, "INVALID_REFERENCES");
});

test("rejects reference accessors without invocation", () => {
  let calls = 0;
  const reference = { kind: "workflow" };
  Object.defineProperty(reference, "id", {
    enumerable: true,
    get() {
      calls += 1;
      return "website.health.v1";
    },
  });
  const result = normalizeBusinessSignal(rawSignal({ references: [reference] }), { now: NOW });
  assert.equal(result.code, "INVALID_REFERENCES");
  assert.equal(calls, 0);
});

test("projects only canonical normalized signals with cloned nested values", () => {
  const normalized = normalizeBusinessSignal(rawSignal(), { now: NOW }).signal;
  const projected = projectBusinessSignal(normalized, { now: NOW });
  assert.notEqual(projected, normalized);
  assert.notEqual(projected.metrics, normalized.metrics);
  assert.notEqual(projected.labels, normalized.labels);
  assert.notEqual(projected.references, normalized.references);
  assert.equal(isDeepFrozen(projected), true);
  assert.equal(projected.stale, false);
});

test("projection rejects incomplete, unknown, accessor, and invalid-clock inputs", () => {
  for (const field of ["metrics", "labels", "references"]) {
    const malformed = mutableCanonicalSignal();
    delete malformed[field];
    assert.equal(projectBusinessSignal(malformed, { now: NOW }), null);
  }
  const unknown = mutableCanonicalSignal({ payload: "unsafe" });
  assert.equal(projectBusinessSignal(unknown, { now: NOW }), null);

  let calls = 0;
  const accessor = mutableCanonicalSignal();
  Object.defineProperty(accessor, "summary", {
    enumerable: true,
    get() {
      calls += 1;
      return "unsafe";
    },
  });
  assert.equal(projectBusinessSignal(accessor, { now: NOW }), null);
  assert.equal(calls, 0);
  assert.equal(projectBusinessSignal(mutableCanonicalSignal(), { now: "invalid" }), null);
});

test("projection computes stale at the exact expiry boundary", () => {
  const before = mutableCanonicalSignal({ observedAt: "2026-08-02T18:50:00.000Z", expiresAt: "2026-08-02T18:59:59.999Z" });
  const equal = mutableCanonicalSignal({ observedAt: "2026-08-02T18:50:00.000Z", expiresAt: NOW.toISOString() });
  const after = mutableCanonicalSignal({ expiresAt: "2026-08-02T19:00:00.001Z" });
  const noExpiry = mutableCanonicalSignal({ expiresAt: null });
  assert.equal(projectBusinessSignal(before, { now: NOW }).stale, true);
  assert.equal(projectBusinessSignal(equal, { now: NOW }).stale, true);
  assert.equal(projectBusinessSignal(after, { now: NOW }).stale, false);
  assert.equal(projectBusinessSignal(noExpiry, { now: NOW }).stale, false);
});

test("projection clock function is invoked exactly once", () => {
  let calls = 0;
  const projected = projectBusinessSignal(mutableCanonicalSignal(), {
    now() {
      calls += 1;
      return NOW;
    },
  });
  assert.ok(projected);
  assert.equal(calls, 1);
});
