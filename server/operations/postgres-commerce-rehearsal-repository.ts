import type { MMGTransactionalDatabase } from "../knowledge-library/persistence.js";
import type {
  MMGCommerceRehearsalCheck,
  MMGCommerceRehearsalEvidence,
  MMGCommerceRehearsalRepository,
} from "./commerce-staging-rehearsal.js";

interface RunRow extends Record<string, unknown> {
  release_id: string;
  status: string;
}

export class MMGPostgresCommerceRehearsalRepository
  implements MMGCommerceRehearsalRepository
{
  readonly #database: MMGTransactionalDatabase;

  constructor(database: MMGTransactionalDatabase) {
    this.#database = database;
  }

  async claim(input: {
    runId: string;
    releaseId: string;
    startedAt: Date;
  }): Promise<"claimed" | "duplicate_completed" | "collision"> {
    return this.#database.transaction(async (transaction) => {
      const inserted = await transaction.query(
        `INSERT INTO mmg_commerce_rehearsal_runs (
           run_id, release_id, environment, status, started_at, updated_at,
           publication_attempted, live_customer_data_used,
           delivered_ownership_revocation_allowed
         ) VALUES ($1, $2, 'staging', 'running', $3, $3, FALSE, FALSE, FALSE)
         ON CONFLICT (run_id) DO NOTHING
         RETURNING run_id`,
        [input.runId, input.releaseId, input.startedAt],
      );
      if (inserted.rowCount === 1) return "claimed";
      const existing = await transaction.query<RunRow>(
        `SELECT release_id, status
         FROM mmg_commerce_rehearsal_runs
         WHERE run_id = $1
         FOR UPDATE`,
        [input.runId],
      );
      const row = existing.rows[0];
      if (row?.release_id === input.releaseId && row.status === "passed") {
        return "duplicate_completed";
      }
      return "collision";
    });
  }

  async appendCheck(input: {
    runId: string;
    check: MMGCommerceRehearsalCheck;
  }): Promise<void> {
    await this.#database.query(
      `INSERT INTO mmg_commerce_rehearsal_checks (
         run_id, check_code, status, evidence, occurred_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (run_id, check_code)
       DO UPDATE SET status = EXCLUDED.status, evidence = EXCLUDED.evidence,
         occurred_at = EXCLUDED.occurred_at`,
      [
        input.runId,
        input.check.code,
        input.check.status,
        JSON.stringify(input.check.evidence),
        input.check.occurredAt,
      ],
    );
  }

  async complete(evidence: MMGCommerceRehearsalEvidence): Promise<void> {
    await this.#database.query(
      `UPDATE mmg_commerce_rehearsal_runs
       SET status = 'passed', completed_at = $2, updated_at = $2,
         evidence = $3::jsonb, error_code = NULL
       WHERE run_id = $1 AND status = 'running'`,
      [evidence.runId, evidence.completedAt, JSON.stringify(evidence)],
    );
  }

  async fail(input: {
    runId: string;
    errorCode: string;
    checks: MMGCommerceRehearsalCheck[];
    failedAt: Date;
  }): Promise<void> {
    await this.#database.query(
      `UPDATE mmg_commerce_rehearsal_runs
       SET status = 'failed', completed_at = $2, updated_at = $2,
         error_code = $3, evidence = $4::jsonb
       WHERE run_id = $1 AND status = 'running'`,
      [
        input.runId,
        input.failedAt,
        input.errorCode,
        JSON.stringify({ checks: input.checks }),
      ],
    );
  }
}
