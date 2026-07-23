import { describe, expect, it } from "vitest";
import { createDeterministicPlan } from "../cloudflare/kairos/deterministic-planner.js";
import { createKairosIntelligenceRuntime } from "../cloudflare/kairos/intelligence-runtime.js";
import { handleKairosIntelligenceRequest } from "../cloudflare/kairos/intelligence-api.js";

const runtimeToken = "r".repeat(40);

describe("Kairos provider-independent runtime", () => {
  it("defaults to a no-cost deterministic provider", () => {
    const runtime = createKairosIntelligenceRuntime({});
    expect(runtime.describe()).toMatchObject({
      provider: "deterministic",
      paidApiRequired: false,
      deterministicFallback: true,
      executionMode: "offline_deterministic",
    });
  });

  it("classifies protected publication work as draft then approval", () => {
    const plan = createDeterministicPlan({
      objective: "Publish a new 100-page digital guide to Shopify",
    });
    expect(plan.workflowId).toBe("digital-product.publish.v1");
    expect(plan.autonomyLevel).toBe(2);
    expect(plan.requiresApproval).toBe(true);
    expect(plan.executionPolicy).toBe("draft_then_approval");
  });

  it("falls back to deterministic planning when Ollama is offline", async () => {
    const runtime = createKairosIntelligenceRuntime(
      {
        KAIROS_MODEL_PROVIDER: "ollama",
        KAIROS_MODEL_ENDPOINT: "http://local-model.invalid",
        KAIROS_MODEL_REQUIRED: "false",
      },
      async () => {
        throw new TypeError("offline");
      },
    );
    await expect(runtime.plan({ objective: "Build the Kairos app" })).resolves.toMatchObject({
      workflowId: "application.develop.v1",
      mode: "deterministic",
      fallback: true,
      fallbackReason: "MODEL_UNAVAILABLE",
    });
  });

  it("accepts structured plans from an Ollama-compatible local server", async () => {
    const runtime = createKairosIntelligenceRuntime(
      {
        KAIROS_MODEL_PROVIDER: "ollama",
        KAIROS_MODEL_ENDPOINT: "https://kairos-model.example.test",
        KAIROS_MODEL_NAME: "qwen2.5:7b-instruct",
      },
      async () => Response.json({
        response: JSON.stringify({
          workflowId: "marketing.campaign.v1",
          domain: "marketing",
          requiresApproval: true,
          stages: [{ action: "prepare campaign brief" }],
          constraints: ["Use approved links"],
        }),
      }),
    );
    await expect(runtime.plan({ objective: "Promote the new product" })).resolves.toMatchObject({
      mode: "self_hosted_model",
      provider: "ollama",
      model: "qwen2.5:7b-instruct",
      autonomyLevel: 2,
      requiresApproval: true,
    });
  });

  it("exposes health without authentication and protects planning routes", async () => {
    const env = {
      KAIROS_RUNTIME_TOKEN: runtimeToken,
      KAIROS_MODEL_PROVIDER: "deterministic",
      KAIROS_SHOPIFY_WRITES_ENABLED: "false",
    };
    const health = await handleKairosIntelligenceRequest(
      new Request("https://kairos.example.test/api/health"),
      env,
    );
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      paidApiRequired: false,
      intelligence: { provider: "deterministic" },
    });

    const unauthorized = await handleKairosIntelligenceRequest(
      new Request("https://kairos.example.test/api/kairos/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective: "Build an app" }),
      }),
      env,
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await handleKairosIntelligenceRequest(
      new Request("https://kairos.example.test/api/kairos/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${runtimeToken}`,
        },
        body: JSON.stringify({ objective: "Build an app" }),
      }),
      env,
    );
    expect(authorized.status).toBe(200);
    await expect(authorized.json()).resolves.toMatchObject({
      plan: { workflowId: "application.develop.v1", autonomyLevel: 2 },
    });
  });
});
