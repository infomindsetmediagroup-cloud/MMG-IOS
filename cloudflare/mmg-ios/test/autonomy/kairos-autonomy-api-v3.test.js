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

function env(overrides = {}) {
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

function request(path, {
  method = "GET",
  authenticated = true,
  contentType,
  body,
  headers = {},
} = {}) {
  const finalHeaders = new Headers(headers);
  if (authenticated) finalHeaders.set("Authorization", `Bearer ${API_TOKEN}`);
  if (contentType !== undefined) finalHeaders.set("Content-Type", contentType);
  const init = { method, headers: finalHeaders };
  if (body !== undefined && method !== "GET" && method !== "HEAD") init.body = body;
  return new Request(new URL(path, ORIGIN), init);
}

function collectionRequest(body = { tenantId: "mmg" }, overrides = {}) {
  return request(KAIROS_BUSINESS_COLLECTION_PATH, {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify(body),
    ...overrides,
  });
}

async function json(response) {
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

function collectorFailure(code, field = null, index = null, message = "secret collector message") {
  return {
    ok: false,
    build: KAIROS_BUSINESS_COLLECTOR_BUILD,
    schemaVersion: 1,
    error: { code, message, field, index },
  };
}

test("exports the API v3 build", () => {
  assert.equal(KAIROS_AUTONOMY_API_BUILD, "kairos-autonomy-api-20260802-3");
});

test("exports the exact business collection path", () => {
  assert.equal(KAIROS_BUSINESS_COLLECTION_PATH, "/api/autonomy/business-state/collect");
});

test("owns exact POST collection path", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.status, 200);
});

test("owns collection path with query string", async () => {
  const response = await handleAutonomyApiRequest(
    request(`${KAIROS_BUSINESS_COLLECTION_PATH}?source=manual`, {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ tenantId: "mmg" }),
    }),
    env(),
    {},
    { businessCollector: async () => validCollectorResult() },
  );
  assert.equal(response.status, 200);
});

test("does not own trailing slash collection path", async () => {
  const response = await handleAutonomyApiRequest(
    request(`${KAIROS_BUSINESS_COLLECTION_PATH}/`, {
      method: "POST",
      contentType: "application/json",
      body: "{}",
    }),
    env(),
  );
  assert.equal(response.status, 404);
});

test("does not own extra collection path segment", async () => {
  const response = await handleAutonomyApiRequest(
    request(`${KAIROS_BUSINESS_COLLECTION_PATH}/extra`, {
      method: "POST",
      contentType: "application/json",
      body: "{}",
    }),
    env(),
  );
  assert.equal(response.status, 404);
});

test("does not own case-variant collection path", async () => {
  const response = await handleAutonomyApiRequest(
    request("/api/autonomy/business-state/Collect", {
      method: "POST",
      contentType: "application/json",
      body: "{}",
    }),
    env(),
  );
  assert.equal(response.status, 404);
});

test("returns null for non-autonomy path", async () => {
  const response = await handleAutonomyApiRequest(request("/health"), env());
  assert.equal(response, null);
});

test("upgrades unknown autonomy 404 build body", async () => {
  const response = await handleAutonomyApiRequest(request("/api/autonomy/unknown"), env());
  assert.equal(response.status, 404);
  assert.equal((await json(response)).build, KAIROS_AUTONOMY_API_BUILD);
});

test("upgrades unknown autonomy 404 build header", async () => {
  const response = await handleAutonomyApiRequest(request("/api/autonomy/unknown"), env());
  assert.equal(response.headers.get("X-Kairos-Autonomy-API-Build"), KAIROS_AUTONOMY_API_BUILD);
});

test("upgrades exact GET status", async () => {
  const response = await handleAutonomyApiRequest(request("/api/autonomy/status"), env());
  assert.equal(response.status, 200);
  assert.equal((await json(response)).build, KAIROS_AUTONOMY_API_BUILD);
});

test("delegates POST status method handling", async () => {
  const response = await handleAutonomyApiRequest(
    request("/api/autonomy/status", { method: "POST", body: "{}" }),
    env(),
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET");
});

test("authenticates a valid collection request", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.status, 200);
});

test("rejects missing Authorization", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest({ tenantId: "mmg" }, { authenticated: false }),
    env(),
  );
  assert.equal(response.status, 401);
});

test("rejects incorrect bearer token", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest({}, { authenticated: false, headers: { Authorization: "Bearer wrong-token" } }),
    env(),
  );
  assert.equal(response.status, 401);
});

test("returns 503 when authentication secret is missing", async () => {
  const configured = env();
  delete configured.KAIROS_AUTONOMY_API_TOKEN;
  const response = await handleAutonomyApiRequest(collectionRequest(), configured);
  assert.equal(response.status, 503);
});

test("upgrades authentication failure build body", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest({}, { authenticated: false }),
    env(),
  );
  assert.equal((await json(response)).build, KAIROS_AUTONOMY_API_BUILD);
});

test("authentication failure includes collector build header", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest({}, { authenticated: false }),
    env(),
  );
  assert.equal(
    response.headers.get("X-Kairos-Business-Collector-Build"),
    KAIROS_BUSINESS_COLLECTOR_BUILD,
  );
});

test("unauthorized request does not invoke collector", async () => {
  let invoked = 0;
  await handleAutonomyApiRequest(
    collectionRequest({}, { authenticated: false }),
    env(),
    {},
    { businessCollector: async () => { invoked += 1; return validCollectorResult(); } },
  );
  assert.equal(invoked, 0);
});

test("unauthorized request leaves body unused", async () => {
  const req = collectionRequest({}, { authenticated: false });
  await handleAutonomyApiRequest(req, env());
  assert.equal(req.bodyUsed, false);
});

test("passes cryptoImpl through authentication probe", async () => {
  let calls = 0;
  const cryptoImpl = {
    subtle: {
      async digest(algorithm, data) {
        calls += 1;
        return globalThis.crypto.subtle.digest(algorithm, data);
      },
    },
  };
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    cryptoImpl,
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.status, 200);
  assert.ok(calls >= 1);
});

test("status advertises API v3 and API v2 builds", async () => {
  const response = await handleAutonomyApiRequest(request("/api/autonomy/status"), env());
  const body = await json(response);
  assert.equal(body.builds.api, KAIROS_AUTONOMY_API_BUILD);
  assert.equal(body.builds.apiV2, "kairos-autonomy-api-20260802-2");
});

test("status preserves existing scheduler and dispatcher builds", async () => {
  const response = await handleAutonomyApiRequest(request("/api/autonomy/status"), env());
  const body = await json(response);
  assert.equal(typeof body.builds.scheduler, "string");
  assert.equal(typeof body.builds.dispatcher, "string");
});

test("status advertises business collector and observation builds", async () => {
  const response = await handleAutonomyApiRequest(request("/api/autonomy/status"), env());
  const body = await json(response);
  assert.equal(body.builds.businessCollector, KAIROS_BUSINESS_COLLECTOR_BUILD);
  assert.equal(body.builds.businessObservation, KAIROS_BUSINESS_OBSERVATION_BUILD);
});

test("status describes manual collection without overclaiming", async () => {
  const response = await handleAutonomyApiRequest(request("/api/autonomy/status"), env());
  const body = await json(response);
  assert.deepEqual(body.businessObservation, {
    manualCollectionPath: KAIROS_BUSINESS_COLLECTION_PATH,
    manualCollectionAvailable: true,
    scheduledCollectionEnabled: false,
    persistenceConfigured: false,
    prioritizationEnabled: false,
    orchestrationEnabled: false,
  });
});

for (const method of ["GET", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
  test(`returns 405 for authenticated ${method} collection`, async () => {
    const response = await handleAutonomyApiRequest(
      request(KAIROS_BUSINESS_COLLECTION_PATH, { method }),
      env(),
    );
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "POST");
    assert.equal((await json(response)).error.code, "METHOD_NOT_ALLOWED");
  });
}

test("method failure includes collector build header", async () => {
  const response = await handleAutonomyApiRequest(
    request(KAIROS_BUSINESS_COLLECTION_PATH, { method: "GET" }),
    env(),
  );
  assert.equal(response.headers.get("X-Kairos-Business-Collector-Build"), KAIROS_BUSINESS_COLLECTOR_BUILD);
});

test("method failure leaves body unused", async () => {
  const req = request(KAIROS_BUSINESS_COLLECTION_PATH, {
    method: "PUT",
    body: "{}",
  });
  await handleAutonomyApiRequest(req, env());
  assert.equal(req.bodyUsed, false);
});

for (const contentType of ["application/json", "application/json; charset=utf-8", "Application/JSON"]) {
  test(`accepts ${contentType}`, async () => {
    const response = await handleAutonomyApiRequest(
      collectionRequest({}, { contentType }),
      env(),
      {},
      { businessCollector: async () => validCollectorResult() },
    );
    assert.equal(response.status, 200);
  });
}

for (const contentType of [undefined, "text/plain", "text/application/json", "application/jsonp", "application/problem+json"]) {
  test(`rejects incompatible content type ${String(contentType)}`, async () => {
    const req = request(KAIROS_BUSINESS_COLLECTION_PATH, {
      method: "POST",
      contentType,
      body: "{}",
    });
    const response = await handleAutonomyApiRequest(req, env());
    assert.equal(response.status, 415);
    assert.equal((await json(response)).error.code, "UNSUPPORTED_MEDIA_TYPE");
    assert.equal(req.bodyUsed, false);
  });
}

test("rejects Content-Length above configured limit without reading body", async () => {
  const req = collectionRequest({}, { headers: { "Content-Length": "5000" } });
  const response = await handleAutonomyApiRequest(req, env(), {}, {
    maxBusinessCollectionRequestBytes: 1024,
  });
  assert.equal(response.status, 413);
  assert.equal(req.bodyUsed, false);
});

test("rejects streamed body above configured limit", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest({ data: "x".repeat(5000) }),
    env(),
    {},
    { maxBusinessCollectionRequestBytes: 1024 },
  );
  assert.equal(response.status, 413);
  assert.equal((await json(response)).error.code, "REQUEST_TOO_LARGE");
});

test("invalid internal request limit falls back to default", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    maxBusinessCollectionRequestBytes: 100,
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.status, 200);
});

test("locked body returns INVALID_REQUEST_BODY", async () => {
  const req = collectionRequest();
  req.body.getReader();
  const response = await handleAutonomyApiRequest(req, env());
  assert.equal(response.status, 400);
  assert.equal((await json(response)).error.code, "INVALID_REQUEST_BODY");
});

test("malformed UTF-8 returns INVALID_REQUEST_BODY", async () => {
  const response = await handleAutonomyApiRequest(
    request(KAIROS_BUSINESS_COLLECTION_PATH, {
      method: "POST",
      contentType: "application/json",
      body: new Uint8Array([0xff, 0xfe]),
    }),
    env(),
  );
  assert.equal(response.status, 400);
  assert.equal((await json(response)).error.code, "INVALID_REQUEST_BODY");
});

for (const body of ["", "{bad", "null", "[]", '"text"', "12", "true"]) {
  test(`rejects invalid JSON object body ${JSON.stringify(body)}`, async () => {
    const response = await handleAutonomyApiRequest(
      request(KAIROS_BUSINESS_COLLECTION_PATH, {
        method: "POST",
        contentType: "application/json",
        body,
      }),
      env(),
    );
    assert.equal(response.status, 400);
    assert.equal((await json(response)).error.code, "INVALID_JSON_BODY");
  });
}

test("passes parsed JSON object unchanged to collector", async () => {
  let received;
  const input = { tenantId: "mmg", website: { targetUrl: " https://example.com " }, unknown: 1 };
  const response = await handleAutonomyApiRequest(collectionRequest(input), env(), {}, {
    businessCollector: async (value) => { received = value; return validCollectorResult(); },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(received, input);
});

test("invokes injected collector exactly once", async () => {
  let calls = 0;
  await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => { calls += 1; return validCollectorResult(); },
  });
  assert.equal(calls, 1);
});

test("rejects non-function injected collector", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: "invalid",
  });
  assert.equal(response.status, 500);
  assert.equal((await json(response)).error.code, "BUSINESS_COLLECTION_API_FAILED");
});

test("rejects businessCollector accessor without invocation", async () => {
  let invoked = 0;
  const options = {};
  Object.defineProperty(options, "businessCollector", {
    enumerable: true,
    get() { invoked += 1; return async () => validCollectorResult(); },
  });
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, options);
  assert.equal(response.status, 500);
  assert.equal(invoked, 0);
});

test("passes env by default", async () => {
  const environment = env();
  let received;
  await handleAutonomyApiRequest(collectionRequest(), environment, {}, {
    businessCollector: async (_input, collectorEnv) => { received = collectorEnv; return validCollectorResult(); },
  });
  assert.equal(received, environment);
});

test("passes exact collectorEnvironment override without merging", async () => {
  const override = { KAIROS_ENVIRONMENT: "staging" };
  let received;
  await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    collectorEnvironment: override,
    businessCollector: async (_input, collectorEnv) => { received = collectorEnv; return validCollectorResult(); },
  });
  assert.equal(received, override);
  assert.equal(Object.hasOwn(received, "KAIROS_AUTONOMY_API_TOKEN"), false);
});

test("omitted collectorOptions becomes new empty object", async () => {
  let received;
  await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async (_input, _env, collectorOptions) => { received = collectorOptions; return validCollectorResult(); },
  });
  assert.deepEqual(received, {});
});

test("shallow-clones collectorOptions", async () => {
  const original = { now: new Date("2026-08-02T19:00:00.000Z"), limit: 1 };
  let received;
  await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    collectorOptions: original,
    businessCollector: async (_input, _env, collectorOptions) => { received = collectorOptions; return validCollectorResult(); },
  });
  assert.notEqual(received, original);
  assert.equal(received.now, original.now);
  assert.equal(received.limit, 1);
});

test("rejects non-plain collectorOptions", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    collectorOptions: [],
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.status, 500);
});

test("rejects symbol-keyed collectorOptions", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
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
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    collectorOptions,
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.status, 500);
  assert.equal(invoked, 0);
});

test("returns exact valid collector result under businessState", async () => {
  const result = validCollectorResult();
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => result,
  });
  const body = await json(response);
  assert.deepEqual(body.businessState, result);
  assert.equal(Object.hasOwn(body, "result"), false);
});

test("success response has exact top-level keys", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => validCollectorResult(),
  });
  const body = await json(response);
  assert.deepEqual(Object.keys(body).sort(), [
    "build", "businessState", "collectorBuild", "observationBuild", "ok",
  ]);
});

test("success response includes safe headers", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => validCollectorResult(),
  });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("X-Kairos-Autonomy-API-Build"), KAIROS_AUTONOMY_API_BUILD);
  assert.equal(response.headers.get("X-Kairos-Business-Collector-Build"), KAIROS_BUSINESS_COLLECTOR_BUILD);
});

const VALIDATION_CODES = [
  "INVALID_INPUT", "UNKNOWN_INPUT_FIELD", "INVALID_TENANT_ID",
  "INVALID_COLLECTORS", "UNSUPPORTED_COLLECTOR", "DUPLICATE_COLLECTOR",
  "INVALID_WEBSITE_INPUT", "UNKNOWN_WEBSITE_FIELD", "INVALID_TARGET_URL_INPUT",
  "INVALID_OPTIONS", "UNKNOWN_OPTION_FIELD", "INVALID_CLOCK",
  "INVALID_WEBSITE_EXECUTOR", "INVALID_FETCH_IMPL", "INVALID_WEBSITE_TIMEOUT",
  "INVALID_WEBSITE_BODY_LIMIT", "INVALID_SNAPSHOT_WINDOW", "INVALID_SNAPSHOT_RECENT_LIMIT",
];

for (const code of VALIDATION_CODES) {
  test(`maps collector validation ${code} to fixed HTTP 400 response`, async () => {
    const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
      businessCollector: async () => collectorFailure(code, "website.targetUrl", 0),
    });
    const body = await json(response);
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

test("maps unsafe validation field and index to null", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => collectorFailure("INVALID_INPUT", " target url ", 5000),
  });
  assert.deepEqual((await json(response)).error, {
    code: "INVALID_INPUT",
    message: "The business-state collection request is invalid.",
    field: null,
    index: null,
  });
});

test("maps snapshot build failure to HTTP 503", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => collectorFailure("SNAPSHOT_BUILD_FAILED"),
  });
  const body = await json(response);
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "BUSINESS_SNAPSHOT_UNAVAILABLE");
  assert.equal(body.error.message, "The business-state snapshot could not be assembled.");
});

test("maps collector exception to HTTP 502", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => { throw new Error("secret stack and message"); },
  });
  const body = await json(response);
  assert.equal(response.status, 502);
  assert.equal(body.error.code, "INVALID_BUSINESS_COLLECTOR_RESULT");
  assert.equal(JSON.stringify(body).includes("secret"), false);
});

for (const malformed of [null, [], "text", 42, new Date(NOW)]) {
  test(`rejects malformed collector result ${Object.prototype.toString.call(malformed)}`, async () => {
    const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
      businessCollector: async () => malformed,
    });
    assert.equal(response.status, 502);
  });
}

test("rejects wrong collector build", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => validCollectorResult({ build: "wrong" }),
  });
  assert.equal(response.status, 502);
});

test("rejects invalid collector tenant identifier", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => validCollectorResult({ tenantId: "MMG" }),
  });
  assert.equal(response.status, 502);
});

test("rejects noncanonical collector timestamp", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => validCollectorResult({ generatedAt: "2026-08-02T19:00:00Z" }),
  });
  assert.equal(response.status, 502);
});

test("rejects inconsistent collector counts", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => validCollectorResult({ failedCount: 1 }),
  });
  assert.equal(response.status, 502);
});

test("rejects collector array length mismatch", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => validCollectorResult({ collectors: [] }),
  });
  assert.equal(response.status, 502);
});

test("rejects top-level collector accessor without invocation", async () => {
  let invoked = 0;
  const result = validCollectorResult();
  Object.defineProperty(result, "ok", {
    enumerable: true,
    get() { invoked += 1; return true; },
  });
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => result,
  });
  assert.equal(response.status, 502);
  assert.equal(invoked, 0);
});

test("rejects nested collector accessor without invocation", async () => {
  let invoked = 0;
  const result = validCollectorResult();
  Object.defineProperty(result.snapshot, "snapshotId", {
    enumerable: true,
    get() { invoked += 1; return "secret"; },
  });
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => result,
  });
  assert.equal(response.status, 502);
  assert.equal(invoked, 0);
});

test("rejects circular collector result", async () => {
  const result = validCollectorResult();
  result.self = result;
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => result,
  });
  assert.equal(response.status, 502);
});

test("rejects BigInt collector value", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => validCollectorResult({ secret: 1n }),
  });
  assert.equal(response.status, 502);
});

test("rejects function collector value without invoking it", async () => {
  let invoked = 0;
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => validCollectorResult({ fn() { invoked += 1; } }),
  });
  assert.equal(response.status, 502);
  assert.equal(invoked, 0);
});

test("does not invoke toJSON", async () => {
  let invoked = 0;
  const result = validCollectorResult();
  result.toJSON = () => { invoked += 1; return {}; };
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => result,
  });
  assert.equal(response.status, 502);
  assert.equal(invoked, 0);
});

test("does not invoke Symbol.toStringTag getter", async () => {
  let invoked = 0;
  const result = validCollectorResult();
  Object.defineProperty(result, Symbol.toStringTag, {
    get() { invoked += 1; return "Collector"; },
  });
  const response = await handleAutonomyApiRequest(collectionRequest(), env(), {}, {
    businessCollector: async () => result,
  });
  assert.equal(response.status, 502);
  assert.equal(invoked, 0);
});

test("delegates workflows route and preserves nested data", async () => {
  const workflows = [{ id: "website.health.v1", status: "active", build: "inner-build" }];
  const response = await handleAutonomyApiRequest(request("/api/autonomy/workflows"), env(), {}, {
    workflowLister: () => workflows,
  });
  const body = await json(response);
  assert.equal(response.status, 200);
  assert.equal(body.build, KAIROS_AUTONOMY_API_BUILD);
  assert.equal(body.workflows[0].build, "inner-build");
  assert.equal(response.headers.get("X-Kairos-Business-Collector-Build"), null);
});

test("collection response does not expose authorization or environment", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), env({ SECRET_MARKER: "do-not-return" }), {}, {
    businessCollector: async () => validCollectorResult(),
  });
  const text = await response.text();
  assert.equal(text.includes(API_TOKEN), false);
  assert.equal(text.includes("do-not-return"), false);
  assert.equal(response.headers.get("Authorization"), null);
});

test("malformed request URL fails closed without rejection", async () => {
  const response = await handleAutonomyApiRequest({
    get url() { throw new Error("secret URL failure"); },
  }, env());
  assert.equal(response.status, 500);
  const body = await json(response);
  assert.equal(body.error.code, "AUTONOMY_API_DELEGATION_FAILED");
  assert.equal(JSON.stringify(body).includes("secret"), false);
});

test("owned-route header failure uses business collection fail-closed error", async () => {
  const fake = {
    url: `${ORIGIN}${KAIROS_BUSINESS_COLLECTION_PATH}`,
    method: "POST",
    get headers() { throw new Error("secret header failure"); },
  };
  const response = await handleAutonomyApiRequest(fake, env());
  assert.equal(response.status, 500);
  assert.equal((await json(response)).error.code, "BUSINESS_COLLECTION_API_FAILED");
});
