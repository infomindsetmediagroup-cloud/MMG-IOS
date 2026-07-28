import { describe, expect, it, vi } from "vitest";
import { attachRevenueBatchAssets, evaluateRevenueBatchAssetCoverage } from "../cloudflare/mmg-ios/src/kairos-revenue-batch-asset-bridge-v1.js";
import { executeStoredFirstRevenueBatchStage, getFirstRevenueBatchStageAction } from "../cloudflare/mmg-ios/src/kairos-first-revenue-batch-stage-bridge-v1.js";

const product = {
  revenueProductId: "ai-video-prompt-mastery-v1",
  productionJobs: [
    { jobId: "j1", outputType: "manuscript", state: "planned", authorization: { status: "authorized" } },
    { jobId: "j2", outputType: "prompt-library", state: "planned", authorization: { status: "authorized" } },
    { jobId: "j3", outputType: "workbook", state: "planned", authorization: { status: "authorized" } },
  ],
  assets: [],
};

const execution = {
  batchExecutionId: "batch-1",
  revenueProductId: "ai-video-prompt-mastery-v1",
  batchType: "content",
  completed: true,
  receipts: [
    { jobId: "j1", assetId: "a1", storageRef: "r2://a1", checksum: "sha-a1", filename: "manuscript.md", completedAt: "2026-07-28T18:00:00.000Z" },
    { jobId: "j2", assetId: "a2", storageRef: "r2://a2", checksum: "sha-a2", filename: "prompt-library.md", completedAt: "2026-07-28T18:00:01.000Z" },
    { jobId: "j3", assetId: "a3", storageRef: "r2://a3", checksum: "sha-a3", filename: "workbook.md", completedAt: "2026-07-28T18:00:02.000Z" },
  ],
};

describe("Kairos revenue batch asset bridge", () => {
  it("registers generated assets and completes their production jobs", () => {
    const next = attachRevenueBatchAssets(product, execution, { operatorIdentityHash: "kid_operator" });
    expect(next.assets.map((item: any) => item.assetId)).toEqual(["a1", "a2", "a3"]);
    expect(next.productionJobs.every((item: any) => item.state === "completed")).toBe(true);
    expect(next.batchAssetAttachments).toHaveLength(1);
    expect(next.automaticPublicationAllowed).toBe(false);
  });

  it("requires checksum-backed storage evidence", () => {
    const invalid = { ...execution, receipts: [{ ...execution.receipts[0], checksum: "" }] };
    expect(() => attachRevenueBatchAssets(product, invalid)).toThrow(/storageRef, and checksum/i);
  });

  it("reports complete content asset coverage", () => {
    const next = attachRevenueBatchAssets(product, execution);
    const coverage = evaluateRevenueBatchAssetCoverage(next, "content");
    expect(coverage.complete).toBe(true);
    expect(coverage.missing).toEqual([]);
    expect(coverage.publicationAuthorizationIncluded).toBe(false);
  });
});

describe("Kairos first revenue batch stage bridge", () => {
  it("maps first-run stages to canonical batch actions", () => {
    expect(getFirstRevenueBatchStageAction("execute-content")).toBe("execute-content-batch");
    expect(getFirstRevenueBatchStageAction("visual-qa")).toBe("approve-visual-assets");
    expect(getFirstRevenueBatchStageAction("create-shopify-draft")).toBeNull();
  });

  it("executes a stored content stage, persists assets, and never publishes", async () => {
    let stored = product;
    const store = {
      getRevenueProduct: vi.fn(async () => stored),
      putRevenueProduct: vi.fn(async (value) => { stored = value; }),
    };
    const env = {
      KAIROS_REVENUE_BATCH_EXECUTOR: vi.fn(async ({ jobId }: any) => {
        const map: Record<string, string> = { j1: "manuscript", j2: "prompt-library", j3: "workbook" };
        return { success: true, executionId: `exec-${jobId}`, assetId: `asset-${jobId}`, storageRef: `r2://${jobId}`, checksum: `sha-${jobId}`, filename: `${map[jobId]}.md` };
      }),
    };
    const run = { runId: "run-1", revenueProductId: product.revenueProductId, currentStage: "execute-content" };
    const result = await executeStoredFirstRevenueBatchStage(store, run, { confirmation: "EXECUTE REVENUE CONTENT BATCH" }, env);
    expect(result.completedStageId).toBe("execute-content");
    expect(result.coverage.complete).toBe(true);
    expect(store.putRevenueProduct).toHaveBeenCalled();
    expect(result.automaticPublicationAllowed).toBe(false);
  });
});
