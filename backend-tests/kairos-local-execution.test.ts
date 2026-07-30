import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const guard = readFileSync(new URL("../cloudflare/mmg-ios/src/kairos-production-entry-local-only-v1.js", import.meta.url), "utf8");
const entry = readFileSync(new URL("../cloudflare/mmg-ios/src/kairos-production-entry-local-execution-v1.js", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../cloudflare/mmg-ios/wrangler.toml", import.meta.url), "utf8");
const index = readFileSync(new URL("../web/kairos-dashboard/index.html", import.meta.url), "utf8");
const loader = readFileSync(new URL("../web/kairos-dashboard/scripts/kairos-runtime-loader.js", import.meta.url), "utf8");
const bridge = readFileSync(new URL("../web/kairos-dashboard/scripts/executive-local-inference.js", import.meta.url), "utf8");
const compatibility = readFileSync(new URL("../web/kairos-dashboard/scripts/kairos-local-inference.js", import.meta.url), "utf8");

const combined = `${guard}\n${entry}\n${wrangler}\n${index}\n${loader}\n${bridge}\n${compatibility}`;

describe("Kairos local operational execution", () => {
  it("uses the local-only entry boundary and no-cost browser inference policy", () => {
    expect(wrangler).toContain('main = "src/kairos-production-entry-local-only-v1.js"');
    expect(wrangler).toContain('KAIROS_MODEL_PROVIDER = "browser-webgpu"');
    expect(wrangler).toContain('KAIROS_NO_COST_MODE = "true"');
    expect(wrangler).toContain('KAIROS_LOCAL_INFERENCE_ENABLED = "true"');
    expect(wrangler).toContain('KAIROS_MANUSCRIPT_START_MODE = "local-browser"');
  });

  it("blocks direct and legacy paid-provider generation routes", () => {
    expect(entry).toContain('url.pathname === "/api/kairos"');
    expect(entry).toContain('code: "LOCAL_INFERENCE_REQUIRED"');
    expect(guard).toContain("LEGACY_MANUSCRIPT_GENERATION");
    expect(guard).toContain("REVENUE_GENERATION");
    expect(guard).toContain('code: "LOCAL_INFERENCE_REQUIRED"');
    expect(combined).toContain('provider: "browser-webgpu"');
    expect(combined).toContain('externalPaidAPIUsed: false');
    expect(combined).toContain('cloudflareNeuronsUsed: 0');
    expect(entry).not.toContain("handleKairosAPI");
  });

  it("preserves the two-module clean boot and loads same-origin local inference", () => {
    expect((index.match(/<script type="module"/g) || []).length).toBe(2);
    expect(index).toContain("kairos-runtime-loader.js");
    expect(loader).toContain('import "./legacy-runtime-loader.js"');
    expect(loader).toContain('import "./executive-local-inference.js"');
    expect(bridge).toContain('import("../vendor/webllm-bundle.js")');
    expect(bridge).toContain("KairosLocalInference.run");
    expect(compatibility).toContain('import "./kairos-local-inference-same-origin.js"');
    expect(combined).not.toContain("api.openai.com");
    expect(combined).not.toContain("cdn.jsdelivr.net");
    expect(combined).not.toContain("esm.run");
  });
});
