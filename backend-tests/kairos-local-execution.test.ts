import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const canonical = readFileSync(new URL("../cloudflare/mmg-ios/src/kairos-production-entry-local-canonical-v1.js", import.meta.url), "utf8");
const guard = readFileSync(new URL("../cloudflare/mmg-ios/src/kairos-production-entry-local-only-v1.js", import.meta.url), "utf8");
const entry = readFileSync(new URL("../cloudflare/mmg-ios/src/kairos-production-entry-local-execution-v1.js", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../cloudflare/mmg-ios/wrangler.toml", import.meta.url), "utf8");
const index = readFileSync(new URL("../web/kairos-dashboard/index.html", import.meta.url), "utf8");
const loader = readFileSync(new URL("../web/kairos-dashboard/scripts/kairos-runtime-loader.js", import.meta.url), "utf8");
const legacy = readFileSync(new URL("../web/kairos-dashboard/scripts/legacy-runtime-loader.js", import.meta.url), "utf8");
const commandHub = readFileSync(new URL("../web/kairos-dashboard/scripts/command-hub.js", import.meta.url), "utf8");
const bridge = readFileSync(new URL("../web/kairos-dashboard/scripts/executive-local-inference.js", import.meta.url), "utf8");
const compatibility = readFileSync(new URL("../web/kairos-dashboard/scripts/kairos-local-inference.js", import.meta.url), "utf8");
const postIntakeGuard = readFileSync(new URL("../web/kairos-dashboard/scripts/manuscript-post-intake-guard.js", import.meta.url), "utf8");

const combined = `${canonical}\n${guard}\n${entry}\n${wrangler}\n${index}\n${loader}\n${legacy}\n${commandHub}\n${bridge}\n${compatibility}\n${postIntakeGuard}`;

describe("Kairos local operational execution", () => {
  it("uses the canonical provider-firewalled entry and no-cost browser inference policy", () => {
    expect(wrangler).toContain('main = "src/kairos-production-entry-local-canonical-v1.js"');
    expect(wrangler).toContain('KAIROS_MODEL_PROVIDER = "browser-webgpu"');
    expect(wrangler).toContain('KAIROS_NO_COST_MODE = "true"');
    expect(wrangler).toContain('KAIROS_LOCAL_INFERENCE_ENABLED = "true"');
    expect(wrangler).toContain('KAIROS_MANUSCRIPT_START_MODE = "local-browser"');
    expect(canonical).toContain("providerBlockedEnv");
    expect(canonical).toContain('property === "OPENAI_API_KEY"');
    expect(canonical).toContain('return ""');
    expect(canonical).toContain("kairos-local-readiness-sentinel-not-a-provider-key");
    expect(canonical).toContain('X-Kairos-OpenAI-Calls", "disabled"');
  });

  it("limits the readiness sentinel to non-generative objective and workflow projection routes", () => {
    expect(canonical).toContain('"/api/hub/run"');
    expect(canonical).toContain('"/api/workflows"');
    expect(canonical).toContain("PROVIDER_INDEPENDENT_OPERATIONAL_PATHS.has(url.pathname)");
    expect(canonical).toContain("operationalCompatibilityEnv(env)");
    expect(canonical).toContain("providerBlockedEnv(env)");
    expect(canonical).not.toContain("handleKairosAPI");
    expect(canonical).not.toContain("api.openai.com");
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

  it("restores the five-center dashboard while retaining same-origin local inference", () => {
    const moduleSources = [...index.matchAll(/<script type="module" src="([^"]+)"/g)]
      .map((match) => match[1].replace(/\?v=.*$/, ""));
    expect(moduleSources).toEqual([
      "./scripts/safari-manuscript-intake-compat.js",
      "./scripts/command-hub.js",
      "./scripts/command-center-layout.js",
      "./scripts/manuscript-production-flow-bootstrap.js",
    ]);
    expect(index).toContain("kairos-five-center-dashboard-post-intake-20260731-1");
    expect(index).toContain("five-center-dashboard-post-intake-stability-20260731-1");
    expect(index).toContain("manuscript-post-intake-guard.js");
    expect(index).toContain("legacy-runtime-loader.js");
    expect(index).not.toContain("kairos-runtime-loader.js");
    expect(index).not.toContain("executive-local-inference.js");
    expect(loader).toContain('import "./legacy-runtime-loader.js"');
    expect(loader).not.toContain("executive-local-inference.js");
    expect(legacy).toContain("commandHubMode");
    expect(legacy).toContain('"command-hub.js"');
    expect(legacy).toContain('"manuscript-post-intake-guard.js"');
    expect((commandHub.match(/id: "(?:knowledge|content|business|customers|operations)"/g) || []).length).toBe(5);
    expect(commandHub).toContain("Five operating centers");
    expect(bridge).toContain('const EXECUTION_MODE = "browser-webgpu"');
    expect(bridge).toContain('import("../vendor/webllm-bundle.js")');
    expect(bridge).toContain("KairosLocalInference.run");
    expect(compatibility).toContain('const RELEASE = "kairos-local-inference-20260731-5-state-recovery"');
    expect(compatibility).toContain('await import(`./kairos-local-inference-same-origin.js?v=${RELEASE}`)');
    expect(postIntakeGuard).toContain("duplicate Manuscript Studio module blocked");
    expect(postIntakeGuard).toContain("success-overlay-restored");
    expect(combined).not.toContain("api.openai.com");
    expect(combined).not.toContain("cdn.jsdelivr.net");
    expect(combined).not.toContain("esm.run");
  });
});
