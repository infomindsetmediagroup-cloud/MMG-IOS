import { describe, expect, it, vi } from "vitest";
import { handleProductionRevenueRequest } from "../cloudflare/mmg-ios/src/kairos-production-revenue-entrypoint-v1.js";
import { projectProductionRevenueDashboard } from "../cloudflare/mmg-ios/src/kairos-production-revenue-dashboard-v1.js";

function approved(type, qaField) {
  return { assetId: `${type}-1`, type, filename: `${type}.bin`, checksum: `sha-${type}`, storageRef: `r2://${type}`, [qaField]: { decision: "approved" } };
}

describe("Kairos production revenue entrypoint", () => {
  it("routes authenticated production actions and preserves publication boundaries", async () => {
    const request = new Request("https://example.com/api/kairos/revenue/status", { method: "GET" });
    const response = await handleProductionRevenueRequest({
      authenticateOperator: vi.fn(async () => ({ authorization: "Bearer token", email: "operator@example.com", identityHash: "kid_operator" })),
      handlers: { getStatus: vi.fn(async () => ({ status: "ready" })) },
    }, request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-kairos-automatic-publication")).toBe("disabled");
    expect((await response.json()).result.status).toBe("ready");
  });

  it("returns explicit readiness without executing a mutation", async () => {
    const request = new Request("https://example.com/api/kairos/revenue/readiness?revenueProductId=product-1", { method: "GET" });
    const response = await handleProductionRevenueRequest({
      env: {},
      authenticateOperator: vi.fn(async () => ({ authorization: "Bearer token", email: "operator@example.com", identityHash: "kid_operator" })),
      revenueStore: { getRevenueProduct: vi.fn(async () => ({ revenueProductId: "product-1", automaticPublicationAllowed: false })) },
    }, request);
    const body = await response.json();
    expect(body.readiness.ready).toBe(false);
    expect(body.readiness.nextAction).toBe("configure-production-runtime");
    expect(body.automaticPublicationAllowed).toBe(false);
  });
});

describe("Kairos production revenue dashboard", () => {
  it("projects the full product lifecycle into manual Shopify review", () => {
    const assets = [
      approved("manuscript", "editorialQa"), approved("prompt-library", "editorialQa"), approved("workbook", "editorialQa"),
      approved("cover", "visualQa"), approved("product-image", "visualQa"),
      approved("digital-edition", "packageQa"), approved("editable-source", "packageQa"), approved("complete-package", "packageQa"),
    ];
    const result = projectProductionRevenueDashboard({
      readiness: { ready: true, blockers: [] },
      product: {
        revenueProductId: "product-1",
        title: "AI Video Prompt Mastery",
        assets,
        shopifyDraftReceipt: { productId: "gid://shopify/Product/1", status: "DRAFT", adminUrl: "https://admin.shopify.com/product/1" },
        launchCertification: { certified: true },
      },
    });
    expect(result.stageCards.every((stage) => stage.complete)).toBe(true);
    expect(result.nextAction).toBe("manual-shopify-review");
    expect(result.publicationControlEnabled).toBe(false);
    expect(result.automaticPublicationAllowed).toBe(false);
  });
});
