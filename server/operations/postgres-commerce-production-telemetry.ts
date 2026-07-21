import type { MMGTransactionalDatabase } from "../knowledge-library/persistence.js";
import type { MMGCommerceConsistencyFacts } from "./commerce-consistency-audit.js";
import type {
  MMGCommerceAccessTelemetry,
  MMGCommerceConsistencyTelemetry,
  MMGCommerceDeliveryTelemetry,
  MMGCommerceInfrastructureTelemetry,
  MMGCommerceVerificationTelemetry,
  MMGCommerceWebhookTelemetry,
  MMGFailureRateSample,
  MMGRatioSample,
} from "./commerce-metrics-collector.js";
import type { MMGCommerceOperationsEnvironment } from "./commerce-operations-control.js";
import type { MMGCommerceConsistencyAdapter } from "./commerce-operations-service.js";
import type { MMGHTTPCommerceRouteProbe } from "./http-commerce-route-probe.js";

interface ScalarRow extends Record<string, unknown> {
  value: string | number | null;
}

interface RateRow extends Record<string, unknown> {
  failures: string | number;
  total: string | number;
}

const numeric = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const integer = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};

export class MMGPostgresCommerceProductionTelemetry
  implements
    MMGCommerceInfrastructureTelemetry,
    MMGCommerceWebhookTelemetry,
    MMGCommerceDeliveryTelemetry,
    MMGCommerceAccessTelemetry,
    MMGCommerceConsistencyTelemetry,
    MMGCommerceVerificationTelemetry,
    MMGCommerceConsistencyAdapter
{
  readonly #database: MMGTransactionalDatabase;
  readonly #routeProbe: MMGHTTPCommerceRouteProbe;
  readonly #now: () => Date;

  constructor(input: {
    database: MMGTransactionalDatabase;
    routeProbe: MMGHTTPCommerceRouteProbe;
    now?: () => Date;
  }) {
    this.#database = input.database;
    this.#routeProbe = input.routeProbe;
    this.#now = input.now ?? (() => new Date());
  }

  async databaseConnectivity(_input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<MMGRatioSample> {
    try {
      await this.#database.query("SELECT 1 AS value");
      return { successes: 1, total: 1 };
    } catch {
      return { successes: 0, total: 1 };
    }
  }

  runtimeRouteAvailability(input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<MMGRatioSample> {
    return this.#routeProbe.availability(input);
  }

  async failureRate(input: {
    environment: MMGCommerceOperationsEnvironment;
    windowSeconds: number;
  }): Promise<MMGFailureRateSample> {
    const cutoff = new Date(this.#now().getTime() - input.windowSeconds * 1000);
    try {
      const result = await this.#database.query<RateRow>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'failed') AS failures,
           COUNT(*) AS total
         FROM mmg_shopify_webhook_deliveries
         WHERE first_received_at >= $1`,
        [cutoff],
      );
      return {
        failures: integer(result.rows[0]?.failures),
        total: integer(result.rows[0]?.total),
        windowSeconds: input.windowSeconds,
      };
    } catch {
      return { failures: 0, total: 0, windowSeconds: input.windowSeconds };
    }
  }

  async oldestProcessingAgeSeconds(_input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<number> {
    return this.#scalar(
      `SELECT EXTRACT(EPOCH FROM ($1::timestamptz - MIN(first_received_at))) AS value
       FROM mmg_shopify_webhook_deliveries
       WHERE status = 'processing'`,
      [this.#now()],
      0,
    );
  }

  async reconciliationLagSeconds(_input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<number> {
    return this.#scalar(
      `SELECT EXTRACT(EPOCH FROM ($1::timestamptz - MIN(delivery.triggered_at))) AS value
       FROM mmg_shopify_webhook_deliveries delivery
       LEFT JOIN mmg_subscription_entitlements entitlement
         ON entitlement.last_shopify_webhook_id = delivery.webhook_id
       WHERE delivery.status = 'processed'
         AND delivery.topic IN ('subscription_contracts/create', 'subscription_contracts/update')
         AND entitlement.id IS NULL`,
      [this.#now()],
      0,
    );
  }

  async schedulerLastSuccessAgeSeconds(_input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<number> {
    return this.#scalar(
      `SELECT EXTRACT(EPOCH FROM ($1::timestamptz - MAX(finished_at))) AS value
       FROM mmg_delivery_controller_runs
       WHERE status = 'completed'`,
      [this.#now()],
    );
  }

  async dispatcherBacklogCount(_input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<number> {
    return this.#scalar(
      `SELECT COUNT(*) AS value
       FROM mmg_entitlement_windows
       WHERE status = 'delivery_ready'`,
      [],
      0,
    );
  }

  async dispatcherFailureRate(input: {
    environment: MMGCommerceOperationsEnvironment;
    windowSeconds: number;
  }): Promise<MMGFailureRateSample> {
    const cutoff = new Date(this.#now().getTime() - input.windowSeconds * 1000);
    try {
      const result = await this.#database.query<RateRow>(
        `SELECT
           COUNT(*) FILTER (
             WHERE status = 'recovery_required'
               AND recovery_reason LIKE 'delivery_%'
           ) AS failures,
           COUNT(*) FILTER (
             WHERE status IN ('delivered', 'recovery_required')
           ) AS total
         FROM mmg_entitlement_windows
         WHERE updated_at >= $1`,
        [cutoff],
      );
      return {
        failures: integer(result.rows[0]?.failures),
        total: integer(result.rows[0]?.total),
        windowSeconds: input.windowSeconds,
      };
    } catch {
      return { failures: 0, total: 0, windowSeconds: input.windowSeconds };
    }
  }

  async recoveryRequiredRate(input: {
    environment: MMGCommerceOperationsEnvironment;
    windowSeconds: number;
  }): Promise<MMGFailureRateSample> {
    const cutoff = new Date(this.#now().getTime() - input.windowSeconds * 1000);
    try {
      const result = await this.#database.query<RateRow>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'recovery_required') AS failures,
           COUNT(*) AS total
         FROM mmg_entitlement_windows
         WHERE updated_at >= $1
           AND status IN (
             'open', 'confirmed', 'delivery_ready', 'delivered', 'closed',
             'expired', 'canceled', 'recovery_required'
           )`,
        [cutoff],
      );
      return {
        failures: integer(result.rows[0]?.failures),
        total: integer(result.rows[0]?.total),
        windowSeconds: input.windowSeconds,
      };
    } catch {
      return { failures: 0, total: 0, windowSeconds: input.windowSeconds };
    }
  }

  async signedAccessFailureRate(input: {
    environment: MMGCommerceOperationsEnvironment;
    windowSeconds: number;
  }): Promise<MMGFailureRateSample> {
    const cutoff = new Date(this.#now().getTime() - input.windowSeconds * 1000);
    try {
      const result = await this.#database.query<RateRow>(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('denied', 'failed')) AS failures,
           COUNT(*) AS total
         FROM mmg_library_access_requests
         WHERE created_at >= $1`,
        [cutoff],
      );
      return {
        failures: integer(result.rows[0]?.failures),
        total: integer(result.rows[0]?.total),
        windowSeconds: input.windowSeconds,
      };
    } catch {
      return { failures: 0, total: 0, windowSeconds: input.windowSeconds };
    }
  }

  async entitlementConsistencyFailureCount(_input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<number> {
    const facts = await this.#facts();
    return (
      facts.billingCycleOverdrawCount +
      facts.windowOverdrawCount +
      facts.orphanDeliveryGrantCount +
      facts.deliveredWindowWithoutOwnershipCount +
      facts.ownershipWithoutAssetCount
    );
  }

  async ownershipDuplicateConflictCount(_input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<number> {
    return (await this.#facts()).duplicateActiveOwnershipCount;
  }

  async e2eEvidenceAgeSeconds(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string | null;
  }): Promise<number> {
    if (!input.releaseId) return Number.NaN;
    return this.#scalar(
      `SELECT EXTRACT(EPOCH FROM ($3::timestamptz - MAX(completed_at))) AS value
       FROM mmg_commerce_e2e_runs
       WHERE environment = $1
         AND release_id = $2
         AND status = 'passed'
         AND completed_at IS NOT NULL`,
      [input.environment, input.releaseId, this.#now()],
    );
  }

  async collectFacts(_input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string | null;
    occurredAt: Date;
  }): Promise<MMGCommerceConsistencyFacts> {
    return this.#facts();
  }

  async #facts(): Promise<MMGCommerceConsistencyFacts> {
    const [
      billingCycleOverdrawCount,
      windowOverdrawCount,
      duplicateActiveOwnershipCount,
      orphanDeliveryGrantCount,
      deliveredWindowWithoutOwnershipCount,
      ownershipWithoutAssetCount,
      stuckWindowCount,
      unresolvedWebhookFailureCount,
    ] = await Promise.all([
      this.#scalar(
        `SELECT COUNT(*) AS value FROM mmg_entitlement_cycles
         WHERE confirmed_packages > total_packages OR consumed_units > total_units`,
        [],
        0,
      ),
      this.#scalar(
        `SELECT COUNT(*) AS value
         FROM (
           SELECT window.id
           FROM mmg_entitlement_windows window
           LEFT JOIN mmg_entitlement_selections selection
             ON selection.window_id = window.id
           GROUP BY window.id, window.total_units, window.target_asset_count
           HAVING COALESCE(SUM(selection.units), 0) > window.total_units
             OR COUNT(selection.asset_id) FILTER (
               WHERE selection.state IN ('selected', 'reserved', 'confirmed')
             ) > window.target_asset_count
         ) invalid_windows`,
        [],
        0,
      ),
      this.#scalar(
        `SELECT COUNT(*) AS value
         FROM (
           SELECT customer_id, asset_id
           FROM mmg_ownership_grants
           WHERE status = 'active'
           GROUP BY customer_id, asset_id
           HAVING COUNT(*) > 1
         ) duplicate_ownership`,
        [],
        0,
      ),
      this.#scalar(
        `SELECT COUNT(*) AS value
         FROM mmg_delivery_grants grant_record
         LEFT JOIN mmg_entitlement_cycles cycle ON cycle.id = grant_record.cycle_id
         LEFT JOIN mmg_entitlement_windows window ON window.id = grant_record.window_id
         LEFT JOIN mmg_knowledge_assets asset ON asset.asset_id = grant_record.asset_id
         WHERE cycle.id IS NULL OR window.id IS NULL OR asset.asset_id IS NULL`,
        [],
        0,
      ),
      this.#scalar(
        `SELECT COUNT(*) AS value
         FROM mmg_entitlement_windows window
         JOIN mmg_entitlement_cycles cycle ON cycle.id = window.cycle_id
         JOIN mmg_subscription_entitlements entitlement
           ON entitlement.id = cycle.subscription_entitlement_id
         WHERE window.status = 'delivered'
           AND EXISTS (
             SELECT 1 FROM mmg_delivery_grants delivery
             WHERE delivery.window_id = window.id AND delivery.status = 'active'
               AND NOT EXISTS (
                 SELECT 1 FROM mmg_ownership_grants ownership
                 WHERE ownership.customer_id = entitlement.customer_id
                   AND ownership.asset_id = delivery.asset_id
                   AND ownership.status = 'active'
               )
           )`,
        [],
        0,
      ),
      this.#scalar(
        `SELECT COUNT(*) AS value
         FROM mmg_ownership_grants ownership
         LEFT JOIN mmg_knowledge_assets asset ON asset.asset_id = ownership.asset_id
         WHERE asset.asset_id IS NULL`,
        [],
        0,
      ),
      this.#scalar(
        `SELECT COUNT(*) AS value
         FROM mmg_entitlement_windows
         WHERE status IN ('open', 'confirmed', 'delivery_ready')
           AND updated_at < $1`,
        [new Date(this.#now().getTime() - 24 * 60 * 60 * 1000)],
        0,
      ),
      this.#scalar(
        `SELECT COUNT(*) AS value
         FROM mmg_shopify_webhook_deliveries
         WHERE status = 'failed'
           AND updated_at < $1`,
        [new Date(this.#now().getTime() - 15 * 60 * 1000)],
        0,
      ),
    ]);
    return {
      billingCycleOverdrawCount: integer(billingCycleOverdrawCount),
      windowOverdrawCount: integer(windowOverdrawCount),
      duplicateActiveOwnershipCount: integer(duplicateActiveOwnershipCount),
      orphanDeliveryGrantCount: integer(orphanDeliveryGrantCount),
      deliveredWindowWithoutOwnershipCount: integer(
        deliveredWindowWithoutOwnershipCount,
      ),
      ownershipWithoutAssetCount: integer(ownershipWithoutAssetCount),
      stuckWindowCount: integer(stuckWindowCount),
      unresolvedWebhookFailureCount: integer(unresolvedWebhookFailureCount),
    };
  }

  async #scalar(
    text: string,
    values: readonly unknown[],
    fallback = Number.NaN,
  ): Promise<number> {
    try {
      const result = await this.#database.query<ScalarRow>(text, values);
      const value = numeric(result.rows[0]?.value);
      return Number.isFinite(value) ? Math.max(0, value) : fallback;
    } catch {
      return fallback;
    }
  }
}
