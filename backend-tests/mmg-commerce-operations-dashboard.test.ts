import { describe, expect, it, vi } from "vitest";
import { buildMMGCommerceOperationsDashboard } from "../server/operations/commerce-operations-dashboard.js";
import { handleMMGCommerceOperationsDashboardRequest } from "../server/operations/commerce-operations-dashboard-http.js";

const now = new Date("2026-07-20T23:00:00.000Z");

const repository = {
  loadState: vi.fn().mockResolvedValue({
    environment: "production",
    latestHealth: {
      schemaVersion: "1.0.0",
      environment: "production",
      runId: "monitor:production:12345678",
      releaseId: "release-production-12345678",
      overallStatus: "degraded",
      evaluatedAt: now.toISOString(),
      signals: [
        {
          code: "webhook_delivery_failure_rate",
          status: "degraded",
          severity: "SEV3",
          value: 0.03,
          unit: "ratio",
          sampleSize: 100,
          observedAt: now.toISOString(),
          title: "Shopify subscription webhook failures",
          reasonCode: "WARNING_THRESHOLD_BREACHED",
        },
      ],
    },
    latestConsistencyAudit: {
      schemaVersion: "1.0.0",
      auditId: "audit:production:12345678",
      environment: "production",
      releaseId: "release-production-12345678",
      status: "passed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString(),
      checks: [],
      destructiveRepairAllowed: false,
      deliveredOwnershipRevocationAllowed: false,
    },
    rollout: {
      environment: "production",
      releaseId: "release-production-12345678",
      stage: "pilot",
      cohortPercentage: 5,
      enteredAt: now.toISOString(),
      observationUntil: null,
      version: 2,
      status: "active",
    },
    controls: [],
    openIncidents: [],
    freshE2EPassed: true,
  }),
};

describe("MMG commerce operations dashboard", () => {
  it("returns a private customer-free operator view", async () => {
    const dashboard = await buildMMGCommerceOperationsDashboard({
      environment: "production",
      principal: {
        actorId: "operator-1",
        sessionId: "session-operator-12345678",
        roles: ["mmg-commerce-operator"],
      },
      repository: repository as any,
      generatedAt: now,
    });
    expect(dashboard.health.status).toBe("degraded");
    expect(dashboard.rollout.stage).toBe("pilot");
    expect(dashboard.mutationsAvailableInBrowser).toBe(false);
    expect(JSON.stringify(dashboard)).not.toContain("customerId");
  });

  it("requires an authenticated operator session over GET", async () => {
    const response = await handleMMGCommerceOperationsDashboardRequest(
      new Request(
        "https://kairos.internal/api/admin/commerce/operations?environment=production",
      ),
      {
        authenticator: {
          authenticate: vi.fn().mockResolvedValue({
            actorId: "operator-1",
            sessionId: "session-operator-12345678",
            roles: ["mmg-commerce-operator"],
          }),
        },
        repository: repository as any,
        now: () => now,
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual(
      expect.objectContaining({ ok: true }),
    );
  });
});
