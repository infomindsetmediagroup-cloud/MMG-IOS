import { describe, expect, it, vi } from "vitest";
import { handleMMGCommerceStagingRehearsalRequest } from "../server/operations/commerce-staging-rehearsal-http.js";

const dependencies = () => ({
  authenticator: {
    authenticate: vi.fn().mockResolvedValue({
      actorId: "rehearsal-operator-1",
      roles: ["mmg-commerce-rehearsal-operator"],
    }),
  },
  gateway: {},
  repository: {},
  allowedOrigins: new Set(["https://staging.example.com"]),
  now: () => new Date("2026-07-21T00:00:00.000Z"),
});

const request = (body: Record<string, unknown>) =>
  new Request("https://staging.example.com/api/internal/commerce/rehearsal", {
    method: "POST",
    headers: {
      Authorization: "Bearer test",
      Origin: "https://staging.example.com",
      "Content-Type": "application/json",
      "X-MMG-Internal-Request": "test-suite",
    },
    body: JSON.stringify(body),
  });

describe("MMG staging rehearsal HTTP boundary", () => {
  it("rejects production and publication-capable requests before execution", async () => {
    const production = await handleMMGCommerceStagingRehearsalRequest(
      request({
        runId: "rehearsal-run-12345678",
        releaseId: "release-staging-12345678",
        environment: "production",
        publicationAllowed: false,
        liveCustomerDataAllowed: false,
      }),
      dependencies() as any,
    );
    expect(production.status).toBe(400);
    expect(await production.json()).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: "MMG_REHEARSAL_STAGING_ONLY" }),
      }),
    );

    const publication = await handleMMGCommerceStagingRehearsalRequest(
      request({
        runId: "rehearsal-run-12345679",
        releaseId: "release-staging-12345678",
        environment: "staging",
        publicationAllowed: true,
        liveCustomerDataAllowed: false,
      }),
      dependencies() as any,
    );
    expect(publication.status).toBe(400);
  });

  it("requires authentication, role, origin, and POST", async () => {
    const unauthenticated = dependencies();
    unauthenticated.authenticator.authenticate.mockResolvedValue(null as any);
    const authResponse = await handleMMGCommerceStagingRehearsalRequest(
      request({
        runId: "rehearsal-run-12345678",
        releaseId: "release-staging-12345678",
        environment: "staging",
      }),
      unauthenticated as any,
    );
    expect(authResponse.status).toBe(403);

    const methodResponse = await handleMMGCommerceStagingRehearsalRequest(
      new Request("https://staging.example.com/api/internal/commerce/rehearsal"),
      dependencies() as any,
    );
    expect(methodResponse.status).toBe(405);
  });
});
