import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AutonomyLedgerStore,
  AUTONOMY_EVENT_STATUS,
  KAIROS_AUTONOMY_LEDGER_BUILD,
  KAIROS_BUSINESS_STATE_STORE_BUILD,
  KAIROS_BUSINESS_STATE_STORE_SCHEMA_VERSION,
} from "../../src/autonomy/kairos-autonomy-ledger-v1.js";
import {
  KAIROS_BUSINESS_COLLECTOR_BUILD,
  KAIROS_BUSINESS_COLLECTOR_SCHEMA_VERSION,
} from "../../src/autonomy/kairos-business-collector-v1.js";
import {
  KAIROS_BUSINESS_OBSERVATION_BUILD,
} from "../../src/autonomy/kairos-business-observation-v1.js";

const ledgerSource = readFileSync(
  new URL("../../src/autonomy/kairos-autonomy-ledger-v1.js", import.meta.url),
  "utf8",
);

class MemoryRepository {
  constructor() {
    this.events = new Map();
    this.snapshots = new Map();
  }

  transaction(callback) {
    return callback(this);
  }

  get(tenantId, eventId) {
    const record = this.events.get(`${tenantId}\u0000${eventId}`);
    return record ? structuredClone(record) : null;
  }

  insert(record) {
    this.events.set(`${record.tenantId}\u0000${record.eventId}`, structuredClone(record));
  }

  replace(record) {
    this.events.set(`${record.tenantId}\u0000${record.eventId}`, structuredClone(record));
  }

  list(tenantId, limit) {
    return [...this.events.values()]
      .filter((record) => record.tenantId === tenantId)
      .slice(0, limit)
      .map((record) => structuredClone(record));
  }

  getBusinessSnapshotStoredValue(tenantId, snapshotId) {
    const entry = this.snapshots.get(this.snapshotKey(tenantId, snapshotId));
    return entry ? structuredClone(entry) : null;
  }

  getBusinessSnapshot(tenantId, snapshotId) {
    const entry = this.getBusinessSnapshotStoredValue(tenantId, snapshotId);
    return entry ? entry.record : null;
  }

  insertBusinessSnapshot(record) {
    this.snapshots.set(this.snapshotKey(record.tenantId, record.snapshotId), {
      record: structuredClone(record),
      serializedBusinessState: JSON.stringify(record.businessState),
      malformed: false,
    });
  }

  getLatestBusinessSnapshot(tenantId) {
    return this.listBusinessSnapshots(tenantId, 1)[0] || null;
  }

  listBusinessSnapshots(tenantId, limit) {
    return [...this.snapshots.values()]
      .map((entry) => entry.record)
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => {
        if (left.generatedAt > right.generatedAt) return -1;
        if (left.generatedAt < right.generatedAt) return 1;
        if (left.snapshotId > right.snapshotId) return -1;
        if (left.snapshotId < right.snapshotId) return 1;
        return 0;
      })
      .slice(0, limit)
      .map((record) => structuredClone(record));
  }

  snapshotKey(tenantId, snapshotId) {
    return `${tenantId}\u0000${snapshotId}`;
  }
}

function businessState(overrides = {}) {
  const {
    snapshot: snapshotOverrides = {},
    snapshotId: explicitSnapshotId,
    ...topLevelOverrides
  } = overrides;
  const generatedAt = topLevelOverrides.generatedAt
    || "2026-08-02T20:00:00.000Z";
  const tenantId = topLevelOverrides.tenantId || "mmg";
  const snapshotId = explicitSnapshotId
    || snapshotOverrides.snapshotId
    || "bss_20260802t200000z_00000001";
  const base = {
    ok: true,
    build: KAIROS_BUSINESS_COLLECTOR_BUILD,
    schemaVersion: KAIROS_BUSINESS_COLLECTOR_SCHEMA_VERSION,
    generatedAt,
    tenantId,
    observationBuild: KAIROS_BUSINESS_OBSERVATION_BUILD,
    websiteWorkflowBuild: "kairos-website-health-workflow-v1",
    selectedCollectors: ["website.health.v1"],
    collectorCount: 1,
    collectedCount: 1,
    blockedCount: 0,
    failedCount: 0,
    collectors: [{
      collectorId: "website.health.v1",
      source: "website.health.workflow",
      status: "collected",
      outcome: "passed",
      code: null,
    }],
    snapshot: {
      ok: true,
      build: KAIROS_BUSINESS_OBSERVATION_BUILD,
      schemaVersion: KAIROS_BUSINESS_STATE_STORE_SCHEMA_VERSION,
      snapshotId,
      tenantId,
      generatedAt,
      window: {
        start: "2026-08-01T20:00:00.000Z",
        end: generatedAt,
        durationMs: 86_400_000,
      },
      inputCount: 1,
      includedCount: 1,
      excludedOutOfWindowCount: 0,
      counts: {
        total: 1,
        stale: 0,
        byDomain: { website: 1 },
        byStatus: { healthy: 1 },
        bySeverity: { info: 1 },
      },
      health: {
        overallStatus: "healthy",
        highestSeverity: "info",
        attentionRequired: false,
        hasFailures: false,
        hasBlocked: false,
        hasCritical: false,
        coverageComplete: true,
      },
      coverage: {
        requiredSources: ["website.health.workflow"],
        observedSources: ["website.health.workflow"],
        missingSources: [],
        complete: true,
      },
      domains: [],
      sources: [],
      recent: [],
    },
  };
  return {
    ...base,
    ...topLevelOverrides,
    snapshot: {
      ...base.snapshot,
      ...snapshotOverrides,
      snapshotId,
    },
  };
}

function harness() {
  const repository = new MemoryRepository();
  let now = new Date("2026-08-02T20:01:00.000Z");
  const store = new AutonomyLedgerStore(repository, {
    now: () => new Date(now.getTime()),
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
  });
  return {
    repository,
    store,
    setNow(value) {
      now = new Date(value);
    },
  };
}

test("business-state store builds are exact", () => {
  assert.equal(
    KAIROS_AUTONOMY_LEDGER_BUILD,
    "kairos-autonomy-ledger-20260802-3-business-state-store",
  );
  assert.equal(
    KAIROS_BUSINESS_STATE_STORE_BUILD,
    "kairos-business-state-store-20260802-1",
  );
});

test("legacy event state contract remains unchanged and frozen", () => {
  assert.deepEqual(AUTONOMY_EVENT_STATUS, {
    ACCEPTED: "accepted",
    RUNNING: "running",
    COMPLETED: "completed",
    FAILED: "failed",
    BLOCKED: "blocked",
  });
  assert.equal(Object.isFrozen(AUTONOMY_EVENT_STATUS), true);
});

test("stores a validated immutable business-state snapshot", () => {
  const { store } = harness();
  const input = businessState();
  const result = store.storeBusinessSnapshot(input);
  assert.equal(result.ok, true);
  assert.equal(result.disposition, "stored");
  assert.equal(result.duplicate, false);
  assert.equal(result.statusCode, 201);
  assert.equal(result.record.storedAt, "2026-08-02T20:01:00.000Z");
  input.snapshot.health.overallStatus = "failed";
  assert.equal(result.record.businessState.snapshot.health.overallStatus, "healthy");
});

test("exact duplicate is idempotent and preserves original storedAt", () => {
  const { store, setNow } = harness();
  const first = store.storeBusinessSnapshot(businessState());
  setNow("2026-08-02T21:00:00.000Z");
  const duplicate = store.storeBusinessSnapshot(businessState());
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.disposition, "duplicate");
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.record.storedAt, first.record.storedAt);
});

test("same identity with different state fails with immutable conflict", () => {
  const { store } = harness();
  store.storeBusinessSnapshot(businessState());
  const changed = businessState();
  changed.snapshot.health.overallStatus = "degraded";
  const conflict = store.storeBusinessSnapshot(changed);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.disposition, "conflict");
  assert.equal(conflict.code, "SNAPSHOT_IDENTITY_CONFLICT");
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.record.businessState.snapshot.health.overallStatus, "healthy");
});

test("retrieves snapshots by tenant and deterministic snapshot identity", () => {
  const { store } = harness();
  const stored = store.storeBusinessSnapshot(businessState());
  const found = store.getBusinessSnapshot("mmg", stored.record.snapshotId);
  assert.equal(found.ok, true);
  assert.deepEqual(found.record, stored.record);
  found.record.businessState.snapshot.health.overallStatus = "changed";
  assert.equal(
    store.getBusinessSnapshot("mmg", stored.record.snapshotId)
      .record.businessState.snapshot.health.overallStatus,
    "healthy",
  );
});

test("latest and recent snapshot ordering is deterministic", () => {
  const { store } = harness();
  store.storeBusinessSnapshot(businessState({
    generatedAt: "2026-08-02T20:00:00.000Z",
    snapshotId: "bss_20260802t200000z_00000001",
    snapshot: { generatedAt: "2026-08-02T20:00:00.000Z" },
  }));
  store.storeBusinessSnapshot(businessState({
    generatedAt: "2026-08-02T21:00:00.000Z",
    snapshotId: "bss_20260802t210000z_00000002",
    snapshot: { generatedAt: "2026-08-02T21:00:00.000Z" },
  }));
  assert.equal(
    store.getLatestBusinessSnapshot("mmg").record.snapshotId,
    "bss_20260802t210000z_00000002",
  );
  assert.deepEqual(
    store.listRecentBusinessSnapshots("mmg", 2).records
      .map((record) => record.snapshotId),
    [
      "bss_20260802t210000z_00000002",
      "bss_20260802t200000z_00000001",
    ],
  );
});

test("unknown and missing business-state fields fail closed", () => {
  const { store } = harness();
  assert.equal(
    store.storeBusinessSnapshot({ ...businessState(), extra: true }).code,
    "UNKNOWN_BUSINESS_STATE_FIELD",
  );
  const missing = businessState();
  delete missing.snapshot;
  assert.equal(store.storeBusinessSnapshot(missing).code, "INVALID_BUSINESS_STATE");
});

test("sensitive nested field names are rejected instead of redacted", () => {
  const { store } = harness();
  const input = businessState();
  input.snapshot.details = { targetUrl: "https://example.com" };
  const result = store.storeBusinessSnapshot(input);
  assert.equal(result.code, "SENSITIVE_BUSINESS_STATE_FIELD");
  assert.equal(result.record, null);
});

test("accessors are rejected without invocation", () => {
  const { store } = harness();
  const input = businessState();
  let invoked = false;
  Object.defineProperty(input.snapshot, "danger", {
    enumerable: true,
    get() {
      invoked = true;
      throw new Error("must not run");
    },
  });
  assert.equal(store.storeBusinessSnapshot(input).code, "INVALID_BUSINESS_SNAPSHOT");
  assert.equal(invoked, false);
});

test("sparse and decorated arrays are rejected", () => {
  const { store } = harness();
  const sparse = businessState();
  sparse.selectedCollectors = new Array(1);
  assert.equal(
    store.storeBusinessSnapshot(sparse).code,
    "INVALID_SELECTED_COLLECTORS",
  );

  const decorated = businessState();
  decorated.selectedCollectors.extra = true;
  assert.equal(
    store.storeBusinessSnapshot(decorated).code,
    "INVALID_SELECTED_COLLECTORS",
  );
});

test("circular and non-finite nested values are rejected", () => {
  const { store } = harness();
  const circular = businessState();
  circular.snapshot.loop = circular.snapshot;
  assert.equal(store.storeBusinessSnapshot(circular).code, "INVALID_BUSINESS_STATE");

  const nonFinite = businessState();
  nonFinite.snapshot.metric = Number.POSITIVE_INFINITY;
  assert.equal(store.storeBusinessSnapshot(nonFinite).code, "INVALID_BUSINESS_STATE");
});

test("invalid recent limits are not coerced", () => {
  const { store } = harness();
  assert.equal(
    store.listRecentBusinessSnapshots("mmg", "10").code,
    "INVALID_BUSINESS_SNAPSHOT_LIMIT",
  );
  assert.equal(
    store.listRecentBusinessSnapshots("mmg", 1.5).code,
    "INVALID_BUSINESS_SNAPSHOT_LIMIT",
  );
  assert.equal(
    store.listRecentBusinessSnapshots("mmg", 101).code,
    "INVALID_BUSINESS_SNAPSHOT_LIMIT",
  );
});

test("oversized direct-store payload is rejected without truncation", () => {
  const { store } = harness();
  const input = businessState();
  input.snapshot.details = "x".repeat(270_000);
  const result = store.storeBusinessSnapshot(input);
  assert.equal(result.code, "BUSINESS_SNAPSHOT_TOO_LARGE");
  assert.equal(result.record, null);
});

test("invalid persistence clock fails without insertion", () => {
  const repository = new MemoryRepository();
  const store = new AutonomyLedgerStore(repository, {
    now: () => "invalid",
  });
  const result = store.storeBusinessSnapshot(businessState());
  assert.equal(result.code, "BUSINESS_SNAPSHOT_STORAGE_FAILED");
  assert.equal(repository.snapshots.size, 0);
});

test("legacy event reservation and lease fencing remain operational", () => {
  const { store } = harness();
  const reserved = store.reserveEvent({
    eventId: "evt_1",
    tenantId: "mmg",
    workflowId: "website.health.v1",
    eventType: "website.health.schedule",
    correlationId: "corr_1",
    causationId: null,
    riskClass: "low",
  });
  assert.equal(reserved.record.status, AUTONOMY_EVENT_STATUS.ACCEPTED);
  const lease = store.acquireLease({
    tenantId: "mmg",
    eventId: "evt_1",
    leaseDurationMs: 30_000,
  });
  assert.equal(lease.record.status, AUTONOMY_EVENT_STATUS.RUNNING);
  assert.match(lease.leaseToken, /^lease_/u);
  const stale = store.markCompleted({
    tenantId: "mmg",
    eventId: "evt_1",
    leaseToken: "lease_stale",
    result: {},
  });
  assert.equal(stale.code, "STALE_OR_INVALID_LEASE");
});

test("source contains migration version 2 without changing Durable Object class", () => {
  assert.match(ledgerSource, /CREATE TABLE IF NOT EXISTS business_state_snapshots/u);
  assert.match(ledgerSource, /idx_business_state_snapshots_tenant_generated/u);
  assert.match(
    ledgerSource,
    /_kairos_autonomy_schema_migrations \(version, appliedAt\) VALUES \(\?, \?\);`[\s\S]*?2,/u,
  );
  assert.equal((ledgerSource.match(/export class KairosAutonomyLedger/gu) || []).length, 1);
});

test("source owns exactly four internal snapshot routes and no network execution", () => {
  for (const route of [
    "/business-snapshots/store",
    "/business-snapshots/get",
    "/business-snapshots/latest",
    "/business-snapshots/recent",
  ]) {
    assert.match(ledgerSource, new RegExp(route.replaceAll("/", "\\/"), "u"));
  }
  assert.doesNotMatch(ledgerSource, /globalThis\.fetch|await\s+fetch\s*\(/u);
  assert.doesNotMatch(ledgerSource, /console\.|\beval\s*\(|new Function/u);
});

test("snapshot response header is scoped to snapshot routes", () => {
  assert.match(
    ledgerSource,
    /X-Kairos-Business-State-Store-Build/u,
  );
  assert.match(
    ledgerSource,
    /const snapshotRoute = BUSINESS_SNAPSHOT_ROUTES\.has\(url\.pathname\)/u,
  );
});
