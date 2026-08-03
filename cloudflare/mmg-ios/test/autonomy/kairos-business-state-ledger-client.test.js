import test from "node:test";
import assert from "node:assert/strict";

import {
  createAutonomyLedgerClient,
  KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD,
} from "../../src/autonomy/kairos-autonomy-ledger-client-v1.js";

const STORE_BUILD = "kairos-business-state-store-20260802-1";
const STORE_HEADER = "X-Kairos-Business-State-Store-Build";

function snapshotResponse(body, status = 200, build = STORE_BUILD) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (build !== null) headers.set(STORE_HEADER, build);
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers,
  });
}

function eventResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function capturedClient(responseFactory = () => snapshotResponse({ ok: true })) {
  const calls = [];
  const client = createAutonomyLedgerClient({}, {
    stub: {
      async fetch(url, init) {
        calls.push({ url, init });
        return responseFactory(url, init, calls.length - 1);
      },
    },
  });
  return { calls, client };
}

test("exports the business-state ledger client build", () => {
  assert.equal(
    KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD,
    "kairos-autonomy-ledger-client-20260802-2-business-state-store",
  );
});

test("preserves every legacy event route and request body", async () => {
  const calls = [];
  const client = createAutonomyLedgerClient({}, {
    stub: {
      async fetch(url, init) {
        calls.push({ url, init });
        return eventResponse({ ok: true, disposition: "accepted" }, 200);
      },
    },
  });
  const event = { eventId: "evt_1" };
  await client.reserveEvent(event);
  await client.getEvent("mmg", "evt_1");
  await client.listRecentEvents("mmg", 7);
  await client.acquireLease({ tenantId: "mmg", eventId: "evt_1" });
  await client.markCompleted({ tenantId: "mmg", eventId: "evt_1" });
  await client.markFailed({ tenantId: "mmg", eventId: "evt_1" });
  await client.markBlocked({ tenantId: "mmg", eventId: "evt_1" });

  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/reserve",
    "/get",
    "/recent",
    "/acquire-lease",
    "/complete",
    "/fail",
    "/block",
  ]);
  assert.deepEqual(JSON.parse(calls[0].init.body), { event });
  assert.deepEqual(JSON.parse(calls[1].init.body), { tenantId: "mmg", eventId: "evt_1" });
  assert.deepEqual(JSON.parse(calls[2].init.body), { tenantId: "mmg", limit: 7 });
});

test("maps the four business-state methods to fixed internal routes", async () => {
  const { calls, client } = capturedClient();
  await client.storeBusinessSnapshot({ ok: true });
  await client.getBusinessSnapshot("mmg", "bss_1");
  await client.getLatestBusinessSnapshot("mmg");
  await client.listRecentBusinessSnapshots("mmg", 4);

  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/business-snapshots/store",
    "/business-snapshots/get",
    "/business-snapshots/latest",
    "/business-snapshots/recent",
  ]);
  assert.deepEqual(JSON.parse(calls[0].init.body), { businessState: { ok: true } });
  assert.deepEqual(JSON.parse(calls[1].init.body), { tenantId: "mmg", snapshotId: "bss_1" });
  assert.deepEqual(JSON.parse(calls[2].init.body), { tenantId: "mmg" });
  assert.deepEqual(JSON.parse(calls[3].init.body), { tenantId: "mmg", limit: 4 });
});

test("uses ten as the default recent business snapshot limit", async () => {
  const { calls, client } = capturedClient();
  await client.listRecentBusinessSnapshots("mmg");
  assert.equal(JSON.parse(calls[0].init.body).limit, 10);
});

test("does not coerce a supplied recent business snapshot limit", async () => {
  const { calls, client } = capturedClient();
  await client.listRecentBusinessSnapshots("mmg", "7");
  assert.equal(JSON.parse(calls[0].init.body).limit, "7");
});

test("snapshot requests use JSON headers without authorization or cookies", async () => {
  const { calls, client } = capturedClient();
  await client.getLatestBusinessSnapshot("mmg");
  const headers = calls[0].init.headers;
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers.Accept, "application/json");
  assert.equal(Object.hasOwn(headers, "Authorization"), false);
  assert.equal(Object.hasOwn(headers, "Cookie"), false);
});

test("snapshot responses use a separate larger default limit", async () => {
  const largeValue = "x".repeat(150 * 1024);
  const stub = {
    async fetch(url) {
      return new URL(url).pathname.startsWith("/business-snapshots/")
        ? snapshotResponse({ ok: true, disposition: "found", record: { largeValue } })
        : eventResponse({ ok: true, largeValue });
    },
  };
  const client = createAutonomyLedgerClient({}, { stub });
  const eventResult = await client.reserveEvent({ eventId: "evt" });
  const snapshotResult = await client.getLatestBusinessSnapshot("mmg");
  assert.equal(eventResult.code, "LEDGER_INVALID_RESPONSE");
  assert.equal(snapshotResult.ok, true);
  assert.equal(snapshotResult.record.largeValue.length, largeValue.length);
});

test("snapshot response limit option is independent from the event limit", async () => {
  const largeValue = "x".repeat(70 * 1024);
  const client = createAutonomyLedgerClient({}, {
    maxResponseBytes: 512 * 1024,
    maxBusinessSnapshotResponseBytes: 64 * 1024,
    stub: {
      async fetch() {
        return snapshotResponse({ ok: true, record: { largeValue } });
      },
    },
  });
  const result = await client.getLatestBusinessSnapshot("mmg");
  assert.equal(result.ok, false);
  assert.equal(result.code, "LEDGER_INVALID_RESPONSE");
});

test("requires the exact business-state store build header", async () => {
  const valid = createAutonomyLedgerClient({}, {
    stub: { async fetch() { return snapshotResponse({ ok: true }); } },
  });
  const missing = createAutonomyLedgerClient({}, {
    stub: { async fetch() { return snapshotResponse({ ok: true }, 200, null); } },
  });
  const incompatible = createAutonomyLedgerClient({}, {
    stub: { async fetch() { return snapshotResponse({ ok: true }, 200, "wrong-build"); } },
  });

  assert.equal((await valid.getLatestBusinessSnapshot("mmg")).ok, true);
  assert.equal((await missing.getLatestBusinessSnapshot("mmg")).code, "LEDGER_INVALID_RESPONSE");
  assert.equal((await incompatible.getLatestBusinessSnapshot("mmg")).code, "LEDGER_INVALID_RESPONSE");
});

test("rejects an oversized snapshot request before invoking the stub", async () => {
  let calls = 0;
  const client = createAutonomyLedgerClient({}, {
    stub: {
      async fetch() {
        calls += 1;
        return snapshotResponse({ ok: true });
      },
    },
  });
  const result = await client.storeBusinessSnapshot({ value: "x".repeat(70 * 1024) });
  assert.equal(result.code, "LEDGER_REQUEST_TOO_LARGE");
  assert.equal(calls, 0);
});

test("rejects getter-containing input without invoking the getter", async () => {
  let invoked = false;
  const businessState = {};
  Object.defineProperty(businessState, "danger", {
    enumerable: true,
    get() {
      invoked = true;
      throw new Error("must not run");
    },
  });
  const { calls, client } = capturedClient();
  const result = await client.storeBusinessSnapshot(businessState);
  assert.equal(result.code, "LEDGER_INVALID_REQUEST");
  assert.equal(invoked, false);
  assert.equal(calls.length, 0);
});

test("rejects toJSON without invoking it", async () => {
  let invoked = false;
  const businessState = {
    toJSON() {
      invoked = true;
      return { leaked: true };
    },
  };
  const { calls, client } = capturedClient();
  const result = await client.storeBusinessSnapshot(businessState);
  assert.equal(result.code, "LEDGER_INVALID_REQUEST");
  assert.equal(invoked, false);
  assert.equal(calls.length, 0);
});

test("rejects symbol keys", async () => {
  const businessState = { ok: true };
  businessState[Symbol("secret")] = "value";
  const { calls, client } = capturedClient();
  const result = await client.storeBusinessSnapshot(businessState);
  assert.equal(result.code, "LEDGER_INVALID_REQUEST");
  assert.equal(calls.length, 0);
});

test("rejects sparse and custom-property arrays", async () => {
  const sparse = [];
  sparse.length = 2;
  sparse[0] = "a";
  const custom = ["a"];
  custom.extra = true;
  const { client } = capturedClient();
  assert.equal((await client.storeBusinessSnapshot({ sparse })).code, "LEDGER_INVALID_REQUEST");
  assert.equal((await client.storeBusinessSnapshot({ custom })).code, "LEDGER_INVALID_REQUEST");
});

test("rejects circular graphs", async () => {
  const businessState = {};
  businessState.self = businessState;
  const { client } = capturedClient();
  assert.equal((await client.storeBusinessSnapshot(businessState)).code, "LEDGER_INVALID_REQUEST");
});

test("rejects bigint, dates, and class instances", async () => {
  class Candidate {}
  const { client } = capturedClient();
  assert.equal((await client.storeBusinessSnapshot({ value: 1n })).code, "LEDGER_INVALID_REQUEST");
  assert.equal((await client.storeBusinessSnapshot({ value: new Date() })).code, "LEDGER_INVALID_REQUEST");
  assert.equal((await client.storeBusinessSnapshot({ value: new Candidate() })).code, "LEDGER_INVALID_REQUEST");
});

test("accepts null-prototype objects", async () => {
  const businessState = Object.create(null);
  businessState.ok = true;
  const { calls, client } = capturedClient();
  const result = await client.storeBusinessSnapshot(businessState);
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].init.body).businessState.ok, true);
});

test("preserves __proto__ as data without prototype mutation", async () => {
  const businessState = Object.create(null);
  Object.defineProperty(businessState, "__proto__", {
    value: { polluted: true },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  const { calls, client } = capturedClient();
  const result = await client.storeBusinessSnapshot(businessState);
  assert.equal(result.ok, true);
  const parsed = JSON.parse(calls[0].init.body);
  assert.equal(Object.hasOwn(parsed.businessState, "__proto__"), true);
  assert.equal(parsed.businessState.__proto__.polluted, true);
  assert.equal({}.polluted, undefined);
});

test("does not mutate caller-owned business state", async () => {
  const businessState = { nested: { values: [1, 2, 3] } };
  const before = structuredClone(businessState);
  const { client } = capturedClient();
  await client.storeBusinessSnapshot(businessState);
  assert.deepEqual(businessState, before);
});

test("snapshot timeout fails even when the stub ignores abort", async () => {
  const client = createAutonomyLedgerClient({}, {
    timeoutMs: 100,
    stub: { async fetch() { return new Promise(() => {}); } },
  });
  const started = Date.now();
  const result = await client.getLatestBusinessSnapshot("mmg");
  assert.equal(result.code, "LEDGER_UNAVAILABLE");
  assert.ok(Date.now() - started < 1_000);
});

test("rejected snapshot fetch returns LEDGER_UNAVAILABLE", async () => {
  const client = createAutonomyLedgerClient({}, {
    stub: { async fetch() { throw new Error("private detail"); } },
  });
  const result = await client.getLatestBusinessSnapshot("mmg");
  assert.equal(result.code, "LEDGER_UNAVAILABLE");
  assert.equal(JSON.stringify(result).includes("private detail"), false);
});

test("rejects oversized, malformed, empty, and invalid snapshot responses", async () => {
  const oversized = createAutonomyLedgerClient({}, {
    maxBusinessSnapshotResponseBytes: 64 * 1024,
    stub: {
      async fetch() {
        return snapshotResponse({ ok: true, record: { value: "x".repeat(70 * 1024) } });
      },
    },
  });
  const malformed = createAutonomyLedgerClient({}, {
    stub: { async fetch() { return snapshotResponse("not-json"); } },
  });
  const empty = createAutonomyLedgerClient({}, {
    stub: { async fetch() { return snapshotResponse(""); } },
  });
  const invalid = createAutonomyLedgerClient({}, {
    stub: { async fetch() { return snapshotResponse([]); } },
  });

  assert.equal((await oversized.getLatestBusinessSnapshot("mmg")).code, "LEDGER_INVALID_RESPONSE");
  assert.equal((await malformed.getLatestBusinessSnapshot("mmg")).code, "LEDGER_INVALID_RESPONSE");
  assert.equal((await empty.getLatestBusinessSnapshot("mmg")).code, "LEDGER_INVALID_RESPONSE");
  assert.equal((await invalid.getLatestBusinessSnapshot("mmg")).code, "LEDGER_INVALID_RESPONSE");
});

test("rejects invalid snapshot response metadata and record collections", async () => {
  const invalidStatus = createAutonomyLedgerClient({}, {
    stub: { async fetch() { return snapshotResponse({ ok: true, statusCode: 200.5 }); } },
  });
  const invalidRecords = createAutonomyLedgerClient({}, {
    stub: { async fetch() { return snapshotResponse({ ok: true, records: ["not-a-record"] }); } },
  });
  assert.equal((await invalidStatus.getLatestBusinessSnapshot("mmg")).code, "LEDGER_INVALID_RESPONSE");
  assert.equal((await invalidRecords.listRecentBusinessSnapshots("mmg")).code, "LEDGER_INVALID_RESPONSE");
});

test("preserves valid stored, duplicate, conflict, and not-found results", async () => {
  const results = [
    snapshotResponse({ ok: true, disposition: "stored", duplicate: false, record: { snapshotId: "a" } }, 201),
    snapshotResponse({ ok: true, disposition: "duplicate", duplicate: true, record: { snapshotId: "a" } }, 200),
    snapshotResponse({ ok: false, disposition: "conflict", code: "SNAPSHOT_IDENTITY_CONFLICT", record: { snapshotId: "a" } }, 409),
    snapshotResponse({ ok: false, disposition: "not_found", code: "BUSINESS_SNAPSHOT_NOT_FOUND", record: null }, 404),
  ];
  let index = 0;
  const client = createAutonomyLedgerClient({}, {
    stub: { async fetch() { return results[index++]; } },
  });
  const stored = await client.storeBusinessSnapshot({ ok: true });
  const duplicate = await client.storeBusinessSnapshot({ ok: true });
  const conflict = await client.storeBusinessSnapshot({ ok: true });
  const missing = await client.getBusinessSnapshot("mmg", "missing");
  assert.equal(stored.disposition, "stored");
  assert.equal(stored.statusCode, 201);
  assert.equal(duplicate.duplicate, true);
  assert.equal(conflict.code, "SNAPSHOT_IDENTITY_CONFLICT");
  assert.equal(conflict.statusCode, 409);
  assert.equal(missing.code, "BUSINESS_SNAPSHOT_NOT_FOUND");
  assert.equal(missing.statusCode, 404);
});

test("uses HTTP status as the snapshot statusCode fallback", async () => {
  const client = createAutonomyLedgerClient({}, {
    stub: { async fetch() { return snapshotResponse({ ok: true, disposition: "stored" }, 201); } },
  });
  const result = await client.storeBusinessSnapshot({ ok: true });
  assert.equal(result.statusCode, 201);
});

test("unavailable clients expose all event and snapshot methods", async () => {
  const client = createAutonomyLedgerClient({});
  const methods = [
    "reserveEvent",
    "getEvent",
    "listRecentEvents",
    "acquireLease",
    "markCompleted",
    "markFailed",
    "markBlocked",
    "storeBusinessSnapshot",
    "getBusinessSnapshot",
    "getLatestBusinessSnapshot",
    "listRecentBusinessSnapshots",
  ];
  for (const method of methods) {
    assert.equal(typeof client[method], "function");
    const result = await client[method]();
    assert.equal(result.ok, false);
    assert.equal(result.code, "LEDGER_UNAVAILABLE");
    assert.equal(result.disposition, "ledger_error");
  }
});

test("returned clients remain frozen and construction performs no request", () => {
  let calls = 0;
  const client = createAutonomyLedgerClient({}, {
    stub: { async fetch() { calls += 1; return snapshotResponse({ ok: true }); } },
  });
  assert.equal(Object.isFrozen(client), true);
  assert.equal(calls, 0);
});

test("snapshot option accessors are not invoked", async () => {
  let invoked = false;
  const options = {
    stub: {
      async fetch() {
        return snapshotResponse({ ok: true, record: { value: "x".repeat(70 * 1024) } });
      },
    },
  };
  Object.defineProperty(options, "maxBusinessSnapshotResponseBytes", {
    enumerable: true,
    get() {
      invoked = true;
      throw new Error("must not run");
    },
  });
  const client = createAutonomyLedgerClient({}, options);
  const result = await client.getLatestBusinessSnapshot("mmg");
  assert.equal(invoked, false);
  assert.equal(result.ok, true);
});

test("legacy event methods remain operational after snapshot calls", async () => {
  const calls = [];
  const client = createAutonomyLedgerClient({}, {
    stub: {
      async fetch(url) {
        calls.push(new URL(url).pathname);
        return new URL(url).pathname.startsWith("/business-snapshots/")
          ? snapshotResponse({ ok: true })
          : eventResponse({ ok: true, disposition: "reserved" }, 201);
      },
    },
  });
  assert.equal((await client.getLatestBusinessSnapshot("mmg")).ok, true);
  assert.equal((await client.reserveEvent({ eventId: "evt" })).ok, true);
  assert.deepEqual(calls, ["/business-snapshots/latest", "/reserve"]);
});
