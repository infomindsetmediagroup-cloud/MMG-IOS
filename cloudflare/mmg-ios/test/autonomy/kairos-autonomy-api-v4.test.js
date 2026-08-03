import test from "node:test";
import assert from "node:assert/strict";

import {
  handleAutonomyApiRequest,
  KAIROS_AUTONOMY_API_BUILD,
  KAIROS_BUSINESS_COLLECTION_PATH,
} from "../../src/autonomy/kairos-autonomy-api-v4.js";
import { KAIROS_AUTONOMY_API_BUILD as KAIROS_AUTONOMY_API_V3_BUILD } from "../../src/autonomy/kairos-autonomy-api-v3.js";
import { KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD } from "../../src/autonomy/kairos-autonomy-ledger-client-v1.js";
import { KAIROS_BUSINESS_COLLECTOR_BUILD } from "../../src/autonomy/kairos-business-collector-v1.js";
import { KAIROS_BUSINESS_OBSERVATION_BUILD } from "../../src/autonomy/kairos-business-observation-v1.js";

const API_TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const ORIGIN = "https://mmg-ios.example";
const NOW = "2026-08-02T19:00:00.000Z";
const STORED_AT = "2026-08-02T19:00:01.000Z";
const SNAPSHOT_ID = "bss_20260802t190000z_12345678";

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

function validCollectorResult(overrides = {}) {
  const result = {
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
      snapshotId: SNAPSHOT_ID,
      tenantId: "mmg",
      generatedAt: NOW,
      recent: [],
    },
  };
  return { ...result, ...overrides };
}

function storageRecord(overrides = {}) {
  return {
    tenantId: "mmg",
    snapshotId: SNAPSHOT_ID,
    generatedAt: NOW,
    storedAt: STORED_AT,
    collectorBuild: KAIROS_BUSINESS_COLLECTOR_BUILD,
    observationBuild: KAIROS_BUSINESS_OBSERVATION_BUILD,
    schemaVersion: 1,
    collectorCount: 1,
    collectedCount: 1,
    blockedCount: 0,
    failedCount: 0,
    businessState: validCollectorResult(),
    ...overrides,
  };
}

function storageResult(disposition = "stored", overrides = {}) {
  return {
    ok: true,
    disposition,
    duplicate: disposition === "duplicate",
    record: storageRecord(),
    statusCode: disposition === "stored" ? 201 : 200,
    ...overrides,
  };
}

function injectedOptions({ collectorResult = validCollectorResult(), ledgerResult = storageResult(), onStore } = {}) {
  return {
    businessCollector: async () => collectorResult,
    businessStateLedgerClient: {
      async storeBusinessSnapshot(value) {
        if (onStore) onStore(value);
        return typeof ledgerResult === "function" ? ledgerResult(value) : ledgerResult;
      },
    },
  };
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

test("exports the exact API v4 build", () => {
  assert.equal(KAIROS_AUTONOMY_API_BUILD, "kairos-autonomy-api-20260802-4-business-state-persistence");
});

test("re-exports the exact collection path", () => {
  assert.equal(KAIROS_BUSINESS_COLLECTION_PATH, "/api/autonomy/business-state/collect");
});

test("returns null for a non-autonomy route", async () => {
  assert.equal(await handleAutonomyApiRequest(apiRequest("/health"), environment()), null);
});

test("delegates unknown autonomy routes and upgrades the build", async () => {
  const response = await handleAutonomyApiRequest(apiRequest("/api/autonomy/unknown"), environment());
  const body = await responseJson(response);
  assert.equal(response.status, 404);
  assert.equal(body.build, KAIROS_AUTONOMY_API_BUILD);
  assert.equal(response.headers.get("X-Kairos-Autonomy-API-Build"), KAIROS_AUTONOMY_API_BUILD);
});

test("upgrades GET status and advertises inactive manual persistence", async () => {
  const response = await handleAutonomyApiRequest(apiRequest("/api/autonomy/status"), environment());
  const body = await responseJson(response);
  assert.equal(response.status, 200);
  assert.equal(body.build, KAIROS_AUTONOMY_API_BUILD);
  assert.equal(body.builds.api, KAIROS_AUTONOMY_API_BUILD);
  assert.equal(body.builds.apiV3, KAIROS_AUTONOMY_API_V3_BUILD);
  assert.equal(body.builds.ledgerClient, KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD);
  assert.equal(body.businessObservation.manualPersistenceEnabled, true);
  assert.equal(body.businessObservation.persistenceConfigured, true);
  assert.equal(body.businessObservation.scheduledCollectionEnabled, false);
  assert.equal(body.businessObservation.scheduledPersistenceEnabled, false);
  assert.equal(body.businessObservation.prioritizationEnabled, false);
  assert.equal(body.businessObservation.orchestrationEnabled, false);
  assert.equal(response.headers.get("X-Kairos-Autonomy-Ledger-Client-Build"), KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD);
});

test("status reports persistence unconfigured without a valid binding", async () => {
  const response = await handleAutonomyApiRequest(
    apiRequest("/api/autonomy/status"),
    environment({ KAIROS_AUTONOMY_LEDGER: {} }),
  );
  assert.equal((await responseJson(response)).businessObservation.persistenceConfigured, false);
});

test("status inspects binding methods without calling them", async () => {
  let idCalls = 0;
  let getCalls = 0;
  let storeCalls = 0;
  const response = await handleAutonomyApiRequest(
    apiRequest("/api/autonomy/status"),
    environment({
      KAIROS_AUTONOMY_LEDGER: {
        idFromName() { idCalls += 1; return "id"; },
        get() { getCalls += 1; return {}; },
      },
    }),
    {},
    {
      businessStateLedgerClient: {
        storeBusinessSnapshot() { storeCalls += 1; },
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(idCalls, 0);
  assert.equal(getCalls, 0);
  assert.equal(storeCalls, 0);
});

test("successful manual collection persists exactly once", async () => {
  let calls = 0;
  const response = await handleAutonomyApiRequest(
    collectionRequest(),
    environment(),
    {},
    injectedOptions({ onStore() { calls += 1; } }),
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});

test("query strings preserve exact collection ownership", async () => {
  let calls = 0;
  const response = await handleAutonomyApiRequest(
    apiRequest(`${KAIROS_BUSINESS_COLLECTION_PATH}?mode=manual`, {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ tenantId: "mmg" }),
    }),
    environment(),
    {},
    injectedOptions({ onStore() { calls += 1; } }),
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});

for (const path of [
  `${KAIROS_BUSINESS_COLLECTION_PATH}/`,
  `${KAIROS_BUSINESS_COLLECTION_PATH}/extra`,
  "/api/autonomy/business-state/Collect",
  "/api/autonomy/business-state",
]) {
  test(`near-match route ${path} never persists`, async () => {
    let calls = 0;
    const response = await handleAutonomyApiRequest(
      apiRequest(path, { method: "POST", contentType: "application/json", body: "{}" }),
      environment(),
      {},
      injectedOptions({ onStore() { calls += 1; } }),
    );
    assert.equal(response.status, 404);
    assert.equal(calls, 0);
  });
}

const noPersistenceCases = [
  ["authentication failure", collectionRequest({}, { authenticated: false }), 401],
  ["incorrect method", apiRequest(KAIROS_BUSINESS_COLLECTION_PATH, { method: "GET" }), 405],
  ["unsupported content type", apiRequest(KAIROS_BUSINESS_COLLECTION_PATH, { method: "POST", contentType: "text/plain", body: "{}" }), 415],
  ["invalid JSON", apiRequest(KAIROS_BUSINESS_COLLECTION_PATH, { method: "POST", contentType: "application/json", body: "{bad" }), 400],
];

for (const [name, request, expectedStatus] of noPersistenceCases) {
  test(`${name} does not persist`, async () => {
    let calls = 0;
    const response = await handleAutonomyApiRequest(
      request,
      environment(),
      {},
      injectedOptions({ onStore() { calls += 1; } }),
    );
    assert.equal(response.status, expectedStatus);
    assert.equal(calls, 0);
  });
}

test("collector validation failure does not persist", async () => {
  let calls = 0;
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => ({ ok: false, build: KAIROS_BUSINESS_COLLECTOR_BUILD, schemaVersion: 1, error: { code: "INVALID_INPUT", message: "secret", field: null, index: null } }),
    businessStateLedgerClient: { async storeBusinessSnapshot() { calls += 1; } },
  });
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("collector execution failure does not persist", async () => {
  let calls = 0;
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => { throw new Error("secret"); },
    businessStateLedgerClient: { async storeBusinessSnapshot() { calls += 1; } },
  });
  assert.equal(response.status, 502);
  assert.equal(calls, 0);
});

test("stored result returns the exact persistence summary", async () => {
  let captured;
  const response = await handleAutonomyApiRequest(
    collectionRequest(),
    environment(),
    {},
    injectedOptions({ onStore(value) { captured = value; } }),
  );
  const body = await responseJson(response);
  assert.equal(response.status, 200);
  assert.deepEqual(body.persistence, {
    ok: true,
    disposition: "stored",
    duplicate: false,
    tenantId: "mmg",
    snapshotId: SNAPSHOT_ID,
    generatedAt: NOW,
    storedAt: STORED_AT,
  });
  assert.deepEqual(body.businessState, captured);
  assert.equal(body.ledgerClientBuild, KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD);
  assert.equal(Object.hasOwn(body, "record"), false);
});

test("duplicate result returns HTTP 200 and exact duplicate summary", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest(),
    environment(),
    {},
    injectedOptions({ ledgerResult: storageResult("duplicate") }),
  );
  const body = await responseJson(response);
  assert.equal(response.status, 200);
  assert.equal(body.persistence.disposition, "duplicate");
  assert.equal(body.persistence.duplicate, true);
});

for (const [name, recordOverride] of [
  ["tenant mismatch", { tenantId: "other" }],
  ["snapshot mismatch", { snapshotId: "different" }],
  ["generatedAt mismatch", { generatedAt: "2026-08-02T19:00:02.000Z" }],
  ["invalid storedAt", { storedAt: "not-a-time" }],
]) {
  test(`${name} fails closed`, async () => {
    const response = await handleAutonomyApiRequest(
      collectionRequest(),
      environment(),
      {},
      injectedOptions({ ledgerResult: storageResult("stored", { record: storageRecord(recordOverride) }) }),
    );
    assert.equal(response.status, 502);
    assert.equal((await responseJson(response)).error.code, "BUSINESS_SNAPSHOT_PERSISTENCE_FAILED");
  });
}

test("missing record fails closed", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest(),
    environment(),
    {},
    injectedOptions({ ledgerResult: storageResult("stored", { record: null }) }),
  );
  assert.equal(response.status, 502);
});

test("invalid duplicate flag fails closed", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest(),
    environment(),
    {},
    injectedOptions({ ledgerResult: storageResult("stored", { duplicate: true }) }),
  );
  assert.equal(response.status, 502);
});

test("unsupported success disposition fails closed", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest(),
    environment(),
    {},
    injectedOptions({ ledgerResult: storageResult("accepted", { duplicate: false }) }),
  );
  assert.equal(response.status, 502);
});

for (const ledgerResult of [
  { ok: false, code: "SNAPSHOT_IDENTITY_CONFLICT", disposition: "ledger_error", record: { secret: true } },
  { ok: false, code: "OTHER", disposition: "conflict", record: { secret: true } },
]) {
  test("identity conflict maps to HTTP 409 without leaking the record", async () => {
    const response = await handleAutonomyApiRequest(
      collectionRequest(),
      environment(),
      {},
      injectedOptions({ ledgerResult }),
    );
    const text = await response.text();
    assert.equal(response.status, 409);
    assert.equal(text.includes("secret"), false);
    assert.equal(JSON.parse(text).error.code, "BUSINESS_SNAPSHOT_IDENTITY_CONFLICT");
  });
}

test("LEDGER_UNAVAILABLE maps to HTTP 503", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest(),
    environment(),
    {},
    injectedOptions({ ledgerResult: { ok: false, code: "LEDGER_UNAVAILABLE", disposition: "ledger_error", error: "secret internal URL" } }),
  );
  const text = await response.text();
  assert.equal(response.status, 503);
  assert.equal(text.includes("secret internal URL"), false);
  assert.equal(JSON.parse(text).error.code, "BUSINESS_SNAPSHOT_PERSISTENCE_UNAVAILABLE");
});

test("thrown storage maps to HTTP 503", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => validCollectorResult(),
    businessStateLedgerClient: { async storeBusinessSnapshot() { throw new Error("secret"); } },
  });
  assert.equal(response.status, 503);
});

test("missing storage method maps to HTTP 503", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => validCollectorResult(),
    businessStateLedgerClient: {},
  });
  assert.equal(response.status, 503);
});

for (const code of ["LEDGER_INVALID_RESPONSE", "LEDGER_INVALID_REQUEST", "LEDGER_REQUEST_TOO_LARGE"]) {
  test(`${code} maps to HTTP 502 without business state`, async () => {
    const response = await handleAutonomyApiRequest(
      collectionRequest(),
      environment(),
      {},
      injectedOptions({ ledgerResult: { ok: false, code, disposition: "ledger_error", error: "secret", record: { secret: true } } }),
    );
    const text = await response.text();
    assert.equal(response.status, 502);
    assert.equal(text.includes("businessState"), false);
    assert.equal(text.includes("secret"), false);
    assert.equal(JSON.parse(text).error.code, "BUSINESS_SNAPSHOT_PERSISTENCE_FAILED");
  });
}

test("collection success preserves required build headers", async () => {
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, injectedOptions());
  assert.equal(response.headers.get("X-Kairos-Autonomy-API-Build"), KAIROS_AUTONOMY_API_BUILD);
  assert.equal(response.headers.get("X-Kairos-Business-Collector-Build"), KAIROS_BUSINESS_COLLECTOR_BUILD);
  assert.equal(response.headers.get("X-Kairos-Autonomy-Ledger-Client-Build"), KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD);
});

test("collection persistence failure preserves the collector build header", async () => {
  const response = await handleAutonomyApiRequest(
    collectionRequest(),
    environment(),
    {},
    injectedOptions({ ledgerResult: { ok: false, code: "LEDGER_INVALID_RESPONSE" } }),
  );
  assert.equal(response.headers.get("X-Kairos-Business-Collector-Build"), KAIROS_BUSINESS_COLLECTOR_BUILD);
});

test("method failure preserves Allow and never persists", async () => {
  let calls = 0;
  const response = await handleAutonomyApiRequest(
    apiRequest(KAIROS_BUSINESS_COLLECTION_PATH, { method: "GET" }),
    environment(),
    {},
    injectedOptions({ onStore() { calls += 1; } }),
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "POST");
  assert.equal(calls, 0);
});

test("oversized delegated collection response fails closed before storage", async () => {
  let calls = 0;
  const result = validCollectorResult();
  result.snapshot.recent = ["x".repeat(70 * 1024)];
  const response = await handleAutonomyApiRequest(
    collectionRequest(),
    environment(),
    {},
    {
      ...injectedOptions({ collectorResult: result, onStore() { calls += 1; } }),
      maxBusinessPersistenceResponseBytes: 64 * 1024,
    },
  );
  assert.equal(response.status, 502);
  assert.equal(calls, 0);
  assert.equal((await responseJson(response)).error.code, "INVALID_BUSINESS_COLLECTION_RESPONSE");
});

test("hostile collector accessors are rejected without invocation", async () => {
  let getterCalls = 0;
  let storeCalls = 0;
  const result = validCollectorResult();
  Object.defineProperty(result, "tenantId", {
    enumerable: true,
    get() { getterCalls += 1; return "mmg"; },
  });
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => result,
    businessStateLedgerClient: { async storeBusinessSnapshot() { storeCalls += 1; } },
  });
  assert.equal(response.status, 502);
  assert.equal(getterCalls, 0);
  assert.equal(storeCalls, 0);
});

test("hostile injected storage accessor is not invoked", async () => {
  let getterCalls = 0;
  const client = {};
  Object.defineProperty(client, "storeBusinessSnapshot", {
    enumerable: true,
    get() { getterCalls += 1; return async () => storageResult(); },
  });
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, {
    businessCollector: async () => validCollectorResult(),
    businessStateLedgerClient: client,
  });
  assert.equal(response.status, 503);
  assert.equal(getterCalls, 0);
});

test("hostile options proxy fails closed without leaking proxy errors", async () => {
  const options = new Proxy({}, {
    getOwnPropertyDescriptor() { throw new Error("secret proxy error"); },
    getPrototypeOf() { throw new Error("secret proxy error"); },
  });
  const response = await handleAutonomyApiRequest(collectionRequest(), environment(), {}, options);
  const text = await response.text();
  assert.ok(response.status >= 500 && response.status <= 599);
  assert.equal(text.includes("secret proxy error"), false);
});

test("ctx.waitUntil is never used for persistence", async () => {
  let waitUntilCalls = 0;
  const response = await handleAutonomyApiRequest(
    collectionRequest(),
    environment(),
    { waitUntil() { waitUntilCalls += 1; } },
    injectedOptions(),
  );
  assert.equal(response.status, 200);
  assert.equal(waitUntilCalls, 0);
});

test("module construction and status inspection do not persist", async () => {
  let calls = 0;
  const client = { async storeBusinessSnapshot() { calls += 1; return storageResult(); } };
  assert.equal(calls, 0);
  await handleAutonomyApiRequest(apiRequest("/api/autonomy/status"), environment(), {}, {
    businessStateLedgerClient: client,
  });
  assert.equal(calls, 0);
});
