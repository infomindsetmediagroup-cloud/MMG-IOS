import { describe, expect, it } from "vitest";
import {
  assignMMGCommerceRolloutCohort,
  hashMMGRolloutCustomerReference,
} from "../server/operations/commerce-rollout-cohort.js";

describe("MMG commerce rollout cohorts", () => {
  it("assigns the same customer to a stable bucket", () => {
    const input = {
      customerReference: "customer-reference-12345678",
      releaseSalt: "release-private-salt-12345678",
      stage: "limited" as const,
    };
    const first = assignMMGCommerceRolloutCohort(input);
    const second = assignMMGCommerceRolloutCohort(input);
    expect(first.cohortBucket).toBe(second.cohortBucket);
    expect(first.included).toBe(second.included);
    expect(first.customerReferenceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("requires a hash allowlist for the internal stage", () => {
    const customerReference = "customer-reference-87654321";
    const releaseSalt = "release-private-salt-12345678";
    const hash = hashMMGRolloutCustomerReference({ customerReference, releaseSalt });
    expect(
      assignMMGCommerceRolloutCohort({
        customerReference,
        releaseSalt,
        stage: "internal",
      }).included,
    ).toBe(false);
    expect(
      assignMMGCommerceRolloutCohort({
        customerReference,
        releaseSalt,
        stage: "internal",
        internalAllowlistHashes: new Set([hash]),
      }).included,
    ).toBe(true);
  });

  it("excludes every customer while rollout is paused", () => {
    const result = assignMMGCommerceRolloutCohort({
      customerReference: "customer-reference-12345678",
      releaseSalt: "release-private-salt-12345678",
      stage: "paused",
    });
    expect(result.included).toBe(false);
    expect(result.reasonCode).toBe("ROLLOUT_PAUSED");
  });
});
