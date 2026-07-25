import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const backend = readFileSync(new URL("../cloudflare/mmg-ios/src/kairos-manuscript-generation-job-v1.js", import.meta.url), "utf8");
const entry = readFileSync(new URL("../cloudflare/mmg-ios/src/kairos-production-entry-local-inference-v1.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../web/kairos-dashboard/scripts/manuscript-auto-pipeline.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../web/kairos-dashboard/index.html", import.meta.url), "utf8");
const deploy = readFileSync(new URL("../.github/workflows/deploy-kairos-manuscript-runtime.yml", import.meta.url), "utf8");

describe("Kairos backend-owned manuscript generation", () => {
  it("uses a durable generation-job route and alarm continuation", () => {
    expect(backend).toContain("/generation-job");
    expect(backend).toContain("setAlarm");
    expect(backend).toContain("resumeManuscriptGenerationAlarm");
    expect(backend).toContain("JOB_INDEX_KEY");
    expect(entry).toContain("handleManuscriptGenerationObjectRequest");
    expect(entry).toContain("async alarm()");
  });

  it("supports governed provider-independent backend inference", () => {
    expect(backend).toContain('provider==="ollama"');
    expect(backend).toContain('provider==="openai-compatible"');
    expect(backend).toContain("KAIROS_MODEL_ENDPOINT");
    expect(backend).toContain("KAIROS_MODEL_AUTH_TOKEN");
    expect(backend).toContain("cloudflareNeuronsUsed:0");
  });

  it("keeps progress durable and the mobile UI phone-independent", () => {
    expect(client).toContain("generationEndpoint");
    expect(client).toContain("You may close this page");
    expect(client).toContain("phone-independent");
    expect(client).not.toContain("window.KairosLocalInference.run");
    expect(client).not.toContain("navigator.gpu");
  });

  it("removes WebLLM from the primary app and deployment path", () => {
    expect(index).not.toContain("kairos-local-inference-same-origin.js");
    expect(index).not.toContain("webllm-bundle.js");
    expect(deploy).not.toContain("npm run build:webllm");
    expect(deploy).not.toContain("CreateMLCEngine");
    expect(deploy).toContain("kairos-manuscript-generation-job-v1.js");
  });

  it("preserves protected Shopify approval boundaries", () => {
    expect(client).toContain("CREATE SHOPIFY PRODUCT DRAFT");
    expect(client).toContain("PUBLISH PRODUCT LIVE");
    expect(client).toContain("APPROVE PACKAGE");
  });
});
