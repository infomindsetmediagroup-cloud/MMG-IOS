import { describe, expect, it, vi } from "vitest";
import { executeFirstContentBatch } from "../cloudflare/mmg-ios/src/kairos-first-content-batch-v1.js";
import { projectContentReviewQueue } from "../cloudflare/mmg-ios/src/kairos-content-review-queue-v1.js";

vi.mock("../cloudflare/mmg-ios/src/kairos-revenue-production-executor-v1.js", () => ({
  executeRevenueProductionJob: vi.fn(async ({ job }) => ({ status: "completed", asset: { assetId: `asset-${job.assetType}`, type: job.assetType, storageRef: `r2://${job.assetType}`, checksum: `sha-${job.assetType}` } })),
}));

describe("Kairos first content batch", () => {
  it("executes only authorized manuscript, prompt-library, and workbook jobs", async () => {
    const jobs = ["manuscript", "prompt-library", "workbook"].map((assetType) => ({ jobId: `job-${assetType}`, assetType, status: "authorized", authorized: true }));
    const assets = jobs.map((job) => ({ assetId: `asset-${job.assetType}`, type: job.assetType, status: "ready", storageRef: `r2://${job.assetType}`, checksum: `sha-${job.assetType}` }));
    const revenueStore = { getRevenueProduct: vi.fn().mockResolvedValueOnce({ revenueProductId: "product-1", productionJobs: jobs }).mockResolvedValueOnce({ revenueProductId: "product-1", assets }) };
    const result = await executeFirstContentBatch({ revenueStore }, { revenueProductId: "product-1", confirmation: "EXECUTE FIRST CONTENT BATCH", authorization: "Bearer token", operatorEmail: "operator@example.com", operatorIdentityHash: "kid_operator" });
    expect(result.receipts).toHaveLength(3);
    expect(result.editorialReviewRequired).toBe(true);
    expect(result.visualGenerationAllowed).toBe(false);
    expect(result.automaticPublicationAllowed).toBe(false);
  });

  it("rejects incomplete or unauthorized content batches", async () => {
    const revenueStore = { getRevenueProduct: vi.fn(async () => ({ revenueProductId: "product-1", productionJobs: [{ jobId: "job-manuscript", assetType: "manuscript", authorized: false }] })) };
    await expect(executeFirstContentBatch({ revenueStore }, { revenueProductId: "product-1", confirmation: "EXECUTE FIRST CONTENT BATCH", authorization: "Bearer token", operatorEmail: "operator@example.com", operatorIdentityHash: "kid_operator" })).rejects.toThrow(/Missing content jobs|not authorized/i);
  });
});

describe("Kairos content review queue", () => {
  it("opens visual generation only after all checksum-backed content assets are approved", () => {
    const assets = ["manuscript", "prompt-library", "workbook"].map((type) => ({ assetId: `asset-${type}`, type, filename: `${type}.md`, status: "ready", storageRef: `r2://${type}`, checksum: `sha-${type}`, editorialReview: { decision: "approved", reviewedAt: "2026-07-28T20:00:00.000Z", operatorIdentityHash: "kid_operator" } }));
    const projection = projectContentReviewQueue({ revenueProductId: "product-1", assets });
    expect(projection.approvedCount).toBe(3);
    expect(projection.blockers).toEqual([]);
    expect(projection.visualGenerationReady).toBe(true);
    expect(projection.automaticPublicationAllowed).toBe(false);
  });

  it("keeps visual generation blocked for pending reviews", () => {
    const projection = projectContentReviewQueue({ revenueProductId: "product-1", assets: [{ assetId: "asset-manuscript", type: "manuscript", status: "ready", storageRef: "r2://manuscript", checksum: "sha-manuscript" }] });
    expect(projection.visualGenerationReady).toBe(false);
    expect(projection.blockers.length).toBeGreaterThan(0);
  });
});
