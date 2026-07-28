import { describe, expect, it, vi } from "vitest";
import { dispatchFirstPackageAction } from "../cloudflare/mmg-ios/src/kairos-first-package-actions-v1.js";
import { reviewFirstPackageAsset } from "../cloudflare/mmg-ios/src/kairos-first-package-review-v1.js";

const headers = {
  Authorization: "Bearer token",
  "CF-Access-Authenticated-User-Email": "operator@example.com",
  "X-Kairos-Operator-Identity": "kid_operator",
  "Content-Type": "application/json",
};

describe("Kairos first package actions", () => {
  it("requires authenticated operator identity", async () => {
    const response = await dispatchFirstPackageAction(new Request("https://example.com/api/kairos/revenue/products/product-1/package-gate", { method: "POST" }), {});
    expect(response?.status).toBe(401);
  });

  it("persists checksum-bound package approval", async () => {
    const replaceRevenueAsset = vi.fn(async () => undefined);
    const result = await reviewFirstPackageAsset({
      revenueStore: {
        getRevenueProduct: vi.fn(async () => ({ revenueProductId: "product-1", assets: [{ assetId: "pdf-1", type: "digital-edition", checksum: "sha-pdf", storageRef: "r2://pdf" }] })),
        replaceRevenueAsset,
      },
    }, {
      revenueProductId: "product-1",
      assetId: "pdf-1",
      assetType: "digital-edition",
      decision: "approved",
      authorization: "Bearer token",
      operatorEmail: "operator@example.com",
      operatorIdentityHash: "kid_operator",
    });
    expect(result.asset.packageQa.decision).toBe("approved");
    expect(result.asset.packageQa.checksum).toBe("sha-pdf");
    expect(replaceRevenueAsset).toHaveBeenCalledOnce();
    expect(result.automaticPublicationAllowed).toBe(false);
  });

  it("requires notes for package rejection", async () => {
    await expect(reviewFirstPackageAsset({}, {
      revenueProductId: "product-1",
      assetId: "zip-1",
      assetType: "complete-package",
      decision: "rejected",
      authorization: "Bearer token",
      operatorEmail: "operator@example.com",
      operatorIdentityHash: "kid_operator",
    })).rejects.toMatchObject({ code: "PACKAGE_QA_NOTES_REQUIRED", status: 409 });
  });

  it("returns a publication-disabled package gate", async () => {
    const request = new Request("https://example.com/api/kairos/revenue/products/product-1/package-gate", { method: "POST", headers, body: "{}" });
    const response = await dispatchFirstPackageAction(request, {
      revenueStore: { getRevenueProduct: vi.fn(async () => ({ revenueProductId: "product-1", assets: [] })) },
    });
    expect(response?.status).toBe(200);
    expect(response?.headers.get("X-Kairos-Automatic-Publication")).toBe("disabled");
    const body = await response?.json();
    expect(body.readyForShopifyDraftHandoff).toBe(false);
    expect(body.automaticPublicationAllowed).toBe(false);
  });
});
