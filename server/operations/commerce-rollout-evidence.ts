import type { MMGSQLExecutor } from "../knowledge-library/persistence.js";
import type { MMGCommerceOperationsEnvironment } from "./commerce-operations-control.js";

export interface MMGCommerceRolloutEvidenceAdapter {
  hasFreshReleaseEvidence(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string;
    maximumAgeSeconds: number;
    asOf: Date;
  }): Promise<boolean>;
}

interface EvidenceRow extends Record<string, unknown> {
  completed_at: Date | string;
  checks: unknown;
}

const checksPassed = (value: unknown): boolean => {
  const parsed =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return null;
          }
        })()
      : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const statuses = Object.values(parsed as Record<string, unknown>);
  return statuses.length > 0 && statuses.every((status) => status === "passed");
};

export class MMGPostgresRolloutEvidenceAdapter
  implements MMGCommerceRolloutEvidenceAdapter
{
  readonly #database: MMGSQLExecutor;

  constructor(database: MMGSQLExecutor) {
    this.#database = database;
  }

  async hasFreshReleaseEvidence(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string;
    maximumAgeSeconds: number;
    asOf: Date;
  }): Promise<boolean> {
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(input.releaseId)) {
      throw new Error("MMG_ROLLOUT_RELEASE_ID_INVALID");
    }
    if (
      !Number.isInteger(input.maximumAgeSeconds) ||
      input.maximumAgeSeconds < 60 ||
      input.maximumAgeSeconds > 86_400
    ) {
      throw new Error("MMG_ROLLOUT_EVIDENCE_MAXIMUM_AGE_INVALID");
    }
    const result = await this.#database.query<EvidenceRow>(
      `SELECT completed_at, checks
       FROM mmg_commerce_e2e_runs
       WHERE environment = $1
         AND release_id = $2
         AND status = 'passed'
         AND completed_at IS NOT NULL
         AND completed_at <= $3
         AND completed_at > $3 - ($4::integer * interval '1 second')
       ORDER BY completed_at DESC
       LIMIT 1`,
      [input.environment, input.releaseId, input.asOf, input.maximumAgeSeconds],
    );
    const row = result.rows[0];
    if (!row || !checksPassed(row.checks)) return false;
    const completedAt =
      row.completed_at instanceof Date
        ? row.completed_at.getTime()
        : Date.parse(row.completed_at);
    return (
      Number.isFinite(completedAt) &&
      completedAt <= input.asOf.getTime() &&
      input.asOf.getTime() - completedAt <= input.maximumAgeSeconds * 1000
    );
  }
}
