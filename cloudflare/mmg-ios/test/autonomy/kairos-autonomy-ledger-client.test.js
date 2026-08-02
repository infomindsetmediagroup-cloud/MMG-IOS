import test from "node:test";
import assert from "node:assert/strict";

import {
  createAutonomyLedgerClient,
  KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD,
} from "../../src/autonomy/kairos-autonomy-ledger-client-v1.js";

test("exports a versioned ledger client build", () => {
  assert.match(KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD, /^kairos-autonomy-ledger-client-/);
});

test("fails closed when the Durable Object binding is missing", async () => {
  const client = createAutonomyLedgerClient({});
  const result = await client.reserveEvent({});
  assert.equal(result.ok, false);
  assert.equal(result.code, "LEDGER_UNAVAILABLE");
});

test("requires idFromName and get on the production binding", async () => {
  const client = createAutonomyLedgerClient({ KAIROS_AUTONOMY_LEDGER: { fetch() {} } });
  const result = await client.acquireLease({});
  assert.equal(result.code, "LEDGER_UNAVAILABLE");
});

test("uses one stable Durable Object identity and fixed POST paths", async () => {
  const calls = [];
  let resolvedName = null;
  const stub = {
    async fetch(url, init) {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true, disposition: "reserved", record: {} }), { status: 201 });
    },
  };
  const binding = {
    idFromName(name) { resolvedName = name; return { name }; },
    get() { return stub; },
  };
  const client = createAutonomyLedgerClient({ KAIROS_AUTONOMY_LEDGER: binding });
  await client.reserveEvent({ eventId: "evt" });
  await client.getEvent("tenant", "evt");
  await client.listRecentEvents("tenant", 10);
  await client.acquireLease({ tenantId: "tenant", eventId: "evt" });
  await client.markCompleted({ tenantId: "tenant", eventId: "evt" });
  await client.markFailed({ tenantId: "tenant", eventId: "evt" });
  await client.markBlocked({ tenantId: "tenant", eventId: "evt" });
  assert.equal(resolvedName, "kairos-autonomy-ledger-v1");
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/reserve", "/get", "/recent", "/acquire-lease", "/complete", "/fail", "/block",
  ]);
  assert.ok(calls.every((call) => call.init.method === "POST"));
  assert.ok(calls.every((call) => !Object.hasOwn(call.init.headers, "Authorization")));
  assert.ok(calls.every((call) => !Object.hasOwn(call.init.headers, "Cookie")));
});

test("parses structured non-2xx ledger responses instead of discarding them", async () => {
  const client = createAutonomyLedgerClient({}, {
    stub: {
      async fetch() {
        return new Response(JSON.stringify({
          ok: false,
          disposition: "lease_conflict",
          code: "ACTIVE_LEASE_EXISTS",
          record: { status: "running" },
          statusCode: 409,
        }), { status: 409 });
      },
    },
  });
  const result = await client.acquireLease({ tenantId: "mmg", eventId: "evt" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "ACTIVE_LEASE_EXISTS");
  assert.equal(result.record.status, "running");
  assert.equal(result.statusCode, 409);
});

test("preserves get failures instead of converting them to null", async () => {
  const client = createAutonomyLedgerClient({}, {
    stub: {
      async fetch() {
        return new Response(JSON.stringify({ ok: false, code: "EVENT_NOT_FOUND", disposition: "not_found", record: null }), { status: 404 });
      },
    },
  });
  const result = await client.getEvent("mmg", "missing");
  assert.equal(result.ok, false);
  assert.equal(result.code, "EVENT_NOT_FOUND");
});

test("rejects empty and malformed ledger responses", async () => {
  const emptyClient = createAutonomyLedgerClient({}, { stub: { async fetch() { return new Response("", { status: 200 }); } } });
  const malformedClient = createAutonomyLedgerClient({}, { stub: { async fetch() { return new Response("not-json", { status: 200 }); } } });
  assert.equal((await emptyClient.reserveEvent({})).code, "LEDGER_INVALID_RESPONSE");
  assert.equal((await malformedClient.reserveEvent({})).code, "LEDGER_INVALID_RESPONSE");
});

test("rejects oversized ledger responses", async () => {
  const client = createAutonomyLedgerClient({}, {
    maxResponseBytes: 1_024,
    stub: {
      async fetch() {
        return new Response(JSON.stringify({ ok: true, value: "x".repeat(2_000) }), { status: 200 });
      },
    },
  });
  const result = await client.reserveEvent({});
  assert.equal(result.ok, false);
  assert.equal(result.code, "LEDGER_INVALID_RESPONSE");
});

test("fails closed when the ledger stub throws", async () => {
  const client = createAutonomyLedgerClient({}, { stub: { async fetch() { throw new Error("internal URL and secret"); } } });
  const result = await client.reserveEvent({});
  assert.equal(result.code, "LEDGER_UNAVAILABLE");
  assert.equal(JSON.stringify(result).includes("internal URL"), false);
});

test("enforces a bounded ledger request deadline even when the stub ignores abort", async () => {
  const client = createAutonomyLedgerClient({}, {
    timeoutMs: 100,
    stub: { async fetch() { return new Promise(() => {}); } },
  });
  const started = Date.now();
  const result = await client.reserveEvent({});
  assert.equal(result.code, "LEDGER_UNAVAILABLE");
  assert.ok(Date.now() - started < 1_000);
});
