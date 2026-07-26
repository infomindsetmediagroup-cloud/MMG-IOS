// @ts-nocheck
import { describe, expect, it } from "vitest";
import { observeKairosResponse, withKairosObservabilityStart } from "../cloudflare/mmg-ios/src/kairos-observability-runtime-v1.js";
import { handleKairosObservabilityObjectRequest } from "../cloudflare/mmg-ios/src/kairos-observability-store-v1.js";
import fs from "node:fs";

function storage() { const map = new Map(); return { async get(k){ return map.get(k); }, async put(k,v){ map.set(k,v); }, map }; }
function env(state) { return { KAIROS_PROJECTS: { idFromName: () => "registry", get: () => ({ fetch: (request) => handleKairosObservabilityObjectRequest(state, request) }) } }; }

describe("Kairos runtime observability", () => {
  it("adds stable request correlation headers", () => {
    const request = withKairosObservabilityStart(new Request("https://kairos.test/api/kairos", { method: "POST" }));
    expect(request.headers.get("X-Kairos-Request-Id")).toBeTruthy();
    expect(request.headers.get("X-Kairos-Started-At")).toBeTruthy();
  });

  it("records response, approval, execution, and verification events", async () => {
    const state = { storage: storage() };
    const runtimeEnv = env(state);
    const request = withKairosObservabilityStart(new Request("https://kairos.test/api/kairos/tools/continue", { method: "POST" }));
    const response = new Response(JSON.stringify({
      success: true,
      status: "completed",
      approvalId: "kap_test",
      tool: "shopify.product.update",
      verification: { verified: true },
    }), { status: 200, headers: { "content-type": "application/json" } });

    const observed = await observeKairosResponse(request, response, runtimeEnv);
    expect(observed.headers.get("X-Kairos-Observability-Runtime")).toBeTruthy();
    const events = state.storage.map.get("kairos-observability:events");
    expect(events.map((item) => item.phase)).toEqual(expect.arrayContaining([
      "response_completed",
      "approval_consumed",
      "tool_execution_completed",
      "verification_completed",
    ]));
  });

  it("wires the store and runtime into the canonical production entry", () => {
    const source = fs.readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-local-inference-v1.js", "utf8");
    expect(source).toContain("handleKairosObservabilityObjectRequest");
    expect(source).toContain("handleKairosObservabilityAPI");
    expect(source).toContain("observeKairosResponse");
    expect(source).toContain("withKairosObservabilityStart");
  });
});
