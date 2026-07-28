import { describe, expect, it, vi } from "vitest";
import { attachStageExecution, handleFirstRevenueStageRequest } from "../cloudflare/mmg-ios/src/kairos-first-revenue-stage-api-v1.js";
import { projectRevenueOperatorRun } from "../cloudflare/mmg-ios/src/kairos-revenue-operator-projection-v1.js";

const run = {
  runId: "run-1",
  revenueProductId: "ai-video-prompt-mastery-v1",
  status: "in_progress",
  currentStage: "execute-content",
  completedStageIds: ["create-product", "plan-production"],
  stages: [
    { id: "create-product" }, { id: "plan-production" }, { id: "execute-content" }, { id: "editorial-qa" },
  ],
  stageReceipts: [],
};

const product = {
  revenueProductId: "ai-video-prompt-mastery-v1",
  title: "AI Video Prompt Mastery",
  productionJobs: [
    { jobId: "j1", outputType: "manuscript", state: "planned", authorization: { status: "authorized" } },
    { jobId: "j2", outputType: "prompt-library", state: "planned", authorization: { status: "authorized" } },
    { jobId: "j3", outputType: "workbook", state: "planned", authorization: { status: "authorized" } },
  ],
  assets: [],
};

describe("Kairos first revenue stage API", () => {
  it("rejects unauthenticated execution", async () => {
    const result = await handleFirstRevenueStageRequest({ method: "POST", params: { runId: "run-1" }, body: {} }, {});
    expect(result.status).toBe(401);
  });

  it("advances a run from a completed stage receipt without publication", () => {
    const next = attachStageExecution(run, {
      completedStageId: "execute-content",
      action: "execute-content-batch",
      execution: { batchExecutionId: "batch-1" },
      coverage: { complete: true },
      completedAt: "2026-07-28T19:00:00.000Z",
    }, "kid_operator");
    expect(next.currentStage).toBe("editorial-qa");
    expect(next.stageReceipts).toHaveLength(1);
    expect(next.stageReceipts[0].publicationPerformed).toBe(false);
  });

  it("executes through stored run and product boundaries", async () => {
    let storedRun: any = run;
    let storedProduct: any = product;
    const context: any = {
      authorization: "Bearer token",
      operatorIdentityHash: "kid_operator",
      firstRevenueRunStore: {
        getFirstRevenueRun: vi.fn(async () => storedRun),
        putFirstRevenueRun: vi.fn(async (value) => { storedRun = value; }),
      },
      revenueProductStore: {
        getRevenueProduct: vi.fn(async () => storedProduct),
        putRevenueProduct: vi.fn(async (value) => { storedProduct = value; }),
      },
      env: {
        KAIROS_REVENUE_BATCH_EXECUTOR: vi.fn(async ({ jobId }: any) => ({
          success: true,
          executionId: `exec-${jobId}`,
          assetId: `asset-${jobId}`,
          storageRef: `r2://${jobId}`,
          checksum: `sha-${jobId}`,
          filename: `${jobId}.md`,
        })),
      },
    };
    const result = await handleFirstRevenueStageRequest({ method: "POST", params: { runId: "run-1" }, body: { confirmation: "EXECUTE REVENUE CONTENT BATCH" } }, context);
    expect(result.status).toBe(200);
    expect(result.body.execution.coverage.complete).toBe(true);
    expect(result.body.run.currentStage).toBe("editorial-qa");
    expect(result.body.automaticPublicationAllowed).toBe(false);
  });
});

describe("Kairos revenue operator projection", () => {
  it("projects an executable content batch with exact confirmation", () => {
    const projection = projectRevenueOperatorRun(run, product);
    expect(projection.executionEnabled).toBe(true);
    expect(projection.nextAction).toBe("execute-content-batch");
    expect(projection.confirmation).toBe("EXECUTE REVENUE CONTENT BATCH");
    expect(projection.automaticPublicationAllowed).toBe(false);
  });

  it("blocks QA while required assets are missing", () => {
    const projection = projectRevenueOperatorRun({ ...run, currentStage: "editorial-qa" }, product);
    expect(projection.executionEnabled).toBe(false);
    expect(projection.blockers[0]).toMatch(/missing assets/i);
  });
});
