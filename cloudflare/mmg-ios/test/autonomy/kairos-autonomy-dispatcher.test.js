import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchAutonomyEvent,
  KAIROS_AUTONOMY_DISPATCHER_BUILD,
} from "../../src/autonomy/kairos-autonomy-dispatcher-v1.js";
import { AutonomyLedgerStore } from "../../src/autonomy/kairos-autonomy-ledger-v1.js";

class MemoryRepository {
  constructor() { this.records = new Map(); }
  transaction(callback) { return callback(this); }
  get(tenantId, eventId) {
    const value = this.records.get(`${tenantId}\u0000${eventId}`);
    return value ? structuredClone(value) : null;
  }
  insert(record) {
    const key = `${record.tenantId}\u0000${record.eventId}`;
    if (this.records.has(key)) throw new Error("duplicate record");
    this.records.set(key, structuredClone(record));
  }
  replace(record) {
    const key = `${record.tenantId}\u0000${record.eventId}`;
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
}

function createClock(initial = "2026-08-02T00:00:00.000Z") {
  let nowMs = Date.parse(initial);
  return {
    now: () => new Date(nowMs),
    advance: (ms) => { nowMs += ms; },
    set: (value) => { nowMs = Date.parse(value); },
  };
}

function createValidEvent(overrides = {}) {
  return {
    eventId: "evt_test_001",
    eventType: "website.health.manual",
    source: "test.suite",
    occurredAt: "2026-08-02T00:00:00.000Z",
    tenantId: "mmg",
    workflowId: "website.health.v1",
    riskClass: "low",
    payload: { targetUrl: "https://themindsetmediagroup.com/" },
    metadata: {},
    ...overrides,
  };
}

function createWorkflow(overrides = {}) {
  return {
    workflowId: "website.health.v1",
    version: 1,
    status: "active",
    riskClass: "low",
    agents: ["website-operations-agent.v1"],
    environments: ["development", "staging", "production"],
    triggers: ["website.health.schedule", "website.health.manual"],
    autonomousActions: ["website.inspect", "incident.record", "repair.propose"],
    approvalRequiredActions: ["github.merge", "cloudflare.deploy.production"],
    blockedActions: ["shopify.price.change", "shopify.product.publish", "customer.email.send"],
    ...overrides,
  };
}

function createAllowPolicy() {
  return { decision: "ALLOW_AUTONOMOUS", policyId: "website.health.v1", policyVersion: 1, reasonCode: "ACTION_CERTIFIED_AUTONOMOUS", explanation: "Allowed for test." };
}
function createDenyPolicy() {
  return { decision: "DENY", policyId: "website.health.v1", policyVersion: 1, reasonCode: "TEST_POLICY_DENIAL", explanation: "Denied for test." };
}
function createApprovalPolicy() {
  return { decision: "REQUIRE_APPROVAL", policyId: "website.health.v1", policyVersion: 1, reasonCode: "TEST_APPROVAL_REQUIRED", explanation: "Approval required for test." };
}

function createMemoryLedgerClient({ clock = createClock() } = {}) {
  const repository = new MemoryRepository();
  let uuid = 0;
  const store = new AutonomyLedgerStore(repository, {
    now: clock.now,
    randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
  });
  const counts = { reserveEvent: 0, acquireLease: 0, markCompleted: 0, markFailed: 0, markBlocked: 0 };
  const client = {
    counts,
    clock,
    store,
    resetCounts() { for (const key of Object.keys(counts)) counts[key] = 0; },
    async reserveEvent(event) { counts.reserveEvent += 1; return store.reserveEvent(event); },
    async getEvent(tenantId, eventId) { return store.getEvent(tenantId, eventId); },
    async listRecentEvents(tenantId, limit) { return store.listRecentEvents(tenantId, limit); },
    async acquireLease(input) { counts.acquireLease += 1; return store.acquireLease(input); },
    async markCompleted(input) { counts.markCompleted += 1; return store.markCompleted(input); },
    async markFailed(input) { counts.markFailed += 1; return store.markFailed(input); },
    async markBlocked(input) { counts.markBlocked += 1; return store.markBlocked(input); },
    readRecord(tenantId = "mmg", eventId = "evt_test_001") { return store.getEvent(tenantId, eventId).record; },
  };
  return client;
}

function baseOptions(ledger, overrides = {}) {
  return {
    ledgerClient: ledger,
    workflowResolver: () => createWorkflow(),
    policyEvaluator: createAllowPolicy,
    workflowExecutor: async () => ({ workflowId: "website.health.v1", status: "passed" }),
    now: ledger?.clock?.now || (() => new Date("2026-08-02T00:00:00.000Z")),
    randomUUID: () => "11111111-1111-4111-8111-111111111111",
    ...overrides,
  };
}

function assertNormalizedResult(result) {
  assert.deepEqual(Object.keys(result), [
    "build", "disposition", "eventId", "tenantId", "workflowId", "duplicate",
    "retriable", "record", "policyDecision", "workflowResult", "error",
  ]);
  assert.equal(result.build, KAIROS_AUTONOMY_DISPATCHER_BUILD);
}

const enabledEnv = { KAIROS_KILL_SWITCH: "enabled", KAIROS_ENVIRONMENT: "production" };

test("rejects a malformed event without contacting the ledger", async () => {
  const ledger = createMemoryLedgerClient();
  let executions = 0;
  const response = await dispatchAutonomyEvent(null, enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => { executions += 1; } }));
  assert.equal(response.disposition, "rejected");
  assert.equal(response.retriable, false);
  assert.equal(ledger.counts.reserveEvent, 0);
  assert.equal(executions, 0);
});

test("rejects an unknown event type without contacting the ledger", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent({ eventType: "unknown.event" }), enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.error.code, "UNKNOWN_EVENT_TYPE");
  assert.equal(ledger.counts.reserveEvent, 0);
});

test("rejects a supplied workflow mismatch", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent({ workflowId: "other.workflow.v1" }), enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.error.code, "WORKFLOW_EVENT_MISMATCH");
  assert.equal(ledger.counts.reserveEvent, 0);
});

test("fails closed when the workflow is missing", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowResolver: () => null }));
  assert.equal(response.error.code, "WORKFLOW_NOT_REGISTERED");
  assert.equal(ledger.counts.reserveEvent, 0);
});

test("fails closed when the workflow is inactive", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowResolver: () => createWorkflow({ status: "disabled" }) }));
  assert.equal(response.error.code, "WORKFLOW_INACTIVE");
  assert.equal(ledger.counts.reserveEvent, 0);
});

test("fails closed when the trigger is not registered", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowResolver: () => createWorkflow({ triggers: [] }) }));
  assert.equal(response.error.code, "WORKFLOW_TRIGGER_NOT_REGISTERED");
});

test("fails closed when the agent is unauthorized", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowResolver: () => createWorkflow({ agents: [] }) }));
  assert.equal(response.error.code, "WORKFLOW_AGENT_NOT_AUTHORIZED");
});

test("fails closed when the environment is unauthorized", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowResolver: () => createWorkflow({ environments: ["staging"] }) }));
  assert.equal(response.error.code, "WORKFLOW_ENVIRONMENT_NOT_AUTHORIZED");
});

test("fails closed when website.inspect is not autonomous", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowResolver: () => createWorkflow({ autonomousActions: [] }) }));
  assert.equal(response.error.code, "WORKFLOW_ACTION_NOT_AUTHORIZED");
});

test("blocks when the kill-switch value is missing", async () => {
  const ledger = createMemoryLedgerClient();
  let executions = 0;
  const options = baseOptions(ledger, { policyEvaluator: undefined, workflowExecutor: async () => { executions += 1; } });
  delete options.policyEvaluator;
  const response = await dispatchAutonomyEvent(createValidEvent(), {}, {}, options);
  assert.equal(response.disposition, "blocked");
  assert.equal(executions, 0);
});

test("blocks when policy returns DENY", async () => {
  const ledger = createMemoryLedgerClient();
  let executions = 0;
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { policyEvaluator: createDenyPolicy, workflowExecutor: async () => { executions += 1; } }));
  assert.equal(response.disposition, "blocked");
  assert.equal(ledger.counts.markBlocked, 1);
  assert.equal(executions, 0);
});

test("blocks when policy returns REQUIRE_APPROVAL", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { policyEvaluator: createApprovalPolicy }));
  assert.equal(response.disposition, "blocked");
});

test("blocks when policy returns an unknown decision", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { policyEvaluator: () => ({ decision: "UNKNOWN" }) }));
  assert.equal(response.disposition, "blocked");
});

test("persists a policy block from accepted state", async () => {
  const ledger = createMemoryLedgerClient();
  await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { policyEvaluator: createDenyPolicy }));
  assert.equal(ledger.readRecord().status, "blocked");
});

test("recovers an expired running lease before persisting a policy block", async () => {
  const clock = createClock();
  const ledger = createMemoryLedgerClient({ clock });
  const event = createValidEvent();
  await ledger.reserveEvent(event);
  await ledger.acquireLease({ tenantId: event.tenantId, eventId: event.eventId, leaseDurationMs: 1_000 });
  clock.advance(1_001);
  ledger.resetCounts();
  const response = await dispatchAutonomyEvent(event, enabledEnv, {}, baseOptions(ledger, { policyEvaluator: createDenyPolicy }));
  assert.equal(response.disposition, "blocked");
  assert.equal(ledger.counts.acquireLease, 1);
  assert.equal(ledger.counts.markBlocked, 1);
  assert.equal(ledger.readRecord().attempt, 2);
});

test("executes a valid manual event", async () => {
  const ledger = createMemoryLedgerClient();
  let executions = 0;
  const response = await dispatchAutonomyEvent(createValidEvent({ eventType: "website.health.manual" }), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => { executions += 1; return { workflowId: "website.health.v1", status: "passed" }; } }));
  assert.equal(response.disposition, "completed");
  assert.equal(executions, 1);
  assert.equal(ledger.counts.markCompleted, 1);
});

test("executes a valid scheduled event", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent({ eventType: "website.health.schedule" }), enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.disposition, "completed");
});

test("persists a healthy result as completed", async () => {
  const ledger = createMemoryLedgerClient();
  await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger));
  assert.equal(ledger.readRecord().result.status, "passed");
});

test("persists a degraded result as completed", async () => {
  const ledger = createMemoryLedgerClient();
  let proposalExecuted = false;
  const workflowResult = { workflowId: "website.health.v1", status: "degraded", proposal: { executionAuthorized: false, steps: ["Do not execute this proposal."] } };
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => workflowResult }));
  assert.equal(response.disposition, "completed");
  assert.equal(ledger.readRecord().result.status, "degraded");
  assert.equal(ledger.readRecord().result.proposal.executionAuthorized, false);
  assert.equal(proposalExecuted, false);
});

test("never treats degraded inspection as a dispatcher failure", async () => {
  const ledger = createMemoryLedgerClient();
  await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => ({ status: "degraded" }) }));
  assert.equal(ledger.counts.markFailed, 0);
});

test("returns a completed event as a duplicate without re-execution", async () => {
  const ledger = createMemoryLedgerClient();
  const event = createValidEvent();
  await ledger.reserveEvent(event);
  const lease = await ledger.acquireLease({ tenantId: event.tenantId, eventId: event.eventId });
  await ledger.markCompleted({ tenantId: event.tenantId, eventId: event.eventId, leaseToken: lease.leaseToken, result: { status: "passed" } });
  let executions = 0;
  const response = await dispatchAutonomyEvent(event, enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => { executions += 1; } }));
  assert.equal(response.disposition, "duplicate");
  assert.equal(response.duplicate, true);
  assert.equal(executions, 0);
});

test("returns a blocked event as a duplicate without re-execution", async () => {
  const ledger = createMemoryLedgerClient();
  const event = createValidEvent();
  await ledger.reserveEvent(event);
  await ledger.markBlocked({ tenantId: event.tenantId, eventId: event.eventId, policyDecision: createDenyPolicy() });
  const response = await dispatchAutonomyEvent(event, enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.disposition, "duplicate");
  assert.equal(response.duplicate, true);
});

test("returns in_progress when an active lease exists", async () => {
  const ledger = createMemoryLedgerClient();
  const event = createValidEvent();
  await ledger.reserveEvent(event);
  await ledger.acquireLease({ tenantId: event.tenantId, eventId: event.eventId, leaseDurationMs: 30_000 });
  const response = await dispatchAutonomyEvent(event, enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.disposition, "in_progress");
  assert.equal(response.duplicate, true);
  assert.equal(response.retriable, true);
});

test("recovers an expired execution lease", async () => {
  const clock = createClock();
  const ledger = createMemoryLedgerClient({ clock });
  const event = createValidEvent();
  await ledger.reserveEvent(event);
  const first = await ledger.acquireLease({ tenantId: event.tenantId, eventId: event.eventId, leaseDurationMs: 1_000 });
  clock.advance(1_001);
  const response = await dispatchAutonomyEvent(event, enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.disposition, "completed");
  assert.equal(response.record.attempt, 2);
  assert.notEqual(first.leaseToken, response.record.leaseToken);
});

test("increments the attempt count after lease recovery", async () => {
  const clock = createClock();
  const ledger = createMemoryLedgerClient({ clock });
  const event = createValidEvent();
  await ledger.reserveEvent(event);
  await ledger.acquireLease({ tenantId: event.tenantId, eventId: event.eventId, leaseDurationMs: 1_000 });
  clock.advance(1_001);
  const response = await dispatchAutonomyEvent(event, enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.record.attempt, 2);
});

test("persists a workflow-returned blocked result", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => ({ status: "blocked", policyDecision: { decision: "DENY", reasonCode: "WORKFLOW_TEST_BLOCK" } }) }));
  assert.equal(response.disposition, "blocked");
  assert.equal(ledger.counts.markBlocked, 1);
  assert.equal(ledger.readRecord().status, "blocked");
});

test("fails safely when a stale token attempts to block", () => {
  const clock = createClock();
  const ledger = createMemoryLedgerClient({ clock });
  const event = createValidEvent();
  ledger.store.reserveEvent(event);
  const first = ledger.store.acquireLease({ tenantId: event.tenantId, eventId: event.eventId, leaseDurationMs: 1_000 });
  clock.advance(1_001);
  const second = ledger.store.acquireLease({ tenantId: event.tenantId, eventId: event.eventId, leaseDurationMs: 30_000 });
  const stale = ledger.store.markBlocked({ tenantId: event.tenantId, eventId: event.eventId, leaseToken: first.leaseToken, policyDecision: createDenyPolicy() });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "STALE_OR_INVALID_LEASE");
  assert.equal(stale.record.leaseToken, second.leaseToken);
});

test("allows the current lease holder to block a running event", () => {
  const ledger = createMemoryLedgerClient();
  const event = createValidEvent();
  ledger.store.reserveEvent(event);
  const lease = ledger.store.acquireLease({ tenantId: event.tenantId, eventId: event.eventId });
  const blocked = ledger.store.markBlocked({ tenantId: event.tenantId, eventId: event.eventId, leaseToken: lease.leaseToken, policyDecision: createDenyPolicy() });
  assert.equal(blocked.ok, true);
  assert.equal(blocked.record.status, "blocked");
});

test("persists a normal thrown workflow error as failed", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => { throw new Error("Test workflow failure"); } }));
  assert.equal(response.disposition, "failed");
  assert.equal(response.retriable, false);
  assert.equal(ledger.counts.markFailed, 1);
  assert.equal(ledger.readRecord().status, "failed");
});

test("preserves an explicitly retriable thrown error", async () => {
  const ledger = createMemoryLedgerClient();
  const error = new Error("Retriable failure");
  error.retriable = true;
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => { throw error; } }));
  assert.equal(response.retriable, true);
});

test("does not infer retriability from message text", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => { throw new Error("temporary timeout retry later"); } }));
  assert.equal(response.retriable, false);
});

test("removes stack traces from persisted errors", async () => {
  const ledger = createMemoryLedgerClient();
  const error = new Error("Error with stack");
  error.stack = "Error with stack\n at sensitive:1:1";
  await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => { throw error; } }));
  const stored = ledger.readRecord().error;
  assert.equal(Object.hasOwn(stored, "stack"), false);
  assert.equal(JSON.stringify(stored).includes("sensitive:1:1"), false);
});

test("removes credentials from persisted errors", async () => {
  const ledger = createMemoryLedgerClient();
  await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => { throw { message: "failure", authorization: "Bearer secret", apiKey: "secret", password: "secret" }; } }));
  const serialized = JSON.stringify(ledger.readRecord().error);
  assert.equal(serialized.includes("Bearer secret"), false);
  assert.equal(serialized.includes('"apiKey":"secret"'), false);
  assert.equal(serialized.includes('"password":"secret"'), false);
});

test("persists rejected workflow output as failed", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => ({ status: "rejected", error: { code: "TARGET_ORIGIN_NOT_ALLOWED", message: "Target rejected." } }) }));
  assert.equal(response.disposition, "failed");
  assert.equal(response.error.code, "TARGET_ORIGIN_NOT_ALLOWED");
  assert.equal(ledger.readRecord().status, "failed");
});

test("persists an invalid workflow result as failed", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => null }));
  assert.equal(response.error.code, "INVALID_WORKFLOW_RESULT");
  assert.equal(ledger.readRecord().status, "failed");
});

test("persists an unknown workflow status as failed", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => ({ status: "mystery" }) }));
  assert.equal(response.error.code, "INVALID_WORKFLOW_RESULT");
});

test("terminates an unresolved workflow at the dispatcher deadline", async () => {
  const ledger = createMemoryLedgerClient();
  const started = Date.now();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => new Promise(() => {}), executionTimeoutMs: 100, leaseDurationMs: 1_100 }));
  assert.equal(response.error.code, "DISPATCH_TIMEOUT");
  assert.ok(Date.now() - started < 1_000);
});

test("persists dispatcher timeout as failed", async () => {
  const ledger = createMemoryLedgerClient();
  await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => new Promise(() => {}), executionTimeoutMs: 100, leaseDurationMs: 1_100 }));
  assert.equal(ledger.readRecord().status, "failed");
});

test("marks dispatcher timeout as retriable", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => new Promise(() => {}), executionTimeoutMs: 100, leaseDurationMs: 1_100 }));
  assert.equal(response.error.code, "DISPATCH_TIMEOUT");
  assert.equal(response.retriable, true);
});

test("does not create an unhandled rejection when a late workflow rejects", async () => {
  const ledger = createMemoryLedgerClient();
  const unhandled = [];
  const listener = (error) => unhandled.push(error);
  process.on("unhandledRejection", listener);
  try {
    let rejectLate;
    const late = new Promise((_, reject) => { rejectLate = reject; });
    const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => late, executionTimeoutMs: 100, leaseDurationMs: 1_100 }));
    assert.equal(response.error.code, "DISPATCH_TIMEOUT");
    rejectLate(new Error("late rejection"));
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(unhandled.length, 0);
  } finally {
    process.off("unhandledRejection", listener);
  }
});

test("fails before execution when the ledger client is invalid", async () => {
  let executions = 0;
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, { ...baseOptions(null), ledgerClient: {}, workflowExecutor: async () => { executions += 1; } });
  assert.equal(response.error.code, "LEDGER_UNAVAILABLE");
  assert.equal(executions, 0);
});

test("fails before execution when reservation fails", async () => {
  const ledger = createMemoryLedgerClient();
  ledger.reserveEvent = async () => ({ ok: false, code: "LEDGER_OPERATION_FAILED", error: "Reservation failed." });
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.disposition, "failed");
  assert.equal(response.error.code, "LEDGER_OPERATION_FAILED");
});

test("fails before execution when lease acquisition fails", async () => {
  const ledger = createMemoryLedgerClient();
  ledger.acquireLease = async () => ({ ok: false, code: "LEDGER_OPERATION_FAILED", error: "Lease failed." });
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.disposition, "failed");
});

test("fails when successful lease acquisition has no lease token", async () => {
  const ledger = createMemoryLedgerClient();
  ledger.acquireLease = async () => ({ ok: true, record: { status: "running" } });
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.error.code, "LEDGER_LEASE_TOKEN_MISSING");
});

test("returns in_progress for ACTIVE_LEASE_EXISTS", async () => {
  const ledger = createMemoryLedgerClient();
  ledger.acquireLease = async () => ({ ok: false, code: "ACTIVE_LEASE_EXISTS", record: { status: "running", leaseExpiresAt: "2026-08-02T00:01:00.000Z" } });
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.disposition, "in_progress");
  assert.equal(response.retriable, true);
});

test("returns a safe failure when completion persistence fails", async () => {
  const ledger = createMemoryLedgerClient();
  ledger.markCompleted = async () => ({ ok: false, code: "LEDGER_OPERATION_FAILED", error: "Completion failed." });
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.disposition, "failed");
  assert.equal(response.error.code, "LEDGER_OPERATION_FAILED");
});

test("does not retry completion with another lease token", async () => {
  const ledger = createMemoryLedgerClient();
  let calls = 0;
  ledger.markCompleted = async () => { calls += 1; return { ok: false, code: "LEDGER_OPERATION_FAILED" }; };
  await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger));
  assert.equal(calls, 1);
});

test("returns a safe stale-lease failure", async () => {
  const ledger = createMemoryLedgerClient();
  let calls = 0;
  ledger.markCompleted = async () => { calls += 1; return { ok: false, code: "STALE_OR_INVALID_LEASE", error: "Stale lease." }; };
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.error.code, "STALE_OR_INVALID_LEASE");
  assert.equal(calls, 1);
});

test("fails safely when a workflow block cannot be persisted", async () => {
  const ledger = createMemoryLedgerClient();
  ledger.markBlocked = async () => ({ ok: false, code: "LEDGER_OPERATION_FAILED", error: "Block failed." });
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => ({ status: "blocked" }) }));
  assert.equal(response.disposition, "failed");
  assert.equal(response.error.code, "LEDGER_OPERATION_FAILED");
});

test("reports failure-write errors instead of claiming the workflow failure was persisted", async () => {
  const ledger = createMemoryLedgerClient();
  ledger.markFailed = async () => ({ ok: false, code: "LEDGER_OPERATION_FAILED", error: "Failure write failed." });
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => { throw new Error("workflow failed"); } }));
  assert.equal(response.error.code, "LEDGER_OPERATION_FAILED");
});

test("uses the normalized result contract for rejected disposition", async () => {
  const ledger = createMemoryLedgerClient();
  assertNormalizedResult(await dispatchAutonomyEvent(null, enabledEnv, {}, baseOptions(ledger)));
});

test("uses the normalized result contract for blocked disposition", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { policyEvaluator: createDenyPolicy }));
  assert.equal(response.disposition, "blocked");
  assertNormalizedResult(response);
});

test("uses the normalized result contract for in_progress disposition", async () => {
  const ledger = createMemoryLedgerClient();
  const event = createValidEvent();
  await ledger.reserveEvent(event);
  await ledger.acquireLease({ tenantId: event.tenantId, eventId: event.eventId });
  const response = await dispatchAutonomyEvent(event, enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.disposition, "in_progress");
  assertNormalizedResult(response);
});

test("uses the normalized result contract for completed disposition", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.disposition, "completed");
  assertNormalizedResult(response);
});

test("uses the normalized result contract for failed disposition", async () => {
  const ledger = createMemoryLedgerClient();
  const response = await dispatchAutonomyEvent(createValidEvent(), enabledEnv, {}, baseOptions(ledger, { workflowExecutor: async () => { throw new Error("fail"); } }));
  assert.equal(response.disposition, "failed");
  assertNormalizedResult(response);
});

test("uses the normalized result contract for duplicate disposition", async () => {
  const ledger = createMemoryLedgerClient();
  const event = createValidEvent();
  await ledger.reserveEvent(event);
  const lease = await ledger.acquireLease({ tenantId: event.tenantId, eventId: event.eventId });
  await ledger.markCompleted({ tenantId: event.tenantId, eventId: event.eventId, leaseToken: lease.leaseToken, result: { status: "passed" } });
  const response = await dispatchAutonomyEvent(event, enabledEnv, {}, baseOptions(ledger));
  assert.equal(response.disposition, "duplicate");
  assertNormalizedResult(response);
});
