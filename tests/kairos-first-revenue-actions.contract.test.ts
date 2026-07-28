import { describe, expect, it, vi } from "vitest";
import { dispatchFirstRevenueAction } from "../cloudflare/mmg-ios/src/kairos-first-revenue-actions-v1.js";
import { renderKairosRevenueReviewPanel } from "../web/kairos-dashboard/kairos-revenue-review-panel.js";

describe("Kairos first revenue action dispatcher", () => {
  it("requires authenticated operator identity", async () => {
    const response = await dispatchFirstRevenueAction(new Request("https://example.com/api/kairos/revenue/first-runs/bootstrap", { method: "POST" }), {});
    expect(response?.status).toBe(401);
  });

  it("creates operator-scoped review links without publication authority", async () => {
    const request = new Request("https://example.com/api/kairos/revenue/first-runs/run-1/review-links", {
      method: "POST",
      headers: { Authorization: "Bearer token", "CF-Access-Authenticated-User-Email": "operator@example.com", "X-Kairos-Operator-Identity": "kid_operator", "Content-Type": "application/json" },
      body: JSON.stringify({ ttlSeconds: 300 }),
    });
    const response = await dispatchFirstRevenueAction(request, {
      firstRevenueStore: { getFirstRevenueRun: vi.fn(async () => ({ runId: "run-1", revenueProductId: "product-1" })) },
      revenueStore: { getRevenueProduct: vi.fn(async () => ({ revenueProductId: "product-1", assets: [{ assetId: "a1", type: "manuscript", filename: "manuscript.md", status: "ready", storageRef: "r2://a1", checksum: "sha-a1" }] })) },
      env: { KAIROS_REVENUE_REVIEW_SIGNER: vi.fn(async ({ assetId }) => ({ url: `https://review.example/${assetId}` })) },
    });
    expect(response?.status).toBe(200);
    const body = await response?.json();
    expect(body.links).toHaveLength(1);
    expect(body.automaticPublicationAllowed).toBe(false);
  });
});

describe("Kairos revenue review panel", () => {
  it("renders reviewable assets and keeps publication disabled", () => {
    document.body.innerHTML = '<main data-review></main>';
    const root = document.querySelector("[data-review]");
    const result = renderKairosRevenueReviewPanel(root, { links: [{ assetId: "a1", type: "manuscript", filename: "manuscript.md", url: "https://review.example/a1", expiresAt: "2026-07-28T21:00:00.000Z" }] });
    expect(result.assetCount).toBe(1);
    expect(root?.getAttribute("data-automatic-publication")).toBe("disabled");
    expect(root?.querySelector("a")?.getAttribute("href")).toBe("https://review.example/a1");
  });
});
