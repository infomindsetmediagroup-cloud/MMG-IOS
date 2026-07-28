import { describe, expect, it } from "vitest";
import { executeStoredRevenueBatchAction } from "../cloudflare/mmg-ios/src/kairos-revenue-batch-store-v1.js";

function product() {
  return {
    revenueProductId: "ai-video-prompt-mastery-v1",
    productionJobs: [
      { jobId: "j1", outputType: "manuscript", state: "planned", authorization: { status: "authorized" } },
      { jobId: "j2", outputType: "prompt-library", state: "planned", authorization: { status: "authorized" } },
      { jobId: "j3", outputType: "workbook", state: "planned", authorization: { status: "authorized" } },
    ],
    assets: [
      { assetId: "a1", type: "manuscript", editorialQAStatus: "approved" },
      { assetId: "a2", type: "prompt-library", editorialQAStatus: "approved" },
      { assetId: "a3", type: "workbook", editorialQAStatus: "approved" },
    ],
  };
}

describe("Kairos revenue batch store", () => {
  it("executes and persists a governed content batch", async () => {
    const products = new Map([["ai-video-prompt-mastery-v1", product()]]);
    const result = await executeStoredRevenueBatchAction({ products }, "ai-video-prompt-mastery-v1", "execute-content-batch", { confirmation: "EXECUTE REVENUE CONTENT BATCH" }, { KAIROS_REVENUE_BATCH_EXECUTOR: async ({ jobId }: { jobId: string }) => ({ success: true, executionId: `exec-${jobId}`, assetId: `asset-${jobId}` }) });
    expect(result.execution.receipts).toHaveLength(3);
    expect(products.get("ai-video-prompt-mastery-v1")?.batchExecutions).toHaveLength(1);
    expect(products.get("ai-video-prompt-mastery-v1")?.batchMutationReceipts.at(-1).publicationPerformed).toBe(false);
  });

  it("persists operator-approved content QA", async () => {
    const products = new Map([["ai-video-prompt-mastery-v1", product()]]);
    const result = await executeStoredRevenueBatchAction({ products }, "ai-video-prompt-mastery-v1", "approve-content-assets", { confirmation: "APPROVE REVENUE CONTENT ASSETS", operatorIdentityHash: "kid_operator" });
    expect(result.approval.batchType).toBe("content");
    expect(products.get("ai-video-prompt-mastery-v1")?.batchApprovals).toHaveLength(1);
    expect(result.automaticPublicationAllowed).toBe(false);
  });

  it("rejects missing products", async () => {
    await expect(executeStoredRevenueBatchAction({ products: new Map() }, "missing", "execute-content-batch", { confirmation: "EXECUTE REVENUE CONTENT BATCH" }, {})).rejects.toMatchObject({ code: "REVENUE_PRODUCT_NOT_FOUND", status: 404 });
  });
});
