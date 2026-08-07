import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  verifyShopifyCustomerAccountSession,
  KAIROS_SHOPIFY_CUSTOMER_ACCOUNT_AUTH_BUILD,
} from "../src/shopify/kairos-shopify-customer-account-auth-v1.js";
import { handleKairosCustomerRuntimeProjectionAPI } from "../src/kairos-customer-runtime-projection-store-v1.js";

const CLIENT_ID = "kairos-customer-account-client";
const CLIENT_SECRET = "test-only-shopify-client-secret";
const SHOP_DOMAIN = "07kd8e-qw.myshopify.com";
const CUSTOMER_ID = "gid://shopify/Customer/123456789";
const NOW = 1786131000;

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sessionToken(overrides = {}, secret = CLIENT_SECRET) {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    dest: SHOP_DOMAIN,
    aud: CLIENT_ID,
    sub: CUSTOMER_ID,
    iat: NOW,
    nbf: NOW - 1,
    exp: NOW + 300,
    jti: "test-session-jti",
    ...overrides,
  });
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

function requestWithToken(token = sessionToken()) {
  return new Request("https://mmg.example/api/kairos/customer/projects", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function env(overrides = {}) {
  return {
    SHOPIFY_CLIENT_ID: CLIENT_ID,
    SHOPIFY_CLIENT_SECRET: CLIENT_SECRET,
    SHOPIFY_STORE_DOMAIN: SHOP_DOMAIN,
    ...overrides,
  };
}

test("verifies a valid Shopify Customer Account session JWT", async () => {
  const result = await verifyShopifyCustomerAccountSession(requestWithToken(), env(), { nowSeconds: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.shopifyCustomerId, CUSTOMER_ID);
  assert.equal(result.customerNumericId, "123456789");
  assert.equal(result.shopDomain, SHOP_DOMAIN);
  assert.equal(result.build, KAIROS_SHOPIFY_CUSTOMER_ACCOUNT_AUTH_BUILD);
});

test("accepts an https destination only when it resolves to the configured shop", async () => {
  const result = await verifyShopifyCustomerAccountSession(
    requestWithToken(sessionToken({ dest: `https://${SHOP_DOMAIN}` })),
    env(),
    { nowSeconds: NOW },
  );
  assert.equal(result.ok, true);
});

test("rejects a token signed with the wrong secret", async () => {
  const result = await verifyShopifyCustomerAccountSession(
    requestWithToken(sessionToken({}, "wrong-secret")),
    env(),
    { nowSeconds: NOW },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.code, "CUSTOMER_SESSION_SIGNATURE_INVALID");
});

test("rejects expired session tokens", async () => {
  const result = await verifyShopifyCustomerAccountSession(
    requestWithToken(sessionToken({ iat: NOW - 600, nbf: NOW - 600, exp: NOW - 300 })),
    env(),
    { nowSeconds: NOW },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("rejects the wrong Shopify app audience", async () => {
  const result = await verifyShopifyCustomerAccountSession(
    requestWithToken(sessionToken({ aud: "different-client" })),
    env(),
    { nowSeconds: NOW },
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "CUSTOMER_SESSION_AUDIENCE_INVALID");
});

test("rejects a session token issued for a different shop", async () => {
  const result = await verifyShopifyCustomerAccountSession(
    requestWithToken(sessionToken({ dest: "another-store.myshopify.com" })),
    env(),
    { nowSeconds: NOW },
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "CUSTOMER_SESSION_DESTINATION_INVALID");
});

test("rejects a session without an authenticated Shopify customer subject", async () => {
  const result = await verifyShopifyCustomerAccountSession(
    requestWithToken(sessionToken({ sub: "gid://shopify/Order/123" })),
    env(),
    { nowSeconds: NOW },
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "CUSTOMER_SESSION_SUBJECT_INVALID");
});

test("fails closed when Shopify application credentials are unavailable", async () => {
  const result = await verifyShopifyCustomerAccountSession(requestWithToken(), {}, { nowSeconds: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, "CUSTOMER_SESSION_AUTH_NOT_CONFIGURED");
});

test("customer runtime API answers extension preflight without authentication", async () => {
  const response = await handleKairosCustomerRuntimeProjectionAPI(new Request(
    "https://mmg.example/api/kairos/customer/projects",
    {
      method: "OPTIONS",
      headers: {
        Origin: "null",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    },
  ), {});
  assert.equal(response?.status, 204);
  assert.equal(response?.headers.get("access-control-allow-origin"), "*");
  assert.match(response?.headers.get("access-control-allow-methods") || "", /GET/);
  assert.match(response?.headers.get("access-control-allow-headers") || "", /Authorization/i);
});

test("customer runtime authentication failures remain CORS-readable without leaking details", async () => {
  const response = await handleKairosCustomerRuntimeProjectionAPI(new Request(
    "https://mmg.example/api/kairos/customer/projects",
    { headers: { Origin: "null", Authorization: "Bearer invalid.jwt.token" } },
  ), env());
  assert.equal(response?.status, 401);
  assert.equal(response?.headers.get("access-control-allow-origin"), "*");
  const payload = await response?.json();
  assert.equal(payload?.error?.code, "CUSTOMER_AUTH_REQUIRED");
});
