import test from "node:test";
import assert from "node:assert/strict";

import {
  KAIROS_AUTONOMY_API_BUILD,
  KAIROS_BUSINESS_COLLECTION_PATH,
  handleAutonomyApiRequest,
} from "../../src/autonomy/kairos-autonomy-api-v3.js";
import { KAIROS_BUSINESS_COLLECTOR_BUILD } from "../../src/autonomy/kairos-business-collector-v1.js";
import { KAIROS_BUSINESS_OBSERVATION_BUILD } from "../../src/autonomy/kairos-business-observation-v1.js";

const API_TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const ORIGIN = "https://mmg-ios.example";
const NOW = "2026-08-02T19:00:00.000Z";

function environment(overrides = {}) {
  return {
    KAIROS_AUTONOMY_API_TOKEN: API_TOKEN,
    KAIROS_ENVIRONMENT: "production",
    KAIROS_KILL_SWITCH: "enabled",
    KAIROS_AUTONOMY_SCHEDULED_ENABLED: "enabled",
    KAIROS_AUTONOMY_ACTIVATION_GATE: "website-health-v1",
    KAIROS_AUTONOMY_LEDGER: {
      idFromName() { return "ledger-id"; },
      get() { return {}; },
    },
    ...overrides,
  };
}

function apiRequest(path, {
  method = "GET",
  authenticated = true,
  contentType,
  body,
  headers = {},
} = {}) {
  const requestHeaders = new Headers(headers);
  if (authenticated) requestHeaders.set("Authorization", `Bearer ${API_TOKEN}`);
  if (contentType !== undefined) requestHeaders.set("Content-Type", contentType);
  const init = { method, headers: requestHeaders };
  if (body !== undefined && method !== "GET" && method !== "HEAD") init.body = body;
  return new Request(new URL(path, ORIGIN), init);
}

function collectionRequest(value = { tenantId: "mmg" }, overrides = {}) {
  return apiRequest(KAIROS_BUSINESS_COLLECTION_PATH, {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify(value),
    ...overrides,
  });
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

function validCollectorResult(overrides = {}) {
  return {
    ok: true,
    build: KAIROS_BUSINESS_COLLECTOR_BUILD,
    schemaVersion: 1,
    generatedAt: NOW,
    tenantId: "mmg",
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
      code: null,
      observedAt: "2026-08-02T18:59:30.000Z",
      signalId: "sig_website_health_20260802t185930z_12345678",
    }],
    snapshot: {
      ok: true,
      build: KAIROS_BUSINESS_OBSERVATION_BUILD,
      schemaVersion: 1,
      snapshotId: "bss_20260802T190000Z_12345678",
      tenantId: "mmg",
      generatedAt: NOW,
      recent: [],
    },
    ...overrides,
  };
}

function collectorFailure(code, field = null, index = null) {
  return {
    ok: false,
    build: KAIROS_BUSINESS_COLLECTOR_BUILD,
    schemaVersion: 1,
    error: {
      code,
      message: "secret collector message",
      field,
      index,
    },
  };
}

test("exports the API v3 build", () => {
  assert.equal(KAIROS_AUTONOMY_API_BUILD, "kairos-autonomy-api-20260802-3");
});

test("exports the exact collection path", () => {
  assert.equal(KAIROS_BUSINESS_COLLECTION_PATH, "/api/autonomy/business-state/collect");
});

test("owns the exact collection path", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.status, 200);
});

test("owns the exact path when a query string is present", async () => {
  const response = await handleAutonomyApiRequest(
    apiRequest(`${KAIROS_BUSINESS_COLLECTION_PATH}?mode=manual`, {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ tenantId: "mmg" }),
    }),
    environment(),
    {},
    { businessCollector: async () => validCollectorResult() },
  );
  assert.equal(response.status, 200);
});

for (const path of [
  `${KAIROS_BUSINESS_COLLECTION_PATH}/`,
  `${KAIROS_BUSINESS_COLLECTION_PATH}/extra`,
  "/api/autonomy/business-state/Collect",
  "/api/autonomy/business-state",
]) {
  test(`does not claim collection route ${path}`, async () => {
    const response = await handleAutonomyApiRequest(
      apiRequest(path, { method: "POST", contentType: "application/json", body: "{}" }),
      environment(),
    );
    assert.equal(response.status, 404);
  });
}

test("returns null for a non-autonomy path", async () => {
  assert.equal(await handleAutonomyApiRequest(apiRequest("/health"), environment()), null);
});

test("delegates unknown autonomy routes and upgrades their build", async () => {
  const response = await handleAutonomyApiRequest(apiRequest("/api/autonomy/unknown"), environment());
  const body = await responseJson(response);
  assert.equal(response.status, 404);
  assert.equal(body.build, KAIROS_AUTONOMY_API_BUILD);
  assert.equal(response.headers.get("X-Kairos-Autonomy-API-Build"), KAIROS_AUTONOMY_API_BUILD);
});

test("upgrades exact GET status", async () => {
  const response = await handleAutonomyApiRequest(apiRequest("/api/autonomy/status"), environment());
  const body = await responseJson(response);
  assert.equal(response.status, 200);
  assert.equal(body.build, KAIROS_AUTONOMY_API_BUILD);
  assert.equal(body.builds.apiV2, "kairos-autonomy-api-20260802-2");
  assert.equal(body.builds.businessCollector, KAIROS_BUSINESS_COLLECTOR_BUILD);
  assert.equal(body.builds.businessObservation, KAIROS_BUSINESS_OBSERVATION_BUILD);
});

test("status advertises only manual observation capability", async () => {
  const response = await handleAutonomyApiRequest(apiRequest("/api/autonomy/status"), environment());
  const body = await responseJson(response);
  assert.deepEqual(body.businessObservation, {
    manualCollectionPath: KAIROS_BUSINESS_COLLECTION_PATH,
    manualCollectionAvailable: true,
    scheduledCollectionEnabled: false,
    persistenceConfigured: false,
    prioritizationEnabled: false,
    orchestrationEnabled: false,
  });
});

test("POST status remains delegated and GET-only", async () => {
  const response = await handleAutonomyApiRequest(
    apiRequest("/api/autonomy/status", { method: "POST", body: "{}" }),
    environment(),
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET");
  assert.equal((await responseJson(response)).build, KAIROS_AUTONOMY_API_BUILD);
});

test("authenticates a valid collection request", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.status, 200);
});

test("rejects missing Authorization before collection", async () => {
  let collectorCalls = 0;
  const request = collectionRequest({}, { authenticated: false });
  const response = await handleAutonomyApiRequest(request, environment(), {}, {
    businessCollector: async () => { collectorCalls += 1; return validCollectorResult(); },
  });
  assert.equal(response.status, 401);
  assert.equal(collectorCalls, 0);
  assert.equal(request.bodyUsed, false);
});

test("rejects an incorrect bearer token", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest({}, {
      authenticated: false,
      headers: { Authorization: "Bearer incorrect-token" },
    }),
    environment(),
  );
  assert.equal(response.status, 401);
});

test("returns 503 when the server secret is missing", async () => {
  const current = environment();
  delete current.KAIROS_AUTONOMY_API_TOKEN;
  const response = await handleAutonomyApiRequest(collectionRequest(), current);
  assert.equal(response.status, 503);
});

test("collection authentication failures receive v3 and collector build headers", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest({}, { authenticated: false }),
    environment(),
  );
  assert.equal(response.headers.get("X-Kairos-Autonomy-API-Build"), KAIROS_AUTONOMY_API_BUILD);
  assert.equal(response.headers.get("X-Kairos-Business-Collector-Build"), KAIROS_BUSINESS_COLLECTOR_BUILD);
});

test("passes cryptoImpl through the API v2 authentication probe", async () => {
  let digestCalls = 0;
  const cryptoImpl = {
    subtle: {
      async digest(algorithm, data) {
        digestCalls += 1;
        return globalThis.crypto.subtle.digest(algorithm, data);
      },
    },
  };
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    cryptoImpl,
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.status, 200);
  assert.ok(digestCalls >= 2);
});

for (const method of ["GET", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
  test(`returns authenticated 405 for collection ${method}`, async () => {
    const response = await handleAutonomyApiRequest(
      apiRequest(KAIROS_BUSINESS_COLLECTION_PATH, { method }),
      environment(),
    );
    const body = await responseJson(response);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "POST");
    assert.equal(body.error.code, "METHOD_NOT_ALLOWED");
    assert.equal(response.headers.get("X-Kairos-Business-Collector-Build"), KAIROS_BUSINESS_COLLECTOR_BUILD);
  });
}

for (const contentType of ["application/json", "application/json; charset=utf-8", "Application/JSON"]) {
  test(`accepts content type ${contentType}`, async () => {
    const response = await handleAutonomyApiRequest(
      collectionRequest({}, { contentType }),
      environment(),
      {},
      { businessCollector: async () => validCollectorResult() },
    );
    assert.equal(response.status, 200);
  });
}

for (const contentType of [undefined, "text/plain", "text/application/json", "application/jsonp", "application/problem+json"]) {
  test(`rejects incompatible content type ${String(contentType)}`, async () => {
    const request = apiRequest(KAIROS_BUSINESS_COLLECTION_PATH, {
      method: "POST",
      contentType,
      body: "{}",
    });
    const response = await handleAutonomyApiRequest(request, environment());
    assert.equal(response.status, 415);
    assert.equal((await responseJson(response)).error.code, "UNSUPPORTED_MEDIA_TYPE");
    assert.equal(request.bodyUsed, false);
  });
}

test("rejects Content-Length above the configured bound before reading", async () => {
  const request = collectionRequest({}, { headers: { "Content-Length": "5000" } });
  const response = await handleAutonomyApiRequest(request, environment(), {}, {
    maxBusinessCollectionRequestBytes: 1024,
  });
  assert.equal(response.status, 413);
  assert.equal(request.bodyUsed, false);
});

test("rejects streamed bytes above the configured bound", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest({ data: "x".repeat(5000) }),
    environment(),
    {},
    { maxBusinessCollectionRequestBytes: 1024 },
  );
  assert.equal(response.status, 413);
  assert.equal((await responseJson(response)).error.code, "REQUEST_TOO_LARGE");
});

test("falls back to the default bound for an invalid internal override", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    maxBusinessCollectionRequestBytes: 100,
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.status, 200);
});

test("returns INVALID_REQUEST_BODY for a locked body", async () => {
  const request = collectionRequest();
  request.body.getReader();
  const response = await handleAutonomyApiRequest(request, environment());
  assert.equal(response.status, 400);
  assert.equal((await responseJson(response)).error.code, "INVALID_REQUEST_BODY");
});

test("returns INVALID_REQUEST_BODY for malformed UTF-8", async () => {
  const response = await handleAutonomyApiRequest(
    apiRequest(KAIROS_BUSINESS_COLLECTION_PATH, {
      method: "POST",
      contentType: "application/json",
      body: new Uint8Array([0xff, 0xfe]),
    }),
    environment(),
  );
  assert.equal(response.status, 400);
  assert.equal((await responseJson(response)).error.code, "INVALID_REQUEST_BODY");
});

for (const body of ["", "{bad", "null", "[]", '"text"', "12", "true"]) {
  test(`rejects non-object JSON body ${JSON.stringify(body)}`, async () => {
    const response = await handleAutonomyApiRequest(
      apiRequest(KAIROS_BUSINESS_COLLECTION_PATH, {
        method: "POST",
        contentType: "application/json",
        body,
      }),
      environment(),
    );
    assert.equal(response.status, 400);
    assert.equal((await responseJson(response)).error.code, "INVALID_JSON_BODY");
  });
}

test("passes the parsed body to the collector without rewriting it", async () => {
  const input = {
    tenantId: "mmg",
    website: { targetUrl: " https://example.com " },
    unknownField: 1,
  };
  let received;
  const response = await handleAutonomyApiRequest(collectionRequest(input), environment(), {}, {
    businessCollector: async (value) => { received = value; return validCollectorResult(); },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(received, input);
});

test("invokes an injected collector exactly once", async () => {
  let calls = 0;
  await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => { calls += 1; return validCollectorResult(); },
  });
  assert.equal(calls, 1);
});

test("rejects a non-function injected collector", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: "invalid",
  });
  assert.equal(response.status, 500);
  assert.equal((await responseJson(response)).error.code, "BUSINESS_COLLECTION_API_FAILED");
});

test("does not invoke a businessCollector accessor", async () => {
  let invoked = 0;
  const options = {};
  Object.defineProperty(options, "businessCollector", {
    enumerable: true,
    get() { invoked += 1; return async () => validCollectorResult(); },
  });
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, options);
  assert.equal(response.status, 500);
  assert.equal(invoked, 0);
});

test("passes env by default and exact collectorEnvironment when supplied", async () => {
  const originalEnv = environment();
  const overrideEnv = { KAIROS_ENVIRONMENT: "staging" };
  let defaultReceived;
  let overrideReceived;
  await handleAutonomyApiRequest(collectionRequest(), originalEnv, {}, {
    businessCollector: async (_input, collectorEnv) => {
      defaultReceived = collectorEnv;
      return validCollectorResult();
    },
  });
  await handleAutonomyApiRequest(collectionRequest(), originalEnv, {}, {
    collectorEnvironment: overrideEnv,
    businessCollector: async (_input, collectorEnv) => {
      overrideReceived = collectorEnv;
      return validCollectorResult();
    },
  });
  assert.equal(defaultReceived, originalEnv);
  assert.equal(overrideReceived, overrideEnv);
  assert.equal(Object.hasOwn(overrideReceived, "KAIROS_AUTONOMY_API_TOKEN"), false);
});

test("uses a new empty collectorOptions object when omitted", async () => {
  let received;
  await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async (_input, _env, options) => {
      received = options;
      return validCollectorResult();
    },
  });
  assert.deepEqual(received, {});
});

test("shallow-clones valid collectorOptions", async () => {
  const original = { now: new Date(NOW), limit: 1 };
  let received;
  await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    collectorOptions: original,
    businessCollector: async (_input, _env, options) => {
      received = options;
      return validCollectorResult();
    },
  });
  assert.notEqual(received, original);
  assert.equal(received.now, original.now);
  assert.equal(received.limit, 1);
  assert.equal(Object.isFrozen(original), false);
});

for (const collectorOptions of [[], new Date(NOW), Object.create({ inherited: true })]) {
  test("rejects non-plain collectorOptions", async () => {
    const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
      collectorOptions,
      businessCollector: async () => validCollectorResult(),
    });
    assert.equal(response.status, 500);
  });
}

test("rejects symbol-keyed collectorOptions", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    collectorOptions: { [Symbol("secret")]: true },
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.status, 500);
});

test("rejects accessor collectorOptions without invocation", async () => {
  let invoked = 0;
  const collectorOptions = {};
  Object.defineProperty(collectorOptions, "now", {
    enumerable: true,
    get() { invoked += 1; return new Date(NOW); },
  });
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    collectorOptions,
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.status, 500);
  assert.equal(invoked, 0);
});

test("returns the complete validated collector result under businessState", async () => {
  const result = validCollectorResult();
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => result,
  });
  const body = await responseJson(response);
  assert.deepEqual(Object.keys(body).sort(), [
    "build", "businessState", "collectorBuild", "observationBuild", "ok",
  ]);
  assert.deepEqual(body.businessState, result);
  assert.equal(Object.hasOwn(body, "result"), false);
});

test("success response includes all security and build headers", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("X-Kairos-Autonomy-API-Build"), KAIROS_AUTONOMY_API_BUILD);
  assert.equal(response.headers.get("X-Kairos-Business-Collector-Build"), KAIROS_BUSINESS_COLLECTOR_BUILD);
});

const VALIDATION_CODES = [
  "INVALID_INPUT",
  "UNKNOWN_INPUT_FIELD",
  "INVALID_TENANT_ID",
  "INVALID_COLLECTORS",
  "UNSUPPORTED_COLLECTOR",
  "DUPLICATE_COLLECTOR",
  "INVALID_WEBSITE_INPUT",
  "UNKNOWN_WEBSITE_FIELD",
  "INVALID_TARGET_URL_INPUT",
  "INVALID_OPTIONS",
  "UNKNOWN_OPTION_FIELD",
  "INVALID_CLOCK",
  "INVALID_WEBSITE_EXECUTOR",
  "INVALID_FETCH_IMPL",
  "INVALID_WEBSITE_TIMEOUT",
  "INVALID_WEBSITE_BODY_LIMIT",
  "INVALID_SNAPSHOT_WINDOW",
  "INVALID_SNAPSHOT_RECENT_LIMIT",
];

for (const code of VALIDATION_CODES) {
  test(`maps collector validation ${code} to fixed HTTP 400`, async () => {
    const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
      businessCollector: async () => collectorFailure(code, "website.targetUrl", 0),
    });
    const body = await responseJson(response);
    assert.equal(response.status, 400);
    assert.deepEqual(body.error, {
      code,
      message: "The business-state collection request is invalid.",
      field: "website.targetUrl",
      index: 0,
    });
    assert.equal(JSON.stringify(body).includes("secret collector message"), false);
  });
}

test("normalizes unsafe collector error field and index to null", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => collectorFailure("INVALID_INPUT", " unsafe field ", 5001),
  });
  assert.deepEqual((await responseJson(response)).error, {
    code: "INVALID_INPUT",
    message: "The business-state collection request is invalid.",
    field: null,
    index: null,
  });
});

test("maps snapshot assembly failure to safe HTTP 503", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => collectorFailure("SNAPSHOT_BUILD_FAILED"),
  });
  const body = await responseJson(response);
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "BUSINESS_SNAPSHOT_UNAVAILABLE");
  assert.equal(body.error.message, "The business-state snapshot could not be assembled.");
});

test("maps a throwing collector to safe HTTP 502", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => { throw new Error("secret stack and message"); },
  });
  const body = await responseJson(response);
  assert.equal(response.status, 502);
  assert.equal(body.error.code, "INVALID_BUSINESS_COLLECTOR_RESULT");
  assert.equal(JSON.stringify(body).includes("secret"), false);
});

for (const malformed of [null, [], "text", 42, new Date(NOW)]) {
  test(`rejects malformed collector result type ${typeof malformed}`, async () => {
    const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
      businessCollector: async () => malformed,
    });
    assert.equal(response.status, 502);
  });
}

test("rejects wrong build, identifier, timestamp, counts, and array lengths", async () => {
  const variants = [
    validCollectorResult({ build: "wrong" }),
    validCollectorResult({ tenantId: "MMG" }),
    validCollectorResult({ generatedAt: "2026-08-02T19:00:00Z" }),
    validCollectorResult({ failedCount: 1 }),
    validCollectorResult({ collectors: [] }),
  ];
  for (const variant of variants) {
    const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
      businessCollector: async () => variant,
    });
    assert.equal(response.status, 502);
  }
});

test("rejects a collector accessor without invoking it", async () => {
  let invoked = 0;
  const result = validCollectorResult();
  Object.defineProperty(result, "ok", {
    enumerable: true,
    get() { invoked += 1; return true; },
  });
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => result,
  });
  assert.equal(response.status, 502);
  assert.equal(invoked, 0);
});

test("rejects nested accessors without invoking them", async () => {
  let invoked = 0;
  const result = validCollectorResult();
  Object.defineProperty(result.snapshot, "snapshotId", {
    enumerable: true,
    get() { invoked += 1; return "secret"; },
  });
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => result,
  });
  assert.equal(response.status, 502);
  assert.equal(invoked, 0);
});

test("rejects circular, BigInt, and function collector graphs", async () => {
  const circular = validCollectorResult();
  circular.self = circular;
  const bigInt = validCollectorResult({ unsafe: 1n });
  let functionInvoked = 0;
  const withFunction = validCollectorResult({ unsafe() { functionInvoked += 1; } });
  for (const result of [circular, bigInt, withFunction]) {
    const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
      businessCollector: async () => result,
    });
    assert.equal(response.status, 502);
  }
  assert.equal(functionInvoked, 0);
});

test("does not invoke toJSON or Symbol.toStringTag", async () => {
  let toJsonInvoked = 0;
  let tagInvoked = 0;
  const withToJson = validCollectorResult();
  withToJson.toJSON = () => { toJsonInvoked += 1; return {}; };
  const withTag = validCollectorResult();
  Object.defineProperty(withTag, Symbol.toStringTag, {
    get() { tagInvoked += 1; return "Collector"; },
  });
  for (const result of [withToJson, withTag]) {
    const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
      businessCollector: async () => result,
    });
    assert.equal(response.status, 502);
  }
  assert.equal(toJsonInvoked, 0);
  assert.equal(tagInvoked, 0);
});

test("delegates workflows through API v2 safe projection", async () => {
  const workflow = {
    workflowId: "website.health.v1",
    version: 1,
    status: "active",
    owner: "operations",
    riskClass: "low",
    agents: ["kairos-operations"],
    environments: ["production"],
    triggers: ["website.health.manual"],
    autonomousActions: ["website.inspect"],
    approvalRequiredActions: ["github.merge"],
    blockedActions: ["customer.email.send"],
    secret: "do-not-project",
    build: "arbitrary-inner-build",
  };
  const response = await handleAutonomyApiRequest(
    apiRequest("/api/autonomy/workflows"),
    environment(),
    {},
    { workflowLister: () => [workflow] },
  );
  const body = await responseJson(response);
  assert.equal(response.status, 200);
  assert.equal(body.build, KAIROS_AUTONOMY_API_BUILD);
  assert.equal(body.workflows[0].workflowId, "website.health.v1");
  assert.equal(body.workflows[0].status, "active");
  assert.equal(Object.hasOwn(body.workflows[0], "secret"), false);
  assert.equal(Object.hasOwn(body.workflows[0], "build"), false);
  assert.equal(response.headers.get("X-Kairos-Business-Collector-Build"), null);
});

test("collection response does not expose authorization or environment values", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest(),
    environment({ SECRET_MARKER: "do-not-return" }),
    {},
    { businessCollector: async () => validCollectorResult() },
  );
  const text = await response.text();
  assert.equal(text.includes(API_TOKEN), false);
  assert.equal(text.includes("do-not-return"), false);
  assert.equal(response.headers.get("Authorization"), null);
});

test("malformed request URL fails closed without rejection", async () => {
  const response = await handleAutonomyApiRequest({
    get url() { throw new Error("secret URL failure"); },
  }, environment());
  const body = await responseJson(response);
  assert.equal(response.status, 500);
  assert.equal(body.error.code, "AUTONOMY_API_DELEGATION_FAILED");
  assert.equal(JSON.stringify(body).includes("secret"), false);
});

test("owned-route header failure uses the collection fail-closed error", async () => {
  const fakeRequest = {
    url: `${ORIGIN}${KAIROS_BUSINESS_COLLECTION_PATH}`,
    method: "POST",
    get headers() { throw new Error("secret header failure"); },
  };
  const response = await handleAutonomyApiRequest(fakeRequest, environment());
  assert.equal(response.status, 500);
  assert.equal((await responseJson(response)).error.code, "BUSINESS_COLLECTION_API_FAILED");
});
