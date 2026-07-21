import type { MMGSQLExecutor } from "../knowledge-library/persistence.js";
import type {
  MMGCommerceControlCode,
  MMGCommerceControlMode,
  MMGCommerceRolloutStage,
} from "./commerce-operations-control.js";
import type { MMGHTTPStagingReadinessRouteProbe } from "./http-staging-readiness-route-probe.js";
import type {
  MMGStagingReadinessHeartbeat,
  MMGStagingReadinessSnapshot,
} from "./staging-readiness-inspector.js";

interface VersionRow extends Record<string, unknown> {
  server_version: string;
}

interface BooleanRow extends Record<string, unknown> {
  value: boolean;
}

interface MigrationRow extends Record<string, unknown> {
  migration_id: string;
}

interface HeartbeatRow extends Record<string, unknown> {
  adapter_code: string;
  status: MMGStagingReadinessHeartbeat["status"];
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

export interface MMGStagingReadinessRuntimeConfig {
  releaseId: string;
  releaseCommitSha: string;
  runtimeOrigin: string;
  credentials: MMGStagingReadinessSnapshot["credentials"];
  alertChannels: string[];
  requiredAlertChannels: string[];
  alertDestinationsUseHttps: boolean;
  alertEnvironmentLabel: string;
}

export interface MMGStagingReadinessGatewayInput {
  releaseId: string;
  releaseCommitSha: string;
  tooling: MMGStagingReadinessSnapshot["tooling"];
  githubEnvironment: MMGStagingReadinessSnapshot["githubEnvironment"];
  occurredAt: Date;
}

const iso = (value: Date | string): string => {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "invalid";
};

const boolean = (value: unknown): boolean => value === true;

export class MMGPostgresStagingReadinessGateway {
  readonly #database: MMGSQLExecutor;
  readonly #routes: MMGHTTPStagingReadinessRouteProbe;
  readonly #config: MMGStagingReadinessRuntimeConfig;

  constructor(input: {
    database: MMGSQLExecutor;
    routes: MMGHTTPStagingReadinessRouteProbe;
    config: MMGStagingReadinessRuntimeConfig;
  }) {
    this.#database = input.database;
    this.#routes = input.routes;
    this.#config = input.config;
  }

  async inspect(input: MMGStagingReadinessGatewayInput): Promise<MMGStagingReadinessSnapshot> {
    const database = await this.#databaseReadiness();
    const [routes, heartbeats, controls, rollout] = await Promise.all([
      this.#routes.inspect({ environment: "staging" }),
      database.reachable ? this.#heartbeats() : Promise.resolve([]),
      database.reachable ? this.#controls() : Promise.resolve({}),
      database.reachable ? this.#rollout() : Promise.resolve(null),
    ]);
    return {
      schemaVersion: "1.0.0",
      environment: "staging",
      releaseId: input.releaseId,
      releaseCommitSha: input.releaseCommitSha,
      configuredReleaseId: this.#config.releaseId,
      configuredReleaseCommitSha: this.#config.releaseCommitSha,
      runtimeOrigin: this.#config.runtimeOrigin,
      database,
      credentials: { ...this.#config.credentials },
      alerts: {
        configuredChannels: [...this.#config.alertChannels].sort(),
        requiredChannels: [...this.#config.requiredAlertChannels].sort(),
        destinationsUseHttps: this.#config.alertDestinationsUseHttps,
        destinationsAppearNonProduction:
          this.#config.alertEnvironmentLabel.trim().toLowerCase() === "staging",
      },
      routes,
      heartbeats,
      controls,
      rollout,
      tooling: { ...input.tooling },
      githubEnvironment: { ...input.githubEnvironment },
      publicationAllowed: false,
      liveCustomerDataAllowed: false,
      inspectedAt: input.occurredAt.toISOString(),
    };
  }

  async #databaseReadiness(): Promise<MMGStagingReadinessSnapshot["database"]> {
    try {
      const version = await this.#database.query<VersionRow>(
        "SHOW server_version",
      );
      const pgcrypto = await this.#database.query<BooleanRow>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
         ) AS value`,
      );
      const ledger = await this.#database.query<BooleanRow>(
        `SELECT to_regclass('public.mmg_schema_migrations') IS NOT NULL AS value`,
      );
      const migrationLedgerAvailable = boolean(ledger.rows[0]?.value);
      let appliedMigrationIds: string[] = [];
      if (migrationLedgerAvailable) {
        const migrations = await this.#database.query<MigrationRow>(
          `SELECT migration_id
           FROM mmg_schema_migrations
           ORDER BY migration_id`,
        );
        appliedMigrationIds = migrations.rows.map((row) => row.migration_id);
      }
      return {
        reachable: true,
        serverVersion: version.rows[0]?.server_version ?? null,
        pgcryptoAvailable: boolean(pgcrypto.rows[0]?.value),
        migrationLedgerAvailable,
        appliedMigrationIds,
      };
    } catch {
      return {
        reachable: false,
        serverVersion: null,
        pgcryptoAvailable: null,
        migrationLedgerAvailable: false,
        appliedMigrationIds: [],
      };
    }
  }

  async #heartbeats(): Promise<MMGStagingReadinessHeartbeat[]> {
    try {
      const result = await this.#database.query<HeartbeatRow>(
        `SELECT adapter_code, status, release_id, observed_at
         FROM mmg_commerce_adapter_heartbeats
         WHERE environment = 'staging'
         ORDER BY adapter_code`,
      );
      return result.rows.map((row) => ({
        adapterCode: row.adapter_code,
        status: row.status,
        releaseId: row.release_id,
        observedAt: iso(row.observed_at),
      }));
    } catch {
      return [];
    }
  }

  async #controls(): Promise<
    Partial<Record<MMGCommerceControlCode, MMGCommerceControlMode>>
  > {
    try {
      const result = await this.#database.query<ControlRow>(
        `SELECT control_code, mode
         FROM mmg_commerce_controls
         WHERE environment = 'staging'
         ORDER BY control_code`,
      );
      return Object.fromEntries(
        result.rows.map((row) => [row.control_code, row.mode]),
      ) as Partial<Record<MMGCommerceControlCode, MMGCommerceControlMode>>;
    } catch {
      return {};
    }
  }

  async #rollout(): Promise<MMGStagingReadinessSnapshot["rollout"]> {
    try {
      const result = await this.#database.query<RolloutRow>(
        `SELECT release_id, stage, cohort_percentage
         FROM mmg_commerce_rollout_state
         WHERE environment = 'staging'
         LIMIT 1`,
      );
      const row = result.rows[0];
      return row
        ? {
            releaseId: row.release_id,
            stage: row.stage as MMGCommerceRolloutStage,
            cohortPercentage: Number(row.cohort_percentage),
          }
        : null;
    } catch {
      return null;
    }
  }
}
