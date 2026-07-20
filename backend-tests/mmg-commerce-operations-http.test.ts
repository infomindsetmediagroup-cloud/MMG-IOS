import { describe, expect, it, vi } from "vitest";
import { handleMMGCommerceOperationsRequest } from "../server/operations/commerce-operations-http.js";

const dependencies = () => ({
  authenticator: {
    authenticate: vi.fn().mockResolvedValue({
      actorId: "operator-1",
      sessionId: "session-operator-12345678",
      roles: ["mmg-commerce-operator"],
    }),
  },
  allowedOrigins: new Set(["https://kairos.internal"]),
  repository: {
    claimRequest: vi.fn().mockResolvedValue("claimed"),
    completeRequest: vi.fn().mockResolvedValue(undefined),
    failRequest: vi.fn().mockResolvedValue(undefined),
    loadState: vi.fn().mockResolvedValue({
      environment: "staging",
      latestHealth: null,
      latestConsistencyAudit: null,
      rollout: null,
      controls: [],
      openIncidents: [],
      freshE2EPassed: false,
    }),
  },
  metrics: { collect: vi.fn() },
  consistency: { collectFacts: vi.fn() },
  controls: { applyControl: vi.fn(), applyRollout: vi.fn() },
  alerts: { notify: vi.fn() },
  now: () => new Date("2026-07-20T23:00:00.000Z"),
  hashPayload: () => "a".repeat(64),
});

const request = (body: Record<string, unknown>) =>
  new Request("https://kairos.internal/api/internal/commerce/operations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test",
      Origin: "https://kairos.internal",
      "X-MMG-Internal-Request": "test-suite",
    },
    body: JSON.stringify(body),
  });

describe("MMG commerce operations HTTP boundary", () => {
  it("returns a private authenticated inspection response", async () => {
    const response = await handleMMGCommerceOperationsRequest(
      request({
        requestId: "request-inspect-12345678",
        action: "inspect",
        environment: "staging",
      }),
      dependencies() as any,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual(
      expect.objectContaining({ ok: true, status: "inspected" }),
    );
  });

  it("rejects unauthenticated and cross-origin requests", async () => {
    const unauthenticated = dependencies();
    unauthenticated.authenticator.authenticate.mockResolvedValue(null as any);
    const authResponse = await handleMMGCommerceOperationsRequest(
      request({
        requestId: "request-auth-12345678",
        action: "inspect",
        environment: "staging",
      }),
      unauthenticated as any,
    );
    expect(authResponse.status).toBe(403);

    const crossOrigin = new Request(
      "https://kairos.internal/api/internal/commerce/operations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://untrusted.example",
          "X-MMG-Internal-Request": "test-suite",
        },
        body: JSON.stringify({
          requestId: "request-origin-12345678",
          action: "inspect",
          environment: "staging",
        }),
      },
    );
    const originResponse = await handleMMGCommerceOperationsRequest(
      crossOrigin,
      dependencies() as any,
    );
    expect(originResponse.status).toBe(403);
  });

  it("rejects unsupported methods", async () => {
    const response = await handleMMGCommerceOperationsRequest(
      new Request("https://kairos.internal/api/internal/commerce/operations"),
      dependencies() as any,
    );
    expect(response.status).toBe(405);
  });
});
