import test from "node:test";
import assert from "node:assert/strict";
import {
  KAIROS_AUTONOMY_OBSERVABILITY_BUILD,
  summarizeAutonomyRecords,
  projectAutonomyRecord,
  emitAutonomyObservation,
} from "../../src/autonomy/kairos-autonomy-observability-v1.js";

const NOW = new Date("2026-08-02T12:00:00.000Z");
const quietLogger = { log() {} };

function record(overrides = {}) {
  return {
    eventId: "evt_1",
    tenantId: "mmg",
    workflowId: "website.health.v1",
    eventType: "website.health.schedule",
    riskClass: "low",
    status: "completed",
    attempt: 1,
    acceptedAt: "2026-08-02T11:59:00.000Z",
    completedAt: "2026-08-02T11:59:02.000Z",
    updatedAt: "2026-08-02T11:59:02.000Z",
    ...overrides,
  };
}

test("exports the observability build", () => {
  assert.equal(KAIROS_AUTONOMY_OBSERVABILITY_BUILD, "kairos-autonomy-observability-20260802-1");
});

test("validates records before the injected clock", () => {
  const result = summarizeAutonomyRecords(null, { now: "invalid" });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_OBSERVABILITY_RECORDS");
  assert.equal(result.build, KAIROS_AUTONOMY_OBSERVABILITY_BUILD);
});

test("accepts only Date-based clocks", () => {
  assert.equal(summarizeAutonomyRecords([], { now: NOW.toISOString() }).error.code, "INVALID_OBSERVABILITY_CLOCK");
  assert.equal(summarizeAutonomyRecords([], { now: NOW }).generatedAt, NOW.toISOString());
  assert.equal(summarizeAutonomyRecords([], { now: () => NOW }).generatedAt, NOW.toISOString());
});

test("summarizes statuses and stale leases", () => {
  const result = summarizeAutonomyRecords([
    record({ status: "accepted" }),
    record({ status: "running", leaseExpiresAt: NOW.toISOString() }),
    record({ status: "completed" }),
    record({ status: "failed" }),
    record({ status: "blocked" }),
    record({ status: "unknown-value" }),
  ], { now: NOW });
  assert.deepEqual(result.counts, { accepted: 1, running: 1, completed: 1, failed: 1, blocked: 1, unknown: 1 });
  assert.equal(result.activeCount, 3);
  assert.equal(result.terminalCount, 2);
  assert.equal(result.staleRunningCount, 1);
});

test("sorts safe projections and bounds the recent list", () => {
  const source = Object.freeze([
    Object.freeze(record({ eventId: "older", updatedAt: "2026-08-02T10:00:00.000Z" })),
    Object.freeze(record({ eventId: "newer", updatedAt: "2026-08-02T11:00:00.000Z" })),
  ]);
  const result = summarizeAutonomyRecords(source, { now: NOW, limit: 1 });
  assert.equal(result.recent[0].eventId, "newer");
  assert.equal(result.latestEvent.eventId, "newer");
});

test("projects only bounded attempts and string timestamps", () => {
  assert.equal(projectAutonomyRecord(record({ attempt: -1 })).attempt, null);
  assert.equal(projectAutonomyRecord(record({ attempt: 1_000_001 })).attempt, null);
  assert.equal(projectAutonomyRecord(record({ acceptedAt: new Date() })).acceptedAt, null);
  assert.equal(projectAutonomyRecord([]).status, "unknown");
});

test("excludes ledger internals and preserves safe policy fields", () => {
  const projected = projectAutonomyRecord(record({
    leaseToken: "omitted-marker",
    result: { proposal: { steps: ["omitted-step"] } },
    error: { code: "SAFE_ERROR", message: "omitted-message" },
    policyDecision: {
      decision: "ALLOW_AUTONOMOUS",
      policyId: "website.health.v1",
      policyVersion: 1,
      reasonCode: "ACTION_CERTIFIED_AUTONOMOUS",
      explanation: "omitted-explanation",
    },
  }));
  const serialized = JSON.stringify(projected);
  assert.equal(projected.errorCode, "SAFE_ERROR");
  assert.equal(projected.policyDecision.policyVersion, 1);
  for (const marker of ["omitted-marker", "omitted-step", "omitted-message", "omitted-explanation"]) {
    assert.equal(serialized.includes(marker), false);
  }
});

test("does not promote arbitrary messages into codes", () => {
  assert.equal(projectAutonomyRecord(record({ error: { message: "DATABASE TEMPORARILY UNAVAILABLE" } })).errorCode, null);
});

test("emits one strict observation and normalizes unknown input", () => {
  const entries = [];
  const observation = emitAutonomyObservation("scheduler.invoked", {
    eventId: "evt_1",
    environment: "production",
    unauthorized: "omitted",
  }, { logger: { log(value) { entries.push(JSON.parse(value)); } }, now: NOW });
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], observation);
  assert.equal(observation.unauthorized, undefined);
  assert.equal(emitAutonomyObservation("unknown", {}, { logger: quietLogger, now: NOW }).type, "autonomy.unknown");
});

test("logging failures never alter execution", () => {
  assert.doesNotThrow(() => emitAutonomyObservation("scheduler.invoked", {}, {
    logger: { log() { throw new Error("log failure"); } },
    now: NOW,
  }));
});
