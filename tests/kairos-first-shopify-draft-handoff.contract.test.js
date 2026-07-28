import { describe, expect, it, vi } from "vitest";
import { evaluatePackageApprovalGate, executeFirstShopifyDraftHandoff } from "../cloudflare/mmg-ios/src/kairos-first-shopify-draft-handoff-v1.js";
import { certifyFirstRevenueLaunch } from "../cloudflare/mmg-ios/src/kairos-first-launch-certification-v1.js";

const approvedAssets = [
  ["manuscript", "editorialQa"], ["prompt-library", "editorialQa"], ["workbook", "editorialQa"],
  ["cover", "visualQa"], ["product-image", "visualQa"],
  ["digital-edition", "packageQa"], ["editable-source", "packageQa"], ["complete-package", "packageQa"],
].map(([type, qa]) => ({ assetId: `${type}-1`, type, checksum: `sha-${type}`, storageRef: `r2://${type}`, [qa]: { decision: "approved" } }));

const operator = {
  confirmation: "CREATE FIRST SHOPIFY DRAFT",
  authorization: "Bearer token",
  operatorEmail: "operator@example.com",
  operatorIdentityHash: "kid_operator",
};

describe("Kairos first Shopify draft handoff", () => {
  it("blocks handoff until PDF, DOCX, and ZIP package assets are approved", () => {
    const gate = evaluatePackageApprovalGate({ assets: approvedAssets.filter((asset) => asset.type !== "complete-package") });
    expect(gate.ready).toBe(false);
    expect(gate.blockers).toContain("complete-package:missing");
  });

  it("creates only a DRAFT product and persists its immutable receipt", async () => {
    const product = { revenueProductId: "product-1", assets: approvedAssets, shopify: { handle: "ai-video-prompt-mastery" } };
    const attachShopifyDraftReceipt = vi.fn(async () => true);
    const result = await executeFirstShopifyDraftHandoff({
      revenueStore: { getRevenueProduct: vi.fn(async () => product), attachShopifyDraftReceipt },
      createShopifyDraft: vi.fn(async () => ({ productId: "gid://shopify/Product/1", status: "DRAFT", handle: "ai-video-prompt-mastery" })),
    }, { ...operator, revenueProductId: "product-1" });

    expect(result.receipt.status).toBe("DRAFT");
    expect(result.receipt.packageChecksums).toHaveLength(3);
    expect(result.automaticPublicationAllowed).toBe(false);
    expect(attachShopifyDraftReceipt).toHaveBeenCalledOnce();
  });
});

describe("Kairos first launch certification", () => {
  it("certifies only a fully approved product with a Shopify draft receipt", () => {
    const result = certifyFirstRevenueLaunch({
      revenueProductId: "product-1",
      assets: approvedAssets,
      price: { amount: 29, currency: "USD" },
      seo: { title: "AI Video Prompt Mastery", description: "Production-ready AI video prompt system." },
      delivery: { mode: "digital" },
      shopifyDraftReceipt: { productId: "gid://shopify/Product/1", status: "DRAFT", packageChecksums: [{}, {}, {}] },
      automaticPublicationAllowed: false,
    }, {
      confirmation: "CERTIFY FIRST REVENUE LAUNCH",
      authorization: "Bearer token",
      operatorEmail: "operator@example.com",
      operatorIdentityHash: "kid_operator",
    });

    expect(result.certified).toBe(true);
    expect(result.nextState).toBe("manual-shopify-review");
    expect(result.checks).toHaveLength(8);
    expect(result.automaticPublicationAllowed).toBe(false);
  });
});
