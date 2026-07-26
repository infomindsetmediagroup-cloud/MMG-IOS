// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import { publishShopifyProduct, SHOPIFY_PRODUCT_PUBLISH_MUTATION } from "../cloudflare/mmg-ios/src/kairos-shopify-product-publish-v1.js";
import { executeKairosTool } from "../cloudflare/mmg-ios/src/kairos-tool-executors-v1.js";
import { getKairosTool } from "../cloudflare/mmg-ios/src/kairos-tool-registry-v1.js";
import { validateKairosToolArguments } from "../cloudflare/mmg-ios/src/kairos-tool-arguments-v1.js";

const env = {
  SHOPIFY_SHOP_DOMAIN: "example.myshopify.com",
  SHOPIFY_ADMIN_ACCESS_TOKEN: "secret",
  SHOPIFY_ADMIN_API_VERSION: "2026-07",
  SHOPIFY_ADMIN_SCOPES: "read_products,write_products,write_publications",
};

const args = {
  productId: "gid://shopify/Product/123",
  publicationId: "gid://shopify/Publication/456",
};

const tool = getKairosTool("shopify.product.publish");

describe("Kairos Shopify product publication", () => {
  it("requires an explicit publication GID", () => {
    expect(validateKairosToolArguments("shopify.product.publish", { productId: args.productId }).ok).toBe(false);
    const valid = validateKairosToolArguments("shopify.product.publish", args);
    expect(valid.ok).toBe(true);
    expect(valid.arguments).toEqual(args);
  });

  it("uses the fixed publishablePublish mutation and verifies the exact target", async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body.query).toBe(SHOPIFY_PRODUCT_PUBLISH_MUTATION);
      expect(body.variables).toEqual({ id: args.productId, publicationId: args.publicationId, input: [{ publicationId: args.publicationId }] });
      expect(init.headers["X-Shopify-Access-Token"]).toBe("secret");
      expect(init.headers["X-Kairos-Approval-Id"]).toBe("kap_test");
      return new Response(JSON.stringify({
        data: {
          publishablePublish: {
            publishable: {
              publishedOnPublication: true,
              availablePublicationsCount: { count: 3 },
              resourcePublicationsCount: { count: 2 },
            },
            userErrors: [],
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishShopifyProduct(env, {
      tool,
      arguments: args,
      identity: "owner@example.com",
      approvalId: "kap_test",
    });

    expect(result.verified).toBe(true);
    expect(result.mutated).toBe(true);
    expect(result.productId).toBe(args.productId);
    expect(result.publicationId).toBe(args.publicationId);
    expect(result.publicationCounts).toEqual({ available: 3, active: 2 });
    expect(result.verification).toMatchObject({
      verified: true,
      type: "shopify-publication-target",
      productId: args.productId,
      publicationId: args.publicationId,
      publishedOnTarget: true,
      automaticRollback: false,
      requiresNewApprovalForUnpublish: true,
    });
    vi.unstubAllGlobals();
  });

  it("fails when Shopify does not confirm the approved publication target", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: {
        publishablePublish: {
          publishable: {
            publishedOnPublication: false,
            availablePublicationsCount: { count: 3 },
            resourcePublicationsCount: { count: 1 },
          },
          userErrors: [],
        },
      },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(publishShopifyProduct(env, { tool, arguments: args, identity: "owner@example.com", approvalId: "kap_test" }))
      .rejects.toMatchObject({ code: "SHOPIFY_PRODUCT_PUBLICATION_VERIFICATION_FAILED", status: 409 });
    vi.unstubAllGlobals();
  });

  it("rejects publication through the product-update executor binding", async () => {
    await expect(publishShopifyProduct(env, {
      tool: getKairosTool("shopify.product.update"),
      arguments: args,
      identity: "owner@example.com",
      approvalId: "kap_test",
    })).rejects.toMatchObject({ code: "SHOPIFY_PUBLICATION_TOOL_MISMATCH" });
  });

  it("normalizes Shopify user errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: { publishablePublish: { publishable: null, userErrors: [{ field: ["input", "0", "publicationId"], message: "Publication is invalid" }] } },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(executeKairosTool({ tool, arguments: args, env, identity: "owner@example.com", approvalId: "kap_test" }))
      .rejects.toMatchObject({ code: "SHOPIFY_PRODUCT_PUBLICATION_REJECTED", status: 422 });
    vi.unstubAllGlobals();
  });
});
