import { describe, expect, it, vi } from "vitest";
import { executeKairosRevenueBatch, attachKairosRevenueBatchExecution, approveKairosRevenueBatch } from "../cloudflare/mmg-ios/src/kairos-revenue-batch-runtime-v1.js";
import { executeRevenueBatchAction, getRevenueBatchActionSpec } from "../cloudflare/mmg-ios/src/kairos-revenue-batch-actions-v1.js";

const product = {
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

describe("Kairos revenue batch runtime", () => {
  it("executes authorized content jobs sequentially and returns bounded receipts", async () => {
    const executor = vi.fn(async ({ jobId }) => ({ success: true, executionId: `execution-${jobId}`, assetId: `asset-${jobId}` }));
    const execution = await executeKairosRevenueBatch(product, "content", { confirmation: "EXECUTE REVENUE CONTENT BATCH" }, { KAIROS_REVENUE_BATCH_EXECUTOR: executor });
    expect(executor).toHaveBeenCalledTimes(3);
    expect(execution.receipts.map((item) => item.jobId)).toEqual(["j1", "j2", "j3"]);
    expect(execution.completed).toBe(true);
    expect(execution.automaticPublicationAllowed).toBe(false);
  });

  it("stops the batch on the first failed job", async () => {
    const executor = vi.fn(async ({ jobId }) => jobId === "j2" ? { success: false, status: 502 } : { success: true });
    await expect(executeKairosRevenueBatch(product, "content", { confirmation: "EXECUTE REVENUE CONTENT BATCH" }, { KAIROS_REVENUE_BATCH_EXECUTOR: executor })).rejects.toThrow(/stopped at job j2/i);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("persists execution history without enabling publication", async () => {
    const execution = await executeKairosRevenueBatch(product, "content", { confirmation: "EXECUTE REVENUE CONTENT BATCH" }, { KAIROS_REVENUE_BATCH_EXECUTOR: async ({ jobId }) => ({ success: true, executionId: jobId }) });
    const next = attachKairosRevenueBatchExecution(product, execution);
    expect(next.batchExecutions).toHaveLength(1);
    expect(next.automaticPublicationAllowed).toBe(false);
  });

  it("requires explicit QA approval and operator identity", () => {
    expect(() => approveKairosRevenueBatch(product, "content", {})).toThrow(/confirmation/i);
    const approved = approveKairosRevenueBatch(product, "content", { confirmation: "APPROVE REVENUE CONTENT ASSETS", operatorIdentityHash: "kid_operator" });
    expect(approved.batchApprovals).toHaveLength(1);
    expect(approved.automaticPublicationAllowed).toBe(false);
  });
});

describe("Kairos revenue batch actions", () => {
  it("maps canonical content and visual actions", () => {
    expect(getRevenueBatchActionSpec("execute-content-batch")?.batchType).toBe("content");
    expect(getRevenueBatchActionSpec("approve-visual-assets")?.batchType).toBe("visual");
  });

  it("coordinates execution through the governed action boundary", async () => {
    const result = await executeRevenueBatchAction(product, "execute-content-batch", { confirmation: "EXECUTE REVENUE CONTENT BATCH" }, { KAIROS_REVENUE_BATCH_EXECUTOR: async ({ jobId }) => ({ success: true, executionId: jobId }) });
    expect(result.execution.receipts).toHaveLength(3);
    expect(result.automaticPublicationAllowed).toBe(false);
  });
});
