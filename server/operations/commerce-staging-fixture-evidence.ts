import type { MMGSQLExecutor } from "../knowledge-library/persistence.js";
import type { MMGCommerceRolloutEvidenceAdapter } from "./commerce-rollout-evidence.js";

interface FixtureEvidenceRow extends Record<string, unknown> {
  release_id: string;
  virtual_clock: Date | string;
  status: string;
}

export class MMGCommerceStagingFixtureEvidenceAdapter
  implements MMGCommerceRolloutEvidenceAdapter
{
  readonly #database: MMGSQLExecutor;
  readonly #runId: string;

  constructor(input: { database: MMGSQLExecutor; runId: string }) {
    this.#database = input.database;
    this.#runId = input.runId;
  }

  async hasFreshReleaseEvidence(input: {
    environment: "staging" | "production";
    releaseId: string;
    maximumAgeSeconds: number;
    asOf: Date;
  }): Promise<boolean> {
    if (input.environment !== "staging") return false;
    if (
      !Number.isInteger(input.maximumAgeSeconds) ||
      input.maximumAgeSeconds < 60 ||
      input.maximumAgeSeconds > 86_400
    ) {
      throw new Error("MMG_STAGING_FIXTURE_EVIDENCE_AGE_INVALID");
    }
    const result = await this.#database.query<FixtureEvidenceRow>(
      `SELECT release_id, virtual_clock, status
       FROM mmg_commerce_staging_fixture_state
       WHERE run_id = $1
         AND environment = 'staging'
         AND status = 'active'
       LIMIT 1`,
      [this.#runId],
    );
    const row = result.rows[0];
    if (!row || row.release_id !== input.releaseId || row.status !== "active") {
      return false;
    }
    const clock = row.virtual_clock instanceof Date
      ? row.virtual_clock.getTime()
      : Date.parse(row.virtual_clock);
    return Number.isFinite(clock) && clock === input.asOf.getTime();
  }
}
