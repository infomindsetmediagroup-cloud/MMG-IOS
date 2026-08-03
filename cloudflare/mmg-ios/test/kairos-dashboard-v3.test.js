import test from "node:test";
import assert from "node:assert/strict";

import {
  handleKairosDashboardRequest,
  KAIROS_DASHBOARD_APP_PATH,
  KAIROS_DASHBOARD_BUILD,
  KAIROS_DASHBOARD_OVERVIEW_PATH,
} from "../src/kairos-dashboard-v3.js";

const SHOP = "07kd8e-qw.myshopify.com";
const CLIENT_ID = "kairos_client_id_1234567890";
const CLIENT_SECRET = "kairos-test-secret-0123456789abcdef";
const STAFF_ID = "900100200300";
const NOW = new Date("2026-08-03T02:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const SNAPSHOT_ID = "bss_20260803t013621z_fc956e44";

function environment(overrides = {}) {
  return {
    KAIROS_SHOPIFY_SHOP_DOMAIN: SHOP,
    KAIROS_SHOPIFY_CLIENT_ID: CLIENT_ID,
    KAIROS_SHOPIFY_CLIENT_SECRET: CLIENT_SECRET,
    KAIROS_AUTONOMOUS_OPERATIONS_ENABLED: "enabled",
    KAIROS_AUTONOMY_SCHEDULED_ENABLED: "enabled",
    KAIROS_AUTONOMY_ACTIVATION_GATE: "business-operations-v1",
    KAIROS_KILL_SWITCH: "enabled",
    KAIROS_ENVIRONMENT: "production",
    KAIROS_AUTONOMY_LEDGER: {
      idFromName() { return "ledger-id"; },
      get() { return { fetch() { throw new Error("not used"); } }; },
    },
    ...overrides,
  };
}

function hostParameter() {
  return base64Url(`admin.shopify.com/store/${SHOP.replace(".myshopify.com", "")}`);
}

function appUrl(path = KAIROS_DASHBOARD_APP_PATH) {
  return `https://kairos.example${path}?shop=${SHOP}&host=${hostParameter()}&embedded=1`;
}

function workflowResolver(workflowId) {
  return workflowId === "business.operations.v1"
    ? { workflowId, status: "active", triggers: ["business.operations.manual"] }
    : null;
}

function businessState() {
  return {
    ok: true,
    tenantId: "mmg",
    generatedAt: "2026-08-03T01:36:21.000Z",
    collectorCount: 1,
    collectedCount: 1,
    blockedCount: 0,
    failedCount: 0,
    snapshot: {
      ok: true,
      tenantId: "mmg",
      snapshotId: SNAPSHOT_ID,
      generatedAt: "2026-08-03T01:36:21.000Z",
      counts: { total: 1, stale: 0 },
      health: {
        overallStatus: "healthy",
        highestSeverity: "info",
        attentionRequired: false,
        hasFailures: false,
        hasBlocked: false,
        hasCritical: false,
        coverageComplete: true,
      },
      domains: [],
      recent: [],
    },
  };
}

function ledgerClient() {
  const record = {
    tenantId: "mmg",
    snapshotId: SNAPSHOT_ID,
    generatedAt: "2026-08-03T01:36:21.000Z",
    storedAt: "2026-08-03T01:36:22.000Z",
    businessState: businessState(),
  };
  return {
    async getLatestBusinessSnapshot() { return { ok: true, record }; },
    async listRecentBusinessSnapshots() { return { ok: true, records: [record] }; },
  };
}

async function signedToken(overrides = {}) {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: `https://${SHOP}/admin`,
    dest: `https://${SHOP}`,
    aud: CLIENT_ID,
    sub: STAFF_ID,
    exp: NOW_SECONDS + 60,
    nbf: NOW_SECONDS - 1,
    iat: NOW_SECONDS,
    sid: "dashboard-session",
    ...overrides,
  };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CLIENT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

function base64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

test("exports the exact existing-App-Home dashboard build", () => {
  assert.equal(KAIROS_DASHBOARD_BUILD, "kairos-dashboard-20260802-4-existing-app-home");
});

test("direct public navigation cannot load a dashboard document route", async () => {
  for (const path of ["/app", "/kairos", "/dashboard"]) {
    const response = await handleKairosDashboardRequest(
      new Request(`https://kairos.example${path}`),
      environment(),
    );
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "SHOPIFY_ADMIN_APP_CONTEXT_REQUIRED");
  }
});

test("ordinary root traffic remains outside the dashboard router", async () => {
  const response = await handleKairosDashboardRequest(
    new Request("https://kairos.example/"),
    environment(),
  );
  assert.equal(response, null);
});

test("valid Shopify Admin bootstrap serves only the authenticated App Bridge shell", async () => {
  const response = await handleKairosDashboardRequest(
    new Request(appUrl()),
    environment(),
  );
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-kairos-shopify-admin-only"), "true");
  assert.equal(response.headers.get("x-frame-options"), null);
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors https:\/\/admin\.shopify\.com/u);
  assert.match(body, /meta name="shopify-api-key"/u);
  assert.match(body, /cdn\.shopify\.com\/shopifycloud\/app-bridge\.js/u);
  assert.match(body, /window\.shopify\.idToken/u);
  assert.match(body, /Authorization: "Bearer " \+ token/u);
  assert.doesNotMatch(body, /kairos-test-secret/u);
});

test("the existing root App Home URL is upgraded without changing Shopify configuration", async () => {
  const response = await handleKairosDashboardRequest(
    new Request(appUrl("/")),
    environment(),
  );
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-kairos-shopify-admin-only"), "true");
  assert.match(body, /meta name="shopify-api-key"/u);
  assert.match(body, /window\.shopify\.idToken/u);
});

test("admin-only dashboard aliases require the same valid Shopify bootstrap", async () => {
  for (const path of ["/kairos", "/dashboard"]) {
    const response = await handleKairosDashboardRequest(
      new Request(appUrl(path)),
      environment(),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-kairos-shopify-admin-only"), "true");
  }
});

test("the document shell needs the public client ID but not the signing secret", async () => {
  const response = await handleKairosDashboardRequest(
    new Request(appUrl()),
    environment({ KAIROS_SHOPIFY_CLIENT_SECRET: "" }),
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /meta name="shopify-api-key"/u);
});

test("missing public client configuration fails closed", async () => {
  const response = await handleKairosDashboardRequest(
    new Request(appUrl()),
    environment({ KAIROS_SHOPIFY_CLIENT_ID: "" }),
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "SHOPIFY_ADMIN_APP_NOT_CONFIGURED");
});

test("overview never returns operations data without a verified Shopify session", async () => {
  const response = await handleKairosDashboardRequest(
    new Request(`https://kairos.example${KAIROS_DASHBOARD_OVERVIEW_PATH}`),
    environment(),
    {},
    { now: NOW, ledgerClient: ledgerClient(), workflowResolver },
  );
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "SHOPIFY_ADMIN_AUTH_REQUIRED");
  assert.equal(Object.hasOwn(body, "latestSnapshot"), false);
});

test("overview remains unavailable when the signing secret is absent", async () => {
  const token = await signedToken();
  const response = await handleKairosDashboardRequest(
    new Request(`https://kairos.example${KAIROS_DASHBOARD_OVERVIEW_PATH}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    environment({ KAIROS_SHOPIFY_CLIENT_SECRET: "" }),
    {},
    { now: NOW, ledgerClient: ledgerClient(), workflowResolver },
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "SHOPIFY_ADMIN_AUTH_NOT_CONFIGURED");
});

test("verified Shopify staff session can read the governed overview", async () => {
  const token = await signedToken();
  const response = await handleKairosDashboardRequest(
    new Request(`https://kairos.example${KAIROS_DASHBOARD_OVERVIEW_PATH}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    environment(),
    {},
    { now: NOW, ledgerClient: ledgerClient(), workflowResolver },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.build, KAIROS_DASHBOARD_BUILD);
  assert.equal(body.latestSnapshot.snapshotId, SNAPSHOT_ID);
  assert.deepEqual(body.access, {
    mode: "shopify-admin-session",
    shopDomain: SHOP,
    staffAuthenticated: true,
  });
  assert.equal(response.headers.get("x-kairos-shopify-staff-session"), "verified");
  assert.match(response.headers.get("vary"), /Authorization/u);
});

test("wrong-shop and expired Shopify sessions are rejected", async () => {
  for (const token of [
    await signedToken({ dest: "https://attacker.myshopify.com" }),
    await signedToken({ exp: NOW_SECONDS - 30, iat: NOW_SECONDS - 90 }),
  ]) {
    const response = await handleKairosDashboardRequest(
      new Request(`https://kairos.example${KAIROS_DASHBOARD_OVERVIEW_PATH}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      environment(),
      {},
      { now: NOW, ledgerClient: ledgerClient(), workflowResolver },
    );
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "SHOPIFY_ADMIN_SESSION_INVALID");
  }
});
