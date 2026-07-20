import type { MMGCommerceOperationsEnvironment } from "./commerce-operations-control.js";

export type MMGCommerceConsistencyCheckCode =
  | "BILLING_CYCLE_CAPACITY"
  | "WINDOW_CAPACITY"
  | "ACTIVE_OWNERSHIP_UNIQUENESS"
  | "DELIVERY_GRANT_REFERENTIAL_INTEGRITY"
  | "DELIVERED_WINDOW_OWNERSHIP_COMPLETENESS"
  | "OWNERSHIP_ASSET_INTEGRITY"
  | "DELIVERY_WINDOW_PROGRESS"
  | "WEBHOOK_RECONCILIATION_COMPLETENESS";

export interface MMGCommerceConsistencyFacts {
  billingCycleOverdrawCount: number;
  windowOverdrawCount: number;
  duplicateActiveOwnershipCount: number;
  orphanDeliveryGrantCount: number;
  deliveredWindowWithoutOwnershipCount: number;
  ownershipWithoutAssetCount: number;
  stuckWindowCount: number;
  unresolvedWebhookFailureCount: number;
}

export interface MMGCommerceConsistencyCheck {
  code: MMGCommerceConsistencyCheckCode;
  status: "passed" | "failed";
  failureCount: number;
  severity: "SEV1" | "SEV2" | null;
  repairMode: "none" | "forward_repair_required" | "manual_reconciliation_required";
}

export interface MMGCommerceConsistencyAudit {
  schemaVersion: "1.0.0";
  auditId: string;
  environment: MMGCommerceOperationsEnvironment;
  releaseId: string | null;
  status: "passed" | "failed";
  startedAt: string;
  completedAt: string;
  checks: MMGCommerceConsistencyCheck[];
  destructiveRepairAllowed: false;
  deliveredOwnershipRevocationAllowed: false;
}

const count = (value: number): number => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("MMG_CONSISTENCY_FACT_INVALID");
  }
  return value;
};

const check = (
  code: MMGCommerceConsistencyCheckCode,
  failureCount: number,
  severity: "SEV1" | "SEV2",
  repairMode: MMGCommerceConsistencyCheck["repairMode"],
): MMGCommerceConsistencyCheck => ({
  code,
  status: failureCount === 0 ? "passed" : "failed",
  failureCount,
  severity: failureCount === 0 ? null : severity,
  repairMode: failureCount === 0 ? "none" : repairMode,
});

export const buildMMGCommerceConsistencyAudit = (input: {
  auditId: string;
  environment: MMGCommerceOperationsEnvironment;
  releaseId?: string | null;
  facts: MMGCommerceConsistencyFacts;
  startedAt: Date;
  completedAt: Date;
}): MMGCommerceConsistencyAudit => {
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(input.auditId)) {
    throw new Error("MMG_CONSISTENCY_AUDIT_ID_INVALID");
  }
  if (input.completedAt.getTime() < input.startedAt.getTime()) {
    throw new Error("MMG_CONSISTENCY_AUDIT_TIME_INVALID");
  }
  const facts: MMGCommerceConsistencyFacts = {
    billingCycleOverdrawCount: count(input.facts.billingCycleOverdrawCount),
    windowOverdrawCount: count(input.facts.windowOverdrawCount),
    duplicateActiveOwnershipCount: count(input.facts.duplicateActiveOwnershipCount),
    orphanDeliveryGrantCount: count(input.facts.orphanDeliveryGrantCount),
    deliveredWindowWithoutOwnershipCount: count(
      input.facts.deliveredWindowWithoutOwnershipCount,
    ),
    ownershipWithoutAssetCount: count(input.facts.ownershipWithoutAssetCount),
    stuckWindowCount: count(input.facts.stuckWindowCount),
    unresolvedWebhookFailureCount: count(input.facts.unresolvedWebhookFailureCount),
  };
  const checks = [
    check(
      "BILLING_CYCLE_CAPACITY",
      facts.billingCycleOverdrawCount,
      "SEV1",
      "forward_repair_required",
    ),
    check(
      "WINDOW_CAPACITY",
      facts.windowOverdrawCount,
      "SEV1",
      "forward_repair_required",
    ),
    check(
      "ACTIVE_OWNERSHIP_UNIQUENESS",
      facts.duplicateActiveOwnershipCount,
      "SEV1",
      "manual_reconciliation_required",
    ),
    check(
      "DELIVERY_GRANT_REFERENTIAL_INTEGRITY",
      facts.orphanDeliveryGrantCount,
      "SEV1",
      "manual_reconciliation_required",
    ),
    check(
      "DELIVERED_WINDOW_OWNERSHIP_COMPLETENESS",
      facts.deliveredWindowWithoutOwnershipCount,
      "SEV1",
      "manual_reconciliation_required",
    ),
    check(
      "OWNERSHIP_ASSET_INTEGRITY",
      facts.ownershipWithoutAssetCount,
      "SEV1",
      "manual_reconciliation_required",
    ),
    check(
      "DELIVERY_WINDOW_PROGRESS",
      facts.stuckWindowCount,
      "SEV2",
      "manual_reconciliation_required",
    ),
    check(
      "WEBHOOK_RECONCILIATION_COMPLETENESS",
      facts.unresolvedWebhookFailureCount,
      "SEV2",
      "manual_reconciliation_required",
    ),
  ];
  return {
    schemaVersion: "1.0.0",
    auditId: input.auditId,
    environment: input.environment,
    releaseId: input.releaseId ?? null,
    status: checks.some((entry) => entry.status === "failed") ? "failed" : "passed",
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    checks,
    destructiveRepairAllowed: false,
    deliveredOwnershipRevocationAllowed: false,
  };
};
