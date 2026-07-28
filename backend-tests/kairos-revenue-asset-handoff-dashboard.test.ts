import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { registerKairosRevenueAsset, completeKairosRevenueJob } from "../cloudflare/mmg-ios/src/kairos-revenue-asset-registration-v1.js";
import { createKairosShopifyPublicationHandoff } from "../cloudflare/mmg-ios/src/kairos-shopify-publication-handoff-v1.js";

describe("Kairos revenue asset and publication contracts", () => {
  it("registers checksum-backed assets and preserves execution boundaries", () => {
    const product = registerKairosRevenueAsset({ assets: [] }, { assetId: "a1", type: "pdf", filename: "guide.pdf", checksum: "sha256:test", storageRef: "r2://guide.pdf", operatorIdentityHash: "kid_1" });
    expect(product.assets).toHaveLength(1);
    expect(product.assets[0].checksum).toBe("sha256:test");
    expect(product.commerceMutationAllowed).toBe(false);
  });

  it("requires authorized production jobs before completion", () => {
    expect(() => completeKairosRevenueJob({ productionJobs: [{ jobId: "j1", authorization: { status: "pending" } }] }, { jobId: "j1" })).toThrow(/authorized/i);
  });

  it("creates only a governed draft Shopify handoff", () => {
    const handoff = createKairosShopifyPublicationHandoff({ revenueProductId: "rev1", state: "ready_to_publish", approval: { status: "approved", approvedByIdentityHash: "kid_a", approvedAt: new Date().toISOString() }, qualityAssurance: { status: "passed" }, commercePackage: { shopifyProduct: { title: "Guide", status: "ACTIVE" }, mediaManifest: [], downloadManifest: [] } }, { operatorIdentityHash: "kid_b" });
    expect(handoff.shopifyPayload.status).toBe("DRAFT");
    expect(handoff.requiresGovernedShopifyWorkflow).toBe(true);
    expect(handoff.commerceMutationAllowed).toBe(false);
  });

  it("registers a responsive operator revenue dashboard", () => {
    const html = readFileSync("web/kairos-dashboard/index.html", "utf8");
    const script = readFileSync("web/kairos-dashboard/scripts/revenue-engine-operations.js", "utf8");
    const css = readFileSync("web/kairos-dashboard/styles/revenue-engine-operations.css", "utf8");
    expect(html).toContain("revenue-engine-operations.js");
    expect(html).toContain("revenue-engine-operations.css");
    expect(script).toContain("/api/kairos/revenue/products");
    expect(script).not.toContain("/deploy");
    expect(css).toContain("@media(max-width:560px)");
    expect(css).toContain("prefers-reduced-motion");
  });
});
