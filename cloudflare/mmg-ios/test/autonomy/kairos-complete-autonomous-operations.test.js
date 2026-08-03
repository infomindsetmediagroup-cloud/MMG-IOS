import test from "node:test";
import assert from "node:assert/strict";

import {
  prioritizeBusinessState,
  KAIROS_BUSINESS_PRIORITIZER_BUILD,
} from "../../src/autonomy/kairos-business-prioritizer-v1.js";
import {
  orchestrateBusinessOperations,
  KAIROS_BUSINESS_ORCHESTRATOR_BUILD,
} from "../../src/autonomy/kairos-business-orchestrator-v1.js";
import {
  runAutonomousOperationsCycle,
  evaluateAutonomousOperationsActivation,
  KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD,
} from "../../src/autonomy/kairos-autonomous-operations-cycle-v1.js";
import {
  handleAutonomyScheduledEvent,
  KAIROS_AUTONOMY_SCHEDULER_BUILD,
} from "../../src/autonomy/kairos-autonomy-scheduler-v2.js";
import {
  handleAutonomyApiRequest,
  KAIROS_AUTONOMY_API_BUILD,
} from "../../src/autonomy/kairos-autonomy-api-v5.js";
import { evaluatePolicy } from "../../src/autonomy/kairos-policy-engine-v1.js";

const NOW = "2026-08-02T20:00:00.000Z";
const TOKEN = "0123456789abcdef".repeat(4);

function state({
  status = "healthy",
  severity = "info",
  stale = 0,
  coverageComplete = true,
  hasFailures = status === "failed",
  hasBlocked = status === "blocked",
  hasCritical = severity === "critical",
} = {}) {
  const byStatus = {
    failed: status === "failed" ? 1 : 0,
    blocked: status === "blocked" ? 1 : 0,
    degraded: status === "degraded" ? 1 : 0,
    attention: status === "attention" ? 1 : 0,
    unknown: status === "unknown" ? 1 : 0,
    healthy: status === "healthy" ? 1 : 0,
  };
  const bySeverity = {
    critical: severity === "critical" ? 1 : 0,
    high: severity === "high" ? 1 : 0,
    medium: severity === "medium" ? 1 : 0,
    low: severity === "low" ? 1 : 0,
    info: severity === "info" ? 1 : 0,
  };
  return {
    ok: true,
    build: "kairos-business-collector-20260802-1",
    schemaVersion: 1,
    generatedAt: NOW,
    tenantId: "mmg",
    observationBuild: "kairos-business-observation-20260802-1",
    websiteWorkflowBuild: "kairos-website-health-workflow-v1",
    selectedCollectors: ["website.health.v1"],
    collectorCount: 1,
    collectedCount: 1,
    blockedCount: 0,
    failedCount: 0,
    collectors: [],
    snapshot: {
      ok: true,
      build: "kairos-business-observation-20260802-1",
      schemaVersion: 1,
      snapshotId: `bss_20260802t200000z_${status}_${severity}`.replace(/[^a-z0-9._:-]/gu, "_"),
      tenantId: "mmg",
      generatedAt: NOW,
      window: { start: "2026-08-01T20:00:00.000Z", end: NOW, durationMs: 86_400_000 },
      inputCount: 1,
      includedCount: 1,
      excludedOutOfWindowCount: 0,
      counts: {
        total: 1,
        stale,
        byDomain: { website: 1 },
        byStatus,
        bySeverity,
      },
      health: {
        overallStatus: status,
        highestSeverity: severity,
        attentionRequired: status !== "healthy" || stale > 0 || !coverageComplete,
        hasFailures,
        hasBlocked,
        hasCritical,
        coverageComplete,
      },
      coverage: {
        requiredSources: ["website.health.workflow"],
        observedSources: coverageComplete ? ["website.health.workflow"] : [],
        missingSources: coverageComplete ? [] : ["website.health.workflow"],
        complete: coverageComplete,
      },
      domains: [{
        domain: "website",
        signalCount: 1,
        staleCount: stale,
        status,
        highestSeverity: severity,
        latestObservedAt: NOW,
        statusCounts: byStatus,
        severityCounts: bySeverity,
        latestSignal: null,
      }],
      sources: [],
      recent: [],
    },
  };
}

function activationEnv(overrides = {}) {
  return {
    KAIROS_ENVIRONMENT: "production",
    KAIROS_KILL_SWITCH: "enabled",
    KAIROS_AUTONOMY_SCHEDULED_ENABLED: "enabled",
    KAIROS_AUTONOMOUS_OPERATIONS_ENABLED: "enabled",
    KAIROS_AUTONOMY_ACTIVATION_GATE: "business-operations-v1",
    KAIROS_WEBSITE_HEALTH_TARGET_URL: "https://themindsetmediagroup.com",
    KAIROS_WEBSITE_HEALTH_ALLOWED_ORIGINS: "https://themindsetmediagroup.com",
    KAIROS_AUTONOMY_LEDGER: {
      idFromName() { return "ledger-id"; },
      get() { return {}; },
    },
    ...overrides,
  };
}

function fakeLedger() {
  const calls = [];
  const ledger = {
    calls,
    async storeBusinessSnapshot(value) {
      calls.push(["storeBusinessSnapshot", value.snapshot.snapshotId]);
      return {
        ok: true,
        disposition: "stored",
        duplicate: false,
        record: {
          tenantId: value.tenantId,
          snapshotId: value.snapshot.snapshotId,
          generatedAt: value.generatedAt,
          storedAt: "2026-08-02T20:00:01.000Z",
        },
      };
    },
    async reserveEvent(event) {
      calls.push(["reserveEvent", event.eventId, event.payload.action]);
      return { ok: true, record: { status: "accepted", eventId: event.eventId } };
    },
    async acquireLease(input) {
      calls.push(["acquireLease", input.eventId]);
      return { ok: true, leaseToken: `lease_${input.eventId}`, record: { status: "running" } };
    },
    async markCompleted(input) {
      calls.push(["markCompleted", input.eventId, input.result.action]);
      return { ok: true, record: { status: "completed" } };
    },
    async markFailed(input) {
      calls.push(["markFailed", input.eventId, input.error.code]);
      return { ok: true, record: { status: "failed" } };
    },
    async markBlocked(input) {
      calls.push(["markBlocked", input.eventId, input.policyDecision.reasonCode]);
      return { ok: true, record: { status: "blocked" } };
    },
  };
  return ledger;
}

function storedSnapshotResult(value) {
  return {
    ok: true,
    disposition: "stored",
    duplicate: false,
    record: {
      tenantId: value.tenantId,
      snapshotId: value.snapshot.snapshotId,
      generatedAt: value.generatedAt,
      storedAt: "2026-08-02T20:00:01.000Z",
    },
    statusCode: 201,
  };
}

test("healthy business state produces a deterministic steady plan", () => {
  const first = prioritizeBusinessState(state());
  const second = prioritizeBusinessState(state());
  assert.equal(first.ok, true);
  assert.equal(first.build, KAIROS_BUSINESS_PRIORITIZER_BUILD);
  assert.equal(first.status, "steady");
  assert.equal(first.taskCount, 0);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
});

test("degraded website state creates certified autonomous work", () => {
  const plan = prioritizeBusinessState(state({ status: "degraded", severity: "medium" }));
  assert.equal(plan.ok, true);
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.tasks.map((task) => task.action).sort(), ["repair.propose", "website.reinspect"]);
  assert.equal(plan.approvalCount, 0);
});

test("critical state adds an approval-required executive review", () => {
  const plan = prioritizeBusinessState(state({ status: "failed", severity: "critical" }));
  assert.equal(plan.ok, true);
  assert.equal(plan.status, "approval_required");
  assert.ok(plan.tasks.some((task) => task.action === "executive.review.request"));
  assert.ok(plan.tasks.some((task) => task.action === "incident.record"));
});

test("business operations policy allows certified work and gates protected work", () => {
  const base = {
    agent: "business-operations-agent.v1",
    workflowId: "business.operations.v1",
    riskClass: "low",
    environment: "production",
    globalKillSwitch: "enabled",
  };
  assert.equal(evaluatePolicy({ ...base, action: "collector.refresh" }).decision, "ALLOW_AUTONOMOUS");
  assert.equal(evaluatePolicy({ ...base, action: "website.reinspect" }).decision, "ALLOW_AUTONOMOUS");
  assert.equal(evaluatePolicy({ ...base, action: "executive.review.request", riskClass: "medium" }).decision, "REQUIRE_APPROVAL");
  assert.equal(evaluatePolicy({ ...base, action: "funds.spend" }).decision, "DENY");
});

test("orchestrator executes safe tasks and records approval blocks", async () => {
  const businessState = state({ status: "failed", severity: "critical" });
  const plan = prioritizeBusinessState(businessState);
  const ledger = fakeLedger();
  const result = await orchestrateBusinessOperations(
    plan,
    businessState,
    activationEnv(),
    {},
    {
      ledgerClient: ledger,
      websiteHealthExecutor: async () => ({
        build: "website-health-test",
        status: "passed",
        repairProposal: null,
      }),
    },
  );
  assert.equal(result.build, KAIROS_BUSINESS_ORCHESTRATOR_BUILD);
  assert.equal(result.ok, true);
  assert.ok(result.counts.completed >= 3);
  assert.equal(result.counts.blocked, 1);
  assert.ok(ledger.calls.some((call) => call[0] === "markBlocked"));
  assert.equal(JSON.stringify(result).includes("https://"), false);
});

test("activation is exact and fail-closed", () => {
  assert.equal(evaluateAutonomousOperationsActivation(activationEnv()).ready, true);
  for (const overrides of [
    { KAIROS_AUTONOMOUS_OPERATIONS_ENABLED: "Enabled" },
    { KAIROS_AUTONOMY_ACTIVATION_GATE: " website-operations-v1" },
    { KAIROS_KILL_SWITCH: "enabled " },
    { KAIROS_ENVIRONMENT: " production " },
  ]) {
    assert.equal(evaluateAutonomousOperationsActivation(activationEnv(overrides)).ready, false);
  }
});

test("complete cycle collects, persists, prioritizes, executes, and records", async () => {
  const businessState = state({ status: "degraded", severity: "medium" });
  const ledger = fakeLedger();
  const cycle = await runAutonomousOperationsCycle(
    { mode: "scheduled", tenantId: "mmg" },
    activationEnv(),
    {},
    {
      ledgerClient: ledger,
      businessCollector: async () => businessState,
      websiteHealthExecutor: async () => ({
        build: "website-health-test",
        status: "passed",
        repairProposal: null,
      }),
    },
  );
  assert.equal(cycle.build, KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD);
  assert.equal(cycle.ok, true);
  assert.equal(cycle.persistence.disposition, "stored");
  assert.equal(cycle.plan.taskCount, 2);
  assert.equal(cycle.orchestration.counts.completed, 2);
  assert.deepEqual(ledger.calls[0], ["storeBusinessSnapshot", businessState.snapshot.snapshotId]);
});

test("scheduled handler runs the complete cycle once", async () => {
  let calls = 0;
  const response = await handleAutonomyScheduledEvent(
    { cron: "0 * * * *", scheduledTime: Date.parse(NOW) },
    activationEnv(),
    {},
    {
      cycleRunner: async () => {
        calls += 1;
        return {
          ok: true,
          status: "completed",
          snapshotId: "bss_test",
          activation: { ready: true },
          plan: { planId: "plan_test", taskCount: 0 },
          orchestration: { counts: { completed: 0, blocked: 0, failed: 0 } },
          error: null,
        };
      },
    },
  );
  assert.equal(response.build, KAIROS_AUTONOMY_SCHEDULER_BUILD);
  assert.equal(response.status, "completed");
  assert.equal(calls, 1);
});

test("API v5 status exposes complete operations readiness without leaking secrets", async () => {
  const response = await handleAutonomyApiRequest(
    new Request("https://kairos.example/api/autonomy/status", {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }),
    activationEnv({ KAIROS_AUTONOMY_API_TOKEN: TOKEN }),
  );
  const text = await response.text();
  const body = JSON.parse(text);
  assert.equal(response.status, 200);
  assert.equal(body.build, KAIROS_AUTONOMY_API_BUILD);
  assert.equal(body.autonomousOperations.ready, true);
  assert.equal(body.businessObservation.scheduledPersistenceEnabled, true);
  assert.equal(body.businessObservation.prioritizationEnabled, true);
  assert.equal(body.businessObservation.orchestrationEnabled, true);
  assert.equal(text.includes(TOKEN), false);
});

test("API v5 manual collection runs the complete operations cycle", async () => {
  const businessState = state({ status: "healthy", severity: "info" });
  const ledger = fakeLedger();
  const response = await handleAutonomyApiRequest(
    new Request("https://kairos.example/api/autonomy/business-state/collect", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tenantId: "mmg" }),
    }),
    activationEnv({ KAIROS_AUTONOMY_API_TOKEN: TOKEN }),
    {},
    {
      businessCollector: async () => businessState,
      businessStateLedgerClient: {
        async storeBusinessSnapshot(value) { return storedSnapshotResult(value); },
      },
      ledgerClient: ledger,
      websiteHealthExecutor: async () => ({ build: "website-health-test", status: "passed" }),
    },
  );
  const body = JSON.parse(await response.text());
  assert.equal(response.status, 200);
  assert.equal(body.build, KAIROS_AUTONOMY_API_BUILD);
  assert.equal(body.operations.ok, true);
  assert.equal(body.operations.plan.taskCount, 0);
  assert.equal(response.headers.get("X-Kairos-Business-Orchestrator-Build"), KAIROS_BUSINESS_ORCHESTRATOR_BUILD);
});
