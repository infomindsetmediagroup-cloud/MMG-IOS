import { describe, expect, it, vi } from "vitest";
import { MMGPostgresRolloutEvidenceAdapter } from "../server/operations/commerce-rollout-evidence.js";

describe("MMG rollout evidence adapter", () => {
  it("requires passed checks for the exact release and environment", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            completed_at: "2026-07-20T22:30:00.000Z",
            checks: { checkout: "passed", ownership: "passed" },
          },
        ],
        rowCount: 1,
      }),
    };
    const adapter = new MMGPostgresRolloutEvidenceAdapter(database);
    await expect(
      adapter.hasFreshReleaseEvidence({
        environment: "production",
        releaseId: "release-production-12345678",
        maximumAgeSeconds: 86_400,
        asOf: new Date("2026-07-20T23:00:00.000Z"),
      }),
    ).resolves.toBe(true);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("release_id = $2"),
      expect.arrayContaining([
        "production",
        "release-production-12345678",
      ]),
    );
  });

  it("rejects incomplete or failed evidence", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            completed_at: "2026-07-20T22:30:00.000Z",
            checks: { checkout: "passed", ownership: "failed" },
          },
        ],
        rowCount: 1,
      }),
    };
    const adapter = new MMGPostgresRolloutEvidenceAdapter(database);
    await expect(
      adapter.hasFreshReleaseEvidence({
        environment: "staging",
        releaseId: "release-staging-12345678",
        maximumAgeSeconds: 86_400,
        asOf: new Date("2026-07-20T23:00:00.000Z"),
      }),
    ).resolves.toBe(false);
  });
});
