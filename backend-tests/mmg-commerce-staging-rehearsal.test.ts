import { describe, expect, it, vi } from "vitest";
import { runMMGCommerceStagingRehearsal } from "../server/operations/commerce-staging-rehearsal.js";
import type { MMGCommerceOperationsState } from "../server/operations/commerce-operations-service.js";

const releaseId = "release-staging-12345678";
const digest = "a".repeat(64);

const state = (
  stage: MMGCommerceOperationsState["rollout"] extends infer R
    ? R extends { stage: infer S }
      ? S
      : never
    : never,
  severity?: "SEV1" | "SEV2",
): MMGCommerceOperationsState => ({
  environment: "staging",
  latestHealth: {
    schemaVersion: "1.0.0",
    environment: "staging",
    runId: "monitor:staging:12345678",
    releaseId,
    overallStatus: severity ? "critical" : "healthy",
    evaluatedAt: "2026-07-21T00:00:00.000Z",
    signals: [],
  },
  latestConsistencyAudit: null,
  rollout: {
    environment: "staging",
    releaseId,
    stage,
    cohortPercentage:
      stage === "pilot" ? 5 : stage === "limited" ? 25 : stage === "expanded" ? 50 : stage === "full" ? 100 : 0,
    enteredAt: "2026-07-21T00:00:00.000Z",
    observationUntil: null,
    version: 1,
    status: stage === "paused" ? "paused" : "active",
  },
  controls: [
    {
      control: "subscription_checkout",
      mode: "disabled",
      version: 1,
      reason: "rehearsal",
      changedAt: "2026-07-21T00:00:00.000Z",
    },
    {
      control: "webhook_ingestion",
      mode: "enabled",
      version: 1,
      reason: "rehearsal",
      changedAt: "2026-07-21T00:00:00.000Z",
    },
    {
      control: "delivery_scheduler",
      mode: "disabled",
      version: 1,
      reason: "rehearsal",
      changedAt: "2026-07-21T00:00:00.000Z",
    },
    {
      control: "delivery_dispatcher",
      mode: severity === "SEV1" ? "drain_only" : "disabled",
      version: 1,
      reason: "rehearsal",
      changedAt: "2026-07-21T00:00:00.000Z",
    },
  ],
  openIncidents: severity
    ? [
        {
          incidentId: `incident:staging:${severity.toLowerCase()}`,
          environment: "staging",
          signalCode:
            severity === "SEV1"
              ? "database_connectivity_ratio"
              : "webhook_delivery_failure_rate",
          severity,
          state: "detected",
          title: severity,
          summary: "Synthetic staging fixture.",
          firstSeenAt: "2026-07-21T00:00:00.000Z",
          lastSeenAt: "2026-07-21T00:00:00.000Z",
          version: 1,
        },
      ]
    : [],
  freshE2EPassed: true,
});

const build = (finalDigest = digest) => {
  let scenario: "database_connectivity_sev1" | "webhook_failure_sev2" | null = null;
  let stage: any = "paused";
  let clock = new Date("2026-07-21T00:00:00.000Z");
  let rightsReads = 0;
  const gateway = {
    bootstrapSafeState: vi.fn().mockResolvedValue(undefined),
    injectScenario: vi.fn().mockImplementation(async ({ scenario: next }) => {
      scenario = next;
    }),
    clearScenario: vi.fn().mockImplementation(async () => {
      scenario = null;
    }),
    evaluate: vi.fn().mockImplementation(async () =>
      state(
        "paused",
        scenario === "database_connectivity_sev1"
          ? "SEV1"
          : scenario === "webhook_failure_sev2"
            ? "SEV2"
            : undefined,
      ),
    ),
    recoverScenario: vi.fn().mockResolvedValue(state("paused")),
    runConsistencyAudit: vi.fn().mockResolvedValue({ passed: true, failedChecks: [] }),
    grantStageApproval: vi.fn().mockResolvedValue(undefined),
    advanceObservation: vi.fn().mockImplementation(async ({ hours }) => {
      clock = new Date(clock.getTime() + hours * 3_600_000);
      return clock;
    }),
    advanceRollout: vi.fn().mockImplementation(async ({ targetStage }) => {
      stage = targetStage;
      return state(stage);
    }),
    readRightsDigest: vi.fn().mockImplementation(async () => {
      rightsReads += 1;
      return {
        activeOwnershipCount: 2,
        activeDeliveryGrantCount: 2,
        deliveredWindowCount: 1,
        activeEntitlementCount: 1,
        digestSha256: rightsReads === 1 ? digest : finalDigest,
      };
    }),
    teardown: vi.fn().mockResolvedValue(undefined),
  };
  const repository = {
    claim: vi.fn().mockResolvedValue("claimed" as const),
    appendCheck: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
  return { gateway, repository };
};

describe("MMG staging commerce rehearsal", () => {
  it("passes the SEV1, SEV2, consistency, rollout, and rights-preservation sequence", async () => {
    const { gateway, repository } = build();
    const evidence = await runMMGCommerceStagingRehearsal({
      runId: "rehearsal-run-12345678",
      releaseId,
      gateway,
      repository,
      now: () => new Date("2026-07-21T00:00:00.000Z"),
    });
    expect(evidence.status).toBe("passed");
    expect(evidence.rolloutStages).toEqual([
      "paused",
      "internal",
      "pilot",
      "limited",
      "expanded",
      "full",
    ]);
    expect(evidence.publicationAttempted).toBe(false);
    expect(evidence.liveCustomerDataUsed).toBe(false);
    expect(repository.complete).toHaveBeenCalled();
    expect(gateway.teardown).toHaveBeenCalled();
    expect(
      evidence.checks.find((entry) => entry.code === "CUSTOMER_RIGHTS_PRESERVED")?.status,
    ).toBe("passed");
  });

  it("fails closed when the customer-rights digest changes", async () => {
    const { gateway, repository } = build("b".repeat(64));
    await expect(
      runMMGCommerceStagingRehearsal({
        runId: "rehearsal-rights-12345678",
        releaseId,
        gateway,
        repository,
        now: () => new Date("2026-07-21T00:00:00.000Z"),
      }),
    ).rejects.toThrow("CUSTOMER_RIGHTS_PRESERVED");
    expect(repository.fail).toHaveBeenCalled();
    expect(repository.complete).not.toHaveBeenCalled();
    expect(gateway.teardown).toHaveBeenCalled();
  });
});
