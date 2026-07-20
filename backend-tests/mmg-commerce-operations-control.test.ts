import { describe, expect, it } from "vitest";
import {
  buildMMGCommerceHealthSnapshot,
  deriveMMGCommerceMitigationPlan,
  evaluateMMGCommerceHealthMetric,
  evaluateMMGCommerceRolloutTransition,
  MMG_SAFE_INITIAL_CONTROLS,
} from "../server/operations/commerce-operations-control.js";

const observedAt = "2026-07-20T23:00:00.000Z";

describe("MMG commerce operations control", () => {
  it("classifies warning and critical health without treating missing evidence as healthy", () => {
    expect(
      evaluateMMGCommerceHealthMetric({
        code: "webhook_delivery_failure_rate",
        value: 0.03,
        unit: "ratio",
        sampleSize: 100,
        windowSeconds: 900,
        observedAt,
      }).status,
    ).toBe("degraded");
    const critical = evaluateMMGCommerceHealthMetric({
      code: "database_connectivity_ratio",
      value: 0.9,
      unit: "ratio",
      sampleSize: 10,
      windowSeconds: 900,
      observedAt,
    });
    expect(critical.status).toBe("critical");
    expect(critical.severity).toBe("SEV1");
    expect(
      evaluateMMGCommerceHealthMetric({
        code: "dispatcher_failure_rate",
        value: 0,
        unit: "ratio",
        sampleSize: 2,
        windowSeconds: 900,
        observedAt,
      }).status,
    ).toBe("unknown");
  });

  it("makes a snapshot critical when any signal is critical", () => {
    const snapshot = buildMMGCommerceHealthSnapshot({
      environment: "staging",
      runId: "monitor:staging:12345678",
      metrics: [
        {
          code: "database_connectivity_ratio",
          value: 1,
          unit: "ratio",
          sampleSize: 10,
          windowSeconds: 900,
          observedAt,
        },
        {
          code: "ownership_duplicate_conflict_count",
          value: 1,
          unit: "count",
          sampleSize: 1,
          windowSeconds: 900,
          observedAt,
        },
      ],
      evaluatedAt: new Date(observedAt),
    });
    expect(snapshot.overallStatus).toBe("critical");
    expect(snapshot.signals[1].severity).toBe("SEV1");
  });

  it("derives reversible containment and preserves customer rights", () => {
    const signal = evaluateMMGCommerceHealthMetric({
      code: "entitlement_consistency_failure_count",
      value: 3,
      unit: "count",
      sampleSize: 1,
      windowSeconds: 900,
      observedAt,
    });
    const plan = deriveMMGCommerceMitigationPlan(signal);
    expect(plan?.pauseRollout).toBe(true);
    expect(plan?.controlChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ control: "subscription_checkout", mode: "disabled" }),
        expect.objectContaining({ control: "delivery_scheduler", mode: "disabled" }),
        expect.objectContaining({ control: "delivery_dispatcher", mode: "drain_only" }),
      ]),
    );
    expect(plan?.destructiveDataActionAllowed).toBe(false);
    expect(plan?.revokeDeliveredOwnershipAllowed).toBe(false);
    expect(MMG_SAFE_INITIAL_CONTROLS.webhook_ingestion).toBe("enabled");
  });

  it("enforces staged rollout gates", () => {
    const blocked = evaluateMMGCommerceRolloutTransition({
      currentStage: "pilot",
      targetStage: "expanded",
      observedHours: 100,
      openSev1Count: 0,
      openSev2Count: 0,
      latestHealthStatus: "healthy",
      consistencyAuditPassed: true,
      freshE2EPassed: true,
      executiveApprovalPresent: true,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockers).toContain("ROLLOUT_STAGE_SKIP_FORBIDDEN");

    const allowed = evaluateMMGCommerceRolloutTransition({
      currentStage: "limited",
      targetStage: "expanded",
      observedHours: 72,
      openSev1Count: 0,
      openSev2Count: 0,
      latestHealthStatus: "healthy",
      consistencyAuditPassed: true,
      freshE2EPassed: true,
      executiveApprovalPresent: true,
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.targetPercentage).toBe(50);
  });
});
