import { afterEach, describe, expect, it, vi } from "vitest";
import { createShopifyProduct, upsertShopifyThemeFiles } from "../cloudflare/mmg-ios/src/kairos-shopify-site-admin-v1.js";
import { getKairosTool } from "../cloudflare/mmg-ios/src/kairos-tool-registry-v1.js";

const baseEnv = {
  SHOPIFY_SHOP_DOMAIN: "example.myshopify.com",
  SHOPIFY_ADMIN_API_ACCESS_TOKEN: "legacy-unused",
  SHOPIFY_ADMIN_ACCESS_TOKEN: "server-secret",
  SHOPIFY_ADMIN_API_VERSION: "2026-07",
  SHOPIFY_ADMIN_SCOPES: "write_products,write_themes,write_online_store_navigation,write_online_store_pages,write_publications",
};

afterEach(() => vi.unstubAllGlobals());

describe("Kairos Shopify site admin executor", () => {
  it("creates products as approved drafts through server-side Admin GraphQL", async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.variables.product.status).toBe("DRAFT");
      expect(init?.headers["X-Shopify-Access-Token"]).toBe("server-secret");
      return new Response(JSON.stringify({ data: { productCreate: { product: { id: "gid://shopify/Product/99", title: "Test", handle: "test", status: "DRAFT", updatedAt: "2026-08-07T22:00:00Z", seo: { title: "", description: "" } }, userErrors: [] } } }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await createShopifyProduct(baseEnv, {
      tool: getKairosTool("shopify.product.create"),
      arguments: { title: "Test", status: "DRAFT" },
      identity: "operator@example.com",
      approvalId: "kap_123",
    });
    expect(result.verified).toBe(true);
    expect(result.mutated).toBe(true);
    expect(result.product.id).toBe("gid://shopify/Product/99");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks theme file writes when Shopify reports the target theme is MAIN", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { node: { id: "gid://shopify/OnlineStoreTheme/5", name: "Live", role: "MAIN", processing: false, processingFailed: false, updatedAt: "2026-08-07T22:00:00Z" } } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(upsertShopifyThemeFiles(baseEnv, {
      tool: getKairosTool("shopify.theme.files.upsert"),
      arguments: { themeId: "gid://shopify/OnlineStoreTheme/5", files: [{ filename: "sections/test.liquid", body: "<section>test</section>" }] },
      identity: "operator@example.com",
      approvalId: "kap_456",
    })).rejects.toMatchObject({ code: "SHOPIFY_LIVE_THEME_WRITE_BLOCKED", status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
