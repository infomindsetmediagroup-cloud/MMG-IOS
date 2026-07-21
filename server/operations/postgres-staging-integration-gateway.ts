import type { MMGSQLExecutor } from "../knowledge-library/persistence.js";
import type {
  MMGCommerceControlCode,
  MMGCommerceControlMode,
} from "./commerce-operations-control.js";
import type { MMGCommerceRehearsalEvidenceAdapter } from "./postgres-commerce-rehearsal-evidence.js";
import type { MMGHTTPCommerceRouteProbe } from "./http-commerce-route-probe.js";
import type {
  MMGStagingAdapterHeartbeat,
  MMGStagingIntegrationGateway,
  MMGStagingIntegrationSnapshot,
} from "./staging-integration-service.js";

interface MigrationRow extends Record<string, unknown> {
  migration_id: string;
}

interface HeartbeatRow extends Record<string, unknown> {
  adapter_code: string;
  status: MMGStagingAdapterHeartbeat["status"];
  release_id: string | null;
  observed_at: Date | string;
}

interface ControlRow extends Record<string, unknown> {
  control_code: string;
  mode: string;
}

interface RolloutRow extends Record<string, unknown> {
  release_id: string;
  stage: string;
  cohort_percentage: number | string;
}

export interface MMGStagingBootstrapRuntime {
  bootstrapSafeState(): Promise<void>;
}

const MAX_HEARTBEAT_AGE_MS = 15 * 60 * 1000;

const date = (value: Date | string): Date => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("MMG_STAGING_ADAPTER_HEARTBEAT_TIME_INVALID");
  }
  return parsed;
};

const heartbeat = (
  row: HeartbeatRow,
  inspectedAt: Date,
): MMGStagingAdapterHeartbeat => {
  const observedAt = date(row.observed_at);
  const age = inspectedAt.getTime() - observedAt.getTime();
  const fresh = age >= 0 && age <= MAX_HEARTBEAT_AGE_MS;
  return {
    adapterCode: row.adapter_code,
    status: fresh ? row.status : "unavailable",
    releaseId: row.release_id,
    observedAt: observedAt.toISOString(),
  };
};

export class MMGPostgresStagingIntegrationGateway
  implements MMGStagingIntegrationGateway
{
  readonly #database: MMGSQLExecutor;
  readonly #routeProbe: MMGHTTPCommerceRouteProbe;
  readonly #runtime: MMGStagingBootstrapRuntime;
  readonly #rehearsal: MMGCommerceRehearsalEvidenceAdapter;

  constructor(input: {
    database: MMGSQLExecutor;
    routeProbe: MMGHTTPCommerceRouteProbe;
    runtime: MMGStagingBootstrapRuntime;
    rehearsal: MMGCommerceRehearsalEvidenceAdapter;
  }) {
    this.#database = input.database;
    this.#routeProbe = input.routeProbe;
    this.#runtime = input.runtime;
    this.#rehearsal = input.rehearsal;
  }

  async inspect(input: {
    releaseId: string;
    releaseCommitSha: string;
    occurredAt: Date;
  }): Promise<MMGStagingIntegrationSnapshot> {
    const [
      migrations,
      heartbeats,
      controls,
      rollout,
      routeProbe,
      rehearsalEvidencePassed,
    ] = await Promise.all([
      this.#database.query<MigrationRow>(
        `SELECT migration_id FROM mmg_schema_migrations ORDER BY migration_id`,
      ),
      this.#database.query<HeartbeatRow>(
        `SELECT adapter_code, status, release_id, observed_at
         FROM mmg_commerce_adapter_heartbeats
         WHERE environment = 'staging'
         ORDER BY adapter_code`,
      ),
      this.#database.query<ControlRow>(
        `SELECT control_code, mode
         FROM mmg_commerce_controls
         WHERE environment = 'staging'
         ORDER BY control_code`,
      ),
      this.#database.query<RolloutRow>(
        `SELECT release_id, stage, cohort_percentage
         FROM mmg_commerce_rollout_state
         WHERE environment = 'staging'
         LIMIT 1`,
      ),
      this.#routeProbe.availability({ environment: "staging" }),
      this.#rehearsal.hasFreshPassedEvidence({
        releaseId: input.releaseId,
        maximumAgeSeconds: 86_400,
        asOf: input.occurredAt,
      }),
    ]);
    const rolloutRow = rollout.rows[0];
    return {
      schemaVersion: "1.0.0",
      environment: "staging",
      releaseId: input.releaseId,
      releaseCommitSha: input.releaseCommitSha,
      migrationIds: migrations.rows.map((row) => row.migration_id),
      routeProbe,
      heartbeats: heartbeats.rows.map((row) => heartbeat(row, input.occurredAt)),
      controls: Object.fromEntries(
        controls.rows.map((row) => [row.control_code, row.mode]),
      ) as Partial<Record<MMGCommerceControlCode, MMGCommerceControlMode>>,
      rollout: rolloutRow
        ? {
            releaseId: rolloutRow.release_id,
            stage: rolloutRow.stage as NonNullable<
              MMGStagingIntegrationSnapshot["rollout"]
            >["stage"],
            cohortPercentage: Number(rolloutRow.cohort_percentage),
          }
        : null,
      rehearsalEvidencePassed,
      publicationAllowed: false,
      liveCustomerDataAllowed: false,
      inspectedAt: input.occurredAt.toISOString(),
    };
  }

  bootstrapSafeState(_input: {
    releaseId: string;
    occurredAt: Date;
  }): Promise<void> {
    return this.#runtime.bootstrapSafeState();
  }
}
