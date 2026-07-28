import { describe, expect, it, vi } from "vitest";
import { storeKairosRevenueExecutionAsset } from "../cloudflare/mmg-ios/src/kairos-revenue-asset-storage-v1.js";
import { getKairosRevenueExecutionQueue, requireNextKairosRevenueJob } from "../cloudflare/mmg-ios/src/kairos-revenue-job-sequencer-v1.js";
import { readFileSync } from "node:fs";

const storeSource = readFileSync(new URL("../cloudflare/mmg-ios/src/kairos-revenue-product-store-v1.js", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../web/kairos-dashboard/scripts/revenue-engine-operations.js", import.meta.url), "utf8");

describe("Kairos revenue storage and execution sequencing", () => {
  it("stores generated assets in the governed object-storage binding", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const stored = await storeKairosRevenueExecutionAsset(
      { revenueProductId: "rp-1", jobId: "job-1", executionId: "resp-1", content: "# Product", completedAt: "2026-07-28T00:00:00.000Z" },
      { asset: { assetId: "asset-1", type: "manuscript", filename: "guide.md", version: 1, checksum: "abc123", contentType: "text/markdown" } },
      { KAIROS_REVENUE_ASSETS: { put } },
    );
    expect(put).toHaveBeenCalledOnce();
    expect(stored.storageRef).toBe("r2://revenue-products/rp-1/job-1/001-guide.md");
    expect(stored.editorialQAStatus).toBe("required");
    expect(stored.automaticPublicationAllowed).toBe(false);
  });

  it("blocks jobs until authorization and dependencies are complete", () => {
    const product = { revenueProductId: "rp-1", productionJobs: [
      { jobId: "outline", state: "completed", authorization: { status: "authorized" } },
      { jobId: "manuscript", state: "queued", dependencies: ["outline"], authorization: { status: "authorized" } },
      { jobId: "pdf", state: "queued", dependencies: ["manuscript"], authorization: { status: "authorized" } },
    ] };
    const queue = getKairosRevenueExecutionQueue(product);
    expect(queue.next?.jobId).toBe("manuscript");
    expect(queue.readyCount).toBe(1);
    expect(() => requireNextKairosRevenueJob(product, "pdf")).toThrow(/blocked/i);
  });

  it("automatically persists, registers, and completes stored execution output", () => {
    expect(storeSource).toContain("record-stored-execution");
    expect(storeSource).toContain("storeKairosRevenueExecutionAsset");
    expect(storeSource).toContain("registerKairosRevenueAsset");
    expect(storeSource).toContain("completeKairosRevenueJob");
    expect(storeSource).toContain("execute-next");
    expect(storeSource).toContain("KAIROS_REVENUE_ASSETS");
  });

  it("keeps production execution separate from Shopify publication", () => {
    expect(storeSource).toContain("automaticPublicationAllowed");
    expect(storeSource).not.toContain("productCreate(");
    expect(storeSource).not.toContain("productSet(");
    expect(dashboardSource).not.toContain("PUBLISH PRODUCT LIVE");
  });
});
