import { describe, expect, it, vi } from "vitest";
import { MMGPostgresCommerceRehearsalEvidenceAdapter } from "../server/operations/postgres-commerce-rehearsal-evidence.js";

const requiredChecks = [
  "SEV1_INCIDENT_OPENED",
  "SEV1_CONTAINMENT_APPLIED",
  "SEV2_INCIDENT_OPENED",
  "WEBHOOK_EVIDENCE_PRESERVED",
  "CONSISTENCY_AUDIT_PASSED",
  "ROLLOUT_INTERNAL_ENTERED",
  "ROLLOUT_PILOT_ENTERED",
  "ROLLOUT_LIMITED_ENTERED",
  "ROLLOUT_EXPANDED_ENTERED",
  "ROLLOUT_FULL_ENTERED",
  "CUSTOMER_RIGHTS_PRESERVED",
].map((code) => ({ code, status: "passed" }));

describe("MMG staging rehearsal evidence adapter", () => {
  it("accepts complete fresh evidence for the exact release", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            completed_at: "2026-07-21T00:00:00.000Z",
            evidence: {
              releaseId: "release-staging-12345678",
              environment: "staging",
              status: "passed",
              publicationAttempted: false,
              liveCustomerDataUsed: false,
              deliveredOwnershipRevocationAllowed: false,
              checks: requiredChecks,
            },
          },
        ],
        rowCount: 1,
      }),
    };
    const adapter = new MMGPostgresCommerceRehearsalEvidenceAdapter(database);
    await expect(
      adapter.hasFreshPassedEvidence({
        releaseId: "release-staging-12345678",
        maximumAgeSeconds: 86400,
        asOf: new Date("2026-07-21T01:00:00.000Z"),
      }),
    ).resolves.toBe(true);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("release_id = $1"),
      expect.arrayContaining(["release-staging-12345678"]),
    );
  });

  it("rejects incomplete or unsafe evidence", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            completed_at: "2026-07-21T00:00:00.000Z",
            evidence: {
              releaseId: "release-staging-12345678",
              environment: "staging",
              status: "passed",
              publicationAttempted: true,
              liveCustomerDataUsed: false,
              deliveredOwnershipRevocationAllowed: false,
              checks: requiredChecks.slice(0, 2),
            },
          },
        ],
        rowCount: 1,
      }),
    };
    const adapter = new MMGPostgresCommerceRehearsalEvidenceAdapter(database);
    await expect(
      adapter.hasFreshPassedEvidence({
        releaseId: "release-staging-12345678",
        maximumAgeSeconds: 86400,
        asOf: new Date("2026-07-21T01:00:00.000Z"),
      }),
    ).resolves.toBe(false);
  });
});
