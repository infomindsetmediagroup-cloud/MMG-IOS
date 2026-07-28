import { describe, expect, it, vi } from "vitest";
import { evaluateContentApprovalGate, executeFirstVisualBatch } from "../cloudflare/mmg-ios/src/kairos-first-visual-batch-v1.js";
import { projectFirstVisualReviewGate } from "../cloudflare/mmg-ios/src/kairos-first-visual-review-gate-v1.js";

function approvedContentAssets() {
  return ["manuscript", "prompt-library", "workbook"].map((type) => ({
    assetId: `${type}-1`, type, checksum: `sha-${type}`, storageRef: `r2://${type}`, editorialQa: { decision: "approved" },
  }));
}

describe("Kairos first visual batch", () => {
  it("blocks visual production until all required content assets are approved", async () => {
    const product = { revenueProductId: "product-1", assets: approvedContentAssets().slice(0, 2), productionJobs: [] };
    const gate = evaluateContentApprovalGate(product);
    expect(gate.ready).toBe(false);
    expect(gate.blockers).toContain("workbook:missing");
  });

  it("executes authorized cover and product-image jobs with checksum-backed evidence", async () => {
    const product = {
      revenueProductId: "product-1",
      assets: approvedContentAssets(),
      productionJobs: [
        { jobId: "cover-job", assetType: "cover", authorized: true },
        { jobId: "product-image-job", assetType: "product-image", authorized: true },
      ],
    };
    const result = await executeFirstVisualBatch({
      revenueStore: { getRevenueProduct: vi.fn(async () => product) },
      executeJob: vi.fn(async (job) => ({ asset: { assetId: `${job.assetType}-1`, type: job.assetType, checksum: `sha-${job.assetType}`, storageRef: `r2://${job.assetType}` } })),
    }, {
      revenueProductId: "product-1",
      confirmation: "EXECUTE FIRST VISUAL BATCH",
      authorization: "Bearer token",
      operatorEmail: "operator@example.com",
      operatorIdentityHash: "kid_operator",
    });
    expect(result.completed).toBe(true);
    expect(result.receipts).toHaveLength(2);
    expect(result.automaticPublicationAllowed).toBe(false);
  });
});

describe("Kairos first visual review gate", () => {
  it("unlocks packaging only after cover and product image are approved", () => {
    const blocked = projectFirstVisualReviewGate({ revenueProductId: "product-1", assets: [{ assetId: "cover-1", type: "cover", checksum: "sha-cover", storageRef: "r2://cover", visualQa: { decision: "approved" } }] });
    expect(blocked.readyForPackaging).toBe(false);
    expect(blocked.blockers).toContain("product-image:missing");

    const ready = projectFirstVisualReviewGate({ revenueProductId: "product-1", assets: [
      { assetId: "cover-1", type: "cover", checksum: "sha-cover", storageRef: "r2://cover", visualQa: { decision: "approved" } },
      { assetId: "image-1", type: "product-image", checksum: "sha-image", storageRef: "r2://image", visualQa: { decision: "approved" } },
    ] });
    expect(ready.readyForPackaging).toBe(true);
    expect(ready.nextStage).toBe("package-product");
    expect(ready.automaticPublicationAllowed).toBe(false);
  });
});
