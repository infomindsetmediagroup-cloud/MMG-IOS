import { afterEach, describe, expect, it, vi } from "vitest";
import { executeKairosRevenueJob } from "../cloudflare/mmg-ios/src/kairos-openai-revenue-executor-v1.js";
import { createKairosRevenueExecutionReceipt } from "../cloudflare/mmg-ios/src/kairos-revenue-execution-receipt-v1.js";
import { compileKairosRevenuePrompt } from "../cloudflare/mmg-ios/src/kairos-revenue-prompt-compiler-v1.js";

describe("Kairos OpenAI revenue executor", () => {
  afterEach(() => vi.unstubAllGlobals());

  const product = { revenueProductId: "rev_1", blueprint: { title: "AI Video Prompt Mastery", productType: "digital_guide", targetAudience: "Creators building better AI videos", objective: "Create a complete practical guide that teaches repeatable prompt systems." } };
  const job = { jobId: "job_manuscript", outputType: "manuscript", requirements: ["Include an introduction", "Include actionable chapters"], authorization: { status: "authorized" } };

  it("compiles bounded commercial production context", () => {
    const prompt = compileKairosRevenuePrompt(product, job);
    expect(prompt.input).toContain("AI Video Prompt Mastery");
    expect(prompt.input).toContain("Creators building better AI videos");
    expect(prompt.instructions).not.toContain("hidden reasoning output");
  });

  it("requires explicit authorization and confirmation", async () => {
    await expect(executeKairosRevenueJob(product, { ...job, authorization: { status: "pending" } }, { OPENAI_API_KEY: "test" }, { confirmation: "EXECUTE REVENUE JOB" })).rejects.toMatchObject({ code: "REVENUE_JOB_NOT_AUTHORIZED" });
    await expect(executeKairosRevenueJob(product, job, { OPENAI_API_KEY: "test" }, {})).rejects.toMatchObject({ code: "EXECUTION_CONFIRMATION_REQUIRED" });
  });

  it("executes through the Responses API without storing model output", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.store).toBe(false);
      expect(body.model).toBe("gpt-5");
      return new Response(JSON.stringify({ id: "resp_1", model: "gpt-5", output_text: "# Finished Guide\n\nCustomer-ready content.", usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 } }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await executeKairosRevenueJob(product, job, { OPENAI_API_KEY: "test", KAIROS_REVENUE_MODEL: "gpt-5" }, { confirmation: "EXECUTE REVENUE JOB" });
    expect(result.content).toContain("Finished Guide");
    expect(result.automaticPublicationAllowed).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("creates checksum-backed receipts and requires storage before registration", () => {
    const receipt = createKairosRevenueExecutionReceipt({ executionId: "resp_1", jobId: "job_manuscript", revenueProductId: "rev_1", outputType: "manuscript", model: "gpt-5", content: "finished content", usage: {} }, {});
    expect(receipt.asset.checksum).toHaveLength(8);
    expect(receipt.registrationReady).toBe(false);
    expect(receipt.automaticPublicationAllowed).toBe(false);
  });
});
