import { describe, expect, it, vi } from "vitest";
import { evaluateVisualApprovalGate, executeFirstPackageBatch } from "../cloudflare/mmg-ios/src/kairos-first-package-batch-v1.js";
import { projectFirstPackageReviewGate } from "../cloudflare/mmg-ios/src/kairos-first-package-review-gate-v1.js";

function approvedVisualAssets() {
  return ["cover", "product-image"].map((type) => ({
    assetId: `${type}-1`, type, checksum: `sha-${type}`, storageRef: `r2://${type}`, visualQa: { decision: "approved" },
  }));
}

describe("Kairos first package batch", () => {
  it("blocks packaging until both required visual assets are approved", () => {
    const gate = evaluateVisualApprovalGate({ assets: approvedVisualAssets().slice(0, 1) });
    expect(gate.ready).toBe(false);
    expect(gate.blockers).toContain("product-image:missing");
  });

  it("executes authorized PDF, DOCX, and ZIP package jobs with checksum-backed evidence", async () => {
    const product = {
      revenueProductId: "product-1",
      assets: approvedVisualAssets(),
      productionJobs: [
        { jobId: "pdf-job", assetType: "digital-edition", authorized: true },
        { jobId: "docx-job", assetType: "editable-source", authorized: true },
        { jobId: "zip-job", assetType: "complete-package", authorized: true },
      ],
    };
    const result = await executeFirstPackageBatch({
      revenueStore: { getRevenueProduct: vi.fn(async () => product) },
      executeJob: vi.fn(async (job) => ({ asset: { assetId: `${job.assetType}-1`, type: job.assetType, checksum: `sha-${job.assetType}`, storageRef: `r2://${job.assetType}` } })),
    }, {
      revenueProductId: "product-1",
      confirmation: "EXECUTE FIRST PACKAGE BATCH",
      authorization: "Bearer token",
      operatorEmail: "operator@example.com",
      operatorIdentityHash: "kid_operator",
    });
    expect(result.completed).toBe(true);
    expect(result.receipts).toHaveLength(3);
    expect(result.automaticPublicationAllowed).toBe(false);
  });
});

describe("Kairos first package review gate", () => {
  it("unlocks Shopify draft handoff only after PDF, DOCX, and ZIP are approved", () => {
    const blocked = projectFirstPackageReviewGate({ revenueProductId: "product-1", assets: [{ assetId: "pdf-1", type: "digital-edition", checksum: "sha-pdf", storageRef: "r2://pdf", packageQa: { decision: "approved" } }] });
    expect(blocked.readyForShopifyDraftHandoff).toBe(false);
    expect(blocked.blockers).toContain("editable-source:missing");

    const ready = projectFirstPackageReviewGate({ revenueProductId: "product-1", assets: [
      { assetId: "pdf-1", type: "digital-edition", checksum: "sha-pdf", storageRef: "r2://pdf", packageQa: { decision: "approved" } },
      { assetId: "docx-1", type: "editable-source", checksum: "sha-docx", storageRef: "r2://docx", packageQa: { decision: "approved" } },
      { assetId: "zip-1", type: "complete-package", checksum: "sha-zip", storageRef: "r2://zip", packageQa: { decision: "approved" } },
    ] });
    expect(ready.readyForShopifyDraftHandoff).toBe(true);
    expect(ready.nextStage).toBe("shopify-draft-handoff");
    expect(ready.automaticPublicationAllowed).toBe(false);
  });
});
