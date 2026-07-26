// @ts-nocheck
import { describe, expect, it } from "vitest";
import { handleKairosOperationsHealth } from "../cloudflare/mmg-ios/src/kairos-operations-health-v1.js";
import { handleKairosObservabilityAPI, handleKairosObservabilityObjectRequest, recordKairosObservabilityEvent } from "../cloudflare/mmg-ios/src/kairos-observability-store-v1.js";

function storage() { const map = new Map(); return { async get(key){ return map.get(key); }, async put(key, value){ map.set(key, value); }, map }; }
function env(state, overrides = {}) {
  const stub = { fetch: (request) => handleKairosObservabilityObjectRequest(state, request) };
  return {
    KAIROS_API_ACCESS_TOKEN: "service-secret",
    KAIROS_PROJECTS: { idFromName: () => "registry", get: () => stub },
    KAIROS_MODEL_PROVIDER: "openai",
    OPENAI_API_KEY: "secret",
    KAIROS_MODEL_NAME: "gpt-test",
    SHOPIFY_SHOP_DOMAIN: "example.myshopify.com",
    SHOPIFY_ADMIN_ACCESS_TOKEN: "shopify-secret",
    SHOPIFY_ADMIN_API_VERSION: "2026-07",
    SHOPIFY_ADMIN_SCOPES: "read_products,write_products",
    ...overrides,
  };
}
function get(path) { return new Request(`https://kairos.test${path}`, { headers: { authorization: "Bearer service-secret" } }); }

describe("Kairos operations health", () => {
  it("reports bounded dependency configuration without exposing credentials", async () => {
    const state = { storage: storage() };
    const response = await handleKairosOperationsHealth(get("/api/kairos/operations/health"), env(state));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.dependencies.durableObjects.status).toBe("available");
    expect(body.dependencies.knowledgeVault.status).toBe("available");
    expect(body.dependencies.shopify.configured).toBe(true);
    expect(body.dependencies.modelProvider).toMatchObject({ provider: "openai", configured: true });
    expect(JSON.stringify(body)).not.toContain("shopify-secret");
    expect(JSON.stringify(body)).not.toContain("secret\"");
  });
});

describe("Kairos aggregate metrics", () => {
  it("returns bounded counters, latency, and alert conditions from sanitized events", async () => {
    const state = { storage: storage() };
    const runtimeEnv = env(state);
    await recordKairosObservabilityEvent(runtimeEnv, { requestId: "req-1", phase: "response_completed", outcome: "success", durationMs: 100 });
    await recordKairosObservabilityEvent(runtimeEnv, { requestId: "req-2", approvalId: "kap-1", phase: "verification_completed", outcome: "failure", verificationPassed: false, durationMs: 300 });
    const response = await handleKairosObservabilityAPI(get("/api/kairos/operations/metrics"), runtimeEnv);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totals).toMatchObject({ events: 2, uniqueRequests: 2, uniqueApprovals: 1, failures: 1, verificationFailures: 1 });
    expect(body.latencyMs).toMatchObject({ average: 200, p50: 100, p95: 300, max: 300 });
    expect(body.alerts).toContainEqual(expect.objectContaining({ code: "VERIFICATION_FAILURES_PRESENT", severity: "critical", count: 1 }));
  });
});
