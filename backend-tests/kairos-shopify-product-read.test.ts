// @ts-nocheck
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectShopifyReadConfiguration } from "../cloudflare/mmg-ios/src/kairos-shopify-read-boundary-v1.js";
import { readShopifyProduct, SHOPIFY_PRODUCT_READ_QUERY } from "../cloudflare/mmg-ios/src/kairos-shopify-product-read-v1.js";
import { executeKairosTool } from "../cloudflare/mmg-ios/src/kairos-tool-executors-v1.js";

const env = {
  SHOPIFY_SHOP_DOMAIN: "example-store.myshopify.com",
  SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat_test_secret",
  SHOPIFY_ADMIN_API_VERSION: "2026-07",
  SHOPIFY_ADMIN_SCOPES: "read_products",
};

afterEach(() => vi.restoreAllMocks());

describe("Kairos Shopify read boundary", () => {
  it("fails closed when the required scope or token is missing", () => {
    expect(inspectShopifyReadConfiguration({ SHOPIFY_SHOP_DOMAIN: "example-store.myshopify.com" }).ready).toBe(false);
    expect(inspectShopifyReadConfiguration(env).ready).toBe(true);
  });

  it("uses one fixed product query with bounded variant selection", () => {
    expect(SHOPIFY_PRODUCT_READ_QUERY).toContain("query KairosProductRead($id: ID!)");
    expect(SHOPIFY_PRODUCT_READ_QUERY).toContain("product(id: $id)");
    expect(SHOPIFY_PRODUCT_READ_QUERY).toContain("variants(first: 25)");
    expect(SHOPIFY_PRODUCT_READ_QUERY).not.toMatch(/mutation\b/i);
  });

  it("returns a normalized verified product contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      data: {
        product: {
          id: "gid://shopify/Product/1",
          title: "Test Product",
          handle: "test-product",
          status: "ACTIVE",
          descriptionHtml: "<p>Test</p>",
          vendor: "MMG",
          productType: "Digital",
          tags: ["test"],
          totalInventory: 3,
          tracksInventory: true,
          createdAt: "2026-07-01T00:00:00Z",
          updatedAt: "2026-07-02T00:00:00Z",
          publishedAt: "2026-07-03T00:00:00Z",
          onlineStoreUrl: "https://example.com/products/test-product",
          seo: { title: "SEO title", description: "SEO description" },
          featuredMedia: { alt: "Cover", preview: { image: { url: "https://cdn.example.com/image.jpg", width: 1200, height: 1800 } } },
          variants: { nodes: [{ id: "gid://shopify/ProductVariant/2", title: "Default", sku: "SKU-1", barcode: null, price: "19.95", compareAtPrice: null, inventoryQuantity: 3, availableForSale: true, selectedOptions: [{ name: "Title", value: "Default" }] }] },
        },
      },
      extensions: { cost: { requestedQueryCost: 12, actualQueryCost: 8, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 1992, restoreRate: 100 } } },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await readShopifyProduct(env, { productId: "gid://shopify/Product/1", requestId: "req_1" });
    expect(result.verified).toBe(true);
    expect(result.source).toBe("shopify-admin-graphql");
    expect(result.product.title).toBe("Test Product");
    expect(result.product.variants[0].price).toBe("19.95");
    expect(result.cost.actualQueryCost).toBe(8);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://example-store.myshopify.com/admin/api/2026-07/graphql.json");
    expect(init.headers["X-Shopify-Access-Token"]).toBe("shpat_test_secret");
    expect(JSON.parse(init.body).variables.id).toBe("gid://shopify/Product/1");
  });

  it("connects the registered Shopify read executor while mutations remain blocked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { product: { id: "gid://shopify/Product/1", title: "Read", handle: "read", status: "DRAFT", descriptionHtml: "", vendor: "", productType: "", tags: [], totalInventory: 0, tracksInventory: false, createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z", publishedAt: null, onlineStoreUrl: null, seo: {}, featuredMedia: null, variants: { nodes: [] } } } }), { status: 200 }));
    const read = await executeKairosTool({ tool: { id: "shopify.product.read", executor: "shopify-readonly", capability: "read" }, arguments: { productId: "gid://shopify/Product/1" }, env });
    expect(read.verified).toBe(true);
    await expect(executeKairosTool({ tool: { id: "shopify.product.update", executor: "shopify-governed-mutation", capability: "mutation" }, arguments: {}, env })).rejects.toMatchObject({ code: "MUTATION_EXECUTOR_UNAVAILABLE" });
  });

  it("normalizes auth, GraphQL, not-found, and invalid-ID failures", async () => {
    await expect(readShopifyProduct(env, { productId: "bad" })).rejects.toMatchObject({ code: "SHOPIFY_PRODUCT_ID_INVALID", status: 400 });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await expect(readShopifyProduct(env, { productId: "gid://shopify/Product/1" })).rejects.toMatchObject({ code: "SHOPIFY_ADMIN_AUTH_FAILED" });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: "Denied" }] }), { status: 200 }));
    await expect(readShopifyProduct(env, { productId: "gid://shopify/Product/1" })).rejects.toMatchObject({ code: "SHOPIFY_ADMIN_GRAPHQL_ERROR" });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ data: { product: null } }), { status: 200 }));
    await expect(readShopifyProduct(env, { productId: "gid://shopify/Product/1" })).rejects.toMatchObject({ code: "SHOPIFY_PRODUCT_NOT_FOUND", status: 404 });
  });
});
