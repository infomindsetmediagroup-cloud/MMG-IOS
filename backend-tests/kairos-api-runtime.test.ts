// @ts-nocheck
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleKairosAPI, KAIROS_API_CONTRACT_VERSION } from "../cloudflare/mmg-ios/src/kairos-api-runtime-v1.js";

const baseEnv = {
  OPENAI_API_KEY: "test-secret-never-returned",
  KAIROS_MODEL_PROVIDER: "openai",
  KAIROS_OPENAI_MODEL: "gpt-5-mini",
  KAIROS_MODEL_ENDPOINT: "https://api.openai.com",
  MMG_STOREFRONT_ORIGIN: "https://themindsetmediagroup.com",
};

afterEach(() => vi.restoreAllMocks());

describe("Kairos API runtime", () => {
  it("exposes a non-secret readiness contract", async () => {
    const response = await handleKairosAPI(new Request("https://kairos.test/api/kairos"), baseEnv);
    expect(response?.status).toBe(200);
    const body = await response?.json();
    expect(body.contractVersion).toBe(KAIROS_API_CONTRACT_VERSION);
    expect(body.provider).toBe("openai");
    expect(JSON.stringify(body)).not.toContain(baseEnv.OPENAI_API_KEY);
  });

  it("fails closed when the server secret is missing", async () => {
    const response = await handleKairosAPI(new Request("https://kairos.test/api/kairos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objective: "Summarize this project." }),
    }), { ...baseEnv, OPENAI_API_KEY: "" });
    expect(response?.status).toBe(503);
    const body = await response?.json();
    expect(body.error.code).toBe("OPENAI_API_KEY_MISSING");
  });

  it("blocks production-affecting execution behind explicit approval", async () => {
    const provider = vi.spyOn(globalThis, "fetch");
    const response = await handleKairosAPI(new Request("https://kairos.test/api/kairos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objective: "Update the Shopify product price and push it live right now.",
        mode: "proposed_action",
      }),
    }), baseEnv);
    expect(response?.status).toBe(202);
    const body = await response?.json();
    expect(body.status).toBe("approval_required");
    expect(body.requiresApproval).toBe(true);
    expect(provider).not.toHaveBeenCalled();
  });

  it("normalizes a successful Responses API result", async () => {
    const provider = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "resp_test_123",
      output: [{ content: [{ type: "output_text", text: "Kairos completed the analysis." }] }],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const response = await handleKairosAPI(new Request("https://kairos.test/api/kairos", {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseEnv.MMG_STOREFRONT_ORIGIN },
      body: JSON.stringify({ objective: "Analyze the current project status." }),
    }), baseEnv);

    expect(response?.status).toBe(200);
    expect(response?.headers.get("access-control-allow-origin")).toBe(baseEnv.MMG_STOREFRONT_ORIGIN);
    const body = await response?.json();
    expect(body.message).toBe("Kairos completed the analysis.");
    expect(body.requestId).toMatch(/^kairos_req_/);
    expect(body.requiresApproval).toBe(false);
    expect(provider).toHaveBeenCalledOnce();

    const request = provider.mock.calls[0][1];
    const payload = JSON.parse(String(request?.body));
    expect(payload.store).toBe(false);
    expect(payload.instructions).toContain("governed intelligence and orchestration layer");
    expect(String(request?.headers?.Authorization)).toContain("test-secret-never-returned");
    expect(JSON.stringify(body)).not.toContain("test-secret-never-returned");
  });

  it("returns actionable validation errors without calling the provider", async () => {
    const provider = vi.spyOn(globalThis, "fetch");
    const response = await handleKairosAPI(new Request("https://kairos.test/api/kairos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objective: "" }),
    }), baseEnv);
    expect(response?.status).toBe(400);
    const body = await response?.json();
    expect(body.error.code).toBe("OBJECTIVE_REQUIRED");
    expect(provider).not.toHaveBeenCalled();
  });
});
