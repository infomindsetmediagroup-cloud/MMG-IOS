import type {
  MMGCommerceDeploymentEnvironment,
  MMGCommerceE2EEvidence,
} from "./live-commerce-deployment.js";

export const MMG_COMMERCE_E2E_CHECKS = Object.freeze([
  "shopify_product_draft_valid",
  "three_variants_exact",
  "shared_selling_plan_exact",
  "cart_requires_explicit_plan_and_consent",
  "checkout_test_order_completed",
  "subscription_webhook_verified",
  "entitlement_created_once",
  "billing_cycle_capacity_exact",
  "first_window_opened",
  "first_package_customer_selected",
  "future_package_ranked",
  "review_window_swap_supported",
  "confirmation_atomic",
  "delivery_dispatched_once",
  "ownership_grants_created",
  "my_library_entry_visible",
  "signed_read_or_download_access_valid",
  "customer_portal_status_correct",
  "no_private_identifiers_exposed",
  "cancellation_pause_and_failure_safe",
]);

export type MMGCommerceE2ECheckCode = (typeof MMG_COMMERCE_E2E_CHECKS)[number];

export interface MMGCommerceE2ECheckResult {
  code: MMGCommerceE2ECheckCode;
  status: "passed" | "failed" | "not_run";
  evidence: Record<string, unknown>;
  failureCode: string | null;
}

export interface MMGCommerceE2EProbeGateway {
  runCheck(input: {
    releaseId: string;
    environment: MMGCommerceDeploymentEnvironment;
    code: MMGCommerceE2ECheckCode;
    occurredAt: Date;
  }): Promise<MMGCommerceE2ECheckResult>;
  getHashedTestReferences(input: {
    releaseId: string;
    environment: MMGCommerceDeploymentEnvironment;
  }): Promise<{
    testOrderIdHash: string | null;
    testCustomerReferenceHash: string | null;
  }>;
}

const runId = (releaseId: string, occurredAt: Date): string =>
  `e2e:${releaseId}:${occurredAt.toISOString()}`.slice(0, 128);

const validHash = (value: string | null): string | null => {
  if (value === null) return null;
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("MMG_E2E_REFERENCE_HASH_INVALID");
  }
  return value;
};

export const runMMGCommerceE2EVerification = async (input: {
  releaseId: string;
  environment: MMGCommerceDeploymentEnvironment;
  gateway: MMGCommerceE2EProbeGateway;
  occurredAt: Date;
}): Promise<{
  evidence: MMGCommerceE2EEvidence;
  results: MMGCommerceE2ECheckResult[];
}> => {
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(input.releaseId)) {
    throw new Error("MMG_E2E_RELEASE_ID_INVALID");
  }

  const results: MMGCommerceE2ECheckResult[] = [];
  for (const code of MMG_COMMERCE_E2E_CHECKS) {
    const result = await input.gateway.runCheck({
      releaseId: input.releaseId,
      environment: input.environment,
      code,
      occurredAt: input.occurredAt,
    });
    if (result.code !== code) throw new Error("MMG_E2E_CHECK_CODE_MISMATCH");
    results.push(result);
    if (result.status === "failed") break;
  }

  const completedCodes = new Set(results.map((result) => result.code));
  for (const code of MMG_COMMERCE_E2E_CHECKS) {
    if (!completedCodes.has(code)) {
      results.push({
        code,
        status: "not_run",
        evidence: {},
        failureCode: "BLOCKED_BY_PRIOR_FAILURE",
      });
    }
  }

  const references = await input.gateway.getHashedTestReferences({
    releaseId: input.releaseId,
    environment: input.environment,
  });
  const checks = Object.fromEntries(
    results.map((result) => [result.code, result.status]),
  ) as Record<string, "passed" | "failed" | "not_run">;

  return {
    evidence: {
      runId: runId(input.releaseId, input.occurredAt),
      completedAt: input.occurredAt.toISOString(),
      environment: input.environment,
      checks,
      testOrderIdHash: validHash(references.testOrderIdHash),
      testCustomerReferenceHash: validHash(
        references.testCustomerReferenceHash,
      ),
    },
    results,
  };
};
