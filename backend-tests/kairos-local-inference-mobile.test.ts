import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../web/kairos-dashboard/scripts/kairos-local-inference.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../web/kairos-dashboard/index.html", import.meta.url), "utf8");

describe("Kairos mobile local inference loader", () => {
  it("pins WebLLM and provides independent CDN recovery paths", () => {
    expect(source).toContain('const WEBLLM_VERSION = "0.2.84"');
    expect(source).toContain("cdn.jsdelivr.net/npm/@mlc-ai/web-llm@");
    expect(source).toContain("esm.run/@mlc-ai/web-llm@");
    expect(source).toContain("All local inference runtime sources failed");
  });

  it("uses Safari-compatible durable caching and GPU-aware compact model selection", () => {
    expect(source).toContain('cacheBackend: "indexeddb"');
    expect(source).toContain('adapter.features?.has?.("shader-f16")');
    expect(source).toContain("Qwen2.5-0.5B-Instruct-q4f16_1-MLC");
    expect(source).toContain("Qwen2.5-0.5B-Instruct-q4f32_1-MLC");
    expect(source).toContain("Compatible model attempts failed");
  });

  it("does not expose raw Safari Load failed errors to the executive", () => {
    expect(source).toContain("Safari could not download the local AI runtime or model");
    expect(source).toContain("Your manuscript and cover remain saved");
    expect(source).toContain("getDiagnostics");
  });

  it("cache-busts the corrected loader in the production dashboard", () => {
    expect(index).toContain("kairos-local-inference-mobile-resilient-20260723-2");
    expect(index).toContain("kairos-command-hub-abos-v2-mobile-inference-20260723-2");
  });
});
