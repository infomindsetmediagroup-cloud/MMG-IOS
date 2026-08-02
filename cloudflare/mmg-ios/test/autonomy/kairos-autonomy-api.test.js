import test from "node:test";
import assert from "node:assert/strict";

import {
  handleAutonomyApiRequest,
  KAIROS_AUTONOMY_API_BUILD,
} from "../../src/autonomy/kairos-autonomy-api-v1.js";

const API_TOKEN = "test-autonomy-token-0000000000000001";
const DEFAULT_ENV = {
  KAIROS_AUTONOMY_API_TOKEN: API_TOKEN,
  KAIROS_KILL_SWITCH: "enabled",
  KAIROS_ENVIRONMENT: "production",
  KAIROS_AUTONOMY_LEDGER: {
    idFromName() { return "id"; },
    get() { return { fetch() {} }; },
  },
};

function authorizedRequest(url, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${API_TOKEN}`);
  return new Request(url, { ...init, headers });
}

function jsonRequest(url, body, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${API_TOKEN}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Request(url, {
    ...init,
    method: init.method || "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

function createDispatcherResult(overrides = {}) {
  return {
    build: "kairos-autonomy-dispatcher-20260802-1",
    disposition: "completed",
    eventId: "evt_api_001",
    tenantId: "mmg",
    workflowId: "website.health.v1",
    duplicate: false,
    retriable: false,
    record: { eventId: "evt_api_001", tenantId: "mmg", status: "completed" },
    policyDecision: { decision: "ALLOW_AUTONOMOUS" },
    workflowResult: { status: "passed" },
    error: null,
    ...overrides,
  };
}

function createLedgerClient(overrides = {}) {
  const calls = { getEvent: [], listRecentEvents: [] };
  return {
    calls,
    async getEvent(tenantId, eventId) {
      calls.getEvent.push({ tenantId, eventId });
      if (overrides.getEvent) return overrides.getEvent(tenantId, eventId);
      return { ok: true, disposition: "found", record: { eventId, tenantId, status: "completed" }, statusCode: 200 };
    },
    async listRecentEvents(tenantId, limit) {
      calls.listRecentEvents.push({ tenantId, limit });
      if (overrides.listRecentEvents) return overrides.listRecentEvents(tenantId, limit);
      return { ok: true, disposition: "listed", records: [{ eventId: "evt_001", tenantId }], limit, statusCode: 200 };
    },
  };
}

function validWorkflow(overrides = {}) {
  return {
    workflowId: "website.health.v1",
    version: 1,
    status: "active",
    owner: "Web Operations",
    riskClass: "low",
    agents: ["website-operations-agent.v1"],
    environments: ["production"],
    triggers: ["website.health.manual"],
    autonomousActions: ["website.inspect"],
    approvalRequiredActions: ["github.merge"],
    blockedActions: ["customer.email.send"],
    ...overrides,
  };
}

function assertCommonHeaders(response) {
  assert.match(response.headers.get("Content-Type") || "", /application\/json/i);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("X-Kairos-Autonomy-API-Build"), KAIROS_AUTONOMY_API_BUILD);
  assert.notEqual(response.headers.get("Access-Control-Allow-Origin"), "*");
}

async function statusRequest(env = DEFAULT_ENV, options = {}, init = {}) {
  return handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/status", init), env, {}, options);
}

test("returns null for a non-autonomy path", async () => {
  assert.equal(await handleAutonomyApiRequest(new Request("https://example.com/api/manuscript/review"), DEFAULT_ENV), null);
});
test("returns null for a similar non-autonomy path", async () => {
  assert.equal(await handleAutonomyApiRequest(new Request("https://example.com/api/autonomous/events"), DEFAULT_ENV), null);
});
test("returns null for an autonomy-prefix collision", async () => {
  assert.equal(await handleAutonomyApiRequest(new Request("https://example.com/api/autonomy-fake"), DEFAULT_ENV), null);
});

for (const [name, token] of [
  ["missing token", undefined],
  ["short token", "short"],
  ["token with whitespace", `${API_TOKEN} suffix`],
  ["token with leading whitespace", ` ${API_TOKEN}`],
  ["token with trailing whitespace", `${API_TOKEN} `],
  ["token over maximum length", "a".repeat(513)],
]) {
  test(`returns 503 for ${name}`, async () => {
    const response = await statusRequest({ ...DEFAULT_ENV, KAIROS_AUTONOMY_API_TOKEN: token });
    assert.equal(response.status, 503);
    assert.equal((await responseJson(response)).error.code, "AUTONOMY_API_NOT_CONFIGURED");
  });
}

test("configuration failure never returns a configured secret", async () => {
  const secret = ` ${API_TOKEN}`;
  const response = await statusRequest({ ...DEFAULT_ENV, KAIROS_AUTONOMY_API_TOKEN: secret });
  assert.equal((await response.text()).includes(secret), false);
});

for (const [name, authorization] of [
  ["missing Authorization", null],
  ["empty Bearer token", "Bearer "],
  ["Basic credentials", "Basic dXNlcjpwYXNz"],
  ["comma-separated credentials", `Bearer ${API_TOKEN},Bearer other`],
  ["extra bearer fields", `Bearer ${API_TOKEN} extra`],
  ["oversized Authorization", `Bearer ${"a".repeat(1030)}`],
  ["incorrect token", "Bearer wrong-token-000000000000000000000000"],
]) {
  test(`returns 401 for ${name}`, async () => {
    const headers = authorization === null ? {} : { Authorization: authorization };
    const response = await handleAutonomyApiRequest(new Request("https://example.com/api/autonomy/status", { headers }), DEFAULT_ENV);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("WWW-Authenticate"), "Bearer");
    assert.equal((await responseJson(response)).error.code, "AUTONOMY_AUTH_REQUIRED");
  });
}

test("accepts a case-insensitive Bearer scheme", async () => {
  const response = await handleAutonomyApiRequest(new Request("https://example.com/api/autonomy/status", {
    headers: { Authorization: `bearer ${API_TOKEN}` },
  }), DEFAULT_ENV);
  assert.equal(response.status, 200);
});
test("missing and incorrect credentials use the same public error", async () => {
  const missing = await handleAutonomyApiRequest(new Request("https://example.com/api/autonomy/status"), DEFAULT_ENV);
  const wrong = await handleAutonomyApiRequest(new Request("https://example.com/api/autonomy/status", {
    headers: { Authorization: "Bearer wrong-token-000000000000000000000000" },
  }), DEFAULT_ENV);
  assert.deepEqual(await responseJson(missing), await responseJson(wrong));
});
test("does not accept query authentication", async () => {
  const response = await handleAutonomyApiRequest(new Request(`https://example.com/api/autonomy/status?token=${API_TOKEN}`), DEFAULT_ENV);
  assert.equal(response.status, 401);
});
test("does not accept cookie authentication", async () => {
  const response = await handleAutonomyApiRequest(new Request("https://example.com/api/autonomy/status", {
    headers: { Cookie: `token=${API_TOKEN}` },
  }), DEFAULT_ENV);
  assert.equal(response.status, 401);
});
test("does not accept body authentication", async () => {
  const response = await handleAutonomyApiRequest(new Request("https://example.com/api/autonomy/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: API_TOKEN }),
  }), DEFAULT_ENV);
  assert.equal(response.status, 401);
});
test("authenticates before accessing a POST body", async () => {
  let bodyAccessed = false;
  const request = {
    url: "https://example.com/api/autonomy/events",
    method: "POST",
    headers: new Headers({ "Content-Type": "application/json" }),
    get body() {
      bodyAccessed = true;
      throw new Error("body must not be read");
    },
  };
  const response = await handleAutonomyApiRequest(request, DEFAULT_ENV);
  assert.equal(response.status, 401);
  assert.equal(bodyAccessed, false);
});
test("fails closed when crypto is explicitly unavailable", async () => {
  const response = await statusRequest(DEFAULT_ENV, { cryptoImpl: null });
  assert.equal(response.status, 503);
  assert.equal((await responseJson(response)).error.code, "AUTONOMY_AUTH_UNAVAILABLE");
});
test("fails closed when digest throws", async () => {
  const response = await statusRequest(DEFAULT_ENV, { cryptoImpl: { subtle: { async digest() { throw new Error("fail"); } } } });
  assert.equal(response.status, 503);
});
test("digests both supplied and configured tokens", async () => {
  let digestCalls = 0;
  const subtle = globalThis.crypto.subtle;
  const cryptoImpl = {
    subtle: {
      async digest(algorithm, value) {
        digestCalls += 1;
        return subtle.digest(algorithm, value);
      },
    },
  };
  const response = await statusRequest(DEFAULT_ENV, { cryptoImpl });
  assert.equal(response.status, 200);
  assert.equal(digestCalls, 2);
});
test("supports a subtle-like crypto test seam", async () => {
  const subtle = globalThis.crypto.subtle;
  const response = await statusRequest(DEFAULT_ENV, { cryptoImpl: { digest: subtle.digest.bind(subtle) } });
  assert.equal(response.status, 200);
});

test("authenticates before returning an autonomy 404", async () => {
  const response = await handleAutonomyApiRequest(new Request("https://example.com/api/autonomy/unknown"), DEFAULT_ENV);
  assert.equal(response.status, 401);
});
test("returns authenticated 404 for an unknown autonomy route", async () => {
  const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/unknown"), DEFAULT_ENV);
  assert.equal(response.status, 404);
});
test("returns authenticated 404 for the autonomy root", async () => {
  const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy"), DEFAULT_ENV);
  assert.equal(response.status, 404);
});
for (const [name, url, method, allow] of [
  ["events PUT", "https://example.com/api/autonomy/events", "PUT", "GET, POST"],
  ["status POST", "https://example.com/api/autonomy/status", "POST", "GET"],
  ["workflows DELETE", "https://example.com/api/autonomy/workflows", "DELETE", "GET"],
  ["event detail PATCH", "https://example.com/api/autonomy/events/evt-1?tenantId=mmg", "PATCH", "GET"],
  ["status HEAD", "https://example.com/api/autonomy/status", "HEAD", "GET"],
]) {
  test(`returns 405 for ${name}`, async () => {
    const response = await handleAutonomyApiRequest(authorizedRequest(url, { method }), DEFAULT_ENV);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), allow);
  });
}
test("OPTIONS is not an authentication bypass", async () => {
  const response = await handleAutonomyApiRequest(new Request("https://example.com/api/autonomy/status", { method: "OPTIONS" }), DEFAULT_ENV);
  assert.equal(response.status, 401);
});
test("authenticated OPTIONS remains method-not-allowed", async () => {
  const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/status", { method: "OPTIONS" }), DEFAULT_ENV);
  assert.equal(response.status, 405);
});

for (const [name, requestFactory, status] of [
  ["missing content type", () => authorizedRequest("https://example.com/api/autonomy/events", { method: "POST", body: "{}" }), 415],
  ["text content type", () => authorizedRequest("https://example.com/api/autonomy/events", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" }), 415],
  ["empty body", () => jsonRequest("https://example.com/api/autonomy/events", ""), 400],
  ["malformed JSON", () => jsonRequest("https://example.com/api/autonomy/events", "{bad"), 400],
  ["JSON null", () => jsonRequest("https://example.com/api/autonomy/events", "null"), 400],
  ["JSON array", () => jsonRequest("https://example.com/api/autonomy/events", "[]"), 400],
  ["JSON primitive", () => jsonRequest("https://example.com/api/autonomy/events", "123"), 400],
]) {
  test(`rejects ${name}`, async () => {
    const response = await handleAutonomyApiRequest(requestFactory(), DEFAULT_ENV);
    assert.equal(response.status, status);
  });
}
test("accepts application/json with parameters", async () => {
  const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", {}, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  }), DEFAULT_ENV, {}, { dispatcher: async () => createDispatcherResult() });
  assert.equal(response.status, 200);
});
test("rejects Content-Length above the body bound before reading", async () => {
  let bodyAccessed = false;
  const request = {
    url: "https://example.com/api/autonomy/events",
    method: "POST",
    headers: new Headers({
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      "Content-Length": "2048",
    }),
    get body() {
      bodyAccessed = true;
      throw new Error("body must not be read");
    },
  };
  const response = await handleAutonomyApiRequest(request, DEFAULT_ENV, {}, { maxRequestBytes: 1024 });
  assert.equal(response.status, 413);
  assert.equal(bodyAccessed, false);
});
test("rejects actual bytes above the body bound", async () => {
  const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", `"${"x".repeat(2000)}"`), DEFAULT_ENV, {}, { maxRequestBytes: 1024 });
  assert.equal(response.status, 413);
});
test("bounds an undersized maxRequestBytes override to 1 KiB", async () => {
  const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", { value: "x".repeat(1200) }), DEFAULT_ENV, {}, {
    maxRequestBytes: 1,
    dispatcher: async () => createDispatcherResult(),
  });
  assert.equal(response.status, 413);
});
test("bounds an oversized maxRequestBytes override to 256 KiB", async () => {
  const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", { value: "x".repeat(270000) }), DEFAULT_ENV, {}, {
    maxRequestBytes: 999999,
    dispatcher: async () => createDispatcherResult(),
  });
  assert.equal(response.status, 413);
});
test("accepts a bounded plain event object", async () => {
  const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", { eventId: "evt" }), DEFAULT_ENV, {}, {
    dispatcher: async () => createDispatcherResult(),
  });
  assert.equal(response.status, 200);
});
test("request data cannot replace direct dispatcher seams", async () => {
  let directCalls = 0;
  let maliciousCalls = 0;
  const event = { dispatcher: () => { maliciousCalls += 1; }, ledgerClient: "malicious", cryptoImpl: "malicious" };
  const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", event), DEFAULT_ENV, {}, {
    dispatcher: async (received) => {
      directCalls += 1;
      assert.equal(received.ledgerClient, "malicious");
      return createDispatcherResult();
    },
  });
  assert.equal(response.status, 200);
  assert.equal(directCalls, 1);
  assert.equal(maliciousCalls, 0);
});
test("calls dispatcher once and passes body, dispatchEnv, ctx, and dispatchOptions", async () => {
  const payload = { eventId: "evt" };
  const dispatchEnv = { isolated: true };
  const ctx = { waitUntil() {} };
  const dispatchOptions = { test: true };
  let calls = 0;
  const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", payload), DEFAULT_ENV, ctx, {
    dispatchEnv,
    dispatchOptions,
    dispatcher: async (...args) => {
      calls += 1;
      assert.deepEqual(args, [payload, dispatchEnv, ctx, dispatchOptions]);
      return createDispatcherResult();
    },
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});
test("fails when dispatcher is not a function", async () => {
  const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", {}), DEFAULT_ENV, {}, { dispatcher: null });
  assert.equal(response.status, 500);
});
for (const invalid of [null, "invalid", [], {}, { disposition: "completed" }, createDispatcherResult({ duplicate: "false" })]) {
  test(`rejects invalid dispatcher result ${JSON.stringify(invalid)?.slice(0, 30)}`, async () => {
    const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", {}), DEFAULT_ENV, {}, { dispatcher: async () => invalid });
    assert.equal(response.status, 500);
    assert.equal((await responseJson(response)).error.code, "INVALID_DISPATCH_RESULT");
  });
}
for (const [disposition, retriable, status, ok] of [
  ["completed", false, 200, true],
  ["duplicate", false, 200, true],
  ["in_progress", true, 202, true],
  ["rejected", false, 400, false],
  ["blocked", false, 403, false],
  ["failed", true, 503, false],
  ["failed", false, 500, false],
]) {
  test(`maps ${disposition}/${retriable} to ${status}`, async () => {
    const result = createDispatcherResult({ disposition, retriable });
    const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", {}), DEFAULT_ENV, {}, { dispatcher: async () => result });
    assert.equal(response.status, status);
    const body = await responseJson(response);
    assert.equal(body.ok, ok);
    assert.deepEqual(body.result, result);
  });
}
test("preserves degraded results and inert repair proposals", async () => {
  let executed = false;
  const result = createDispatcherResult({
    workflowResult: {
      status: "degraded",
      proposal: { executionAuthorized: false, steps: [() => { executed = true; }, "inspect only"] },
    },
  });
  const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", {}), DEFAULT_ENV, {}, { dispatcher: async () => result });
  const body = await responseJson(response);
  assert.equal(body.result.workflowResult.status, "degraded");
  assert.equal(body.result.workflowResult.proposal.executionAuthorized, false);
  assert.equal(executed, false);
});
test("sanitizes thrown dispatcher secrets and stack lines", async () => {
  const error = new Error("Bearer secret-value token=abc123\nat internal stack");
  const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", {}), DEFAULT_ENV, {}, {
    dispatcher: async () => { throw error; },
  });
  const text = await response.text();
  assert.equal(response.status, 500);
  assert.equal(text.includes("secret-value"), false);
  assert.equal(text.includes("abc123"), false);
  assert.equal(text.includes("internal stack"), false);
});

for (const [name, query] of [
  ["missing tenant", ""],
  ["empty tenant", "?tenantId="],
  ["oversized tenant", `?tenantId=${"a".repeat(257)}`],
  ["control-character tenant", "?tenantId=mmg%00"],
  ["limit zero", "?tenantId=mmg&limit=0"],
  ["limit above maximum", "?tenantId=mmg&limit=101"],
  ["fractional limit", "?tenantId=mmg&limit=1.5"],
  ["nonnumeric limit", "?tenantId=mmg&limit=abc"],
]) {
  test(`rejects recent-list ${name}`, async () => {
    const response = await handleAutonomyApiRequest(authorizedRequest(`https://example.com/api/autonomy/events${query}`), DEFAULT_ENV, {}, { ledgerClient: createLedgerClient() });
    assert.equal(response.status, 400);
  });
}
for (const [query, expected] of [["?tenantId=mmg", 20], ["?tenantId=mmg&limit=1", 1], ["?tenantId=mmg&limit=100", 100]]) {
  test(`uses recent-list limit ${expected}`, async () => {
    const ledgerClient = createLedgerClient();
    const response = await handleAutonomyApiRequest(authorizedRequest(`https://example.com/api/autonomy/events${query}`), DEFAULT_ENV, {}, { ledgerClient });
    assert.equal(response.status, 200);
    assert.equal(ledgerClient.calls.listRecentEvents[0].limit, expected);
  });
}
test("normalizes recent-list tenantId", async () => {
  const ledgerClient = createLedgerClient();
  const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/events?tenantId=%20mmg%20&limit=10"), DEFAULT_ENV, {}, { ledgerClient });
  assert.equal(response.status, 200);
  assert.deepEqual(ledgerClient.calls.listRecentEvents[0], { tenantId: "mmg", limit: 10 });
});
test("returns recent records and ledger limit", async () => {
  const ledgerClient = createLedgerClient({ listRecentEvents: async () => ({ ok: true, records: [{ eventId: "evt" }], limit: 7 }) });
  const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/events?tenantId=mmg&limit=8"), DEFAULT_ENV, {}, { ledgerClient });
  assert.deepEqual(await responseJson(response), { ok: true, build: KAIROS_AUTONOMY_API_BUILD, tenantId: "mmg", limit: 7, records: [{ eventId: "evt" }] });
});
for (const code of ["LEDGER_UNAVAILABLE", "LEDGER_INVALID_RESPONSE", "LEDGER_OPERATION_FAILED"]) {
  test(`maps ${code} list failure to 503 without empty records`, async () => {
    const ledgerClient = createLedgerClient({ listRecentEvents: async () => ({ ok: false, code, error: "offline" }) });
    const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/events?tenantId=mmg"), DEFAULT_ENV, {}, { ledgerClient });
    assert.equal(response.status, 503);
    assert.equal((await responseJson(response)).records, undefined);
  });
}
test("rejects malformed successful list response", async () => {
  const ledgerClient = createLedgerClient({ listRecentEvents: async () => ({ ok: true, records: null }) });
  const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/events?tenantId=mmg"), DEFAULT_ENV, {}, { ledgerClient });
  assert.equal(response.status, 503);
});
test("rejects invalid list ledger client", async () => {
  const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/events?tenantId=mmg"), DEFAULT_ENV, {}, { ledgerClient: {} });
  assert.equal(response.status, 503);
});

test("retrieves decoded eventId with tenantId", async () => {
  const ledgerClient = createLedgerClient();
  const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/events/evt%2D123?tenantId=mmg"), DEFAULT_ENV, {}, { ledgerClient });
  assert.equal(response.status, 200);
  assert.deepEqual(ledgerClient.calls.getEvent[0], { tenantId: "mmg", eventId: "evt-123" });
});
for (const [name, path] of [
  ["missing tenant", "/api/autonomy/events/evt-1"],
  ["empty eventId", "/api/autonomy/events/?tenantId=mmg"],
  ["additional segment", "/api/autonomy/events/evt-1/extra?tenantId=mmg"],
  ["malformed encoding", "/api/autonomy/events/evt%ZZ?tenantId=mmg"],
  ["oversized eventId", `/api/autonomy/events/${"a".repeat(257)}?tenantId=mmg`],
  ["control eventId", "/api/autonomy/events/evt%001?tenantId=mmg"],
  ["encoded slash", "/api/autonomy/events/evt%2F1?tenantId=mmg"],
]) {
  test(`rejects event retrieval ${name}`, async () => {
    const response = await handleAutonomyApiRequest(authorizedRequest(`https://example.com${path}`), DEFAULT_ENV, {}, { ledgerClient: createLedgerClient() });
    assert.equal(response.status, 400);
  });
}
test("maps EVENT_NOT_FOUND to 404", async () => {
  const ledgerClient = createLedgerClient({ getEvent: async () => ({ ok: false, code: "EVENT_NOT_FOUND" }) });
  const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/events/evt?tenantId=mmg"), DEFAULT_ENV, {}, { ledgerClient });
  assert.equal(response.status, 404);
});
for (const code of ["LEDGER_UNAVAILABLE", "LEDGER_INVALID_RESPONSE", "LEDGER_OPERATION_FAILED"]) {
  test(`maps ${code} retrieval failure to 503`, async () => {
    const ledgerClient = createLedgerClient({ getEvent: async () => ({ ok: false, code }) });
    const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/events/evt?tenantId=mmg"), DEFAULT_ENV, {}, { ledgerClient });
    assert.equal(response.status, 503);
  });
}
test("returns a retrieved event record", async () => {
  const record = { eventId: "evt", status: "completed" };
  const ledgerClient = createLedgerClient({ getEvent: async () => ({ ok: true, record }) });
  const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/events/evt?tenantId=mmg"), DEFAULT_ENV, {}, { ledgerClient });
  assert.deepEqual((await responseJson(response)).record, record);
});
test("rejects malformed successful retrieval response", async () => {
  const ledgerClient = createLedgerClient({ getEvent: async () => ({ ok: true, record: null }) });
  const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/events/evt?tenantId=mmg"), DEFAULT_ENV, {}, { ledgerClient });
  assert.equal(response.status, 503);
});

test("returns only safe active workflow summaries", async () => {
  const secretFunction = () => {};
  const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/workflows"), DEFAULT_ENV, {}, {
    workflowLister: () => [
      validWorkflow({ secret: "hidden", executable: secretFunction }),
      validWorkflow({ workflowId: "inactive", status: "disabled" }),
    ],
  });
  const body = await responseJson(response);
  assert.equal(body.workflows.length, 1);
  assert.deepEqual(Object.keys(body.workflows[0]).sort(), [
    "agents", "approvalRequiredActions", "autonomousActions", "blockedActions", "environments",
    "owner", "riskClass", "status", "triggers", "version", "workflowId",
  ].sort());
  assert.equal(body.workflows[0].secret, undefined);
  assert.equal(body.workflows[0].executable, undefined);
});
test("workflow arrays are projected as independent JSON data", async () => {
  const agents = ["agent-a"];
  const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/workflows"), DEFAULT_ENV, {}, {
    workflowLister: () => [validWorkflow({ agents })],
  });
  agents.push("mutated-after-response");
  assert.deepEqual((await responseJson(response)).workflows[0].agents, ["agent-a"]);
});
for (const [name, workflowLister] of [
  ["invalid lister", null],
  ["throwing lister", () => { throw new Error("secret=hidden\nstack"); }],
  ["non-array lister", () => ({})],
]) {
  test(`fails closed for ${name}`, async () => {
    const response = await handleAutonomyApiRequest(authorizedRequest("https://example.com/api/autonomy/workflows"), DEFAULT_ENV, {}, { workflowLister });
    assert.equal(response.status, 500);
    assert.equal((await responseJson(response)).workflows, undefined);
  });
}

test("status is ready when auth and ledger are configured", async () => {
  const body = await responseJson(await statusRequest());
  assert.equal(body.status, "ready");
  assert.equal(body.ledgerConfigured, true);
});
for (const [name, binding] of [
  ["missing ledger", undefined],
  ["missing idFromName", { get() {} }],
  ["missing get", { idFromName() {} }],
]) {
  test(`status is degraded for ${name}`, async () => {
    const body = await responseJson(await statusRequest({ ...DEFAULT_ENV, KAIROS_AUTONOMY_LEDGER: binding }));
    assert.equal(body.status, "degraded");
    assert.equal(body.ledgerConfigured, false);
  });
}
test("autonomousExecutionEnabled requires exact enabled", async () => {
  assert.equal((await responseJson(await statusRequest())).autonomousExecutionEnabled, true);
  assert.equal((await responseJson(await statusRequest({ ...DEFAULT_ENV, KAIROS_KILL_SWITCH: "Enabled" }))).autonomousExecutionEnabled, false);
  assert.equal((await responseJson(await statusRequest({ ...DEFAULT_ENV, KAIROS_KILL_SWITCH: undefined }))).autonomousExecutionEnabled, false);
});
test("normalizes invalid environment to production", async () => {
  assert.equal((await responseJson(await statusRequest({ ...DEFAULT_ENV, KAIROS_ENVIRONMENT: " bad env " }))).environment, "production");
});
test("returns build identifiers without secrets or raw environment", async () => {
  const response = await statusRequest();
  const body = await responseJson(response);
  assert.equal(body.builds.api, KAIROS_AUTONOMY_API_BUILD);
  assert.equal(typeof body.builds.dispatcher, "string");
  assert.equal(typeof body.builds.ledgerClient, "string");
  const text = JSON.stringify(body);
  assert.equal(text.includes(API_TOKEN), false);
  assert.equal(text.includes("KAIROS_KILL_SWITCH"), false);
  assert.equal(text.includes("KAIROS_AUTONOMY_LEDGER"), false);
});
for (const [name, responseFactory] of [
  ["success", () => statusRequest()],
  ["authentication failure", () => handleAutonomyApiRequest(new Request("https://example.com/api/autonomy/status"), DEFAULT_ENV)],
  ["method failure", () => statusRequest(DEFAULT_ENV, {}, { method: "POST" })],
]) {
  test(`applies common headers to ${name}`, async () => assertCommonHeaders(await responseFactory()));
}
test("sanitizes bearer and inline secret values", async () => {
  const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", {}), DEFAULT_ENV, {}, {
    dispatcher: async () => { throw new Error("Bearer abc123 token=hidden secret=alsohidden"); },
  });
  const text = await response.text();
  assert.equal(text.includes("abc123"), false);
  assert.equal(text.includes("hidden"), false);
});
test("bounds error messages to 1000 characters", async () => {
  const response = await handleAutonomyApiRequest(jsonRequest("https://example.com/api/autonomy/events", {}), DEFAULT_ENV, {}, {
    dispatcher: async () => { throw new Error("a".repeat(2000)); },
  });
  assert.ok((await responseJson(response)).error.message.length <= 1000);
});
test("does not set permissive CORS", async () => {
  assert.notEqual((await statusRequest()).headers.get("Access-Control-Allow-Origin"), "*");
});
