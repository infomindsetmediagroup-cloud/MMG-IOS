import { describe, expect, it, vi } from "vitest";
import { dispatchFirstShopifyAction } from "../cloudflare/mmg-ios/src/kairos-first-shopify-actions-v1.js";
import { createFirstLaunchCertificationStoreAdapter } from "../cloudflare/mmg-ios/src/kairos-first-launch-certification-store-v1.js";

const approvedAssets = [
  ["manuscript", "editorialQa"], ["prompt-library", "editorialQa"], ["workbook", "editorialQa"],
  ["cover", "visualQa"], ["product-image", "visualQa"],
  ["digital-edition", "packageQa"], ["editable-source", "packageQa"], ["complete-package", "packageQa"],
].map(([type, qa]) => ({ type, checksum: `sha-${type}`, storageRef: `r2://${type}`, [qa]: { decision: "approved" } }));

const operator = {
  authorization: "Bearer token",
  operatorEmail: "operator@example.com",
  operatorIdentityHash: "kid_operator",
};

describe("Kairos first Shopify actions", () => {
  it("persists successful launch certification and returns publication-disabled headers", async () => {
    const product = {
      revenueProductId: "product-1",
      assets: approvedAssets,
      price: { amount: 29, currency: "USD" },
      seo: { title: "AI Video Prompt Mastery", description: "Production-ready AI video prompt system." },
      delivery: { mode: "digital" },
      shopifyDraftReceipt: { productId: "gid://shopify/Product/1", status: "DRAFT", packageChecksums: [{}, {}, {}] },
      automaticPublicationAllowed: false,
    };
    const attachLaunchCertification = vi.fn(async () => true);
    const result = await dispatchFirstShopifyAction({
      revenueStore: { getRevenueProduct: vi.fn(async () => product), attachLaunchCertification },
    }, {
      ...operator,
      action: "certify-first-revenue-launch",
      confirmation: "CERTIFY FIRST REVENUE LAUNCH",
      revenueProductId: "product-1",
    });

    expect(result.status).toBe(200);
    expect(result.body.certified).toBe(true);
    expect(result.headers["x-kairos-automatic-publication"]).toBe("disabled");
    expect(attachLaunchCertification).toHaveBeenCalledOnce();
  });
});

describe("Kairos first launch certification store", () => {
  it("moves a certified product only to manual Shopify review", async () => {
    const putRevenueProduct = vi.fn(async () => true);
    const appendRevenueEvent = vi.fn(async () => true);
    const adapter = createFirstLaunchCertificationStoreAdapter({
      getRevenueProduct: vi.fn(async () => ({ revenueProductId: "product-1" })),
      putRevenueProduct,
      appendRevenueEvent,
    });
    const persisted = await adapter.attachLaunchCertification("product-1", {
      certified: true,
      certifiedByIdentityHash: "kid_operator",
      certifiedByEmail: "operator@example.com",
      certifiedAt: "2026-07-28T22:30:00.000Z",
    });

    expect(persisted).toBe(true);
    expect(putRevenueProduct.mock.calls[0][1].lifecycleState).toBe("manual-shopify-review");
    expect(putRevenueProduct.mock.calls[0][1].automaticPublicationAllowed).toBe(false);
    expect(appendRevenueEvent).toHaveBeenCalledOnce();
  });
});
