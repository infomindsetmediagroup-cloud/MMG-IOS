import test from "node:test";
import assert from "node:assert/strict";

import {
  AutonomyLedgerStore,
  AUTONOMY_EVENT_STATUS,
} from "../../src/autonomy/kairos-autonomy-ledger-v1.js";

class MemoryRepository {
  constructor() {
    this.records = new Map();
  }
  transaction(callback) { return callback(this); }
  get(tenantId, eventId) {
    const value = this.records.get(this.key(tenantId, eventId));
    return value ? structuredClone(value) : null;
  }
  insert(record) {
    const key = this.key(record.tenantId, record.eventId);
    if (this.records.has(key)) throw new Error("duplicate record");
    this.records.set(key, structuredClone(record));
  }
  replace(record) {
    const key = this.key(record.tenantId, record.eventId);
    if (!this.records.has(key)) throw new Error("record missing");
    this.records.set(key, structuredClone(record));
  }
  list(tenantId, limit) {
    return [...this.records.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt) || b.eventId.localeCompare(a.eventId))
      .slice(0, limit)
      .map((record) => structuredClone(record));
  }
  key(tenantId, eventId) { return `${tenantId}\u0000${eventId}`; }
}

function harness() {
  const repository = new MemoryRepository();
  let nowMs = Date.parse("2026-08-02T06:00:00.000Z");
  let uuidSequence = 0;
  const store = new AutonomyLedgerStore(repository, {
    now: () => new Date(nowMs),
    randomUUID: () => `00000000-0000-4000-8000-${String(++uuidSequence).padStart(12, "0")}`,
  });
  return {
    repository,
    store,
    advance(ms) { nowMs += ms; },
    setTime(value) { nowMs = Date.parse(value); },
  };
}

function event(overrides = {}) {
  return {
    eventId: "evt_1",
    tenantId: "mmg",
    workflowId: "website.health.v1",
    eventType: "website.health.schedule",
    correlationId: "corr_1",
    causationId: null,
    riskClass: "low",
    ...overrides,
  };
}

test("first reservation succeeds with zero execution attempts", () => {
  const { store } = harness();
  const result = store.reserveEvent(event());
  assert.equal(result.ok, true);
  assert.equal(result.disposition, "reserved");
  assert.equal(result.record.status, AUTONOMY_EVENT_STATUS.ACCEPTED);
  assert.equal(result.record.attempt, 0);
});

test("duplicate reservation returns the original record without mutation", () => {
  const { store, advance } = harness();
  const first = store.reserveEvent(event());
  advance(5_000);
  const duplicate = store.reserveEvent(event({ workflowId: "changed.workflow" }));
  assert.equal(duplicate.disposition, "duplicate");
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.record.workflowId, first.record.workflowId);
  assert.equal(duplicate.record.acceptedAt, first.record.acceptedAt);
});

test("an active execution lease prevents a second executor", () => {
  const { store } = harness();
  store.reserveEvent(event());
  const first = store.acquireLease({ tenantId: "mmg", eventId: "evt_1", leaseDurationMs: 30_000 });
  const second = store.acquireLease({ tenantId: "mmg", eventId: "evt_1", leaseDurationMs: 30_000 });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.code, "ACTIVE_LEASE_EXISTS");
  assert.equal(second.record.attempt, 1);
});

test("an expired lease is recovered with a new token", () => {
  const { store, advance } = harness();
  store.reserveEvent(event());
  const first = store.acquireLease({ tenantId: "mmg", eventId: "evt_1", leaseDurationMs: 1_000 });
  advance(1_001);
  const recovered = store.acquireLease({ tenantId: "mmg", eventId: "evt_1", leaseDurationMs: 1_000 });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.disposition, "lease_recovered");
  assert.notEqual(recovered.leaseToken, first.leaseToken);
});

test("execution attempts increment atomically across failure and retry", () => {
  const { store, advance } = harness();
  store.reserveEvent(event());
  const first = store.acquireLease({ tenantId: "mmg", eventId: "evt_1" });
  const failed = store.markFailed({ tenantId: "mmg", eventId: "evt_1", leaseToken: first.leaseToken, error: { message: "temporary" } });
  advance(1_000);
  const retry = store.acquireLease({ tenantId: "mmg", eventId: "evt_1" });
  assert.equal(failed.record.attempt, 1);
  assert.equal(retry.record.attempt, 2);
});

test("completed events cannot return to running", () => {
  const { store } = harness();
  store.reserveEvent(event());
  const lease = store.acquireLease({ tenantId: "mmg", eventId: "evt_1" });
  store.markCompleted({ tenantId: "mmg", eventId: "evt_1", leaseToken: lease.leaseToken, result: { status: "passed" } });
  const rerun = store.acquireLease({ tenantId: "mmg", eventId: "evt_1" });
  assert.equal(rerun.ok, false);
  assert.equal(rerun.code, "EVENT_TERMINAL");
});

test("blocked events cannot execute", () => {
  const { store } = harness();
  store.reserveEvent(event());
  const blocked = store.markBlocked({ tenantId: "mmg", eventId: "evt_1", policyDecision: { decision: "DENY", reasonCode: "TEST_DENIAL" } });
  const run = store.acquireLease({ tenantId: "mmg", eventId: "evt_1" });
  assert.equal(blocked.record.status, AUTONOMY_EVENT_STATUS.BLOCKED);
  assert.equal(run.ok, false);
  assert.equal(run.code, "EVENT_TERMINAL");
});

test("failure details are serialized without secrets or stack traces", () => {
  const { store } = harness();
  store.reserveEvent(event());
  const lease = store.acquireLease({ tenantId: "mmg", eventId: "evt_1" });
  const failed = store.markFailed({
    tenantId: "mmg",
    eventId: "evt_1",
    leaseToken: lease.leaseToken,
    error: { message: "network failed", stack: "sensitive stack", authorization: "Bearer secret-value", nested: { apiKey: "provider-key" } },
  });
  assert.equal(failed.record.error.stack, undefined);
  assert.equal(failed.record.error.authorization, "[REDACTED]");
  assert.equal(failed.record.error.nested.apiKey, "[REDACTED]");
});

test("tenant identity is part of the unique event key", () => {
  const { store } = harness();
  const first = store.reserveEvent(event({ tenantId: "tenant-a" }));
  const second = store.reserveEvent(event({ tenantId: "tenant-b" }));
  assert.equal(first.disposition, "reserved");
  assert.equal(second.disposition, "reserved");
  assert.equal(store.getEvent("tenant-a", "evt_1").record.tenantId, "tenant-a");
  assert.equal(store.getEvent("tenant-b", "evt_1").record.tenantId, "tenant-b");
});

test("recent-event listing is bounded and deterministically ordered", () => {
  const { store, setTime } = harness();
  setTime("2026-08-02T06:00:00.000Z");
  store.reserveEvent(event({ eventId: "evt_a" }));
  setTime("2026-08-02T06:00:01.000Z");
  store.reserveEvent(event({ eventId: "evt_b" }));
  setTime("2026-08-02T06:00:02.000Z");
  store.reserveEvent(event({ eventId: "evt_c" }));
  const listed = store.listRecentEvents("mmg", 2);
  assert.deepEqual(listed.records.map((record) => record.eventId), ["evt_c", "evt_b"]);
  assert.equal(store.listRecentEvents("mmg", 10_000).limit, 100);
});

test("a stale lease token cannot complete an event after lease recovery", () => {
  const { store, advance } = harness();
  store.reserveEvent(event());
  const first = store.acquireLease({ tenantId: "mmg", eventId: "evt_1", leaseDurationMs: 1_000 });
  advance(1_001);
  const second = store.acquireLease({ tenantId: "mmg", eventId: "evt_1", leaseDurationMs: 1_000 });
  const staleCompletion = store.markCompleted({ tenantId: "mmg", eventId: "evt_1", leaseToken: first.leaseToken, result: { status: "stale" } });
  assert.equal(staleCompletion.ok, false);
  assert.equal(staleCompletion.code, "STALE_OR_INVALID_LEASE");
  assert.equal(staleCompletion.record.leaseToken, second.leaseToken);
});

test("invalid state transitions fail closed", () => {
  const { store } = harness();
  store.reserveEvent(event());
  const completeBeforeRun = store.markCompleted({ tenantId: "mmg", eventId: "evt_1", leaseToken: "lease_invalid", result: {} });
  assert.equal(completeBeforeRun.ok, false);
  assert.equal(completeBeforeRun.code, "INVALID_STATE_TRANSITION");
});

test("the current active lease holder can block a running event", () => {
  const { store } = harness();
  store.reserveEvent(event());
  const lease = store.acquireLease({ tenantId: "mmg", eventId: "evt_1", leaseDurationMs: 30_000 });
  const blocked = store.markBlocked({ tenantId: "mmg", eventId: "evt_1", leaseToken: lease.leaseToken, policyDecision: { decision: "DENY" } });
  assert.equal(blocked.ok, true);
  assert.equal(blocked.record.status, AUTONOMY_EVENT_STATUS.BLOCKED);
  assert.equal(blocked.record.leaseToken, null);
});

test("a stale lease token cannot block after lease recovery", () => {
  const { store, advance } = harness();
  store.reserveEvent(event());
  const first = store.acquireLease({ tenantId: "mmg", eventId: "evt_1", leaseDurationMs: 1_000 });
  advance(1_001);
  const second = store.acquireLease({ tenantId: "mmg", eventId: "evt_1", leaseDurationMs: 30_000 });
  const blocked = store.markBlocked({ tenantId: "mmg", eventId: "evt_1", leaseToken: first.leaseToken, policyDecision: { decision: "DENY" } });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "STALE_OR_INVALID_LEASE");
  assert.equal(blocked.record.leaseToken, second.leaseToken);
});

test("an expired lease token cannot block before recovery", () => {
  const { store, advance } = harness();
  store.reserveEvent(event());
  const lease = store.acquireLease({ tenantId: "mmg", eventId: "evt_1", leaseDurationMs: 1_000 });
  advance(1_001);
  const blocked = store.markBlocked({ tenantId: "mmg", eventId: "evt_1", leaseToken: lease.leaseToken, policyDecision: { decision: "DENY" } });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "STALE_OR_INVALID_LEASE");
});

test("blocking an already blocked event is idempotent and does not mutate it", () => {
  const { store, advance } = harness();
  store.reserveEvent(event());
  const first = store.markBlocked({ tenantId: "mmg", eventId: "evt_1", policyDecision: { decision: "DENY", reasonCode: "FIRST" } });
  advance(5_000);
  const duplicate = store.markBlocked({ tenantId: "mmg", eventId: "evt_1", policyDecision: { decision: "DENY", reasonCode: "SECOND" } });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.record.updatedAt, first.record.updatedAt);
  assert.equal(duplicate.record.policyDecision.reasonCode, "FIRST");
});

test("completed events cannot transition to blocked", () => {
  const { store } = harness();
  store.reserveEvent(event());
  const lease = store.acquireLease({ tenantId: "mmg", eventId: "evt_1" });
  store.markCompleted({ tenantId: "mmg", eventId: "evt_1", leaseToken: lease.leaseToken, result: { status: "passed" } });
  const blocked = store.markBlocked({ tenantId: "mmg", eventId: "evt_1", policyDecision: { decision: "DENY" } });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "INVALID_STATE_TRANSITION");
});
