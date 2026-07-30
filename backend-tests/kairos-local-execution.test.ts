import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const entry = readFileSync(new URL("../cloudflare/mmg-ios/src/kairos-production-entry-local-execution-v1.js", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../cloudflare/mmg-ios/wrangler.toml", import.meta.url), "utf8");
const index = readFileSync(new URL("../web/kairos-dashboard/index.html", import.meta.url), "utf8");
const bridge = readFileSync(new URL("../web/kairos-dashboard/scripts/executive-local-inference.js", import.meta.url), "utf8");
const compatibility = readFileSync(new URL("../web/kairos-dashboard/scripts/kairos-local-inference.js", import.meta.url), "utf8");

const combined = `${entry}\n${wrangler}\n${index}\n${bridge}\n${compatibility}`;

describe("Kairos local operational execution", () => {
  it("uses the local execution entrypoint and no-cost browser inference policy", () => {
    expect(wrangler).toContain('main = "src/kairos-production-entry-local-execution-v1.js"');
    expect(wrangler).toContain('KAIROS_MODEL_PROVIDER = "browser-webgpu"');
    expect(wrangler).toContain('KAIROS_NO_COST_MODE = "true"');
    expect(wrangler).toContain('KAIROS_LOCAL_INFERENCE_ENABLED = "true"');
    expect(wrangler).toContain('KAIROS_MANUSCRIPT_START_MODE = "local-browser"');
  });

  it("blocks direct paid-provider generation and records local-only evidence", () => {
    expect(entry).toContain('url.pathname === "/api/kairos"');
    expect(entry).toContain('code: "LOCAL_INFERENCE_REQUIRED"');
    expect(entry).toContain('provider: "browser-webgpu"');
    expect(entry).toContain('externalPaidAPIUsed: false');
    expect(entry).toContain('cloudflareNeuronsUsed: 0');
    expect(entry).not.toContain("handleKairosAPI");
  });

  it("loads the same-origin local bridge and retires the CDN compatibility entry", () => {
    expect(index).toContain("executive-local-inference.js");
    expect(bridge).toContain('import("../vendor/webllm-bundle.js")');
    expect(bridge).toContain("KairosLocalInference.run");
    expect(compatibility).toContain('import "./kairos-local-inference-same-origin.js"');
    expect(combined).not.toContain("api.openai.com");
    expect(combined).not.toContain("cdn.jsdelivr.net");
    expect(combined).not.toContain("esm.run");
  });
});
