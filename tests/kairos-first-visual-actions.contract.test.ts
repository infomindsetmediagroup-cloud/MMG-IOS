import { describe, expect, it, vi } from "vitest";
import { dispatchFirstVisualAction } from "../cloudflare/mmg-ios/src/kairos-first-visual-actions-v1.js";
import { recordFirstVisualReview } from "../cloudflare/mmg-ios/src/kairos-first-visual-review-v1.js";

const authHeaders = {
  Authorization: "Bearer token",
  "CF-Access-Authenticated-User-Email": "operator@example.com",
  "X-Kairos-Operator-Identity": "kid_operator",
  "Content-Type": "application/json",
};

describe("Kairos first visual actions", () => {
  it("requires authenticated operator identity", async () => {
    const response = await dispatchFirstVisualAction(new Request("https://example.com/api/kairos/revenue/products/product-1/visual/gate", { method: "POST" }), {});
    expect(response?.status).toBe(401);
  });

  it("returns the packaging gate with publication disabled", async () => {
    const request = new Request("https://example.com/api/kairos/revenue/products/product-1/visual/gate", { method: "POST", headers: authHeaders });
    const response = await dispatchFirstVisualAction(request, { revenueStore: { getRevenueProduct: vi.fn(async () => ({ revenueProductId: "product-1", assets: [] })) } });
    expect(response?.status).toBe(200);
    const body = await response?.json();
    expect(body.readyForPackaging).toBe(false);
    expect(body.automaticPublicationAllowed).toBe(false);
  });
});

describe("Kairos visual QA persistence", () => {
  it("persists checksum-bound approval", async () => {
    let stored: any = null;
    const product = { revenueProductId: "product-1", assets: [{ assetId: "cover-1", type: "cover", checksum: "sha-cover", storageRef: "r2://cover" }] };
    const result = await recordFirstVisualReview({
      revenueStore: {
        getRevenueProduct: vi.fn(async () => product),
        putRevenueProduct: vi.fn(async (value) => { stored = value; }),
      },
    }, {
      revenueProductId: "product-1",
      assetId: "cover-1",
      decision: "approved",
      authorization: "Bearer token",
      operatorEmail: "operator@example.com",
      operatorIdentityHash: "kid_operator",
    });
    expect(result.asset.visualQa.decision).toBe("approved");
    expect(result.asset.visualQa.checksum).toBe("sha-cover");
    expect(stored.automaticPublicationAllowed).toBe(false);
  });

  it("requires notes for rejection", async () => {
    await expect(recordFirstVisualReview({ revenueStore: { getRevenueProduct: vi.fn() } }, {
      revenueProductId: "product-1",
      assetId: "cover-1",
      decision: "rejected",
      authorization: "Bearer token",
      operatorEmail: "operator@example.com",
      operatorIdentityHash: "kid_operator",
    })).rejects.toThrow(/notes/i);
  });
});
