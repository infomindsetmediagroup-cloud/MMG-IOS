import { describe, expect, it } from "vitest";
import { buildMMGCommerceConsistencyAudit } from "../server/operations/commerce-consistency-audit.js";

const emptyFacts = {
  billingCycleOverdrawCount: 0,
  windowOverdrawCount: 0,
  duplicateActiveOwnershipCount: 0,
  orphanDeliveryGrantCount: 0,
  deliveredWindowWithoutOwnershipCount: 0,
  ownershipWithoutAssetCount: 0,
  stuckWindowCount: 0,
  unresolvedWebhookFailureCount: 0,
};

describe("MMG commerce consistency audit", () => {
  it("passes only when every governed relationship is consistent", () => {
    const audit = buildMMGCommerceConsistencyAudit({
      auditId: "audit:staging:12345678",
      environment: "staging",
      facts: emptyFacts,
      startedAt: new Date("2026-07-20T23:00:00.000Z"),
      completedAt: new Date("2026-07-20T23:01:00.000Z"),
    });
    expect(audit.status).toBe("passed");
    expect(audit.checks.every((check) => check.status === "passed")).toBe(true);
  });

  it("classifies ownership conflicts as SEV1 and forbids destructive repair", () => {
    const audit = buildMMGCommerceConsistencyAudit({
      auditId: "audit:production:12345678",
      environment: "production",
      facts: { ...emptyFacts, duplicateActiveOwnershipCount: 1 },
      startedAt: new Date("2026-07-20T23:00:00.000Z"),
      completedAt: new Date("2026-07-20T23:01:00.000Z"),
    });
    expect(audit.status).toBe("failed");
    expect(
      audit.checks.find((check) => check.code === "ACTIVE_OWNERSHIP_UNIQUENESS"),
    ).toEqual(
      expect.objectContaining({
        status: "failed",
        severity: "SEV1",
        repairMode: "manual_reconciliation_required",
      }),
    );
    expect(audit.destructiveRepairAllowed).toBe(false);
    expect(audit.deliveredOwnershipRevocationAllowed).toBe(false);
  });
});
