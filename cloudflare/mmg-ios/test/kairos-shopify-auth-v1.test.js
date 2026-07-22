import test from "node:test";
import assert from "node:assert/strict";
import {
  getShopifyAdminAccessToken,
  inspectShopifyAuthConfiguration,
} from "../src/kairos-shopify-auth-v1.js";

test("exchanges Shopify client credentials and caches the temporary token", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    assert.equal(url, "https://example.myshopify.com/admin/oauth/access_token");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded");
    const body = String(options.body);
    assert.match(body, /grant_type=client_credentials/);
    assert.match(body, /client_id=client-id/);
    assert.match(body, /client_secret=client-secret/);
    return new Response(JSON.stringify({
      access_token: "shpat_temporary",
      scope: "read_products,write_products",
      expires_in: 86399,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const env = {
    SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
    SHOPIFY_CLIENT_ID: "client-id",
    SHOPIFY_CLIENT_SECRET: "client-secret",
  };

  try {
    const first = await getShopifyAdminAccessToken(env);
    const second = await getShopifyAdminAccessToken(env);
    assert.equal(first.accessToken, "shpat_temporary");
    assert.equal(first.source, "CLIENT_CREDENTIALS");
    assert.equal(first.scope, "read_products,write_products");
    assert.ok(first.expiresAt);
    assert.equal(second.accessToken, first.accessToken);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses a configured static Admin token only as a compatibility fallback", async () => {
  const token = await getShopifyAdminAccessToken({ SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat_static" });
  assert.equal(token.accessToken, "shpat_static");
  assert.equal(token.source, "STATIC_ADMIN_TOKEN");
});

test("reports client-credential readiness without exposing credential values", () => {
  const configuration = inspectShopifyAuthConfiguration({
    SHOPIFY_CLIENT_ID: "client-id",
    SHOPIFY_CLIENT_SECRET: "client-secret",
  });
  assert.equal(configuration.authenticationConfigured, true);
  assert.equal(configuration.clientCredentialsConfigured, true);
  assert.equal(configuration.preferredMode, "CLIENT_CREDENTIALS");
  assert.equal(JSON.stringify(configuration).includes("client-secret"), false);
});
