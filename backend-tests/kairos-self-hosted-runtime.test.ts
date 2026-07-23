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
      modelRequired: false,
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

  it("removes nested credentials from model context", () => {
    const plan = createDeterministicPlan({
      objective: "Prepare a marketing brief",
      context: {
        campaign: {
          audience: "creators",
          token: "do-not-forward",
          nested: { apiKey: "also-secret", note: "approved" },
        },
        password: "top-level-secret",
      },
    });
    expect(plan.context).toEqual({
      campaign: {
        audience: "creators",
        nested: { note: "approved" },
      },
    });
  });

  it("falls back to deterministic planning when Ollama is offline", async () => {
    const runtime = createKairosIntelligenceRuntime(
      {
        KAIROS_MODEL_PROVIDER: "ollama",
        KAIROS_MODEL_ENDPOINT: "https://local-model.invalid",
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

  it("uses model refinements without allowing workflow or approval escalation", async () => {
    let forwardedPrompt = "";
    const runtime = createKairosIntelligenceRuntime(
      {
        KAIROS_MODEL_PROVIDER: "ollama",
        KAIROS_MODEL_ENDPOINT: "https://kairos-model.example.test",
        KAIROS_MODEL_NAME: "qwen2.5:7b-instruct",
      },
      async (_url, init) => {
        forwardedPrompt = JSON.parse(String(init?.body || "{}")).prompt;
        return Response.json({
          response: JSON.stringify({
            workflowId: "unrestricted.root.execute.v1",
            domain: "system-administration",
            requiresApproval: false,
            stages: [{ action: "prepare publication package" }],
            constraints: ["Use approved links"],
          }),
        });
      },
    );
    const plan = await runtime.plan({
      objective: "Publish the new digital guide",
      context: { safe: "included", credentials: { token: "excluded" } },
    });
    expect(plan).toMatchObject({
      mode: "self_hosted_model",
      provider: "ollama",
      model: "qwen2.5:7b-instruct",
      workflowId: "digital-product.publish.v1",
      domain: "publishing",
      autonomyLevel: 2,
      requiresApproval: true,
      executionPolicy: "draft_then_approval",
    });
    expect(forwardedPrompt).toContain("included");
    expect(forwardedPrompt).not.toContain("excluded");
  });

  it("rejects insecure non-local model endpoints", () => {
    expect(() => createKairosIntelligenceRuntime({
      KAIROS_MODEL_PROVIDER: "ollama",
      KAIROS_MODEL_ENDPOINT: "http://model.example.test",
    })).toThrow("must use HTTPS");
  });

  it("exposes hardened health and protects planning routes", async () => {
    const env = {
      KAIROS_RUNTIME_TOKEN: runtimeToken,
      KAIROS_MODEL_PROVIDER: "deterministic",
      KAIROS_SHOPIFY_WRITES_ENABLED: "false",
      KAIROS_ENVIRONMENT: "staging",
      KAIROS_RELEASE_ID: "test-release",
    };
    const health = await handleKairosIntelligenceRequest(
      new Request("https://kairos.example.test/api/health"),
      env,
    );
    expect(health.status).toBe(200);
    expect(health.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(health.headers.get("x-frame-options")).toBe("DENY");
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      status: "ready",
      environment: "staging",
      releaseId: "test-release",
      paidApiRequired: false,
      productionMutationsEnabled: false,
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

    const crossOrigin = await handleKairosIntelligenceRequest(
      new Request("https://kairos.example.test/api/kairos/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${runtimeToken}`,
          Origin: "https://attacker.example.test",
        },
        body: JSON.stringify({ objective: "Build an app" }),
      }),
      env,
    );
    expect(crossOrigin.status).toBe(403);
    await expect(crossOrigin.json()).resolves.toMatchObject({ error: { code: "ORIGIN_DENIED" } });

    const authorized = await handleKairosIntelligenceRequest(
      new Request("https://kairos.example.test/api/kairos/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${runtimeToken}`,
          Origin: "https://kairos.example.test",
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

  it("rejects chunked request bodies beyond the plan limit", async () => {
    const response = await handleKairosIntelligenceRequest(
      new Request("https://kairos.example.test/api/kairos/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${runtimeToken}`,
        },
        body: JSON.stringify({ objective: "x".repeat(70_000) }),
      }),
      {
        KAIROS_RUNTIME_TOKEN: runtimeToken,
        KAIROS_MODEL_PROVIDER: "deterministic",
      },
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "REQUEST_TOO_LARGE" } });
  });
});
