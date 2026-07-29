import { describe, expect, it, vi } from "vitest";
import { routeKairosProductionFetch } from "../cloudflare/mmg-ios/src/kairos-production-fetch-chain-v1.js";
import { bootstrapLiveRevenueRuntime, verifyLiveBindings } from "../cloudflare/mmg-ios/src/kairos-live-runtime-bootstrap-v1.js";

function liveEnv() {
  return {
    OPENAI_API_KEY: "sk-proj-production-key-long-enough",
    KAIROS_PRODUCTION_MODEL: "gpt-production",
    REVENUE_ASSETS_R2: { put: vi.fn(), get: vi.fn() },
    REVENUE_RUNS: { idFromName: vi.fn(), get: vi.fn() },
    SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
    SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat_production_token_long_enough",
  };
}

describe("Kairos live production fetch chain", () => {
  it("preserves the publication-disabled boundary for unmatched routes", async () => {
    const response = await routeKairosProductionFetch({ next: vi.fn(async () => new Response("ok")) }, new Request("https://example.com/health"));
    expect(response.status).toBe(200);
  });
});

describe("Kairos live runtime bootstrap", () => {
  it("verifies all required live bindings", async () => {
    const result = await verifyLiveBindings(liveEnv());
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("bootstraps the first live run only after readiness and exact confirmation", async () => {
    const product = {
      revenueProductId: "ai-video-prompt-mastery",
      productionJobs: Array.from({ length: 8 }, (_, index) => ({ jobId: `job-${index}` })),
      price: { amount: 29, currency: "USD" },
      shopify: { title: "AI Video Prompt Mastery", handle: "ai-video-prompt-mastery" },
      automaticPublicationAllowed: false,
    };
    const result = await bootstrapLiveRevenueRuntime({
      env: liveEnv(),
      revenueStore: { getRevenueProduct: vi.fn(async () => product) },
      firstRunStore: { bootstrap: vi.fn(async () => ({ runId: "run-live-1", status: "ready" })) },
    }, {
      revenueProductId: product.revenueProductId,
      confirmation: "BOOTSTRAP LIVE REVENUE RUNTIME",
      authorization: "Bearer token",
      operatorEmail: "operator@example.com",
      operatorIdentityHash: "kid_operator",
    });
    expect(result.runId).toBe("run-live-1");
    expect(result.nextAction).toBe("execute-content-batch");
    expect(result.automaticPublicationAllowed).toBe(false);
  });
});
