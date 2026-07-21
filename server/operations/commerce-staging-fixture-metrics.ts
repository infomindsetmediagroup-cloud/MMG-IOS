import type { MMGSQLExecutor } from "../knowledge-library/persistence.js";
import type {
  MMGCommerceHealthMetric,
  MMGCommerceHealthSignalCode,
  MMGCommerceOperationsEnvironment,
} from "./commerce-operations-control.js";
import type { MMGCommerceMetricsAdapter } from "./commerce-operations-service.js";
import type { MMGCommerceRehearsalScenario } from "./commerce-staging-rehearsal.js";

interface FixtureRow extends Record<string, unknown> {
  run_id: string;
  release_id: string;
  scenario: string | null;
}

const override = (
  code: MMGCommerceHealthSignalCode,
  value: number,
  unit: MMGCommerceHealthMetric["unit"],
  sampleSize: number,
  occurredAt: Date,
  windowSeconds = 900,
): MMGCommerceHealthMetric => ({
  code,
  value,
  unit,
  sampleSize,
  windowSeconds,
  observedAt: occurredAt.toISOString(),
});

export class MMGCommerceStagingFixtureMetricsAdapter
  implements MMGCommerceMetricsAdapter
{
  readonly #database: MMGSQLExecutor;
  readonly #base: MMGCommerceMetricsAdapter;

  constructor(input: {
    database: MMGSQLExecutor;
    base: MMGCommerceMetricsAdapter;
  }) {
    this.#database = input.database;
    this.#base = input.base;
  }

  async collect(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string | null;
    occurredAt: Date;
  }): Promise<MMGCommerceHealthMetric[]> {
    const base = await this.#base.collect(input);
    if (input.environment !== "staging") return base;
    const fixture = await this.#activeFixture(input.releaseId);
    if (!fixture) return base;
    const scenario = fixture.scenario as MMGCommerceRehearsalScenario | null;
    const preserved = new Map(base.map((metric) => [metric.code, metric]));
    const actual = (code: MMGCommerceHealthSignalCode): MMGCommerceHealthMetric => {
      const metric = preserved.get(code);
      if (!metric) throw new Error(`MMG_STAGING_FIXTURE_METRIC_MISSING:${code}`);
      return metric;
    };
    return [
      override(
        "database_connectivity_ratio",
        scenario === "database_connectivity_sev1" ? 0 : 1,
        "ratio",
        10,
        input.occurredAt,
      ),
      actual("runtime_route_availability_ratio"),
      override(
        "webhook_delivery_failure_rate",
        scenario === "webhook_failure_sev2" ? 1 : 0,
        "ratio",
        20,
        input.occurredAt,
      ),
      override("webhook_oldest_processing_age_seconds", 0, "seconds", 1, input.occurredAt),
      override("subscription_reconciliation_lag_seconds", 0, "seconds", 1, input.occurredAt),
      override("scheduler_last_success_age_seconds", 0, "seconds", 1, input.occurredAt),
      override("dispatcher_backlog_count", 0, "count", 1, input.occurredAt),
      override("dispatcher_failure_rate", 0, "ratio", 20, input.occurredAt),
      override("recovery_required_rate", 0, "ratio", 10, input.occurredAt, 86_400),
      override("signed_access_failure_rate", 0, "ratio", 20, input.occurredAt),
      actual("entitlement_consistency_failure_count"),
      actual("ownership_duplicate_conflict_count"),
      override("e2e_evidence_age_seconds", 0, "seconds", 1, input.occurredAt, 86_400),
    ];
  }

  async #activeFixture(releaseId: string | null): Promise<FixtureRow | null> {
    const result = await this.#database.query<FixtureRow>(
      `SELECT run_id, release_id, scenario
       FROM mmg_commerce_staging_fixture_state
       WHERE environment = 'staging'
         AND status = 'active'
         AND ($1::text IS NULL OR release_id = $1)
       ORDER BY updated_at DESC
       LIMIT 1`,
      [releaseId],
    );
    return result.rows[0] ?? null;
  }
}
