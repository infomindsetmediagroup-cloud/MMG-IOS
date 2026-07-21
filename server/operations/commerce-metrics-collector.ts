import type {
  MMGCommerceHealthMetric,
  MMGCommerceOperationsEnvironment,
} from "./commerce-operations-control.js";
import type { MMGCommerceMetricsAdapter } from "./commerce-operations-service.js";

export interface MMGRatioSample {
  successes: number;
  total: number;
}

export interface MMGFailureRateSample {
  failures: number;
  total: number;
  windowSeconds: number;
}

export interface MMGCommerceInfrastructureTelemetry {
  databaseConnectivity(input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<MMGRatioSample>;
  runtimeRouteAvailability(input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<MMGRatioSample>;
}

export interface MMGCommerceWebhookTelemetry {
  failureRate(input: {
    environment: MMGCommerceOperationsEnvironment;
    windowSeconds: number;
  }): Promise<MMGFailureRateSample>;
  oldestProcessingAgeSeconds(input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<number>;
  reconciliationLagSeconds(input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<number>;
}

export interface MMGCommerceDeliveryTelemetry {
  schedulerLastSuccessAgeSeconds(input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<number>;
  dispatcherBacklogCount(input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<number>;
  dispatcherFailureRate(input: {
    environment: MMGCommerceOperationsEnvironment;
    windowSeconds: number;
  }): Promise<MMGFailureRateSample>;
  recoveryRequiredRate(input: {
    environment: MMGCommerceOperationsEnvironment;
    windowSeconds: number;
  }): Promise<MMGFailureRateSample>;
}

export interface MMGCommerceAccessTelemetry {
  signedAccessFailureRate(input: {
    environment: MMGCommerceOperationsEnvironment;
    windowSeconds: number;
  }): Promise<MMGFailureRateSample>;
}

export interface MMGCommerceConsistencyTelemetry {
  entitlementConsistencyFailureCount(input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<number>;
  ownershipDuplicateConflictCount(input: {
    environment: MMGCommerceOperationsEnvironment;
  }): Promise<number>;
}

export interface MMGCommerceVerificationTelemetry {
  e2eEvidenceAgeSeconds(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string | null;
  }): Promise<number>;
}

export interface MMGCompositeCommerceMetricsDependencies {
  infrastructure: MMGCommerceInfrastructureTelemetry;
  webhooks: MMGCommerceWebhookTelemetry;
  delivery: MMGCommerceDeliveryTelemetry;
  access: MMGCommerceAccessTelemetry;
  consistency: MMGCommerceConsistencyTelemetry;
  verification: MMGCommerceVerificationTelemetry;
}

const ratio = (sample: MMGRatioSample): number =>
  sample.total > 0 ? sample.successes / sample.total : Number.NaN;

const failureRate = (sample: MMGFailureRateSample): number =>
  sample.total > 0 ? sample.failures / sample.total : Number.NaN;

const metric = (
  code: MMGCommerceHealthMetric["code"],
  value: number,
  unit: MMGCommerceHealthMetric["unit"],
  sampleSize: number,
  windowSeconds: number,
  observedAt: Date,
): MMGCommerceHealthMetric => ({
  code,
  value,
  unit,
  sampleSize,
  windowSeconds,
  observedAt: observedAt.toISOString(),
});

const nonnegative = (value: number): number =>
  Number.isFinite(value) && value >= 0 ? value : Number.NaN;

export class MMGCompositeCommerceMetricsAdapter
  implements MMGCommerceMetricsAdapter
{
  readonly #dependencies: MMGCompositeCommerceMetricsDependencies;

  constructor(dependencies: MMGCompositeCommerceMetricsDependencies) {
    this.#dependencies = dependencies;
  }

  async collect(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string | null;
    occurredAt: Date;
  }): Promise<MMGCommerceHealthMetric[]> {
    const rateWindowSeconds = 15 * 60;
    const [
      database,
      routes,
      webhookRate,
      webhookAge,
      reconciliationLag,
      schedulerAge,
      dispatcherBacklog,
      dispatcherRate,
      recoveryRate,
      accessRate,
      entitlementFailures,
      ownershipConflicts,
      e2eAge,
    ] = await Promise.all([
      this.#dependencies.infrastructure.databaseConnectivity(input),
      this.#dependencies.infrastructure.runtimeRouteAvailability(input),
      this.#dependencies.webhooks.failureRate({
        environment: input.environment,
        windowSeconds: rateWindowSeconds,
      }),
      this.#dependencies.webhooks.oldestProcessingAgeSeconds(input),
      this.#dependencies.webhooks.reconciliationLagSeconds(input),
      this.#dependencies.delivery.schedulerLastSuccessAgeSeconds(input),
      this.#dependencies.delivery.dispatcherBacklogCount(input),
      this.#dependencies.delivery.dispatcherFailureRate({
        environment: input.environment,
        windowSeconds: rateWindowSeconds,
      }),
      this.#dependencies.delivery.recoveryRequiredRate({
        environment: input.environment,
        windowSeconds: 24 * 60 * 60,
      }),
      this.#dependencies.access.signedAccessFailureRate({
        environment: input.environment,
        windowSeconds: rateWindowSeconds,
      }),
      this.#dependencies.consistency.entitlementConsistencyFailureCount(input),
      this.#dependencies.consistency.ownershipDuplicateConflictCount(input),
      this.#dependencies.verification.e2eEvidenceAgeSeconds(input),
    ]);

    return [
      metric(
        "database_connectivity_ratio",
        ratio(database),
        "ratio",
        database.total,
        rateWindowSeconds,
        input.occurredAt,
      ),
      metric(
        "runtime_route_availability_ratio",
        ratio(routes),
        "ratio",
        routes.total,
        rateWindowSeconds,
        input.occurredAt,
      ),
      metric(
        "webhook_delivery_failure_rate",
        failureRate(webhookRate),
        "ratio",
        webhookRate.total,
        webhookRate.windowSeconds,
        input.occurredAt,
      ),
      metric(
        "webhook_oldest_processing_age_seconds",
        nonnegative(webhookAge),
        "seconds",
        1,
        rateWindowSeconds,
        input.occurredAt,
      ),
      metric(
        "subscription_reconciliation_lag_seconds",
        nonnegative(reconciliationLag),
        "seconds",
        1,
        rateWindowSeconds,
        input.occurredAt,
      ),
      metric(
        "scheduler_last_success_age_seconds",
        nonnegative(schedulerAge),
        "seconds",
        1,
        rateWindowSeconds,
        input.occurredAt,
      ),
      metric(
        "dispatcher_backlog_count",
        nonnegative(dispatcherBacklog),
        "count",
        1,
        rateWindowSeconds,
        input.occurredAt,
      ),
      metric(
        "dispatcher_failure_rate",
        failureRate(dispatcherRate),
        "ratio",
        dispatcherRate.total,
        dispatcherRate.windowSeconds,
        input.occurredAt,
      ),
      metric(
        "recovery_required_rate",
        failureRate(recoveryRate),
        "ratio",
        recoveryRate.total,
        recoveryRate.windowSeconds,
        input.occurredAt,
      ),
      metric(
        "signed_access_failure_rate",
        failureRate(accessRate),
        "ratio",
        accessRate.total,
        accessRate.windowSeconds,
        input.occurredAt,
      ),
      metric(
        "entitlement_consistency_failure_count",
        nonnegative(entitlementFailures),
        "count",
        1,
        rateWindowSeconds,
        input.occurredAt,
      ),
      metric(
        "ownership_duplicate_conflict_count",
        nonnegative(ownershipConflicts),
        "count",
        1,
        rateWindowSeconds,
        input.occurredAt,
      ),
      metric(
        "e2e_evidence_age_seconds",
        nonnegative(e2eAge),
        "seconds",
        1,
        24 * 60 * 60,
        input.occurredAt,
      ),
    ];
  }
}
