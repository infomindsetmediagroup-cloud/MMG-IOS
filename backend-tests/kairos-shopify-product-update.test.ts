// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import { updateShopifyProduct, SHOPIFY_PRODUCT_UPDATE_MUTATION } from "../cloudflare/mmg-ios/src/kairos-shopify-product-update-v1.js";
import { executeKairosTool } from "../cloudflare/mmg-ios/src/kairos-tool-executors-v1.js";
import { getKairosTool } from "../cloudflare/mmg-ios/src/kairos-tool-registry-v1.js";

const env = {
  SHOPIFY_SHOP_DOMAIN: "example-store.myshopify.com",
  SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat_secret",
  SHOPIFY_ADMIN_API_VERSION: "2026-07",
  SHOPIFY_ADMIN_SCOPES: "read_products,write_products",
};

const args = {
  productId: "gid://shopify/Product/123",
  changes: {
    title: "Approved title",
    descriptionHtml: "<p>Approved description</p>",
    seoTitle: "Approved SEO title",
    seoDescription: "Approved SEO description",
    status: "DRAFT",
  },
};

function responsePayload() {
  return {
    data: {
      productUpdate: {
        product: {
          id: args.productId,
          title: "Approved title",
          status: "DRAFT",
          updatedAt: "2026-07-25T12:00:00Z",
          seo: { title: "Approved SEO title", description: "Approved SEO description" },
        },
        userErrors: [],
      },
    },
  };
}

describe("approval-gated Shopify product updates", () => {
  it("uses a fixed ProductUpdateInput mutation and no prohibited fields", () => {
    expect(SHOPIFY_PRODUCT_UPDATE_MUTATION).toContain("productUpdate(product: $product)");
    expect(SHOPIFY_PRODUCT_UPDATE_MUTATION).not.toMatch(/variants|inventory|price|metafield|media|publishablePublish/i);
  });

  it("requires durable approval context", async () => {
    await expect(updateShopifyProduct(env, {
      tool: getKairosTool("shopify.product.update"),
      arguments: args,
      identity: "owner@example.com",
    })).rejects.toMatchObject({ code: "APPROVAL_ID_REQUIRED" });
  });

  it("executes only the registered update executor after approval consumption", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(responsePayload()), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const result = await executeKairosTool({
      tool: getKairosTool("shopify.product.update"),
      arguments: args,
      env,
      identity: "owner@example.com",
      approvalId: "kap_approved123",
    });
    expect(result.mutated).toBe(true);
    expect(result.changedFields).toEqual(["descriptionHtml", "seoDescription", "seoTitle", "status", "title"]);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body.query).toBe(SHOPIFY_PRODUCT_UPDATE_MUTATION);
    expect(body.variables.product).toEqual({
      id: args.productId,
      title: "Approved title",
      descriptionHtml: "<p>Approved description</p>",
      status: "DRAFT",
      seo: { title: "Approved SEO title", description: "Approved SEO description" },
    });
    expect(init.headers["X-Kairos-Approval-Id"]).toBe("kap_approved123");
    expect(String(init.headers["X-Shopify-Access-Token"])).toBe("shpat_secret");
    fetchMock.mockRestore();
  });

  it("keeps publication disconnected", async () => {
    await expect(executeKairosTool({
      tool: getKairosTool("shopify.product.publish"),
      arguments: { productId: args.productId },
      env: { ...env, SHOPIFY_ADMIN_SCOPES: "read_products,write_products,write_publications" },
      identity: "owner@example.com",
      approvalId: "kap_publish123",
    })).rejects.toMatchObject({ code: "SHOPIFY_PUBLICATION_EXECUTOR_UNAVAILABLE" });
  });

  it("normalizes Shopify user errors without returning credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      data: { productUpdate: { product: null, userErrors: [{ field: ["product", "title"], message: "Title is invalid" }] } },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(updateShopifyProduct(env, {
      tool: getKairosTool("shopify.product.update"),
      arguments: args,
      identity: "owner@example.com",
      approvalId: "kap_error123",
    })).rejects.toMatchObject({ code: "SHOPIFY_PRODUCT_UPDATE_REJECTED", status: 422 });
    fetchMock.mockRestore();
  });
});
