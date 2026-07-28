import { describe, expect, it, vi } from "vitest";
import { bootstrapFirstRevenueRun, recoverFirstRevenueRun } from "../cloudflare/mmg-ios/src/kairos-first-revenue-bootstrap-v1.js";
import { createRevenueAssetReviewLinks } from "../cloudflare/mmg-ios/src/kairos-revenue-review-links-v1.js";

describe("Kairos first revenue bootstrap and recovery", () => {
  it("creates one governed first run and prevents duplicate active runs", async () => {
    let stored: any = null;
    const stores = {
      revenueStore: { getRevenueProduct: vi.fn(async () => ({ revenueProductId: "ai-video-prompt-mastery-v1" })) },
      firstRevenueStore: {
        findActiveRunByProduct: vi.fn(async () => stored),
        putFirstRevenueRun: vi.fn(async (run) => { stored = run; }),
      },
    };
    const first = await bootstrapFirstRevenueRun(stores, { confirmation: "BOOTSTRAP FIRST REVENUE RUN", operatorIdentityHash: "kid_operator" });
    const second = await bootstrapFirstRevenueRun(stores, { confirmation: "BOOTSTRAP FIRST REVENUE RUN", operatorIdentityHash: "kid_operator" });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.automaticPublicationAllowed).toBe(false);
  });

  it("recovers completed stages from persisted receipts", async () => {
    let run: any = { runId: "run-1", revenueProductId: "product-1", state: "failed", completedStageIds: [], stageReceipts: [{ completedStageId: "execute-content" }] };
    const result = await recoverFirstRevenueRun({ firstRevenueStore: { getFirstRevenueRun: vi.fn(async () => run), putFirstRevenueRun: vi.fn(async (value) => { run = value; }) } }, { runId: "run-1", confirmation: "RECOVER FIRST REVENUE RUN", operatorIdentityHash: "kid_operator" });
    expect(result.run.completedStageIds).toContain("execute-content");
    expect(result.run.state).toBe("active");
  });
});

describe("Kairos revenue review links", () => {
  it("creates expiring operator review links without publication authority", async () => {
    const result = await createRevenueAssetReviewLinks({ revenueProductId: "product-1", assets: [{ assetId: "a1", type: "manuscript", filename: "manuscript.md", status: "ready", storageRef: "r2://a1", checksum: "sha-a1" }] }, { operatorIdentityHash: "kid_operator" }, { KAIROS_REVENUE_REVIEW_SIGNER: vi.fn(async ({ assetId }) => ({ url: `https://review.example/${assetId}` })) });
    expect(result.links).toHaveLength(1);
    expect(result.singleUse).toBe(true);
    expect(result.automaticPublicationAllowed).toBe(false);
  });

  it("requires operator identity", async () => {
    await expect(createRevenueAssetReviewLinks({ revenueProductId: "product-1", assets: [] }, {}, { KAIROS_REVENUE_REVIEW_SIGNER: vi.fn() })).rejects.toThrow(/identity/i);
  });
});
