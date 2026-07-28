import { describe, expect, it, vi } from "vitest";
import { createFirstRevenueExecutionPlan, executeFirstRevenueStage } from "../cloudflare/mmg-ios/src/kairos-first-revenue-run-executor-v1.js";
import { createRevenueBatchManifest, evaluateRevenueAssetBatchQA } from "../cloudflare/mmg-ios/src/kairos-revenue-batch-policy-v1.js";

const run = {
  runId: "run-1",
  revenueProductId: "ai-video-prompt-mastery-v1",
  completedStageIds: ["create-product", "plan-production"],
  stages: [
    { id: "create-product", dependsOn: [] },
    { id: "plan-production", dependsOn: ["create-product"] },
    { id: "execute-content", dependsOn: ["plan-production"] },
    { id: "execute-visuals", dependsOn: ["execute-content"] },
  ],
};

describe("Kairos first revenue run executor", () => {
  it("maps the next stage to the canonical authenticated revenue action", () => {
    const plan = createFirstRevenueExecutionPlan(run, {});
    expect(plan.next.id).toBe("execute-content");
    expect(plan.request.path).toContain("/execute-content-batch");
    expect(plan.request.body.confirmation).toBe("EXECUTE REVENUE CONTENT BATCH");
    expect(plan.automaticPublicationAllowed).toBe(false);
  });

  it("executes one stage through an injected authenticated transport", async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true, status: 200, body: { receipts: 3 } });
    const result = await executeFirstRevenueStage(run, {}, transport);
    expect(transport).toHaveBeenCalledOnce();
    expect(result.completedStageId).toBe("execute-content");
    expect(result.result.receipts).toBe(3);
  });

  it("blocks execution when dependencies are incomplete", () => {
    const blocked = { ...run, completedStageIds: ["create-product"] };
    expect(() => createFirstRevenueExecutionPlan(blocked, {})).toThrow(/blocked/i);
  });
});

describe("Kairos revenue batch policy", () => {
  const product = {
    revenueProductId: "ai-video-prompt-mastery-v1",
    productionJobs: [
      { jobId: "j1", outputType: "manuscript", state: "planned", authorization: { status: "authorized" } },
      { jobId: "j2", outputType: "prompt-library", state: "planned", authorization: { status: "authorized" } },
      { jobId: "j3", outputType: "workbook", state: "planned", authorization: { status: "authorized" } },
    ],
  };

  it("creates a sequential content manifest with publication disabled", () => {
    const manifest = createRevenueBatchManifest(product, "content", { confirmation: "EXECUTE REVENUE CONTENT BATCH" });
    expect(manifest.jobIds).toEqual(["j1", "j2", "j3"]);
    expect(manifest.stopOnFailure).toBe(true);
    expect(manifest.automaticPublicationAllowed).toBe(false);
  });

  it("requires exact confirmation and job authorization", () => {
    expect(() => createRevenueBatchManifest(product, "content", {})).toThrow(/confirmation/i);
    const unauthorized = { ...product, productionJobs: [{ ...product.productionJobs[0], authorization: { status: "pending" } }] };
    expect(() => createRevenueBatchManifest(unauthorized, "content", { confirmation: "EXECUTE REVENUE CONTENT BATCH" })).toThrow(/authorize/i);
  });

  it("evaluates complete editorial QA across the content batch", () => {
    const qa = evaluateRevenueAssetBatchQA({ assets: [
      { assetId: "a1", type: "manuscript", editorialQAStatus: "approved" },
      { assetId: "a2", type: "prompt-library", editorialQAStatus: "approved" },
      { assetId: "a3", type: "workbook", editorialQAStatus: "approved" },
    ] }, "content");
    expect(qa.passed).toBe(true);
    expect(qa.publicationAuthorizationIncluded).toBe(false);
  });
});
