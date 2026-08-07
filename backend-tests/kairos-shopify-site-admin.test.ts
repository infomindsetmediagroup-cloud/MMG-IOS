import { afterEach, describe, expect, it, vi } from "vitest";
import { createShopifyProduct, upsertShopifyThemeFiles } from "../cloudflare/mmg-ios/src/kairos-shopify-site-admin-v1.js";
import { getKairosTool } from "../cloudflare/mmg-ios/src/kairos-tool-registry-v1.js";

function env(domain) {
  return {
    SHOPIFY_STORE_DOMAIN: domain,
    SHOPIFY_ADMIN_ACCESS_TOKEN: "server-secret",
    SHOPIFY_ADMIN_API_VERSION: "2026-07",
  };
}

function json(data) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Kairos Shopify site admin executor", () => {
  it("creates an approved draft with scope verification, preflight, mutation, and readback", async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body || "{}"));
      const query = String(request.query || "");
      expect(init?.headers["X-Shopify-Access-Token"]).toBe("server-secret");

      if (query.includes("KairosShopifyInstallationVerification")) {
        return json({
          shop: { id: "gid://shopify/Shop/1", name: "Test", myshopifyDomain: "cap-product.myshopify.com" },
          currentAppInstallation: {
            id: "gid://shopify/AppInstallation/1",
            accessScopes: [{ handle: "read_products" }, { handle: "write_products" }],
          },
        });
      }
      if (query.includes("KairosProductPreflight")) {
        expect(request.variables.identifier.handle).toBe("test-product");
        return json({ productByIdentifier: null });
      }
      if (query.includes("KairosProductCreate")) {
        expect(request.variables.product.status).toBe("DRAFT");
        expect(request.variables.product.handle).toBe("test-product");
        return json({
          productCreate: {
            product: {
              id: "gid://shopify/Product/99",
              title: "Test Product",
              handle: "test-product",
              status: "DRAFT",
              updatedAt: "2026-08-07T22:00:00Z",
              seo: { title: "", description: "" },
            },
            userErrors: [],
          },
        });
      }
      if (query.includes("KairosProductReadback")) {
        return json({
          product: {
            id: "gid://shopify/Product/99",
            title: "Test Product",
            handle: "test-product",
            status: "DRAFT",
            updatedAt: "2026-08-07T22:00:01Z",
            seo: { title: "", description: "" },
          },
        });
      }
      throw new Error(`Unexpected Shopify query: ${query.slice(0, 80)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createShopifyProduct(env("cap-product.myshopify.com"), {
      tool: getKairosTool("shopify.product.create"),
      arguments: { title: "Test Product", handle: "test-product", status: "DRAFT" },
      identity: "operator@example.com",
      approvalId: "kap_123",
    });

    expect(result.verified).toBe(true);
    expect(result.mutated).toBe(true);
    expect(result.product.id).toBe("gid://shopify/Product/99");
    expect(result.before).toBeNull();
    expect(result.after.handle).toBe("test-product");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("blocks MAIN-theme file writes after live scope and role preflight, before mutation", async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body || "{}"));
      const query = String(request.query || "");
      if (query.includes("KairosShopifyInstallationVerification")) {
        return json({
          shop: { id: "gid://shopify/Shop/2", name: "Test", myshopifyDomain: "cap-theme.myshopify.com" },
          currentAppInstallation: {
            id: "gid://shopify/AppInstallation/2",
            accessScopes: [{ handle: "read_themes" }, { handle: "write_themes" }],
          },
        });
      }
      if (query.includes("KairosThemeRole")) {
        return json({
          node: {
            id: "gid://shopify/OnlineStoreTheme/5",
            name: "Live",
            role: "MAIN",
            processing: false,
            processingFailed: false,
            updatedAt: "2026-08-07T22:00:00Z",
          },
        });
      }
      throw new Error("Theme mutation must not run against MAIN.");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(upsertShopifyThemeFiles(env("cap-theme.myshopify.com"), {
      tool: getKairosTool("shopify.theme.files.upsert"),
      arguments: {
        themeId: "gid://shopify/OnlineStoreTheme/5",
        files: [{ filename: "sections/test.liquid", body: "<section>test</section>" }],
      },
      identity: "operator@example.com",
      approvalId: "kap_456",
    })).rejects.toMatchObject({ code: "SHOPIFY_LIVE_THEME_WRITE_BLOCKED", status: 403 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
