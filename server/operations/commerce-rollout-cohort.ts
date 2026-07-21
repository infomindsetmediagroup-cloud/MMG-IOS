import { createHash } from "node:crypto";
import {
  MMG_COMMERCE_ROLLOUT_STAGES,
  type MMGCommerceRolloutStage,
} from "./commerce-operations-control.js";

export interface MMGCommerceRolloutAssignment {
  schemaVersion: "1.0.0";
  stage: MMGCommerceRolloutStage;
  included: boolean;
  reasonCode:
    | "ROLLOUT_PAUSED"
    | "INTERNAL_ALLOWLIST_MATCH"
    | "INTERNAL_ALLOWLIST_REQUIRED"
    | "COHORT_INCLUDED"
    | "COHORT_EXCLUDED";
  cohortBucket: number;
  customerReferenceHash: string;
}

const normalize = (value: string, code: string): string => {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 512) throw new Error(code);
  return normalized;
};

export const hashMMGRolloutCustomerReference = (input: {
  customerReference: string;
  releaseSalt: string;
}): string =>
  createHash("sha256")
    .update(normalize(input.releaseSalt, "MMG_ROLLOUT_SALT_INVALID"))
    .update("\u0000")
    .update(normalize(input.customerReference, "MMG_ROLLOUT_CUSTOMER_REFERENCE_INVALID"))
    .digest("hex");

export const assignMMGCommerceRolloutCohort = (input: {
  customerReference: string;
  releaseSalt: string;
  stage: MMGCommerceRolloutStage;
  internalAllowlistHashes?: ReadonlySet<string>;
}): MMGCommerceRolloutAssignment => {
  const hash = hashMMGRolloutCustomerReference(input);
  const bucket = Number.parseInt(hash.slice(0, 8), 16) % 10_000;
  if (input.stage === "paused") {
    return {
      schemaVersion: "1.0.0",
      stage: input.stage,
      included: false,
      reasonCode: "ROLLOUT_PAUSED",
      cohortBucket: bucket,
      customerReferenceHash: hash,
    };
  }
  const policy = MMG_COMMERCE_ROLLOUT_STAGES[input.stage];
  if (policy.allowlistOnly) {
    const included = Boolean(input.internalAllowlistHashes?.has(hash));
    return {
      schemaVersion: "1.0.0",
      stage: input.stage,
      included,
      reasonCode: included
        ? "INTERNAL_ALLOWLIST_MATCH"
        : "INTERNAL_ALLOWLIST_REQUIRED",
      cohortBucket: bucket,
      customerReferenceHash: hash,
    };
  }
  const included = bucket < policy.cohortPercentage * 100;
  return {
    schemaVersion: "1.0.0",
    stage: input.stage,
    included,
    reasonCode: included ? "COHORT_INCLUDED" : "COHORT_EXCLUDED",
    cohortBucket: bucket,
    customerReferenceHash: hash,
  };
};
