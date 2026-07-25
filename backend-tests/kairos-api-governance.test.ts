// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import { handleGovernedKairosAPI, handleKairosAPIGovernanceObjectRequest } from "../cloudflare/mmg-ios/src/kairos-api-governance-v1.js";

function createStorage() {
  const values = new Map();
  return {
    async get(key) { return values.get(key); },
    async put(key, value) { values.set(key, value); },
    async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key); },
    values,
  };
}

function createEnv(storage, overrides = {}) {
  const stub = {
    fetch(request) {
      return handleKairosAPIGovernanceObjectRequest({ storage }, request);
    },
  };
  return {
    KAIROS_API_AUTH_MODE: "access-or-token",
    KAIROS_API_ACCESS_TOKEN: "test-service-token",
    KAIROS_API_RATE_LIMIT: "2",
    KAIROS_API_RATE_WINDOW_SECONDS: "60",
    KAIROS_API_AUDIT_RETENTION: "50",
    KAIROS_PROJECTS: {
      idFromName: () => "registry-id",
      get: () => stub,
    },
    ...overrides,
  };
}

const handler = vi.fn(async () => new Response(JSON.stringify({ success: true }), {
  status: 200,
  headers: { "content-type": "application/json" },
}));

describe("Kairos API governance", () => {
  it("rejects anonymous access before provider execution", async () => {
    const storage = createStorage();
    handler.mockClear();
    const response = await handleGovernedKairosAPI(new Request("https://kairos.test/api/kairos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objective: "Analyze this." }),
    }), createEnv(storage), handler);
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
  });

  it("accepts a matching Worker-secret service token", async () => {
    const storage = createStorage();
    handler.mockClear();
    const response = await handleGovernedKairosAPI(new Request("https://kairos.test/api/kairos", {
      method: "POST",
      headers: { authorization: "Bearer test-service-token", "content-type": "application/json" },
      body: JSON.stringify({ objective: "Analyze this." }),
    }), createEnv(storage), handler);
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(response.headers.get("x-kairos-authenticated-identity")).toBe("service-token");
  });

  it("accepts Cloudflare Access identity", async () => {
    const storage = createStorage();
    handler.mockClear();
    const response = await handleGovernedKairosAPI(new Request("https://kairos.test/api/kairos", {
      method: "POST",
      headers: { "cf-access-authenticated-user-email": "owner@example.com", "content-type": "application/json" },
      body: JSON.stringify({ objective: "Analyze this." }),
    }), createEnv(storage), handler);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-kairos-authenticated-identity")).toBe("owner@example.com");
  });

  it("rate limits repeated requests and persists audit records", async () => {
    const storage = createStorage();
    handler.mockClear();
    const env = createEnv(storage);
    const makeRequest = () => new Request("https://kairos.test/api/kairos", {
      method: "POST",
      headers: { authorization: "Bearer test-service-token", "content-type": "application/json" },
      body: JSON.stringify({ objective: "Analyze this." }),
    });
    expect((await handleGovernedKairosAPI(makeRequest(), env, handler)).status).toBe(200);
    expect((await handleGovernedKairosAPI(makeRequest(), env, handler)).status).toBe(200);
    const limited = await handleGovernedKairosAPI(makeRequest(), env, handler);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    const auditIndex = storage.values.get("kairos-api-audit:index");
    expect(Array.isArray(auditIndex)).toBe(true);
    expect(auditIndex.length).toBeGreaterThan(0);
  });
});
