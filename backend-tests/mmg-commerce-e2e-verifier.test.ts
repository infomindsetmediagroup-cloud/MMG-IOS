import { describe, expect, it, vi } from "vitest";
import {
  MMG_COMMERCE_E2E_CHECKS,
  runMMGCommerceE2EVerification,
} from "../server/deployment/e2e-commerce-verifier.js";

describe("MMG commerce E2E verifier", () => {
  it("runs every check and persists only hashed references", async () => {
    const gateway = {
      runCheck: vi.fn().mockImplementation(async ({ code }) => ({
        code,
        status: "passed",
        evidence: { verified: true },
        failureCode: null,
      })),
      getHashedTestReferences: vi.fn().mockResolvedValue({
        testOrderIdHash: "a".repeat(64),
        testCustomerReferenceHash: "b".repeat(64),
      }),
    };
    const result = await runMMGCommerceE2EVerification({
      releaseId: "release-20260720-e2e",
      environment: "staging",
      gateway,
      occurredAt: new Date("2026-07-20T23:30:00.000Z"),
    });
    expect(gateway.runCheck).toHaveBeenCalledTimes(MMG_COMMERCE_E2E_CHECKS.length);
    expect(Object.values(result.evidence.checks)).toEqual(
      Array(MMG_COMMERCE_E2E_CHECKS.length).fill("passed"),
    );
    expect(result.evidence.testOrderIdHash).toBe("a".repeat(64));
  });

  it("stops after a failure and marks remaining checks not run", async () => {
    const gateway = {
      runCheck: vi.fn().mockImplementation(async ({ code }) => ({
        code,
        status: code === "subscription_webhook_verified" ? "failed" : "passed",
        evidence: {},
        failureCode:
          code === "subscription_webhook_verified" ? "WEBHOOK_FAILED" : null,
      })),
      getHashedTestReferences: vi.fn().mockResolvedValue({
        testOrderIdHash: null,
        testCustomerReferenceHash: null,
      }),
    };
    const result = await runMMGCommerceE2EVerification({
      releaseId: "release-20260720-failure",
      environment: "staging",
      gateway,
      occurredAt: new Date("2026-07-20T23:30:00.000Z"),
    });
    expect(result.evidence.checks.subscription_webhook_verified).toBe("failed");
    expect(result.evidence.checks.entitlement_created_once).toBe("not_run");
  });
});
