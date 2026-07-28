import { describe, expect, it, vi } from "vitest";
import { routeFirstRevenueLiveRequest } from "../cloudflare/mmg-ios/src/kairos-first-revenue-live-router-v1.js";
import { mountRevenueLivePanel } from "../web/kairos-dashboard/kairos-revenue-live-panel.js";

describe("Kairos first revenue live router", () => {
  it("mounts status routes with publication disabled headers", async () => {
    const response = await routeFirstRevenueLiveRequest(new Request("https://example.com/api/kairos/revenue/first-runs/run-1/status", { headers: { Authorization: "Bearer token", "CF-Access-Authenticated-User-Email": "operator@example.com" } }), {}, {
      firstRevenueStore: { getFirstRevenueRun: vi.fn(async () => ({ runId: "run-1", revenueProductId: "product-1" })) },
      revenueStore: { getRevenueProduct: vi.fn(async () => ({ revenueProductId: "product-1" })) },
    });
    expect(response?.status).toBe(200);
    expect(response?.headers.get("X-Kairos-Automatic-Publication")).toBe("disabled");
  });

  it("returns null outside the first revenue route boundary", async () => {
    expect(await routeFirstRevenueLiveRequest(new Request("https://example.com/api/other"))).toBeNull();
  });
});

describe("Kairos revenue live panel", () => {
  it("renders progress and executes the exact projected confirmation", async () => {
    const root = document.createElement("div");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ run: { runId: "run-1", revenueProductId: "product-1", completedStageIds: [], stages: [{ id: "execute-content", confirmation: "EXECUTE REVENUE CONTENT BATCH" }] }, product: { assets: [], productionJobs: [] }, blockers: [] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ completedStageId: "execute-content" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ run: { runId: "run-1", revenueProductId: "product-1", completedStageIds: ["execute-content"], stages: [{ id: "execute-content", confirmation: "EXECUTE REVENUE CONTENT BATCH" }] }, product: { assets: [], productionJobs: [] }, blockers: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const panel = mountRevenueLivePanel(root, { fetcher, authorization: "Bearer token", operatorEmail: "operator@example.com", operatorIdentityHash: "kid_operator" });
    await panel.refresh("run-1");
    expect(root.textContent).toContain("Execute Next Stage");
    await panel.executeNext("run-1");
    expect(fetcher.mock.calls[1][1].body).toContain("EXECUTE REVENUE CONTENT BATCH");
    expect(panel.getState()?.progressPercent).toBe(100);
  });
});
