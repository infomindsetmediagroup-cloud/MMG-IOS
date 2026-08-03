import test from "node:test";
import assert from "node:assert/strict";

import {
  handleKairosDashboardRequest,
  KAIROS_DASHBOARD_BUILD,
  KAIROS_DASHBOARD_OVERVIEW_PATH,
  KAIROS_DASHBOARD_PATH,
} from "../src/kairos-dashboard-v1.js";

const NOW = new Date("2026-08-03T02:00:00.000Z");
const GENERATED_AT = "2026-08-03T01:36:21.000Z";
const STORED_AT = "2026-08-03T01:36:22.000Z";
const SNAPSHOT_ID = "bss_20260803t013621z_fc956e44";

function environment() {
  return {
    KAIROS_AUTONOMY_SCHEDULED_ENABLED: "enabled",
    KAIROS_AUTONOMY_ACTIVATION_GATE: "business-operations-v1",
    KAIROS_KILL_SWITCH: "enabled",
    KAIROS_ENVIRONMENT: "production",
  };
}

function businessState() {
  return {
    ok: true,
    tenantId: "mmg",
    generatedAt: GENERATED_AT,
    collectorCount: 1,
    collectedCount: 1,
    blockedCount: 0,
    failedCount: 0,
    snapshot: {
      ok: true,
      snapshotId: SNAPSHOT_ID,
      tenantId: "mmg",
      generatedAt: GENERATED_AT,
      counts: { total: 1, stale: 0 },
      health: {
        overallStatus: "degraded",
        highestSeverity: "high",
        attentionRequired: true,
        hasFailures: false,
        hasBlocked: false,
        hasCritical: false,
        coverageComplete: true,
      },
      domains: [
        {
          domain: "website",
          status: "degraded",
          highestSeverity: "high",
          signalCount: 1,
          staleCount: 0,
          latestObservedAt: GENERATED_AT,
          latestSignal: { summary: "Website health requires review." },
        },
      ],
      recent: [
        {
          signalId: "signal.website.health.1",
          observedAt: GENERATED_AT,
          source: "website.health.v1",
          domain: "website",
          type: "website.health",
          status: "degraded",
          severity: "high",
          summary: "Website health requires review.",
          stale: false,
        },
      ],
    },
  };
}

function ledgerClient() {
  const record = {
    tenantId: "mmg",
    snapshotId: SNAPSHOT_ID,
    generatedAt: GENERATED_AT,
    storedAt: STORED_AT,
    businessState: businessState(),
  };
  return {
    async getLatestBusinessSnapshot(tenantId) {
      assert.equal(tenantId, "mmg");
      return { ok: true, record };
    },
    async listRecentBusinessSnapshots(tenantId, limit) {
      assert.equal(tenantId, "mmg");
      assert.equal(limit, 12);
      return { ok: true, records: [record] };
    },
  };
}

test("GET /kairos serves the production command center", async () => {
  const response = await handleKairosDashboardRequest(
    new Request(`https://kairos.example${KAIROS_DASHBOARD_PATH}`),
    environment(),
  );
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/u);
  assert.equal(response.headers.get("x-kairos-dashboard-build"), KAIROS_DASHBOARD_BUILD);
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'self' https:\/\/themindsetmediagroup\.com/u);
  assert.match(body, /Kairos Command Center/u);
  assert.match(body, /Executive Command Center/u);
  assert.match(body, new RegExp(KAIROS_DASHBOARD_OVERVIEW_PATH.replaceAll("/", "\\/"), "u"));
});

test("dashboard aliases resolve to the same app shell", async () => {
  for (const path of ["/dashboard", "/dashboard/", "/app", "/app/"]) {
    const response = await handleKairosDashboardRequest(new Request(`https://kairos.example${path}`), environment());
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /Autonomous Business Operations/u);
  }
});

test("overview projects durable business state without exposing mutation controls", async () => {
  const response = await handleKairosDashboardRequest(
    new Request(`https://kairos.example${KAIROS_DASHBOARD_OVERVIEW_PATH}`),
    environment(),
    {},
    { now: NOW, ledgerClient: ledgerClient() },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.build, KAIROS_DASHBOARD_BUILD);
  assert.equal(body.status, "degraded");
  assert.equal(body.summary.latestAvailable, true);
  assert.equal(body.summary.signalCount, 1);
  assert.equal(body.summary.attentionDomainCount, 1);
  assert.equal(body.latestSnapshot.snapshotId, SNAPSHOT_ID);
  assert.equal(body.domains[0].domain, "website");
  assert.equal(body.signals[0].summary, "Website health requires review.");
  assert.equal(body.history.length, 1);
  assert.equal(body.governance.automaticExternalMutation, false);
  assert.equal(body.governance.approvalBoundary, true);
  assert.equal(body.governance.openAiCalls, "disabled");
  assert.equal(body.governance.dashboardMode, "read-only-observability");
  assert.equal(Object.hasOwn(body, "token"), false);
  assert.equal(Object.hasOwn(body, "authorization"), false);
});

test("overview remains available before the first durable snapshot", async () => {
  const emptyClient = {
    async getLatestBusinessSnapshot() { return { ok: false, record: null }; },
    async listRecentBusinessSnapshots() { return { ok: true, records: [] }; },
  };
  const response = await handleKairosDashboardRequest(
    new Request(`https://kairos.example${KAIROS_DASHBOARD_OVERVIEW_PATH}`),
    environment(),
    {},
    { now: NOW, ledgerClient: emptyClient },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.summary.latestAvailable, false);
  assert.equal(body.latestSnapshot, null);
  assert.deepEqual(body.domains, []);
  assert.deepEqual(body.signals, []);
});

test("dashboard routes reject mutation methods", async () => {
  for (const path of [KAIROS_DASHBOARD_PATH, KAIROS_DASHBOARD_OVERVIEW_PATH]) {
    const response = await handleKairosDashboardRequest(
      new Request(`https://kairos.example${path}`, { method: "POST" }),
      environment(),
    );
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
  }
});

test("unrelated routes are not claimed", async () => {
  const response = await handleKairosDashboardRequest(
    new Request("https://kairos.example/api/workflows"),
    environment(),
  );
  assert.equal(response, null);
});
