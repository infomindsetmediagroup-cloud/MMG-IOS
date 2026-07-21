import type {
  MMGSQLExecutor,
  MMGTransactionalDatabase,
} from "../knowledge-library/persistence.js";
import type {
  MMGStagingIntegrationCommand,
  MMGStagingIntegrationRepository,
  MMGStagingIntegrationSnapshot,
} from "./staging-integration-service.js";

interface IntegrationRow extends Record<string, unknown> {
  integration_run_id: string;
  release_id: string;
  release_commit_sha: string;
  status: string;
  evidence: unknown;
}

const actionStatus = (
  action: MMGStagingIntegrationCommand["action"],
): "planned" | "running" => (action === "inspect" ? "planned" : "running");

export class MMGPostgresStagingIntegrationRepository
  implements MMGStagingIntegrationRepository
{
  readonly #database: MMGTransactionalDatabase;

  constructor(database: MMGTransactionalDatabase) {
    this.#database = database;
  }

  async claim(input: {
    command: MMGStagingIntegrationCommand;
    actorId: string;
    occurredAt: Date;
  }): Promise<"claimed" | "duplicate_completed" | "collision"> {
    return this.#database.transaction(async (transaction) => {
      const current = await transaction.query<IntegrationRow>(
        `SELECT integration_run_id, release_id, release_commit_sha, status, evidence
         FROM mmg_commerce_staging_integration_runs
         WHERE integration_run_id = $1
         FOR UPDATE`,
        [input.command.integrationRunId],
      );
      const row = current.rows[0];
      if (row) {
        if (
          row.release_id !== input.command.releaseId ||
          row.release_commit_sha !== input.command.releaseCommitSha
        ) {
          return "collision";
        }
        if (["verified", "rehearsed"].includes(row.status)) {
          return "duplicate_completed";
        }
        await transaction.query(
          `UPDATE mmg_commerce_staging_integration_runs
           SET status = $2, error_code = NULL, updated_at = $3
           WHERE integration_run_id = $1`,
          [
            input.command.integrationRunId,
            actionStatus(input.command.action),
            input.occurredAt,
          ],
        );
        return "claimed";
      }
      await transaction.query(
        `INSERT INTO mmg_commerce_staging_integration_runs (
           integration_run_id, release_id, release_commit_sha, environment,
           status, evidence, started_at, updated_at
         ) VALUES ($1, $2, $3, 'staging', $4, $5::jsonb, $6, $6)`,
        [
          input.command.integrationRunId,
          input.command.releaseId,
          input.command.releaseCommitSha,
          actionStatus(input.command.action),
          JSON.stringify({
            requestId: input.command.requestId,
            action: input.command.action,
            actorId: input.actorId,
          }),
          input.occurredAt,
        ],
      );
      return "claimed";
    });
  }

  async complete(input: {
    command: MMGStagingIntegrationCommand;
    status: "planned" | "verified";
    snapshot: MMGStagingIntegrationSnapshot;
    occurredAt: Date;
  }): Promise<void> {
    await this.#database.query(
      `UPDATE mmg_commerce_staging_integration_runs
       SET status = $2,
         migration_count = $3,
         route_count = $4,
         provider_count = $5,
         evidence = $6::jsonb,
         error_code = NULL,
         completed_at = $7,
         updated_at = $7
       WHERE integration_run_id = $1`,
      [
        input.command.integrationRunId,
        input.status,
        input.snapshot.migrationIds.length,
        input.snapshot.routeProbe.successes,
        input.snapshot.heartbeats.filter((heartbeat) => heartbeat.status === "healthy")
          .length,
        JSON.stringify({
          schemaVersion: input.snapshot.schemaVersion,
          releaseId: input.snapshot.releaseId,
          releaseCommitSha: input.snapshot.releaseCommitSha,
          migrationIds: input.snapshot.migrationIds,
          routeProbe: input.snapshot.routeProbe,
          heartbeats: input.snapshot.heartbeats,
          controls: input.snapshot.controls,
          rollout: input.snapshot.rollout,
          rehearsalEvidencePassed: input.snapshot.rehearsalEvidencePassed,
          publicationAllowed: false,
          liveCustomerDataAllowed: false,
          inspectedAt: input.snapshot.inspectedAt,
        }),
        input.occurredAt,
      ],
    );
  }

  async fail(input: {
    command: MMGStagingIntegrationCommand;
    errorCode: string;
    occurredAt: Date;
  }): Promise<void> {
    await this.#database.query(
      `UPDATE mmg_commerce_staging_integration_runs
       SET status = 'failed', error_code = $2, completed_at = $3, updated_at = $3
       WHERE integration_run_id = $1`,
      [
        input.command.integrationRunId,
        input.errorCode.slice(0, 500),
        input.occurredAt,
      ],
    );
  }
}

export const recordMMGStagingAdapterHeartbeat = async (
  database: MMGSQLExecutor,
  input: {
    adapterCode: string;
    releaseId: string;
    status: "healthy" | "degraded" | "unavailable" | "unknown";
    details?: Record<string, unknown>;
    observedAt: Date;
  },
): Promise<void> => {
  await database.query(
    `INSERT INTO mmg_commerce_adapter_heartbeats (
       environment, adapter_code, release_id, status, observed_at, details,
       updated_at
     ) VALUES ('staging', $1, $2, $3, $4, $5::jsonb, $4)
     ON CONFLICT (environment, adapter_code)
     DO UPDATE SET
       release_id = EXCLUDED.release_id,
       status = EXCLUDED.status,
       observed_at = EXCLUDED.observed_at,
       details = EXCLUDED.details,
       updated_at = EXCLUDED.updated_at`,
    [
      input.adapterCode,
      input.releaseId,
      input.status,
      input.observedAt,
      JSON.stringify(input.details ?? {}),
    ],
  );
};
