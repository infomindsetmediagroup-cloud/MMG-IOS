import { describe, expect, it, vi } from "vitest";
import { listProductionRevenueActions, routeProductionRevenueAction } from "../cloudflare/mmg-ios/src/kairos-production-revenue-router-v1.js";
import { projectProductionRevenueReadiness } from "../cloudflare/mmg-ios/src/kairos-production-readiness-v1.js";

const operator = {
  authorization: "Bearer token",
  operatorEmail: "operator@example.com",
  operatorIdentityHash: "kid_operator",
};

describe("Kairos production revenue router", () => {
  it("registers the complete governed first-product action surface", () => {
    const actions = listProductionRevenueActions().map((item) => item.action);
    expect(actions).toEqual(expect.arrayContaining([
      "execute-content-batch", "review-content-asset", "content-gate",
      "execute-visual-batch", "review-visual-asset", "visual-gate",
      "execute-package-batch", "review-package-asset", "package-gate",
      "create-shopify-draft", "certify-launch", "status",
    ]));
  });

  it("preserves exact confirmation and publication boundaries", async () => {
    const executeContentBatch = vi.fn(async () => ({ completed: true }));
    const response = await routeProductionRevenueAction({ executeContentBatch }, {
      ...operator,
      action: "execute-content-batch",
      method: "POST",
      confirmation: "EXECUTE FIRST CONTENT BATCH",
    });
    expect(response.result.completed).toBe(true);
    expect(response.automaticPublicationAllowed).toBe(false);
    expect(response.headers["x-kairos-automatic-publication"]).toBe("disabled");
  });

  it("rejects unconfirmed governed mutations", async () => {
    await expect(routeProductionRevenueAction({ executeContentBatch: vi.fn() }, {
      ...operator,
      action: "execute-content-batch",
      method: "POST",
    })).rejects.toMatchObject({ code: "REVENUE_CONFIRMATION_REQUIRED", status: 409 });
  });
});

describe("Kairos production readiness", () => {
  it("reports the exact missing production bindings", () => {
    const result = projectProductionRevenueReadiness({}, { revenueProductId: "product-1", productionJobs: [], automaticPublicationAllowed: false });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("binding:OPENAI_API_KEY");
    expect(result.nextAction).toBe("configure-production-runtime");
  });

  it("unlocks the first revenue bootstrap only when runtime and product are complete", () => {
    const env = Object.fromEntries([
      "OPENAI_API_KEY", "KAIROS_PRODUCTION_MODEL", "REVENUE_ASSETS_R2", "REVENUE_RUNS", "SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_ACCESS_TOKEN",
    ].map((name) => [name, {}]));
    const product = {
      revenueProductId: "product-1",
      productionJobs: Array.from({ length: 8 }, (_, index) => ({ jobId: `job-${index}` })),
      price: { amount: 29, currency: "USD" },
      shopify: { handle: "ai-video-prompt-mastery", title: "AI Video Prompt Mastery" },
      automaticPublicationAllowed: false,
    };
    const result = projectProductionRevenueReadiness(env, product);
    expect(result.ready).toBe(true);
    expect(result.nextAction).toBe("bootstrap-first-revenue-run");
    expect(result.automaticPublicationAllowed).toBe(false);
  });
});
