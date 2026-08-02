import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  handleAutonomyApiRequest,
  KAIROS_AUTONOMY_API_BUILD,
} from "../../src/autonomy/kairos-autonomy-api-v2.js";

const TOKEN = "t".repeat(48);
const NOW = new Date("2026-08-02T12:00:00.000Z");

function request(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${TOKEN}`);
  return new Request(`https://kairos.example${path}`, { ...init, headers });
}

function binding() {
  return { idFromName() {}, get() {} };
}

function env(overrides = {}) {
  return { KAIROS_AUTONOMY_API_TOKEN: TOKEN, KAIROS_ENVIRONMENT: "production", ...overrides };
}

function ledgerResult(records = [], limit = 20) {
  return { ok: true, disposition: "listed", records, limit, statusCode: 200 };
}

async function json(response) {
  return JSON.parse(await response.text());
}

const workerPath = fileURLToPath(new URL("../../src/kairos-production-entry-local-canonical-v1.js", import.meta.url));
const schedulerPath = fileURLToPath(new URL("../../src/autonomy/kairos-autonomy-scheduler-v1.js", import.meta.url));
const wranglerPath = fileURLToPath(new URL("../../wrangler.toml", import.meta.url));
const ciPath = fileURLToPath(new URL("../../../../.github/workflows/kairos-autonomy-kernel.yml", import.meta.url));

const record = {
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
  leaseToken: "omitted-lease-marker",
  result: { proposal: { steps: ["omitted-repair-marker"] } },
  error: { code: "SAFE_ERROR_CODE", message: "omitted-error-marker" },
  policyDecision: {
    decision: "ALLOW_AUTONOMOUS",
    policyId: "website.health.v1",
    policyVersion: 1,
    reasonCode: "ACTION_CERTIFIED_AUTONOMOUS",
    explanation: "omitted-policy-marker",
  },
};

test("exports the composed Slice 4 API build", () => {
  assert.equal(KAIROS_AUTONOMY_API_BUILD, "kairos-autonomy-api-20260802-2");
});

test("observability authenticates before routing", async () => {
  const missing = await handleAutonomyApiRequest(new Request("https://kairos.example/api/autonomy/observability?tenantId=mmg"), env());
  const wrong = await handleAutonomyApiRequest(new Request("https://kairos.example/api/autonomy/observability?tenantId=mmg", {
    headers: { Authorization: `Bearer ${"w".repeat(48)}` },
  }), env());
  assert.equal(missing.status, 401);
  assert.equal(wrong.status, 401);
});

test("observability is GET-only", async () => {
  const response = await handleAutonomyApiRequest(request("/api/autonomy/observability?tenantId=mmg", { method: "POST" }), env());
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET");
});

for (const query of [
  "",
  "?tenantId=",
  "?tenantId=m%20g",
  "?tenantId=mmg&limit=0",
  "?tenantId=mmg&limit=101",
  "?tenantId=mmg&limit=1.5",
  "?tenantId=mmg&limit=20abc",
  "?tenantId=mmg&limit=%2020%20",
]) {
  test(`rejects invalid observability query ${query || "empty"}`, async () => {
    const response = await handleAutonomyApiRequest(
      request(`/api/autonomy/observability${query}`),
      env(),
      {},
      { ledgerClient: { async listRecentEvents() { return ledgerResult(); } } },
    );
    assert.equal(response.status, 400);
  });
}

test("passes exact tenant and limit to the ledger", async () => {
  const calls = [];
  const response = await handleAutonomyApiRequest(
    request("/api/autonomy/observability?tenantId=mmg&limit=12"),
    env(),
    {},
    {
      ledgerClient: { async listRecentEvents(tenantId, limit) { calls.push({ tenantId, limit }); return ledgerResult([record], limit); } },
      observabilityNow: NOW,
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ tenantId: "mmg", limit: 12 }]);
});

test("maps unavailable, thrown, failed, and malformed ledgers to 503", async () => {
  const clients = [
    null,
    { async listRecentEvents() { throw new Error("failure"); } },
    { async listRecentEvents() { return { ok: false, code: "LEDGER_OPERATION_FAILED" }; } },
    { async listRecentEvents() { return { ok: true, records: null }; } },
  ];
  for (const ledgerClient of clients) {
    const response = await handleAutonomyApiRequest(
      request("/api/autonomy/observability?tenantId=mmg"),
      env(),
      {},
      { ledgerClient },
    );
    assert.equal(response.status, 503);
  }
});

test("observability returns only the safe projection", async () => {
  const response = await handleAutonomyApiRequest(
    request("/api/autonomy/observability?tenantId=mmg"),
    env(),
    {},
    { ledgerClient: { async listRecentEvents() { return ledgerResult([record]); } }, observabilityNow: NOW },
  );
  const text = await response.text();
  for (const marker of ["omitted-lease-marker", "omitted-repair-marker", "omitted-error-marker", "omitted-policy-marker", "leaseToken", "proposal", "steps", "explanation"]) {
    assert.equal(text.includes(marker), false);
  }
  const parsed = JSON.parse(text);
  assert.equal(parsed.observability.total, 1);
  assert.equal(parsed.observability.recent[0].errorCode, "SAFE_ERROR_CODE");
  assert.equal(parsed.observability.recent[0].policyDecision.policyVersion, 1);
});

test("status remains fail-closed until every exact activation condition is met", async () => {
  const inactive = await json(await handleAutonomyApiRequest(request("/api/autonomy/status"), env()));
  assert.equal(inactive.scheduledAutonomy.ready, false);
  assert.equal(inactive.scheduledAutonomy.cron, "0 * * * *");

  const active = await json(await handleAutonomyApiRequest(request("/api/autonomy/status"), env({
    KAIROS_AUTONOMY_SCHEDULED_ENABLED: "enabled",
    KAIROS_AUTONOMY_ACTIVATION_GATE: "website-health-v1",
    KAIROS_KILL_SWITCH: "enabled",
    KAIROS_AUTONOMY_LEDGER: binding(),
  })));
  assert.equal(active.scheduledAutonomy.ready, true);
});

test("status rejects case and whitespace activation variants", async () => {
  for (const overrides of [
    { KAIROS_AUTONOMY_SCHEDULED_ENABLED: "Enabled" },
    { KAIROS_AUTONOMY_ACTIVATION_GATE: " website-health-v1" },
    { KAIROS_KILL_SWITCH: "enabled " },
    { KAIROS_ENVIRONMENT: " production " },
  ]) {
    const parsed = await json(await handleAutonomyApiRequest(request("/api/autonomy/status"), env({
      KAIROS_AUTONOMY_SCHEDULED_ENABLED: "enabled",
      KAIROS_AUTONOMY_ACTIVATION_GATE: "website-health-v1",
      KAIROS_KILL_SWITCH: "enabled",
      KAIROS_AUTONOMY_LEDGER: binding(),
      ...overrides,
    })));
    assert.equal(parsed.scheduledAutonomy.ready, false);
  }
});

test("status exposes only normalized state and build identifiers", async () => {
  const response = await handleAutonomyApiRequest(request("/api/autonomy/status"), env({
    KAIROS_AUTONOMY_SCHEDULED_ENABLED: "enabled",
    KAIROS_AUTONOMY_ACTIVATION_GATE: "website-health-v1",
    KAIROS_KILL_SWITCH: "enabled",
    KAIROS_AUTONOMY_LEDGER: binding(),
  }));
  const text = await response.text();
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed.builds).sort(), ["api", "dispatcher", "ledgerClient", "observability", "scheduler"]);
  assert.equal(text.includes(TOKEN), false);
  assert.equal(text.includes("KAIROS_AUTONOMY_SCHEDULED_ENABLED"), false);
});

test("Slice 4 API responses preserve security headers", async () => {
  const status = await handleAutonomyApiRequest(request("/api/autonomy/status"), env());
  const observations = await handleAutonomyApiRequest(
    request("/api/autonomy/observability?tenantId=mmg"),
    env(),
    {},
    { ledgerClient: { async listRecentEvents() { return ledgerResult(); } }, observabilityNow: NOW },
  );
  for (const response of [status, observations]) {
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(response.headers.get("X-Kairos-Autonomy-API-Build"), KAIROS_AUTONOMY_API_BUILD);
  }
});

test("canonical Worker composes API v3 and exact scheduled routing", () => {
  const source = readFileSync(workerPath, "utf8");
  assert.match(source, /from "\.\/autonomy\/kairos-autonomy-api-v3\.js"/u);
  assert.match(source, /controller\?\.cron === KAIROS_AUTONOMY_HEALTH_CRON/u);
  assert.match(source, /handleAutonomyScheduledEvent\(controller, providerBlockedEnv\(env\), ctx\)/u);
  assert.match(source, /canonicalRuntime\.scheduled\(controller, providerBlockedEnv\(env\), ctx\)/u);
  assert.match(source, /X-Kairos-Autonomy-Scheduler-Build/u);
  assert.equal(source.includes("dispatchAutonomyEvent"), false);
});

test("Wrangler preserves migrations and adds the hourly cron without activation defaults", () => {
  const source = readFileSync(wranglerPath, "utf8");
  assert.match(source, /crons = \["0 15 \* \* \*", "0 2 \* \* \*", "0 \* \* \* \*"\]/u);
  assert.match(source, /name = "KAIROS_AUTONOMY_LEDGER"\s+class_name = "KairosAutonomyLedger"/u);
  assert.match(source, /tag = "kairos-autonomy-ledger-v1"\s+new_sqlite_classes = \["KairosAutonomyLedger"\]/u);
  assert.equal((source.match(/new_sqlite_classes = \["KairosAutonomyLedger"\]/gu) || []).length, 1);
  assert.doesNotMatch(source, /^KAIROS_AUTONOMY_SCHEDULED_ENABLED\s*=\s*"enabled"/mu);
  assert.doesNotMatch(source, /^KAIROS_AUTONOMY_ACTIVATION_GATE\s*=\s*"website-health-v1"/mu);
  assert.doesNotMatch(source, /^KAIROS_KILL_SWITCH\s*=\s*"enabled"/mu);
});

test("scheduler source has no direct execution or external-provider bypass", () => {
  const source = readFileSync(schedulerPath, "utf8");
  assert.match(source, /dispatchAutonomyEvent/u);
  for (const forbidden of ["executeWebsiteHealthWorkflow", "KAIROS_AUTONOMY_API_TOKEN", "eval(", "new Function", "github.merge", "cloudflare.deploy.production", "shopify.price.change", "customer.email.send", "OPENAI_API_KEY", "api.openai.com"]) {
    assert.equal(source.includes(forbidden), false);
  }
});

test("CI validates Slice 4 and retains regression and dry-run commands", () => {
  const source = readFileSync(ciPath, "utf8");
  for (const file of ["kairos-autonomy-api-v2.js", "kairos-autonomy-observability-v1.js", "kairos-autonomy-scheduler-v1.js", "kairos-autonomy-observability.test.js", "kairos-autonomy-scheduler.test.js", "kairos-autonomy-activation.test.js"]) {
    assert.match(source, new RegExp(`node --check [^\\n]*${file.replaceAll(".", "\\.")}`, "u"));
  }
  assert.match(source, /Validate scheduled autonomy activation boundary/u);
  assert.match(source, /X-Kairos-Autonomy-Scheduler-Build/u);
  assert.match(source, /npm run test:autonomy/u);
  assert.match(source, /npm install --ignore-scripts --no-audit --no-fund/u);
  assert.match(source, /npx wrangler deploy --dry-run/u);
});
