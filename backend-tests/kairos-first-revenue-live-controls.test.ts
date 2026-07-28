import { describe, expect, it, vi } from "vitest";
import { dispatchFirstRevenueLiveRequest } from "../cloudflare/mmg-ios/src/kairos-first-revenue-live-dispatcher-v1.js";
import { createRevenueLiveController, projectRevenueLiveView } from "../web/kairos-dashboard/kairos-revenue-live-controller.js";

describe("Kairos first revenue live dispatcher", () => {
  it("returns the stored run and product without publication authority", async () => {
    const request = new Request("https://example.com/api/kairos/revenue/first-runs/run-1/status", { headers: { Authorization: "Bearer token", "CF-Access-Authenticated-User-Email": "operator@example.com" } });
    const response = await dispatchFirstRevenueLiveRequest(request, {
      firstRevenueStore: { getFirstRevenueRun: vi.fn(async () => ({ runId: "run-1", revenueProductId: "product-1" })) },
      revenueStore: { getRevenueProduct: vi.fn(async () => ({ revenueProductId: "product-1", assets: [] })) },
    });
    expect(response?.status).toBe(200);
    const body = await response?.json();
    expect(body.automaticPublicationAllowed).toBe(false);
  });

  it("requires authenticated operator access", async () => {
    const response = await dispatchFirstRevenueLiveRequest(new Request("https://example.com/api/kairos/revenue/first-runs/run-1/status"), {});
    expect(response?.status).toBe(401);
  });
});

describe("Kairos revenue live controller", () => {
  it("executes only with the exact stage confirmation supplied", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ completedStageId: "execute-content", automaticPublicationAllowed: false }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const controller = createRevenueLiveController({ fetcher, authorization: "Bearer token", operatorEmail: "operator@example.com", operatorIdentityHash: "kid_operator" });
    await expect(controller.executeNext("run-1", {})).rejects.toThrow(/confirmation/i);
    const result = await controller.executeNext("run-1", { confirmation: "EXECUTE REVENUE CONTENT BATCH" });
    expect(result.completedStageId).toBe("execute-content");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("projects production progress, assets, jobs, receipts, and blockers", () => {
    const view = projectRevenueLiveView({
      run: { runId: "run-1", revenueProductId: "product-1", completedStageIds: ["create-product", "plan-production"], stages: [{ id: "create-product" }, { id: "plan-production" }, { id: "execute-content", confirmation: "EXECUTE REVENUE CONTENT BATCH" }], stageReceipts: [] },
      product: { productionJobs: [{ state: "completed", authorization: { status: "authorized" } }], assets: [{ status: "ready", storageRef: "r2://asset", checksum: "sha" }] },
      blockers: [],
    });
    expect(view.currentStage).toBe("execute-content");
    expect(view.canExecute).toBe(true);
    expect(view.assets.ready).toBe(1);
    expect(view.automaticPublicationAllowed).toBe(false);
  });
});
