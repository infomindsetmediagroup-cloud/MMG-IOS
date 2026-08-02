import test from "node:test";
import assert from "node:assert/strict";

import {
  KAIROS_BUSINESS_COLLECTOR_BUILD,
  KAIROS_BUSINESS_COLLECTOR_SCHEMA_VERSION,
  KAIROS_BUSINESS_COLLECTOR_IDS,
  collectBusinessState,
} from "../../src/autonomy/kairos-business-collector-v1.js";

const NOW = new Date("2026-08-02T19:00:00.000Z");

function passedResult(overrides = {}) {
  return {
    workflowId: "website.health.v1",
    status: "passed",
    checkedAt: "2026-08-02T18:59:30.000Z",
    incidentsDetected: 0,
    healthCheck: {
      statusCode: 200,
      latencyMs: 142,
      bodyBytesInspected: 4096,
      bodyTruncated: false,
    },
    ...overrides,
  };
}

function degradedResult(overrides = {}) {
  return {
    workflowId: "website.health.v1",
    status: "degraded",
    recordedAt: "2026-08-02T18:59:30.000Z",
    incident: {
      incidentId: "inc_website_001",
      reason: "HTTP_ERROR",
      details: {
        statusCode: 503,
        latencyMs: 312,
        bodyBytes: 2048,
        bodyTruncated: false,
      },
    },
    proposal: {
      title: "Private proposal",
      steps: ["Private step"],
      executionAuthorized: false,
    },
    auditPersistence: { status: "recorded" },
    ...overrides,
  };
}

function blockedResult(overrides = {}) {
  return {
    workflowId: "website.health.v1",
    status: "blocked",
    checkedAt: "2026-08-02T18:59:30.000Z",
    policyDecision: {
      reasonCode: "GLOBAL_KILL_SWITCH_DISABLED",
      explanation: "Private policy explanation",
    },
    ...overrides,
  };
}

function rejectedResult(overrides = {}) {
  return {
    workflowId: "website.health.v1",
    status: "rejected",
    checkedAt: "2026-08-02T18:59:30.000Z",
    error: {
      code: "TARGET_ORIGIN_NOT_ALLOWED",
      message: "Private target detail",
    },
    ...overrides,
  };
}

function executorFor(result) {
  return async () => result;
}

function options(executor, overrides = {}) {
  return {
    now: NOW,
    websiteHealthExecutor: executor,
    ...overrides,
  };
}

function recentSignal(result) {
  return result.snapshot.recent[0];
}

function isDeepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || value instanceof Date || seen.has(value)) {
    return true;
  }
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor
      && Object.hasOwn(descriptor, "value")
      && !isDeepFrozen(descriptor.value, seen)
    ) {
      return false;
    }
  }
  return true;
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

test("exports the exact collector build", () => {
  assert.equal(KAIROS_BUSINESS_COLLECTOR_BUILD, "kairos-business-collector-20260802-1");
});

test("exports schema version one", () => {
  assert.equal(KAIROS_BUSINESS_COLLECTOR_SCHEMA_VERSION, 1);
});

test("exports the exact collector registry order", () => {
  assert.deepEqual(KAIROS_BUSINESS_COLLECTOR_IDS, ["website.health.v1"]);
});

test("freezes the exported collector registry", () => {
  assert.equal(Object.isFrozen(KAIROS_BUSINESS_COLLECTOR_IDS), true);
});

test("rejects an omitted tenant", async () => {
  const result = await collectBusinessState({}, {}, { now: NOW });
  assert.equal(result.error.code, "INVALID_TENANT_ID");
});

test("rejects null input", async () => {
  const result = await collectBusinessState(null, {}, { now: NOW });
  assert.equal(result.error.code, "INVALID_INPUT");
});

test("accepts a null-prototype input", async () => {
  const input = Object.create(null);
  input.tenantId = "mmg";
  const result = await collectBusinessState(
    input,
    {},
    options(executorFor(passedResult())),
  );
  assert.equal(result.ok, true);
});

test("rejects uppercase tenant identifiers", async () => {
  const result = await collectBusinessState({ tenantId: "MMG" }, {}, { now: NOW });
  assert.equal(result.error.code, "INVALID_TENANT_ID");
});

test("accepts a 256-character tenant identifier", async () => {
  const result = await collectBusinessState(
    { tenantId: "a".repeat(256) },
    {},
    options(executorFor(passedResult())),
  );
  assert.equal(result.ok, true);
});

test("rejects a 257-character tenant identifier", async () => {
  const result = await collectBusinessState(
    { tenantId: "a".repeat(257) },
    {},
    { now: NOW },
  );
  assert.equal(result.error.code, "INVALID_TENANT_ID");
});

test("rejects an enumerable unknown input field", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg", token: "private" },
    {},
    { now: NOW },
  );
  assert.equal(result.error.code, "UNKNOWN_INPUT_FIELD");
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("rejects a symbol input field", async () => {
  const symbol = Symbol("private");
  const input = { tenantId: "mmg", [symbol]: true };
  const result = await collectBusinessState(input, {}, { now: NOW });
  assert.equal(result.error.code, "UNKNOWN_INPUT_FIELD");
});

test("does not invoke an input getter", async () => {
  let calls = 0;
  const input = {};
  Object.defineProperty(input, "tenantId", {
    enumerable: true,
    get() {
      calls += 1;
      return "mmg";
    },
  });
  const result = await collectBusinessState(input, {}, { now: NOW });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("deeply freezes input failures", async () => {
  const result = await collectBusinessState({}, {}, { now: NOW });
  assert.equal(isDeepFrozen(result), true);
});

test("defaults collectors to the website collector", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(passedResult())),
  );
  assert.deepEqual(result.selectedCollectors, ["website.health.v1"]);
});

test("accepts an empty collector selection", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg", collectors: [] },
    {},
    options(async () => {
      throw new Error("must not run");
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.collectorCount, 0);
  assert.deepEqual(result.collectors, []);
  assert.deepEqual(result.snapshot.coverage.requiredSources, []);
  assert.equal(result.snapshot.coverage.complete, true);
});

test("does not invoke the website executor for an empty selection", async () => {
  let calls = 0;
  const result = await collectBusinessState(
    { tenantId: "mmg", collectors: [] },
    {},
    options(async () => {
      calls += 1;
      return passedResult();
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(calls, 0);
});

test("rejects a non-array collector selection", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg", collectors: "website.health.v1" },
    {},
    { now: NOW },
  );
  assert.equal(result.error.code, "INVALID_COLLECTORS");
});

test("rejects an unsupported collector", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg", collectors: ["commerce.v1"] },
    {},
    { now: NOW },
  );
  assert.equal(result.error.code, "UNSUPPORTED_COLLECTOR");
});

test("rejects a duplicate collector", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg", collectors: ["website.health.v1", "website.health.v1"] },
    {},
    { now: NOW },
  );
  assert.equal(result.error.code, "DUPLICATE_COLLECTOR");
});

test("rejects a sparse collector array", async () => {
  const collectors = [];
  collectors[1] = "website.health.v1";
  const result = await collectBusinessState(
    { tenantId: "mmg", collectors },
    {},
    { now: NOW },
  );
  assert.equal(result.error.code, "INVALID_COLLECTORS");
});

test("rejects a custom collector-array property", async () => {
  const collectors = ["website.health.v1"];
  collectors.extra = true;
  const result = await collectBusinessState(
    { tenantId: "mmg", collectors },
    {},
    { now: NOW },
  );
  assert.equal(result.error.code, "INVALID_COLLECTORS");
});

test("does not invoke a collector index getter", async () => {
  let calls = 0;
  const collectors = [];
  Object.defineProperty(collectors, "0", {
    enumerable: true,
    get() {
      calls += 1;
      return "website.health.v1";
    },
  });
  const result = await collectBusinessState(
    { tenantId: "mmg", collectors },
    {},
    { now: NOW },
  );
  assert.equal(result.error.code, "INVALID_COLLECTORS");
  assert.equal(calls, 0);
});

test("defaults website input to an empty object", async () => {
  let received;
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(async (website) => {
      received = website;
      return passedResult();
    }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(received, {});
});

test("rejects a non-object website input", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg", website: "invalid" },
    {},
    { now: NOW },
  );
  assert.equal(result.error.code, "INVALID_WEBSITE_INPUT");
});

test("accepts a null-prototype website input", async () => {
  const website = Object.create(null);
  website.targetUrl = "https://example.com";
  const result = await collectBusinessState(
    { tenantId: "mmg", website },
    {},
    options(executorFor(passedResult())),
  );
  assert.equal(result.ok, true);
});

test("rejects an unknown website field", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg", website: { payload: true } },
    {},
    { now: NOW },
  );
  assert.equal(result.error.code, "UNKNOWN_WEBSITE_FIELD");
});

test("does not invoke a target URL getter", async () => {
  let calls = 0;
  const website = {};
  Object.defineProperty(website, "targetUrl", {
    enumerable: true,
    get() {
      calls += 1;
      return "https://example.com";
    },
  });
  const result = await collectBusinessState(
    { tenantId: "mmg", website },
    {},
    { now: NOW },
  );
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("rejects a whitespace-wrapped target URL", async () => {
  const targetUrl = " https://example.com";
  const result = await collectBusinessState(
    { tenantId: "mmg", website: { targetUrl } },
    {},
    { now: NOW },
  );
  assert.equal(result.error.code, "INVALID_TARGET_URL_INPUT");
  assert.equal(JSON.stringify(result).includes(targetUrl), false);
});

test("rejects a target URL containing controls", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg", website: { targetUrl: "https://example.com\u0000" } },
    {},
    { now: NOW },
  );
  assert.equal(result.error.code, "INVALID_TARGET_URL_INPUT");
});

test("accepts a target URL at the maximum length", async () => {
  const targetUrl = `https://example.com/${"a".repeat(2028)}`;
  assert.equal(targetUrl.length, 2048);
  const result = await collectBusinessState(
    { tenantId: "mmg", website: { targetUrl } },
    {},
    options(executorFor(passedResult())),
  );
  assert.equal(result.ok, true);
});

test("forwards the target URL only to the executor", async () => {
  const targetUrl = "https://private-target.example";
  let received;
  const result = await collectBusinessState(
    { tenantId: "mmg", website: { targetUrl } },
    {},
    options(async (website) => {
      received = website.targetUrl;
      return passedResult({ targetUrl });
    }),
  );
  assert.equal(received, targetUrl);
  assert.equal(JSON.stringify(result).includes(targetUrl), false);
});

test("rejects null options", async () => {
  const result = await collectBusinessState({ tenantId: "mmg" }, {}, null);
  assert.equal(result.error.code, "INVALID_OPTIONS");
});

test("accepts null-prototype options", async () => {
  const collectorOptions = Object.create(null);
  collectorOptions.now = NOW;
  collectorOptions.websiteHealthExecutor = executorFor(passedResult());
  const result = await collectBusinessState({ tenantId: "mmg" }, {}, collectorOptions);
  assert.equal(result.ok, true);
});

test("rejects an unknown option", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    { now: NOW, arbitrary: true },
  );
  assert.equal(result.error.code, "UNKNOWN_OPTION_FIELD");
});

test("does not invoke an option getter", async () => {
  let calls = 0;
  const collectorOptions = {};
  Object.defineProperty(collectorOptions, "now", {
    enumerable: true,
    get() {
      calls += 1;
      return NOW;
    },
  });
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    collectorOptions,
  );
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("calls a clock function exactly once", async () => {
  let calls = 0;
  const returnedDate = new Date(NOW.getTime());
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    {
      now: () => {
        calls += 1;
        return returnedDate;
      },
      websiteHealthExecutor: executorFor(passedResult()),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.equal(returnedDate.getTime(), NOW.getTime());
});

test("rejects a string clock", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    { now: NOW.toISOString() },
  );
  assert.equal(result.error.code, "INVALID_CLOCK");
});

test("rejects a non-function executor", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    { now: NOW, websiteHealthExecutor: "invalid" },
  );
  assert.equal(result.error.code, "INVALID_WEBSITE_EXECUTOR");
});

test("rejects a non-function fetch implementation", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    { now: NOW, fetchImpl: "invalid" },
  );
  assert.equal(result.error.code, "INVALID_FETCH_IMPL");
});

test("accepts bounded workflow options and forwards them", async () => {
  const fetchImpl = async () => {};
  let received;
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(async (_website, _env, workflowOptions) => {
      received = workflowOptions;
      return passedResult();
    }, {
      fetchImpl,
      websiteHealthTimeoutMs: 100,
      websiteHealthMaxBodyBytes: 1024,
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(received.fetchImpl, fetchImpl);
  assert.equal(received.timeoutMs, 100);
  assert.equal(received.maxBodyBytes, 1024);
  assert.equal(Object.hasOwn(received, "randomUUID"), false);
});

test("rejects an out-of-range timeout", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    { now: NOW, websiteHealthTimeoutMs: 30_001 },
  );
  assert.equal(result.error.code, "INVALID_WEBSITE_TIMEOUT");
});

test("rejects a numeric-string timeout option", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    { now: NOW, websiteHealthTimeoutMs: "100" },
  );
  assert.equal(result.error.code, "INVALID_WEBSITE_TIMEOUT");
});

test("rejects an out-of-range body limit", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    { now: NOW, websiteHealthMaxBodyBytes: 1_048_577 },
  );
  assert.equal(result.error.code, "INVALID_WEBSITE_BODY_LIMIT");
});

test("uses configured snapshot bounds", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(passedResult()), {
      snapshotWindowMs: 120_000,
      snapshotRecentLimit: 1,
    }),
  );
  assert.equal(result.snapshot.window.durationMs, 120_000);
  assert.equal(result.snapshot.recent.length, 1);
});

test("rejects an invalid snapshot window", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    { now: NOW, snapshotWindowMs: 59_999 },
  );
  assert.equal(result.error.code, "INVALID_SNAPSHOT_WINDOW");
});

test("rejects an invalid recent limit", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    { now: NOW, snapshotRecentLimit: 101 },
  );
  assert.equal(result.error.code, "INVALID_SNAPSHOT_RECENT_LIMIT");
});

test("invokes the selected executor exactly once", async () => {
  let calls = 0;
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(async () => {
      calls += 1;
      return passedResult();
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
});

test("passes isolated copies to the executor", async () => {
  const callerEnv = {
    KAIROS_ENVIRONMENT: "production",
    KAIROS_AUTONOMY_API_TOKEN: "private",
  };
  const callerWebsite = { targetUrl: "https://example.com" };
  let receivedWebsite;
  let receivedEnv;
  let receivedOptions;
  const result = await collectBusinessState(
    { tenantId: "mmg", website: callerWebsite },
    callerEnv,
    options(async (website, env, workflowOptions) => {
      receivedWebsite = website;
      receivedEnv = env;
      receivedOptions = workflowOptions;
      website.changed = true;
      env.changed = true;
      workflowOptions.now.setUTCFullYear(2030);
      return passedResult();
    }),
  );
  assert.equal(result.ok, true);
  assert.notEqual(receivedWebsite, callerWebsite);
  assert.notEqual(receivedEnv, callerEnv);
  assert.equal(Object.hasOwn(receivedEnv, "KAIROS_AUTONOMY_API_TOKEN"), false);
  assert.equal(Object.hasOwn(callerWebsite, "changed"), false);
  assert.equal(Object.hasOwn(callerEnv, "changed"), false);
  assert.equal(result.generatedAt, NOW.toISOString());
  assert.equal(receivedOptions.now instanceof Date, true);
});

test("forwards only allowlisted environment values", async () => {
  let received;
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {
      KAIROS_ENVIRONMENT: "production",
      KAIROS_KILL_SWITCH: "enabled",
      KAIROS_WEBSITE_HEALTH_ALLOWED_ORIGINS: "https://example.com",
      KAIROS_WEBSITE_HEALTH_TIMEOUT_MS: "8000",
      KAIROS_WEBSITE_HEALTH_MAX_BODY_BYTES: 262144,
      KAIROS_AUTONOMY_AUDIT: { put() {} },
      GITHUB_TOKEN: "private",
      SHOPIFY_TOKEN: "private",
    },
    options(async (_website, env) => {
      received = env;
      return passedResult();
    }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(received, {
    KAIROS_ENVIRONMENT: "production",
    KAIROS_KILL_SWITCH: "enabled",
    KAIROS_WEBSITE_HEALTH_ALLOWED_ORIGINS: "https://example.com",
    KAIROS_WEBSITE_HEALTH_TIMEOUT_MS: "8000",
    KAIROS_WEBSITE_HEALTH_MAX_BODY_BYTES: 262144,
  });
});

test("omits accessor and object-valued environment entries", async () => {
  let calls = 0;
  const env = {
    KAIROS_KILL_SWITCH: { value: "enabled" },
  };
  Object.defineProperty(env, "KAIROS_ENVIRONMENT", {
    get() {
      calls += 1;
      return "production";
    },
  });
  let received;
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    env,
    options(async (_website, collectorEnv) => {
      received = collectorEnv;
      return passedResult();
    }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(received, {});
  assert.equal(calls, 0);
});

test("does not enumerate the complete environment", async () => {
  const target = { KAIROS_ENVIRONMENT: "production" };
  const env = new Proxy(target, {
    ownKeys() {
      throw new Error("must not enumerate");
    },
  });
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    env,
    options(executorFor(passedResult())),
  );
  assert.equal(result.ok, true);
});

test("maps a passed workflow to a healthy signal", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    { KAIROS_ENVIRONMENT: "production" },
    options(executorFor(passedResult())),
  );
  const signal = recentSignal(result);
  assert.equal(result.collectors[0].status, "collected");
  assert.equal(result.collectors[0].code, null);
  assert.equal(signal.status, "healthy");
  assert.equal(signal.severity, "info");
  assert.equal(signal.summary, "Website health inspection completed successfully.");
  assert.deepEqual(signal.metrics, {
    body_bytes_inspected: 4096,
    body_truncated: false,
    collector_completed: true,
    incidents_detected: 0,
    latency_ms: 142,
    reachable: true,
    status_code: 200,
  });
  assert.deepEqual(signal.labels, ["collector", "healthy", "production", "website"]);
  assert.deepEqual(signal.references, [
    { kind: "workflow", id: "website.health.v1" },
  ]);
});

test("omits invalid passed metrics", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(passedResult({
      incidentsDetected: -1,
      healthCheck: {
        statusCode: 99,
        latencyMs: Infinity,
        bodyBytesInspected: -1,
        bodyTruncated: "false",
      },
    }))),
  );
  assert.deepEqual(recentSignal(result).metrics, {
    collector_completed: true,
    reachable: true,
  });
});

test("maps a degraded workflow and preserves only safe observations", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(degradedResult())),
  );
  const signal = recentSignal(result);
  assert.equal(result.collectors[0].status, "collected");
  assert.equal(result.collectors[0].code, "HTTP_ERROR");
  assert.equal(signal.status, "degraded");
  assert.equal(signal.severity, "high");
  assert.equal(signal.metrics.repair_proposal_present, true);
  assert.equal(signal.metrics.status_code, 503);
  assert.equal(signal.metrics.latency_ms, 312);
  assert.equal(signal.metrics.body_bytes_inspected, 2048);
  assert.equal(signal.metrics.body_truncated, false);
  assert.deepEqual(signal.references, [
    { kind: "incident", id: "inc_website_001" },
    { kind: "workflow", id: "website.health.v1" },
  ]);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("Private proposal"), false);
  assert.equal(serialized.includes("Private step"), false);
  assert.equal(serialized.includes("auditPersistence"), false);
});

test("uses a degraded fallback code for an unsafe reason", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(degradedResult({
      incident: { reason: "unsafe reason", incidentId: "INVALID" },
    }))),
  );
  assert.equal(result.collectors[0].code, "WEBSITE_DEGRADED");
  assert.deepEqual(recentSignal(result).references, [
    { kind: "workflow", id: "website.health.v1" },
  ]);
});

test("does not invoke proposal or incident accessors", async () => {
  let proposalCalls = 0;
  let reasonCalls = 0;
  const resultObject = degradedResult();
  Object.defineProperty(resultObject, "proposal", {
    enumerable: true,
    get() {
      proposalCalls += 1;
      return {};
    },
  });
  Object.defineProperty(resultObject.incident, "reason", {
    enumerable: true,
    get() {
      reasonCalls += 1;
      return "HTTP_ERROR";
    },
  });
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(resultObject)),
  );
  assert.equal(recentSignal(result).metrics.repair_proposal_present, false);
  assert.equal(result.collectors[0].code, "WEBSITE_DEGRADED");
  assert.equal(proposalCalls, 0);
  assert.equal(reasonCalls, 0);
});

test("maps a blocked workflow to governance-blocked state", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(blockedResult())),
  );
  const signal = recentSignal(result);
  assert.equal(result.collectors[0].status, "blocked");
  assert.equal(result.collectors[0].code, "GLOBAL_KILL_SWITCH_DISABLED");
  assert.equal(signal.status, "blocked");
  assert.equal(signal.severity, "high");
  assert.deepEqual(signal.metrics, {
    collector_completed: false,
    reachable: false,
  });
  assert.equal(signal.labels.includes("governance_blocked"), true);
  assert.equal(JSON.stringify(result).includes("Private policy explanation"), false);
});

test("uses a blocked fallback code without invoking an accessor", async () => {
  let calls = 0;
  const resultObject = blockedResult();
  Object.defineProperty(resultObject.policyDecision, "reasonCode", {
    enumerable: true,
    get() {
      calls += 1;
      return "BLOCKED";
    },
  });
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(resultObject)),
  );
  assert.equal(result.collectors[0].code, "COLLECTOR_BLOCKED");
  assert.equal(calls, 0);
});

test("maps a rejected workflow to failed state", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(rejectedResult())),
  );
  const signal = recentSignal(result);
  assert.equal(result.collectors[0].status, "failed");
  assert.equal(result.collectors[0].code, "TARGET_ORIGIN_NOT_ALLOWED");
  assert.equal(signal.status, "failed");
  assert.equal(signal.labels.includes("rejected"), true);
  assert.equal(JSON.stringify(result).includes("Private target detail"), false);
});

test("uses a rejected fallback code without invoking an accessor", async () => {
  let calls = 0;
  const resultObject = rejectedResult();
  Object.defineProperty(resultObject.error, "code", {
    enumerable: true,
    get() {
      calls += 1;
      return "REJECTED";
    },
  });
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(resultObject)),
  );
  assert.equal(result.collectors[0].code, "COLLECTOR_REJECTED");
  assert.equal(recentSignal(result).labels.includes("rejected"), true);
  assert.equal(calls, 0);
});

test("converts executor exceptions into a failure observation", async () => {
  const privateMessage = "private executor crash";
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(async () => {
      throw new Error(privateMessage);
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.failedCount, 1);
  assert.equal(result.collectors[0].code, "COLLECTOR_EXECUTION_FAILED");
  assert.equal(recentSignal(result).labels.includes("collection_failed"), true);
  assert.equal(JSON.stringify(result).includes(privateMessage), false);
});

test("converts invalid workflow results into a failure observation", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor({ status: "unexpected", secret: "private-result" })),
  );
  assert.equal(result.ok, true);
  assert.equal(result.collectors[0].code, "INVALID_COLLECTOR_RESULT");
  assert.equal(recentSignal(result).labels.includes("invalid_result"), true);
  assert.equal(JSON.stringify(result).includes("private-result"), false);
});

test("does not invoke a workflow status accessor", async () => {
  let calls = 0;
  const resultObject = {};
  Object.defineProperty(resultObject, "status", {
    enumerable: true,
    get() {
      calls += 1;
      return "passed";
    },
  });
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(resultObject)),
  );
  assert.equal(result.collectors[0].code, "INVALID_COLLECTOR_RESULT");
  assert.equal(calls, 0);
});

test("preserves canonical past workflow timestamps", async () => {
  const checkedAt = "2026-08-02T18:30:00.000Z";
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(passedResult({ checkedAt }))),
  );
  assert.equal(recentSignal(result).observedAt, checkedAt);
});

test("preserves a timestamp at the future-skew boundary", async () => {
  const checkedAt = new Date(NOW.getTime() + 300_000).toISOString();
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(passedResult({ checkedAt }))),
  );
  assert.equal(recentSignal(result).observedAt, checkedAt);
});

test("falls back for a timestamp beyond future skew", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(passedResult({
      checkedAt: new Date(NOW.getTime() + 300_001).toISOString(),
    }))),
  );
  assert.equal(recentSignal(result).observedAt, NOW.toISOString());
});

test("falls back without invoking a timestamp accessor", async () => {
  let calls = 0;
  const resultObject = passedResult();
  Object.defineProperty(resultObject, "checkedAt", {
    enumerable: true,
    get() {
      calls += 1;
      return NOW.toISOString();
    },
  });
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(resultObject)),
  );
  assert.equal(recentSignal(result).observedAt, NOW.toISOString());
  assert.equal(calls, 0);
});

test("sets expiration exactly ninety minutes after observation", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(passedResult())),
  );
  const signal = recentSignal(result);
  assert.equal(
    Date.parse(signal.expiresAt) - Date.parse(signal.observedAt),
    5_400_000,
  );
});

test("creates the exact passed signal hash", async () => {
  const observedAt = "2026-08-02T18:59:30.000Z";
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(passedResult({ checkedAt: observedAt }))),
  );
  const expected = fnv1a32(
    `mmg|website.health.v1|${observedAt}|passed|`,
  );
  assert.equal(recentSignal(result).signalId.endsWith(`_${expected}`), true);
});

test("creates the exact degraded signal hash", async () => {
  const observedAt = "2026-08-02T18:59:30.000Z";
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(degradedResult({ recordedAt: observedAt }))),
  );
  const expected = fnv1a32(
    `mmg|website.health.v1|${observedAt}|degraded|HTTP_ERROR`,
  );
  assert.equal(recentSignal(result).signalId.endsWith(`_${expected}`), true);
});

test("creates distinct execution-failure and invalid-result hashes", async () => {
  const execution = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(async () => {
      throw new Error("failure");
    }),
  );
  const invalid = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(null)),
  );
  const executionExpected = fnv1a32(
    `mmg|website.health.v1|${NOW.toISOString()}|execution_failed|COLLECTOR_EXECUTION_FAILED`,
  );
  const invalidExpected = fnv1a32(
    `mmg|website.health.v1|${NOW.toISOString()}|invalid_result|INVALID_COLLECTOR_RESULT`,
  );
  assert.equal(recentSignal(execution).signalId.endsWith(`_${executionExpected}`), true);
  assert.equal(recentSignal(invalid).signalId.endsWith(`_${invalidExpected}`), true);
  assert.notEqual(recentSignal(execution).signalId, recentSignal(invalid).signalId);
});

test("formats signal identifiers canonically", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(passedResult())),
  );
  assert.match(
    recentSignal(result).signalId,
    /^sig_website_health_\d{8}t\d{6}z_[0-9a-f]{8}$/u,
  );
});

test("returns the complete observation snapshot directly", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(passedResult())),
  );
  assert.equal(result.snapshot.ok, true);
  assert.equal(Object.hasOwn(result.snapshot, "snapshot"), false);
  assert.equal(result.snapshot.tenantId, "mmg");
  assert.deepEqual(result.snapshot.coverage.requiredSources, [
    "website.health.workflow",
  ]);
  assert.equal(result.snapshot.coverage.complete, true);
  assert.equal(result.snapshot.health.overallStatus, "healthy");
  assert.equal(result.snapshot.recent.length, 1);
});

test("maps snapshot health for every workflow outcome", async () => {
  const passed = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(passedResult())),
  );
  const degraded = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(degradedResult())),
  );
  const blocked = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(blockedResult())),
  );
  const rejected = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(rejectedResult())),
  );
  assert.equal(passed.snapshot.health.overallStatus, "healthy");
  assert.equal(degraded.snapshot.health.overallStatus, "degraded");
  assert.equal(blocked.snapshot.health.overallStatus, "blocked");
  assert.equal(rejected.snapshot.health.overallStatus, "failed");
});

test("returns exact success fields and counts", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(passedResult())),
  );
  assert.deepEqual(Object.keys(result).sort(), [
    "blockedCount",
    "build",
    "collectedCount",
    "collectorCount",
    "collectors",
    "failedCount",
    "generatedAt",
    "observationBuild",
    "ok",
    "schemaVersion",
    "selectedCollectors",
    "snapshot",
    "tenantId",
    "websiteWorkflowBuild",
  ]);
  assert.equal(result.collectorCount, 1);
  assert.equal(result.collectedCount, 1);
  assert.equal(result.blockedCount, 0);
  assert.equal(result.failedCount, 0);
  assert.deepEqual(Object.keys(result.collectors[0]).sort(), [
    "code",
    "collectorId",
    "observedAt",
    "signalId",
    "source",
    "status",
  ]);
});

test("deeply freezes successful assembly output", async () => {
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(degradedResult())),
  );
  assert.equal(isDeepFrozen(result), true);
});

test("does not freeze or mutate caller-owned structures", async () => {
  const input = {
    tenantId: "mmg",
    collectors: ["website.health.v1"],
    website: { targetUrl: "https://example.com" },
  };
  const env = { KAIROS_ENVIRONMENT: "production" };
  const resultObject = degradedResult();
  const collectorOptions = options(executorFor(resultObject));
  const inputBefore = JSON.stringify(input);
  const envBefore = JSON.stringify(env);
  const resultBefore = JSON.stringify(resultObject);

  const result = await collectBusinessState(input, env, collectorOptions);

  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(input), inputBefore);
  assert.equal(JSON.stringify(env), envBefore);
  assert.equal(JSON.stringify(resultObject), resultBefore);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.collectors), false);
  assert.equal(Object.isFrozen(input.website), false);
  assert.equal(Object.isFrozen(env), false);
  assert.equal(Object.isFrozen(collectorOptions), false);
  assert.equal(Object.isFrozen(resultObject), false);
  assert.equal(Object.isFrozen(resultObject.proposal), false);
  assert.equal(Object.isFrozen(resultObject.incident.details), false);
});

test("never returns sensitive workflow or environment material", async () => {
  const secrets = [
    "private-api-token",
    "private-target",
    "private-cookie",
    "private-authorization",
    "private-stack",
  ];
  const result = await collectBusinessState(
    {
      tenantId: "mmg",
      website: { targetUrl: `https://${secrets[1]}.example` },
    },
    {
      KAIROS_AUTONOMY_API_TOKEN: secrets[0],
      COOKIE: secrets[2],
      AUTHORIZATION: secrets[3],
    },
    options(executorFor(degradedResult({
      targetUrl: `https://${secrets[1]}.example`,
      stack: secrets[4],
      proposal: {
        title: secrets[0],
        steps: [secrets[2]],
      },
      incident: {
        reason: "HTTP_ERROR",
        details: {
          private: secrets[3],
        },
      },
    }))),
  );
  const serialized = JSON.stringify(result);
  for (const secret of secrets) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("ignores unallowlisted workflow functions without invoking them", async () => {
  let calls = 0;
  const result = await collectBusinessState(
    { tenantId: "mmg" },
    {},
    options(executorFor(passedResult({
      arbitrary: () => {
        calls += 1;
      },
    }))),
  );
  assert.equal(result.ok, true);
  assert.equal(calls, 0);
});

test("fails closed when input proxy inspection throws", async () => {
  const input = new Proxy({}, {
    getPrototypeOf() {
      return Object.prototype;
    },
    ownKeys() {
      throw new Error("inspection failure");
    },
  });
  const result = await collectBusinessState(input, {}, { now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_INPUT");
});
