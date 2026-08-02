import test from "node:test";
import assert from "node:assert/strict";

import {
  KAIROS_BUSINESS_OBSERVATION_BUILD,
  KAIROS_BUSINESS_OBSERVATION_SCHEMA_VERSION,
  KAIROS_BUSINESS_DOMAINS,
  buildBusinessStateSnapshot,
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

function snapshotOptions(overrides = {}) {
  return {
    tenantId: "mmg",
    now: NOW,
    windowMs: 86_400_000,
    recentLimit: 20,
    requiredSources: ["website.monitor"],
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

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function expectedSnapshotHash(tenantId, generatedAt, windowMs, signals) {
  const sorted = [...signals].sort((left, right) => {
    if (left.observedAt > right.observedAt) return -1;
    if (left.observedAt < right.observedAt) return 1;
    return left.signalId < right.signalId ? -1 : left.signalId > right.signalId ? 1 : 0;
  });
  const tuples = sorted.map((signal) => [
    signal.signalId,
    signal.observedAt,
    signal.source,
    signal.domain,
    signal.type,
    signal.status,
    signal.severity,
    signal.expiresAt || "",
  ].join("\u001f"));
  return fnv1a(`${tenantId}|${generatedAt}|${String(windowMs)}|${tuples.join("\u001e")}`);
}

test("validates the collection before options or clock execution", () => {
  let calls = 0;
  const clock = () => { calls += 1; return NOW; };
  for (const invalid of [null, {}, "signals"]) {
    const result = buildBusinessStateSnapshot(invalid, snapshotOptions({ now: clock }));
    assert.equal(result.error.code, "INVALID_SIGNAL_COLLECTION");
  }
  assert.equal(calls, 0);
});

test("enforces the 1000-signal collection bound before clock execution", () => {
  const accepted = Array.from({ length: 1000 }, (_, index) => rawSignal({ signalId: `sig_${String(index).padStart(4, "0")}` }));
  assert.equal(buildBusinessStateSnapshot(accepted, snapshotOptions()).ok, true);

  let calls = 0;
  const tooMany = [...accepted, rawSignal({ signalId: "sig_1000" })];
  const result = buildBusinessStateSnapshot(tooMany, snapshotOptions({ now() { calls += 1; return NOW; } }));
  assert.equal(result.error.code, "SIGNAL_COLLECTION_TOO_LARGE");
  assert.equal(calls, 0);
});

test("requires plain snapshot options and a valid tenant", () => {
  class Options {}
  for (const options of [null, [], new Options()]) {
    assert.equal(buildBusinessStateSnapshot([], options).error.code, "INVALID_OPTIONS");
  }
  const missing = snapshotOptions();
  delete missing.tenantId;
  assert.equal(buildBusinessStateSnapshot([], missing).error.code, "INVALID_TENANT_ID");
  for (const tenantId of ["", "MMG", "a".repeat(257)]) {
    assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ tenantId })).error.code, "INVALID_TENANT_ID");
  }
  assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ tenantId: "a".repeat(256) })).ok, true);
});

test("validates window and recent bounds without coercion", () => {
  for (const windowMs of ["60000", 60_000.5, 59_999, 2_592_000_001]) {
    assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ windowMs })).error.code, "INVALID_WINDOW_MS");
  }
  assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ windowMs: 60_000 })).ok, true);
  assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ windowMs: 2_592_000_000 })).ok, true);

  for (const recentLimit of ["1", 1.5, 0, 101]) {
    assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ recentLimit })).error.code, "INVALID_RECENT_LIMIT");
  }
  assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ recentLimit: 1 })).ok, true);
  assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ recentLimit: 100 })).ok, true);
});

test("validates, sorts, and bounds required sources", () => {
  assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ requiredSources: "website.monitor" })).error.code, "INVALID_REQUIRED_SOURCES");
  assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ requiredSources: ["Website.Monitor"] })).error.code, "INVALID_REQUIRED_SOURCES");
  assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ requiredSources: ["a.source", "a.source"] })).error.code, "INVALID_REQUIRED_SOURCES");
  const thirtyTwo = Array.from({ length: 32 }, (_, index) => `source.${String(index).padStart(2, "0")}`);
  assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ requiredSources: thirtyTwo })).ok, true);
  assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ requiredSources: [...thirtyTwo, "source.32"] })).error.code, "INVALID_REQUIRED_SOURCES");
  const sorted = buildBusinessStateSnapshot([], snapshotOptions({ requiredSources: ["z.source", "a.source"] }));
  assert.deepEqual(sorted.coverage.requiredSources, ["a.source", "z.source"]);
});

test("uses one cloned Date clock for the entire snapshot", () => {
  let calls = 0;
  const returned = new Date(NOW.getTime());
  const signals = [rawSignal(), rawSignal({ signalId: "sig_2" })];
  const result = buildBusinessStateSnapshot(signals, snapshotOptions({ now() { calls += 1; return returned; } }));
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.equal(returned.getTime(), NOW.getTime());
});

test("rejects invalid snapshot clocks", () => {
  for (const now of [
    NOW.toISOString(), NOW.getTime(), new Date(Number.NaN),
    () => NOW.toISOString(), () => NOW.getTime(), () => new Date(Number.NaN),
    () => { throw new Error("clock"); },
  ]) {
    assert.equal(buildBusinessStateSnapshot([], snapshotOptions({ now })).error.code, "INVALID_CLOCK");
  }
});

test("fails the entire snapshot at the exact invalid signal index", () => {
  const signals = [rawSignal({ signalId: "sig_1" }), rawSignal({ signalId: "INVALID" })];
  const result = buildBusinessStateSnapshot(signals, snapshotOptions());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_SIGNAL_ID");
  assert.equal(result.error.field, "signalId");
  assert.equal(result.error.index, 1);
  assert.equal(result.counts, undefined);
  assert.equal(isDeepFrozen(result), true);
});

test("rejects mixed tenants and duplicate identifiers before window filtering", () => {
  const mixed = buildBusinessStateSnapshot([
    rawSignal({ signalId: "sig_1" }),
    rawSignal({ signalId: "sig_2", tenantId: "other" }),
  ], snapshotOptions());
  assert.equal(mixed.error.code, "TENANT_MISMATCH");
  assert.equal(mixed.error.index, 1);

  for (const observedTimes of [
    ["2026-08-02T18:58:00.000Z", "2026-08-02T18:59:00.000Z"],
    ["2020-01-01T00:00:00.000Z", "2026-08-02T18:59:00.000Z"],
    ["2020-01-01T00:00:00.000Z", "2020-01-01T00:01:00.000Z"],
  ]) {
    const duplicate = buildBusinessStateSnapshot([
      rawSignal({ observedAt: observedTimes[0] }),
      rawSignal({ observedAt: observedTimes[1] }),
    ], snapshotOptions());
    assert.equal(duplicate.error.code, "DUPLICATE_SIGNAL_ID");
    assert.equal(duplicate.error.index, 1);
  }
});

test("uses the default deterministic window projection", () => {
  const options = snapshotOptions();
  delete options.windowMs;
  const result = buildBusinessStateSnapshot([], options);
  assert.equal(result.window.durationMs, 86_400_000);
  assert.equal(result.window.end, result.generatedAt);
  assert.equal(result.window.start, "2026-08-01T19:00:00.000Z");
});

test("includes exact window boundaries and the allowed future skew", () => {
  const start = rawSignal({ signalId: "sig_start", observedAt: "2026-08-01T19:00:00.000Z" });
  const now = rawSignal({ signalId: "sig_now", observedAt: NOW.toISOString(), expiresAt: "2026-08-02T19:01:00.000Z" });
  const future = rawSignal({
    signalId: "sig_future",
    observedAt: "2026-08-02T19:05:00.000Z",
    expiresAt: "2026-08-02T19:06:00.000Z",
  });
  const result = buildBusinessStateSnapshot([start, now, future], snapshotOptions());
  assert.equal(result.ok, true);
  assert.equal(result.includedCount, 3);
  assert.equal(result.excludedOutOfWindowCount, 0);
});

test("excludes older signals and rejects excessive future skew", () => {
  const old = rawSignal({ signalId: "sig_old", observedAt: "2026-08-01T18:59:59.999Z" });
  const result = buildBusinessStateSnapshot([old], snapshotOptions());
  assert.equal(result.includedCount, 0);
  assert.equal(result.excludedOutOfWindowCount, 1);
  assert.equal(result.counts.total, 0);
  assert.equal(result.recent.length, 0);

  const future = rawSignal({ observedAt: "2026-08-02T19:05:00.001Z", expiresAt: "2026-08-02T19:06:00.000Z" });
  assert.equal(buildBusinessStateSnapshot([future], snapshotOptions()).error.code, "OBSERVED_AT_IN_FUTURE");
});

test("sorts recent signals deterministically and respects recentLimit", () => {
  const signals = [
    rawSignal({ signalId: "sig_b", observedAt: "2026-08-02T18:55:00.000Z" }),
    rawSignal({ signalId: "sig_a", observedAt: "2026-08-02T18:55:00.000Z" }),
    rawSignal({ signalId: "sig_new", observedAt: "2026-08-02T18:56:00.000Z" }),
  ];
  const forward = buildBusinessStateSnapshot(signals, snapshotOptions({ recentLimit: 2 }));
  const reverse = buildBusinessStateSnapshot([...signals].reverse(), snapshotOptions({ recentLimit: 2 }));
  assert.deepEqual(forward.recent.map(({ signalId }) => signalId), ["sig_new", "sig_a"]);
  assert.deepEqual(forward.recent, reverse.recent);
  assert.equal(isDeepFrozen(forward.recent), true);
});

test("returns only canonical safe projection fields in recent", () => {
  const result = buildBusinessStateSnapshot([rawSignal()], snapshotOptions());
  assert.deepEqual(Object.keys(result.recent[0]).sort(), [
    "domain", "expiresAt", "labels", "metrics", "observedAt", "references", "severity",
    "signalId", "source", "stale", "status", "summary", "tenantId", "type",
  ]);
});

test("creates exact deterministic FNV-1a snapshot hashes", () => {
  const empty = buildBusinessStateSnapshot([], snapshotOptions());
  assert.equal(empty.snapshotId.split("_").at(-1), expectedSnapshotHash("mmg", empty.generatedAt, 86_400_000, []));

  const oneSignal = rawSignal();
  const one = buildBusinessStateSnapshot([oneSignal], snapshotOptions());
  assert.equal(one.snapshotId.split("_").at(-1), expectedSnapshotHash("mmg", one.generatedAt, 86_400_000, [oneSignal]));

  const multipleSignals = [
    rawSignal({ signalId: "sig_1", observedAt: "2026-08-02T18:50:00.000Z" }),
    rawSignal({ signalId: "sig_2", observedAt: "2026-08-02T18:55:00.000Z" }),
  ];
  const multiple = buildBusinessStateSnapshot(multipleSignals, snapshotOptions());
  assert.equal(multiple.snapshotId.split("_").at(-1), expectedSnapshotHash("mmg", multiple.generatedAt, 86_400_000, multipleSignals));
  assert.match(multiple.snapshotId, /^bss_\d{8}T\d{6}Z_[0-9a-f]{8}$/u);
});

test("snapshot hash is independent of input order, recent limit, required coverage, and excluded data", () => {
  const included = rawSignal({ signalId: "sig_included" });
  const excludedA = rawSignal({ signalId: "sig_old", observedAt: "2020-01-01T00:00:00.000Z" });
  const excludedB = rawSignal({ signalId: "sig_old", observedAt: "2020-01-02T00:00:00.000Z" });
  const first = buildBusinessStateSnapshot([included, excludedA], snapshotOptions({ recentLimit: 1, requiredSources: [] }));
  const second = buildBusinessStateSnapshot([excludedB, included], snapshotOptions({ recentLimit: 100, requiredSources: ["website.monitor"] }));
  assert.equal(first.snapshotId, second.snapshotId);
});

test("snapshot hash changes with every canonical tuple field and snapshot identity field", () => {
  const baseline = buildBusinessStateSnapshot([rawSignal()], snapshotOptions()).snapshotId;
  const variants = [
    rawSignal({ signalId: "sig_changed" }),
    rawSignal({ observedAt: "2026-08-02T18:58:00.000Z" }),
    rawSignal({ source: "website.probe" }),
    rawSignal({ domain: "commerce" }),
    rawSignal({ type: "website.availability" }),
    rawSignal({ status: "degraded" }),
    rawSignal({ severity: "high" }),
    rawSignal({ expiresAt: "2026-08-02T19:05:00.000Z" }),
  ];
  for (const variant of variants) {
    assert.notEqual(buildBusinessStateSnapshot([variant], snapshotOptions({ requiredSources: [] })).snapshotId, baseline);
  }
  assert.notEqual(buildBusinessStateSnapshot([], snapshotOptions({ tenantId: "other" })).snapshotId, buildBusinessStateSnapshot([], snapshotOptions()).snapshotId);
  assert.notEqual(buildBusinessStateSnapshot([], snapshotOptions({ now: new Date("2026-08-02T20:00:00.000Z") })).snapshotId, buildBusinessStateSnapshot([], snapshotOptions()).snapshotId);
  assert.notEqual(buildBusinessStateSnapshot([], snapshotOptions({ windowMs: 172_800_000 })).snapshotId, buildBusinessStateSnapshot([], snapshotOptions()).snapshotId);
});

test("creates complete deterministic count objects without metric aggregation", () => {
  const signals = [
    rawSignal({ signalId: "sig_website", domain: "website", status: "failed", severity: "critical", metrics: { count: 10 } }),
    rawSignal({ signalId: "sig_commerce", domain: "commerce", status: "blocked", severity: "high", metrics: { count: 20 } }),
  ];
  const result = buildBusinessStateSnapshot(signals, snapshotOptions());
  assert.equal(result.counts.total, 2);
  for (const domain of KAIROS_BUSINESS_DOMAINS) assert.equal(typeof result.counts.byDomain[domain], "number");
  for (const status of ["failed", "blocked", "degraded", "attention", "unknown", "healthy"]) assert.equal(typeof result.counts.byStatus[status], "number");
  for (const severity of ["critical", "high", "medium", "low", "info"]) assert.equal(typeof result.counts.bySeverity[severity], "number");
  assert.equal(result.counts.byDomain.website, 1);
  assert.equal(result.counts.byDomain.commerce, 1);
  assert.equal(result.counts.count, undefined);
});

test("counts stale signals at and before the snapshot clock", () => {
  const signals = [
    rawSignal({ signalId: "sig_before", observedAt: "2026-08-02T18:50:00.000Z", expiresAt: "2026-08-02T18:59:59.999Z" }),
    rawSignal({ signalId: "sig_equal", observedAt: "2026-08-02T18:50:00.000Z", expiresAt: NOW.toISOString() }),
    rawSignal({ signalId: "sig_after", expiresAt: "2026-08-02T19:00:00.001Z" }),
    rawSignal({ signalId: "sig_none", expiresAt: null }),
  ];
  const result = buildBusinessStateSnapshot(signals, snapshotOptions());
  assert.equal(result.counts.stale, 2);
});

test("computes worst status and severity plus attention flags", () => {
  const signals = [
    rawSignal({ signalId: "sig_1", status: "healthy", severity: "info" }),
    rawSignal({ signalId: "sig_2", status: "attention", severity: "medium" }),
    rawSignal({ signalId: "sig_3", status: "failed", severity: "critical" }),
  ];
  const result = buildBusinessStateSnapshot(signals, snapshotOptions());
  assert.equal(result.health.overallStatus, "failed");
  assert.equal(result.health.highestSeverity, "critical");
  assert.equal(result.health.hasFailures, true);
  assert.equal(result.health.hasBlocked, false);
  assert.equal(result.health.hasCritical, true);
  assert.equal(result.health.attentionRequired, true);
});

test("healthy current complete coverage is the only non-attention state", () => {
  const result = buildBusinessStateSnapshot([rawSignal()], snapshotOptions());
  assert.equal(result.health.overallStatus, "healthy");
  assert.equal(result.counts.stale, 0);
  assert.equal(result.coverage.complete, true);
  assert.equal(result.health.attentionRequired, false);

  const empty = buildBusinessStateSnapshot([], snapshotOptions({ requiredSources: [] }));
  assert.equal(empty.health.overallStatus, "unknown");
  assert.equal(empty.health.highestSeverity, "info");
  assert.equal(empty.health.attentionRequired, true);
});

test("builds one ordered domain summary for every certified domain", () => {
  const result = buildBusinessStateSnapshot([rawSignal()], snapshotOptions());
  assert.deepEqual(result.domains.map(({ domain }) => domain), KAIROS_BUSINESS_DOMAINS);
  const website = result.domains[0];
  assert.equal(website.signalCount, 1);
  assert.equal(website.status, "healthy");
  assert.equal(website.highestSeverity, "info");
  assert.equal(website.latestSignal.signalId, "sig_website_health_001");
  const commerce = result.domains[1];
  assert.equal(commerce.signalCount, 0);
  assert.equal(commerce.status, "unknown");
  assert.equal(commerce.highestSeverity, "info");
  assert.equal(commerce.latestSignal, null);
});

test("domain summaries use worst state and deterministic latest-signal ordering", () => {
  const signals = [
    rawSignal({ signalId: "sig_b", observedAt: "2026-08-02T18:55:00.000Z", status: "healthy", severity: "info" }),
    rawSignal({ signalId: "sig_a", observedAt: "2026-08-02T18:55:00.000Z", status: "failed", severity: "critical" }),
  ];
  const result = buildBusinessStateSnapshot(signals, snapshotOptions());
  const website = result.domains[0];
  assert.equal(website.status, "failed");
  assert.equal(website.highestSeverity, "critical");
  assert.equal(website.latestObservedAt, "2026-08-02T18:55:00.000Z");
  assert.equal(website.latestSignal.signalId, "sig_a");
  assert.equal(website.metrics, undefined);
});

test("computes required-source coverage from included signals only", () => {
  const signals = [
    rawSignal({ signalId: "sig_a", source: "z.monitor" }),
    rawSignal({ signalId: "sig_b", source: "a.monitor" }),
    rawSignal({ signalId: "sig_old", source: "old.monitor", observedAt: "2020-01-01T00:00:00.000Z" }),
  ];
  const result = buildBusinessStateSnapshot(signals, snapshotOptions({ requiredSources: ["z.monitor", "missing.monitor", "a.monitor", "old.monitor"] }));
  assert.deepEqual(result.coverage.observedSources, ["a.monitor", "z.monitor"]);
  assert.deepEqual(result.coverage.missingSources, ["missing.monitor", "old.monitor"]);
  assert.equal(result.coverage.complete, false);
  assert.deepEqual(result.sources.map(({ source }) => source), ["a.monitor", "z.monitor"]);
});

test("handles constructor as a valid source without prototype collisions", () => {
  const result = buildBusinessStateSnapshot([
    rawSignal({ source: "constructor" }),
  ], snapshotOptions({ requiredSources: ["constructor"] }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.coverage.observedSources, ["constructor"]);
  assert.equal(result.sources[0].source, "constructor");
  assert.equal(result.sources[0].signalCount, 1);
});

test("returns the exact success shape and deeply freezes all output", () => {
  const result = buildBusinessStateSnapshot([rawSignal()], snapshotOptions());
  assert.deepEqual(Object.keys(result).sort(), [
    "build", "counts", "coverage", "domains", "excludedOutOfWindowCount", "generatedAt",
    "health", "includedCount", "inputCount", "ok", "recent", "schemaVersion", "snapshotId",
    "sources", "tenantId", "window",
  ]);
  assert.equal(result.build, KAIROS_BUSINESS_OBSERVATION_BUILD);
  assert.equal(result.schemaVersion, KAIROS_BUSINESS_OBSERVATION_SCHEMA_VERSION);
  assert.equal(isDeepFrozen(result), true);
});

test("does not freeze, reorder, mutate, or share caller inputs", () => {
  const first = rawSignal({ signalId: "sig_b", labels: ["zeta", "alpha"], references: [{ kind: "workflow", id: "z" }, { kind: "asset", id: "a" }] });
  const second = rawSignal({ signalId: "sig_a" });
  const signals = [first, second];
  const options = snapshotOptions({ requiredSources: ["website.monitor"] });
  const result = buildBusinessStateSnapshot(signals, options);
  assert.equal(Object.isFrozen(signals), false);
  assert.equal(Object.isFrozen(first), false);
  assert.equal(Object.isFrozen(first.metrics), false);
  assert.deepEqual(signals.map(({ signalId }) => signalId), ["sig_b", "sig_a"]);
  assert.deepEqual(first.labels, ["zeta", "alpha"]);
  assert.equal(first.references[0].kind, "workflow");
  assert.notEqual(result.recent.find(({ signalId }) => signalId === "sig_b").metrics, first.metrics);
  assert.notEqual(result.recent.find(({ signalId }) => signalId === "sig_b").labels, first.labels);
  assert.notEqual(result.recent.find(({ signalId }) => signalId === "sig_b").references, first.references);
  assert.deepEqual(options.requiredSources, ["website.monitor"]);
});

test("never invokes functions or accessors supplied in signal data", () => {
  let functionCalls = 0;
  const functionResult = buildBusinessStateSnapshot([
    rawSignal({ metrics: { unsafe() { functionCalls += 1; } } }),
  ], snapshotOptions());
  assert.equal(functionResult.ok, false);
  assert.equal(functionResult.error.code, "INVALID_METRICS");
  assert.equal(functionCalls, 0);

  let getterCalls = 0;
  const signal = rawSignal();
  Object.defineProperty(signal, "summary", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "unsafe";
    },
  });
  const getterResult = buildBusinessStateSnapshot([signal], snapshotOptions());
  assert.equal(getterResult.ok, false);
  assert.equal(getterCalls, 0);
});

test("never leaks rejected secret-bearing values or returns partial state", () => {
  const marker = "TOP_SECRET_MARKER_123";
  const unknown = buildBusinessStateSnapshot([rawSignal({ payload: marker })], snapshotOptions());
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, "UNKNOWN_SIGNAL_FIELD");
  assert.equal(JSON.stringify(unknown).includes(marker), false);
  assert.equal(unknown.counts, undefined);
  assert.equal(unknown.recent, undefined);

  const unsafe = buildBusinessStateSnapshot([rawSignal({ summary: `Bearer ${marker}` })], snapshotOptions());
  assert.equal(unsafe.error.code, "UNSAFE_SUMMARY");
  assert.equal(JSON.stringify(unsafe).includes(marker), false);
});
