import { describe, expect, it, vi } from "vitest";
import { handleMMGCommerceStagingRehearsalAdapterRequest } from "../server/operations/commerce-staging-rehearsal-adapter-http.js";

const dependencies = () => ({
  authenticator: {
    authenticate: vi.fn().mockResolvedValue({
      actorId: "rehearsal-adapter-1",
      roles: ["mmg-commerce-rehearsal-adapter"],
    }),
  },
  executor: {
    bootstrapSafeState: vi.fn().mockResolvedValue(undefined),
    setScenario: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(),
    recoverScenario: vi.fn(),
    runConsistencyAudit: vi.fn(),
    grantStageApproval: vi.fn(),
    advanceObservation: vi.fn(),
    advanceRollout: vi.fn(),
    readRightsDigest: vi.fn(),
    teardown: vi.fn(),
  },
  allowedOrigins: new Set(["https://staging.example.com"]),
});

const request = (body: Record<string, unknown>) =>
  new Request(
    "https://staging.example.com/api/internal/commerce/rehearsal/adapter",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        Origin: "https://staging.example.com",
        "Content-Type": "application/json",
        "X-MMG-Internal-Request": "test-suite",
      },
      body: JSON.stringify({
        runId: "rehearsal-run-12345678",
        releaseId: "release-staging-12345678",
        environment: "staging",
        publicationAllowed: false,
        liveCustomerDataAllowed: false,
        occurredAt: "2026-07-21T00:00:00.000Z",
        ...body,
      }),
    },
  );

describe("MMG staging rehearsal adapter HTTP boundary", () => {
  it("injects only an approved synthetic scenario", async () => {
    const deps = dependencies();
    const response = await handleMMGCommerceStagingRehearsalAdapterRequest(
      request({
        action: "inject_scenario",
        scenario: "database_connectivity_sev1",
      }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(deps.executor.setScenario).toHaveBeenCalledWith(
      expect.objectContaining({ scenario: "database_connectivity_sev1" }),
    );
  });

  it("rejects production, publication, and live-customer access", async () => {
    const production = await handleMMGCommerceStagingRehearsalAdapterRequest(
      request({ action: "bootstrap_safe_state", environment: "production" }),
      dependencies(),
    );
    expect(production.status).toBe(409);

    const publication = await handleMMGCommerceStagingRehearsalAdapterRequest(
      request({ action: "bootstrap_safe_state", publicationAllowed: true }),
      dependencies(),
    );
    expect(publication.status).toBe(409);

    const customer = await handleMMGCommerceStagingRehearsalAdapterRequest(
      request({ action: "bootstrap_safe_state", liveCustomerDataAllowed: true }),
      dependencies(),
    );
    expect(customer.status).toBe(409);
  });
});
