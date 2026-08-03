import test from "node:test";
import assert from "node:assert/strict";

import {
  KAIROS_SHOPIFY_ADMIN_AUTH_BUILD,
  resolveShopifyClientId,
  validateShopifyBootstrap,
  verifyShopifyAdminSession,
} from "../../src/shopify/kairos-shopify-admin-auth-v1.js";

const SHOP = "07kd8e-qw.myshopify.com";
const CLIENT_ID = "kairos_client_id_1234567890";
const CLIENT_SECRET = "kairos-test-secret-0123456789abcdef";
const STAFF_ID = "900100200300";
const NOW_SECONDS = 1785726000;

function environment(overrides = {}) {
  return {
    KAIROS_SHOPIFY_SHOP_DOMAIN: SHOP,
    KAIROS_SHOPIFY_CLIENT_ID: CLIENT_ID,
    KAIROS_SHOPIFY_CLIENT_SECRET: CLIENT_SECRET,
    ...overrides,
  };
}

function aliasEnvironment(overrides = {}) {
  return {
    KAIROS_SHOPIFY_SHOP_DOMAIN: SHOP,
    SHOPIFY_CLIENT_ID: CLIENT_ID,
    SHOPIFY_CLIENT_SECRET: CLIENT_SECRET,
    ...overrides,
  };
}

function claims(overrides = {}) {
  return {
    iss: `https://${SHOP}/admin`,
    dest: `https://${SHOP}`,
    aud: CLIENT_ID,
    sub: STAFF_ID,
    exp: NOW_SECONDS + 60,
    nbf: NOW_SECONDS - 1,
    iat: NOW_SECONDS,
    sid: "session-1",
    ...overrides,
  };
}

async function signToken(payload = claims(), secret = CLIENT_SECRET) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
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

function request(token) {
  return new Request("https://kairos.example/api/kairos-dashboard/overview", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

test("exports the exact Shopify Admin auth build", () => {
  assert.equal(
    KAIROS_SHOPIFY_ADMIN_AUTH_BUILD,
    "kairos-shopify-admin-auth-20260802-3-runtime-bindings",
  );
});

test("accepts an authentic short-lived Shopify Admin session", async () => {
  const token = await signToken();
  const result = await verifyShopifyAdminSession(request(token), environment(), {
    now: new Date(NOW_SECONDS * 1000),
  });
  assert.equal(result.ok, true);
  assert.equal(result.shopDomain, SHOP);
  assert.equal(result.staffUserId, STAFF_ID);
  assert.equal(result.sessionId, "session-1");
});

test("uses the existing deployed Shopify client credential aliases", async () => {
  const token = await signToken();
  const env = aliasEnvironment();
  assert.equal(resolveShopifyClientId(env), CLIENT_ID);
  const result = await verifyShopifyAdminSession(request(token), env, {
    now: new Date(NOW_SECONDS * 1000),
  });
  assert.equal(result.ok, true);
  assert.equal(result.staffUserId, STAFF_ID);
});

test("reads Cloudflare-style runtime bindings when descriptors are not exposed", async () => {
  const values = aliasEnvironment();
  const env = new Proxy({}, {
    get(_target, key) {
      return values[key];
    },
    getOwnPropertyDescriptor() {
      return undefined;
    },
  });
  const token = await signToken();
  assert.equal(resolveShopifyClientId(env), CLIENT_ID);
  const result = await verifyShopifyAdminSession(request(token), env, {
    now: new Date(NOW_SECONDS * 1000),
  });
  assert.equal(result.ok, true);
});

test("uses only complete matching credential pairs", async () => {
  const token = await signToken();
  const result = await verifyShopifyAdminSession(
    request(token),
    {
      KAIROS_SHOPIFY_SHOP_DOMAIN: SHOP,
      KAIROS_SHOPIFY_CLIENT_ID: "incomplete_client_id_12345",
      SHOPIFY_CLIENT_ID: CLIENT_ID,
      SHOPIFY_CLIENT_SECRET: CLIENT_SECRET,
    },
    { now: new Date(NOW_SECONDS * 1000) },
  );
  assert.equal(result.ok, true);
  assert.equal(resolveShopifyClientId({
    KAIROS_SHOPIFY_CLIENT_ID: "incomplete_client_id_12345",
    SHOPIFY_CLIENT_ID: CLIENT_ID,
    SHOPIFY_CLIENT_SECRET: CLIENT_SECRET,
  }), CLIENT_ID);
});

test("requires configured client credentials", async () => {
  const token = await signToken();
  const missingClient = await verifyShopifyAdminSession(request(token), environment({
    KAIROS_SHOPIFY_CLIENT_ID: "",
  }), { now: new Date(NOW_SECONDS * 1000) });
  assert.equal(missingClient.status, 503);
  assert.equal(missingClient.code, "SHOPIFY_ADMIN_AUTH_NOT_CONFIGURED");

  const missingSecret = await verifyShopifyAdminSession(request(token), environment({
    KAIROS_SHOPIFY_CLIENT_SECRET: "",
  }), { now: new Date(NOW_SECONDS * 1000) });
  assert.equal(missingSecret.status, 503);
});

test("rejects missing, malformed, and incorrectly signed tokens", async () => {
  const missing = await verifyShopifyAdminSession(request(null), environment(), {
    now: new Date(NOW_SECONDS * 1000),
  });
  assert.equal(missing.status, 401);
  assert.equal(missing.code, "SHOPIFY_ADMIN_AUTH_REQUIRED");

  const malformed = await verifyShopifyAdminSession(request("not.a.jwt"), environment(), {
    now: new Date(NOW_SECONDS * 1000),
  });
  assert.equal(malformed.status, 401);

  const wrongSignature = await verifyShopifyAdminSession(
    request(await signToken(claims(), "different-test-secret-0123456789")),
    environment(),
    { now: new Date(NOW_SECONDS * 1000) },
  );
  assert.equal(wrongSignature.status, 401);
});

test("rejects wrong audience, destination, issuer, and expired sessions", async () => {
  for (const payload of [
    claims({ aud: "other_client_identifier_123" }),
    claims({ dest: "https://another-shop.myshopify.com" }),
    claims({ iss: "https://another-shop.myshopify.com/admin" }),
    claims({ exp: NOW_SECONDS - 20, iat: NOW_SECONDS - 80 }),
  ]) {
    const result = await verifyShopifyAdminSession(
      request(await signToken(payload)),
      environment(),
      { now: new Date(NOW_SECONDS * 1000) },
    );
    assert.equal(result.status, 401);
    assert.equal(result.code, "SHOPIFY_ADMIN_SESSION_INVALID");
  }
});

test("optional staff allowlist fails closed for unapproved Shopify users", async () => {
  const token = await signToken();
  const denied = await verifyShopifyAdminSession(
    request(token),
    environment({ KAIROS_SHOPIFY_ADMIN_USER_IDS: "111,222" }),
    { now: new Date(NOW_SECONDS * 1000) },
  );
  assert.equal(denied.status, 403);
  assert.equal(denied.code, "SHOPIFY_ADMIN_ACCESS_DENIED");

  const allowed = await verifyShopifyAdminSession(
    request(token),
    environment({ KAIROS_SHOPIFY_ADMIN_USER_IDS: `111,${STAFF_ID}` }),
    { now: new Date(NOW_SECONDS * 1000) },
  );
  assert.equal(allowed.ok, true);
});

test("bootstrap accepts only the exact MMG Shopify Admin host context", () => {
  const host = base64Url(`admin.shopify.com/store/${SHOP.replace(".myshopify.com", "")}`);
  assert.equal(validateShopifyBootstrap(
    new URL(`https://kairos.example/app?shop=${SHOP}&host=${host}`),
    environment(),
  ), true);
  assert.equal(validateShopifyBootstrap(
    new URL(`https://kairos.example/app?shop=other.myshopify.com&host=${host}`),
    environment(),
  ), false);
  assert.equal(validateShopifyBootstrap(
    new URL(`https://kairos.example/app?shop=${SHOP}&host=${base64Url("attacker.example")}`),
    environment(),
  ), false);
});
