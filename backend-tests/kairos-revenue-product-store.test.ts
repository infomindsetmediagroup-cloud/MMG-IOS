import { describe, expect, it } from "vitest";
import { buildKairosRevenueProduct } from "../cloudflare/mmg-ios/src/kairos-revenue-engine-v1.js";
import { createKairosRevenueProductionJobs, authorizeKairosRevenueJob } from "../cloudflare/mmg-ios/src/kairos-revenue-production-jobs-v1.js";
import { handleKairosRevenueProductAPI } from "../cloudflare/mmg-ios/src/kairos-revenue-product-store-v1.js";

const blueprint = {
  blueprintId: "bp_1",
  productType: "digital_guide",
  title: "AI Video Prompt Mastery",
  objective: "Create a complete commercial guide for creators.",
  audience: "Creators and small businesses",
  price: { amount: 49, currency: "USD" },
};

describe("Kairos revenue production jobs", () => {
  it("creates bounded, dependency-aware jobs without granting execution authority", () => {
    const product = buildKairosRevenueProduct({ blueprint, assets: [] });
    const jobs = createKairosRevenueProductionJobs(product, { projectId: "project_1", priority: "high" });
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((job) => job.executionAuthorized === false)).toBe(true);
    expect(jobs.every((job) => job.commerceMutationAllowed === false)).toBe(true);
  });

  it("requires hashed authorization before queueing a job", () => {
    const product = buildKairosRevenueProduct({ blueprint, assets: [] });
    const [job] = createKairosRevenueProductionJobs(product);
    expect(() => authorizeKairosRevenueJob(job, {})).toThrow(/authorizer/i);
    const queued = authorizeKairosRevenueJob(job, { authorizedByIdentityHash: "kid_deadbeef" });
    expect(queued.status).toBe("queued");
    expect(queued.executionAuthorized).toBe(true);
    expect(queued.externalPublicationAllowed).toBe(false);
  });
});

describe("Kairos revenue product API", () => {
  it("requires authentication", async () => {
    const response = await handleKairosRevenueProductAPI(new Request("https://example.com/api/kairos/revenue/products"), {});
    expect(response?.status).toBe(401);
  });

  it("routes authenticated collection requests through KAIROS_PROJECTS", async () => {
    let forwarded = false;
    const env = {
      KAIROS_API_ACCESS_TOKEN: "secret",
      KAIROS_PROJECTS: {
        idFromName: () => "id",
        get: () => ({ fetch: async () => { forwarded = true; return new Response(JSON.stringify({ success: true, products: [] }), { headers: { "Content-Type": "application/json" } }); } }),
      },
    };
    const response = await handleKairosRevenueProductAPI(new Request("https://example.com/api/kairos/revenue/products", { headers: { authorization: "Bearer secret" } }), env);
    expect(response?.status).toBe(200);
    expect(forwarded).toBe(true);
  });
});
