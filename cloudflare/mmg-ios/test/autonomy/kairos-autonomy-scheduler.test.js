import test from "node:test";
import assert from "node:assert/strict";
import {
  handleAutonomyScheduledEvent,
  KAIROS_AUTONOMY_SCHEDULER_BUILD,
  KAIROS_AUTONOMY_HEALTH_CRON,
  KAIROS_AUTONOMY_ACTIVATION_ID,
} from "../../src/autonomy/kairos-autonomy-scheduler-v1.js";

const SCHEDULED_TIME = Date.parse("2026-08-02T12:00:00.000Z");

function env(overrides = {}) {
  return {
    KAIROS_AUTONOMY_SCHEDULED_ENABLED: "enabled",
    KAIROS_AUTONOMY_ACTIVATION_GATE: "website-health-v1",
    KAIROS_KILL_SWITCH: "enabled",
    KAIROS_ENVIRONMENT: "production",
    KAIROS_AUTONOMY_LEDGER: { idFromName() {}, get() {} },
    ...overrides,
  };
}

function controller(overrides = {}) {
  return { cron: KAIROS_AUTONOMY_HEALTH_CRON, scheduledTime: SCHEDULED_TIME, ...overrides };
}

function workflow(overrides = {}) {
  return { workflowId: "website.health.v1", version: 1, status: "active", triggers: ["website.health.schedule"], ...overrides };
}

function dispatchResult(disposition = "completed", overrides = {}) {
  return {
    build: "test-dispatcher",
    disposition,
    eventId: "evt_website_health_20260802T120000Z",
    tenantId: "mmg",
    workflowId: "website.health.v1",
    duplicate: disposition === "duplicate" || disposition === "in_progress",
    retriable: disposition === "in_progress" || disposition === "failed",
    record: null,
    policyDecision: null,
    workflowResult: null,
    error: null,
    ...overrides,
  };
}

function harness(overrides = {}) {
  const observations = [];
  return {
    observations,
    options: {
      dispatcher: async () => dispatchResult(),
      workflowResolver: () => workflow(),
      logger: { log(value) { observations.push(JSON.parse(value)); } },
      ...overrides,
    },
  };
}

test("exports exact scheduler constants", () => {
  assert.equal(KAIROS_AUTONOMY_SCHEDULER_BUILD, "kairos-autonomy-scheduler-20260802-1");
  assert.equal(KAIROS_AUTONOMY_HEALTH_CRON, "0 * * * *");
  assert.equal(KAIROS_AUTONOMY_ACTIVATION_ID, "website-health-v1");
});

test("ignores unrelated crons without dispatching", async () => {
  let calls = 0;
  const { observations, options } = harness({ dispatcher: async () => { calls += 1; return dispatchResult(); } });
  const response = await handleAutonomyScheduledEvent(controller({ cron: "0 2 * * *" }), env(), {}, options);
  assert.equal(response.handled, false);
  assert.equal(response.status, "ignored");
  assert.equal(calls, 0);
  assert.deepEqual(observations.map((entry) => entry.type), ["scheduler.ignored"]);
});

for (const [name, overrides] of [
  ["missing scheduled flag", { KAIROS_AUTONOMY_SCHEDULED_ENABLED: undefined }],
  ["scheduled flag case", { KAIROS_AUTONOMY_SCHEDULED_ENABLED: "Enabled" }],
  ["scheduled flag whitespace", { KAIROS_AUTONOMY_SCHEDULED_ENABLED: "enabled " }],
  ["missing activation gate", { KAIROS_AUTONOMY_ACTIVATION_GATE: undefined }],
  ["wrong activation gate", { KAIROS_AUTONOMY_ACTIVATION_GATE: "wrong" }],
  ["missing kill switch", { KAIROS_KILL_SWITCH: undefined }],
  ["kill switch case", { KAIROS_KILL_SWITCH: "ENABLED" }],
  ["unauthorized environment", { KAIROS_ENVIRONMENT: "PRODUCTION" }],
  ["missing ledger", { KAIROS_AUTONOMY_LEDGER: undefined }],
  ["incomplete ledger", { KAIROS_AUTONOMY_LEDGER: { idFromName() {} } }],
]) {
  test(`fails closed for ${name}`, async () => {
    let calls = 0;
    const { observations, options } = harness({ dispatcher: async () => { calls += 1; return dispatchResult(); } });
    const response = await handleAutonomyScheduledEvent(controller(), env(overrides), {}, options);
    assert.equal(response.status, "blocked");
    assert.equal(calls, 0);
    assert.deepEqual(observations.map((entry) => entry.type), ["activation.blocked"]);
    assert.equal(Object.values(response.activation).every((value) => typeof value === "boolean"), true);
  });
}

test("requires an active matching workflow and exact trigger", async () => {
  for (const definition of [null, workflow({ status: "inactive" }), workflow({ workflowId: "wrong" }), workflow({ triggers: [] })]) {
    const { options } = harness({ workflowResolver: () => definition });
    assert.equal((await handleAutonomyScheduledEvent(controller(), env(), {}, options)).status, "blocked");
  }
});

test("rejects invalid scheduled timestamps before dispatch", async () => {
  for (const scheduledTime of [undefined, null, NaN, Infinity, "2026-08-02T12:00:00.000Z", new Date("invalid")]) {
    let calls = 0;
    const { observations, options } = harness({ dispatcher: async () => { calls += 1; return dispatchResult(); } });
    const response = await handleAutonomyScheduledEvent(controller({ scheduledTime }), env(), {}, options);
    assert.equal(response.status, "failed");
    assert.equal(response.error.code, "INVALID_SCHEDULED_TIME");
    assert.equal(calls, 0);
    assert.deepEqual(observations.map((entry) => entry.type), ["scheduler.exception"]);
  }
});

test("constructs the deterministic event envelope", async () => {
  let captured;
  const { options } = harness({ dispatcher: async (event) => { captured = event; return dispatchResult(); } });
  await handleAutonomyScheduledEvent(controller(), env({
    KAIROS_WEBSITE_HEALTH_TARGET_URL: " https://themindsetmediagroup.com/ ",
    UNRELATED_VALUE: "omitted-marker",
  }), {}, options);
  assert.equal(captured.eventId, "evt_website_health_20260802T120000Z");
  assert.equal(captured.correlationId, "corr_website_health_20260802T120000Z");
  assert.equal(captured.eventType, "website.health.schedule");
  assert.equal(captured.source, "cloudflare.cron");
  assert.equal(captured.tenantId, "mmg");
  assert.equal(captured.workflowId, "website.health.v1");
  assert.equal(captured.occurredAt, "2026-08-02T12:00:00.000Z");
  assert.deepEqual(captured.payload, { targetUrl: "https://themindsetmediagroup.com/" });
  assert.deepEqual(Object.keys(captured.metadata).sort(), ["cron", "dispatcherBuild", "observabilityBuild", "schedulerBuild"]);
  assert.equal(JSON.stringify(captured).includes("omitted-marker"), false);
});

test("passes dispatch seams and ctx unchanged without waitUntil", async () => {
  const runtimeEnv = { isolated: true };
  const runtimeOptions = { custom: true };
  let capturedEnv;
  let capturedCtx;
  let capturedOptions;
  let waitCalls = 0;
  const ctx = { waitUntil() { waitCalls += 1; } };
  const { options } = harness({
    dispatchEnv: runtimeEnv,
    dispatchOptions: runtimeOptions,
    dispatcher: async (_event, nextEnv, nextCtx, nextOptions) => {
      capturedEnv = nextEnv;
      capturedCtx = nextCtx;
      capturedOptions = nextOptions;
      return dispatchResult();
    },
  });
  await handleAutonomyScheduledEvent(controller(), env(), ctx, options);
  assert.equal(capturedEnv, runtimeEnv);
  assert.equal(capturedCtx, ctx);
  assert.equal(capturedOptions, runtimeOptions);
  assert.equal(waitCalls, 0);
});

for (const disposition of ["completed", "duplicate", "in_progress", "blocked", "rejected", "failed"]) {
  test(`returns governed ${disposition} dispatcher outcome`, async () => {
    const value = Object.freeze(dispatchResult(disposition));
    const { observations, options } = harness({ dispatcher: async () => value });
    const response = await handleAutonomyScheduledEvent(controller(), env(), {}, options);
    assert.equal(response.status, "dispatched");
    assert.equal(response.result, value);
    assert.deepEqual(observations.map((entry) => entry.type), ["scheduler.invoked", `dispatch.${disposition}`]);
  });
}

test("fails closed for unavailable, thrown, and malformed dispatchers", async () => {
  const cases = [
    [null, "DISPATCHER_UNAVAILABLE"],
    ["invalid", "DISPATCHER_UNAVAILABLE"],
    [async () => { throw new Error("internal-detail"); }, "DISPATCHER_EXCEPTION"],
    [async () => null, "MALFORMED_DISPATCH_RESULT"],
    [async () => [], "MALFORMED_DISPATCH_RESULT"],
    [async () => dispatchResult("unknown"), "MALFORMED_DISPATCH_RESULT"],
    [async () => ({ disposition: "completed" }), "MALFORMED_DISPATCH_RESULT"],
  ];
  for (const [dispatcher, code] of cases) {
    const { observations, options } = harness({ dispatcher });
    const response = await handleAutonomyScheduledEvent(controller(), env(), {}, options);
    assert.equal(response.status, "failed");
    assert.equal(response.error.code, code);
    assert.equal(JSON.stringify(response).includes("internal-detail"), false);
    assert.equal(observations.at(-1).type, "scheduler.exception");
  }
});

test("never logs or executes dispatcher internals", async () => {
  let executed = 0;
  const marker = "omitted-repair-marker";
  const value = dispatchResult("completed", {
    workflowResult: { marker, execute() { executed += 1; }, proposal: { execute() { executed += 1; } } },
  });
  const { observations, options } = harness({ dispatcher: async () => value });
  await handleAutonomyScheduledEvent(controller(), env(), {}, options);
  assert.equal(executed, 0);
  assert.equal(JSON.stringify(observations).includes(marker), false);
  for (const key of ["record", "workflowResult", "policyDecision", "result", "payload"]) {
    assert.equal(JSON.stringify(observations).includes(`\"${key}\"`), false);
  }
});
