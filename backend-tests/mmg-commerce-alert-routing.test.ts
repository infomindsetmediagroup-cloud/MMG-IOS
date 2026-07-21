import { describe, expect, it } from "vitest";
import { buildMMGCommerceAlertPlan } from "../server/operations/commerce-alert-routing.js";
import type { MMGCommerceIncidentRecord } from "../server/operations/commerce-operations-service.js";
import type { MMGCommerceSignalEvaluation } from "../server/operations/commerce-operations-control.js";

const occurredAt = new Date("2026-07-20T23:00:00.000Z");

const incident: MMGCommerceIncidentRecord = {
  incidentId: "incident:production:entitlement_consistency_failure_count",
  environment: "production",
  signalCode: "entitlement_consistency_failure_count",
  severity: "SEV1",
  state: "detected",
  title: "Entitlement consistency failures",
  summary: "Entitlement consistency failed.",
  firstSeenAt: occurredAt.toISOString(),
  lastSeenAt: occurredAt.toISOString(),
  version: 2,
};

const signal: MMGCommerceSignalEvaluation = {
  code: "entitlement_consistency_failure_count",
  status: "critical",
  severity: "SEV1",
  value: 2,
  unit: "count",
  sampleSize: 1,
  observedAt: occurredAt.toISOString(),
  title: "Entitlement consistency failures",
  reasonCode: "CRITICAL_THRESHOLD_BREACHED",
};

describe("MMG commerce alert routing", () => {
  it("routes SEV1 to every required channel with no customer data", () => {
    const plan = buildMMGCommerceAlertPlan({ incident, signal, occurredAt });
    expect(plan.channels).toEqual([
      "on_call_pager",
      "operations_email",
      "operations_chat",
      "executive_briefing",
    ]);
    expect(plan.acknowledgementDueAt).toBe("2026-07-20T23:15:00.000Z");
    expect(plan.mitigationDueAt).toBe("2026-07-20T23:30:00.000Z");
    expect(plan.customerDataIncluded).toBe(false);
    expect(plan.rawProviderPayloadIncluded).toBe(false);
  });
});
