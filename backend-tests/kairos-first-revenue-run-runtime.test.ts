import { describe, expect, it, vi } from "vitest";
import { attachFirstRevenueStageReceipt, executePersistedFirstRevenueStage } from "../cloudflare/mmg-ios/src/kairos-first-revenue-run-runtime-v1.js";

const run = {
  runId: "run-1",
  revenueProductId: "ai-video-prompt-mastery-v1",
  completedStageIds: ["create-product", "plan-production"],
  stageReceipts: [],
  stages: [
    { id: "create-product", dependsOn: [] },
    { id: "plan-production", dependsOn: ["create-product"] },
    { id: "execute-content", dependsOn: ["plan-production"] },
    { id: "execute-visuals", dependsOn: ["execute-content"] },
  ],
};

describe("Kairos first revenue run runtime", () => {
  it("executes the next stage through the authenticated runtime boundary", async () => {
    const runtimeFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ receipts: 3 }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const execution = await executePersistedFirstRevenueStage(run, { authorization: "Bearer token", operatorEmail: "operator@example.com" }, { KAIROS_RUNTIME_FETCH: runtimeFetch });
    expect(runtimeFetch).toHaveBeenCalledOnce();
    expect(execution.completedStageId).toBe("execute-content");
    expect(execution.automaticPublicationAllowed).toBe(false);
  });

  it("persists bounded stage receipts and advances the run", () => {
    const next = attachFirstRevenueStageReceipt(run, { completedStageId: "execute-content", executedAt: "2026-07-28T17:00:00.000Z", result: { receipts: 3 } }, { operatorIdentityHash: "kid_operator" });
    expect(next.completedStageIds).toContain("execute-content");
    expect(next.currentStage).toBe("execute-visuals");
    expect(next.stageReceipts).toHaveLength(1);
    expect(next.stageReceipts[0].publicationPerformed).toBe(false);
  });

  it("blocks execution without the internal runtime transport", async () => {
    await expect(executePersistedFirstRevenueStage(run, {}, {})).rejects.toThrow(/transport/i);
  });
});
