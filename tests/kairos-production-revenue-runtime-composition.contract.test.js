import { describe, expect, it, vi } from "vitest";
import {
  handleFirstRevenueRunObjectRequest,
  handleProductionRevenueRuntime,
} from "../cloudflare/mmg-ios/src/kairos-production-revenue-runtime-composition-v1.js";

function product() {
  return {
    revenueProductId: "ai-video-prompt-mastery",
    productionJobs: Array.from({ length: 8 }, (_, index) => ({ jobId: `job-${index}` })),
    price: { amount: 29, currency: "USD" },
    shopify: { title: "AI Video Prompt Mastery", handle: "ai-video-prompt-mastery" },
    automaticPublicationAllowed: false,
  };
}

function liveEnv(durableFetch) {
  return {
    OPENAI_API_KEY: "sk-proj-production-key-long-enough",
    KAIROS_MODEL_NAME: "gpt-5-mini",
    KAIROS_REVENUE_ASSETS: { put: vi.fn(), get: vi.fn() },
    KAIROS_PROJECTS: {
      idFromName: vi.fn(() => "registry-id"),
      get: vi.fn(() => ({ fetch: durableFetch })),
    },
    SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
    SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat_production_token_long_enough",
  };
}

function authenticatedRequest(path, init = {}) {
  return new Request(`https://example.com${path}`, {
    ...init,
    headers: {
      "CF-Access-Authenticated-User-Email": "operator@example.com",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

describe("Kairos production revenue runtime composition", () => {
  it("projects readiness through the canonical authenticated route", async () => {
    const durableFetch = vi.fn(async (request) => {
      const input = await request.json();
      return new Response(JSON.stringify({ success: true, product: product(), operation: input.operation }), {
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await handleProductionRevenueRuntime(
      authenticatedRequest("/api/kairos/revenue/readiness?revenueProductId=ai-video-prompt-mastery"),
      liveEnv(durableFetch),
      vi.fn(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.readiness.ready).toBe(true);
    expect(body.automaticPublicationAllowed).toBe(false);
  });

  it("bootstraps through the product and first-run durable adapters", async () => {
    const durableFetch = vi.fn(async (request) => {
      const url = new URL(request.url);
      const input = await request.json();
      if (url.pathname.endsWith("kairos-revenue-products")) {
        return new Response(JSON.stringify({ success: true, product: product() }), { headers: { "Content-Type": "application/json" } });
      }
      expect(input.action).toBe("start");
      return new Response(JSON.stringify({ success: true, run: { runId: "run-live-1", status: "ready" } }), { headers: { "Content-Type": "application/json" } });
    });

    const response = await handleProductionRevenueRuntime(
      authenticatedRequest("/api/kairos/revenue/bootstrap-live-runtime", {
        method: "POST",
        body: JSON.stringify({
          revenueProductId: "ai-video-prompt-mastery",
          confirmation: "BOOTSTRAP LIVE REVENUE RUNTIME",
        }),
      }),
      liveEnv(durableFetch),
      vi.fn(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.runId).toBe("run-live-1");
    expect(body.result.nextAction).toBe("execute-content-batch");
    expect(response.headers.get("x-kairos-automatic-publication")).toBe("disabled");
    expect(durableFetch).toHaveBeenCalledTimes(2);
  });

  it("mounts the first-run store on the project Durable Object boundary", async () => {
    const state = { storage: { get: vi.fn(async () => []), put: vi.fn(async () => undefined) } };
    const response = await handleFirstRevenueRunObjectRequest(state, new Request("https://kairos.internal/registry/kairos-first-revenue-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start",
        input: {
          revenueProductId: "ai-video-prompt-mastery",
          operatorIdentityHash: "kid_operator",
          confirmation: "BOOTSTRAP FIRST REVENUE RUN",
        },
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run.revenueProductId).toBe("ai-video-prompt-mastery");
    expect(body.run.automaticPublicationAllowed).toBe(false);
  });
});
