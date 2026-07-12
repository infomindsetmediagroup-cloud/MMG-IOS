import { describe, expect, it, vi } from "vitest";
// @ts-expect-error The deployed Worker is intentionally authored as an ES module.
import worker from "../cloudflare/mmg-ios/src/worker.js";

describe("reconciled Cloudflare worker", () => {
  it("serves the bundled Command Center shell from the asset binding", async () => {
    const assets = { fetch: vi.fn(async (_request: Request) => new Response("<!doctype html><title>Kairos</title>", { status: 200, headers: { "content-type": "text/html" } })) };
    const response = await worker.fetch(new Request("https://kairos.example/"), { ASSETS: assets }, {});

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Kairos");
    expect(response.headers.get("x-mmg-host")).toBe("cloudflare-assets");
    expect(response.headers.get("x-mmg-build")).toBe("command-center-operational-candidate-20260711-35");
    expect(assets.fetch).toHaveBeenCalledOnce();
    expect(assets.fetch.mock.calls[0][0].url).toBe("https://kairos.example/");
  });

  it("keeps API routes on the same consolidated worker", async () => {
    const response = await worker.fetch(new Request("https://kairos.example/api/health"), {}, {});
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.runtime).toBe("cloudflare-workers");
    expect(body.capabilities.cloudflareNative).toBe(true);
  });

  it("produces a source-grounded Shopify proposal through client credentials and OpenAI", async () => {
    const providerPlan = {
      summary: "A structural redesign is not safe from the available files.",
      recommendedChanges: [],
      affectedAssets: [],
      expectedBenefits: [],
      risks: [],
      rollbackPlan: [],
      acceptanceCriteria: [],
      mutationPlan: { themeId: "123456", files: [] },
    };
    const network = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/admin/oauth/access_token")) return Response.json({ access_token: "fresh-shopify-token" });
      if (url.includes("/graphql.json")) {
        const request = input instanceof Request ? input : null;
        const payload = request ? await request.clone().json() : init?.body ? JSON.parse(String(init.body)) : {};
        const query = String(payload?.query || "");
        if (query.includes("KairosMainTheme")) return Response.json({ data: { themes: { nodes: [{ id: "gid://shopify/OnlineStoreTheme/123456", name: "Published", role: "MAIN", processing: false, processingFailed: false }] } } });
        if (query.includes("KairosThemeFiles")) return Response.json({ data: { theme: { files: { nodes: [{ filename: "assets/base.css", contentType: "text/css", body: { content: ".template-index main { display: block; }" } }], userErrors: [] } } } });
      }
      if (url === "https://api.openai.com/v1/responses") return Response.json({ output_text: JSON.stringify(providerPlan) });
      return new Response("Unexpected request", { status: 500 });
    });
    vi.stubGlobal("fetch", network);
    try {
      const response = await worker.fetch(new Request("https://kairos.example/api/theme-plan", {
        method: "POST",
        headers: { Authorization: "Bearer runtime-test", "Content-Type": "application/json" },
        body: JSON.stringify({ objective: "Prepare a bounded guided homepage improvement." }),
      }), {
        KAIROS_RUNTIME_TOKEN: "runtime-test",
        OPENAI_API_KEY: "openai-test",
        OPENAI_MODEL: "gpt-test",
        SHOPIFY_STORE_DOMAIN: "mindsetmediagroup.myshopify.com",
        SHOPIFY_CLIENT_ID: "client-test-integration",
        SHOPIFY_CLIENT_SECRET: "secret-test",
        SHOPIFY_API_VERSION: "2026-07",
      }, {});
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.mutationPlan.themeId).toBe("123456");
      expect(body.mutationPlan.files).toHaveLength(1);
      expect(body.mutationPlan.files[0].key).toBe("assets/base.css");
      expect(body.mutationPlan.files[0].value).toContain("MMG KAIROS GUIDED HOMEPAGE BASELINE");
      expect(body.sourceEvidence.adapter).toBe("graphql-admin");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
