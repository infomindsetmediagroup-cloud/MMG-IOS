import { describe, expect, it, vi } from "vitest";
import { readShopifyDashboardAnalyticsV2 } from "../cloudflare/mmg-ios/src/shopify-live-analytics-v2.js";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Kairos Shopify analytics credential selection", () => {
  it("skips a rejected static token and uses working client credentials", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      if (String(url).endsWith("/admin/oauth/access_token")) {
        return response({ access_token: "working-token", scope: "read_reports" });
      }
      const request = JSON.parse(String(init.body || "{}"));
      if (String(init.headers?.["X-Shopify-Access-Token"]) !== "working-token") {
        return response({ errors: [{ message: "Invalid API key or access token" }] }, 401);
      }
      if (request.query.includes("currentAppInstallation")) {
        return response({ data: { currentAppInstallation: { accessScopes: [{ handle: "read_reports" }] } } });
      }
      return response({ data: { shopifyqlQuery: { tableData: { columns: [], rows: [{ orders: "0" }] }, parseErrors: [] } } });
    });

    try {
      const result = await readShopifyDashboardAnalyticsV2({
        SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
        SHOPIFY_API_VERSION: "2026-07",
        SHOPIFY_CLIENT_ID: "client-id",
        SHOPIFY_CLIENT_SECRET: "client-secret",
        SHOPIFY_ADMIN_ACCESS_TOKEN: "stale-token",
      });
      expect(result.status).toBe("ready");
      expect(result.credentialPath).toBe("client-credentials");
      expect(result.authorization.readReportsGranted).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reports safe configuration state without exposing credentials", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => response({ errors: [{ message: "Access denied for shopifyqlQuery field." }] }, 200));
    try {
      const result = await readShopifyDashboardAnalyticsV2({
        SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
        SHOPIFY_API_VERSION: "2026-07",
        SHOPIFY_ACCESS_TOKEN: "secret-value",
      });
      expect(result.status).toBe("unavailable");
      expect(JSON.stringify(result)).not.toContain("secret-value");
      expect(result.authorization.configuration.accessTokenAlias).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
