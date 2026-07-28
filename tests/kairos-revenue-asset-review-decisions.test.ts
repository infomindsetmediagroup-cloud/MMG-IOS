import { describe, expect, it, vi } from "vitest";
import { decideRevenueAssetReview, evaluateContentApproval } from "../cloudflare/mmg-ios/src/kairos-revenue-asset-review-decisions-v1.js";
import { createRevenueReviewController } from "../web/kairos-dashboard/kairos-revenue-review-controller.js";

describe("Kairos revenue asset review decisions", () => {
  it("persists an approved checksum-backed asset review", async () => {
    let product: any = { revenueProductId: "product-1", assets: [{ assetId: "a1", type: "manuscript", status: "ready", storageRef: "r2://a1", checksum: "sha-a1" }] };
    const result = await decideRevenueAssetReview({ revenueStore: { getRevenueProduct: vi.fn(async () => product), putRevenueProduct: vi.fn(async (value) => { product = value; }) } }, { revenueProductId: "product-1", assetId: "a1", decision: "approved", operatorIdentityHash: "kid_operator" });
    expect(result.asset.status).toBe("approved");
    expect(product.assets[0].editorialReview.decision).toBe("approved");
    expect(result.automaticPublicationAllowed).toBe(false);
  });

  it("requires notes when an asset is rejected", async () => {
    await expect(decideRevenueAssetReview({}, { decision: "rejected", operatorIdentityHash: "kid_operator" })).rejects.toThrow(/notes/i);
  });

  it("opens visual generation only after all content assets are approved", () => {
    const blocked = evaluateContentApproval({ assets: [{ type: "manuscript", editorialReview: { decision: "approved" } }] });
    expect(blocked.readyForVisualGeneration).toBe(false);
    expect(blocked.blockers).toEqual(["prompt-library", "workbook"]);
    const ready = evaluateContentApproval({ assets: ["manuscript", "prompt-library", "workbook"].map((type) => ({ type, editorialReview: { decision: "approved" } })) });
    expect(ready.readyForVisualGeneration).toBe(true);
    expect(ready.automaticPublicationAllowed).toBe(false);
  });
});

describe("Kairos revenue review controller", () => {
  it("forwards authenticated approval decisions", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.decision).toBe("approved");
      expect(new Headers(init?.headers).get("X-Kairos-Operator-Identity")).toBe("kid_operator");
      return new Response(JSON.stringify({ asset: { assetId: "a1", status: "approved" }, automaticPublicationAllowed: false }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const controller = createRevenueReviewController({ fetcher, authorization: "Bearer token", operatorEmail: "operator@example.com", operatorIdentityHash: "kid_operator" });
    const result = await controller.decide("run-1", "product-1", "a1", "approved");
    expect(result.asset.status).toBe("approved");
  });
});
