import type { MMGTransactionalDatabase } from "../knowledge-library/persistence.js";
import {
  buildMMGCommerceAlertPlan,
  MMG_COMMERCE_ALERT_POLICIES,
  type MMGCommerceAlertChannel,
} from "./commerce-alert-routing.js";
import type {
  MMGCommerceIncidentRecord,
  MMGCommerceAlertAdapter,
} from "./commerce-operations-service.js";
import type {
  MMGCommerceOperationsEnvironment,
  MMGCommerceSignalEvaluation,
} from "./commerce-operations-control.js";

export interface MMGCommerceAlertHasher {
  sha256(value: string): Promise<string>;
}

export interface MMGCommerceAlertDeliveryStore {
  record(input: {
    alertId: string;
    incidentId: string;
    channel: MMGCommerceAlertChannel;
    destinationHash: string;
    status: "delivered" | "failed" | "suppressed";
    providerReferenceHash: string | null;
    errorCode: string | null;
    occurredAt: Date;
  }): Promise<void>;
}

export class MMGPostgresCommerceAlertDeliveryStore
  implements MMGCommerceAlertDeliveryStore
{
  readonly #database: MMGTransactionalDatabase;

  constructor(database: MMGTransactionalDatabase) {
    this.#database = database;
  }

  async record(input: {
    alertId: string;
    incidentId: string;
    channel: MMGCommerceAlertChannel;
    destinationHash: string;
    status: "delivered" | "failed" | "suppressed";
    providerReferenceHash: string | null;
    errorCode: string | null;
    occurredAt: Date;
  }): Promise<void> {
    await this.#database.query(
      `INSERT INTO mmg_commerce_alert_deliveries (
         alert_id, incident_id, channel, destination_hash, status,
         attempt_count, provider_reference_hash, last_error_code,
         first_attempted_at, delivered_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, 1, $6, $7, $8,
         CASE WHEN $5 = 'delivered' THEN $8 ELSE NULL END, $8
       )
       ON CONFLICT (alert_id)
       DO UPDATE SET
         status = EXCLUDED.status,
         attempt_count = mmg_commerce_alert_deliveries.attempt_count + 1,
         provider_reference_hash = EXCLUDED.provider_reference_hash,
         last_error_code = EXCLUDED.last_error_code,
         delivered_at = CASE
           WHEN EXCLUDED.status = 'delivered' THEN EXCLUDED.updated_at
           ELSE mmg_commerce_alert_deliveries.delivered_at
         END,
         updated_at = EXCLUDED.updated_at`,
      [
        input.alertId,
        input.incidentId,
        input.channel,
        input.destinationHash,
        input.status,
        input.providerReferenceHash,
        input.errorCode,
        input.occurredAt,
      ],
    );
  }
}

export interface MMGWebhookCommerceAlertAdapterConfig {
  destinations: Partial<Record<MMGCommerceAlertChannel, string>>;
  hasher: MMGCommerceAlertHasher;
  store: MMGCommerceAlertDeliveryStore;
  requestTimeoutMs: number;
  fetcher?: typeof fetch;
  now?: () => Date;
}

export class MMGWebhookCommerceAlertAdapter implements MMGCommerceAlertAdapter {
  readonly #config: MMGWebhookCommerceAlertAdapterConfig;

  constructor(config: MMGWebhookCommerceAlertAdapterConfig) {
    this.#config = config;
  }

  async notify(input: {
    environment: MMGCommerceOperationsEnvironment;
    incident: MMGCommerceIncidentRecord;
    signal: MMGCommerceSignalEvaluation;
    automaticContainmentApplied: boolean;
  }): Promise<void> {
    const occurredAt = this.#config.now?.() ?? new Date();
    const plan = buildMMGCommerceAlertPlan({
      incident: input.incident,
      signal: input.signal,
      occurredAt,
    });
    const policy = MMG_COMMERCE_ALERT_POLICIES[input.incident.severity];
    const failures: string[] = [];
    for (const channel of plan.channels) {
      const destination = this.#config.destinations[channel];
      if (!destination) {
        if (!policy.suppressible) failures.push(`MMG_ALERT_DESTINATION_MISSING:${channel}`);
        continue;
      }
      const destinationHash = await this.#config.hasher.sha256(destination);
      const alertId = `${plan.deduplicationKey}:${channel}`;
      try {
        const providerReferenceHash = await this.#deliver({
          destination,
          channel,
          plan,
          incident: input.incident,
          signal: input.signal,
          automaticContainmentApplied: input.automaticContainmentApplied,
        });
        await this.#config.store.record({
          alertId,
          incidentId: input.incident.incidentId,
          channel,
          destinationHash,
          status: "delivered",
          providerReferenceHash,
          errorCode: null,
          occurredAt,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message.split(":", 1)[0] : "MMG_ALERT_DELIVERY_FAILED";
        await this.#config.store.record({
          alertId,
          incidentId: input.incident.incidentId,
          channel,
          destinationHash,
          status: "failed",
          providerReferenceHash: null,
          errorCode: code,
          occurredAt,
        });
        failures.push(`${code}:${channel}`);
      }
    }
    if (failures.length > 0 && !policy.suppressible) {
      throw new Error(`MMG_REQUIRED_ALERT_DELIVERY_FAILED:${failures.join(",")}`);
    }
  }

  async #deliver(input: {
    destination: string;
    channel: MMGCommerceAlertChannel;
    plan: ReturnType<typeof buildMMGCommerceAlertPlan>;
    incident: MMGCommerceIncidentRecord;
    signal: MMGCommerceSignalEvaluation;
    automaticContainmentApplied: boolean;
  }): Promise<string | null> {
    const fetcher = this.#config.fetcher ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#config.requestTimeoutMs);
    try {
      const response = await fetcher(input.destination, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-MMG-Alert-Deduplication-Key": input.plan.deduplicationKey,
        },
        body: JSON.stringify({
          schemaVersion: input.plan.schemaVersion,
          channel: input.channel,
          environment: input.plan.environment,
          incident: {
            incidentId: input.incident.incidentId,
            severity: input.incident.severity,
            state: input.incident.state,
            title: input.incident.title,
            summary: input.incident.summary,
            firstSeenAt: input.incident.firstSeenAt,
            lastSeenAt: input.incident.lastSeenAt,
            version: input.incident.version,
          },
          signal: {
            code: input.signal.code,
            status: input.signal.status,
            reasonCode: input.signal.reasonCode,
            value: input.signal.value,
            unit: input.signal.unit,
            sampleSize: input.signal.sampleSize,
            observedAt: input.signal.observedAt,
          },
          responseTargets: {
            acknowledgementDueAt: input.plan.acknowledgementDueAt,
            mitigationDueAt: input.plan.mitigationDueAt,
            repeatAfter: input.plan.repeatAfter,
          },
          automaticContainmentApplied: input.automaticContainmentApplied,
          customerDataIncluded: false,
          rawProviderPayloadIncluded: false,
        }),
      });
      if (!response.ok) throw new Error(`MMG_ALERT_PROVIDER_REJECTED:${response.status}`);
      const providerReference = response.headers.get("x-request-id");
      return providerReference
        ? await this.#config.hasher.sha256(providerReference)
        : null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
