import {
  MMG_SUBSCRIPTION_PLANS,
  type MMGSubscriptionPlanCode,
} from "../knowledge-library/entitlements.js";
import type {
  MMGSQLExecutor,
  MMGTransactionalDatabase,
} from "../knowledge-library/persistence.js";
import type {
  MMGShopifySubscriptionReconciliationCommand,
  MMGShopifyWebhookMetadata,
} from "./subscription-webhook-reconciliation.js";

export type MMGShopifyWebhookClaimState =
  | "claimed"
  | "retry_claimed"
  | "duplicate_processed";

export interface MMGShopifySubscriptionReconciliationResult {
  entitlementId: string;
  cycleId: string | null;
  cycleCreated: boolean;
  orderLinkUpdated: boolean;
  staleIgnored: boolean;
}

export interface MMGShopifySubscriptionWebhookRepository {
  claimWebhookDelivery(input: {
    metadata: MMGShopifyWebhookMetadata;
    payloadSha256: string;
    receivedAt: Date;
  }): Promise<MMGShopifyWebhookClaimState>;
  markWebhookProcessed(input: {
    webhookId: string;
    processedAt: Date;
    outcome: Record<string, unknown>;
  }): Promise<void>;
  markWebhookFailed(input: {
    webhookId: string;
    failedAt: Date;
    errorCode: string;
    retryable: boolean;
  }): Promise<void>;
  reconcileSubscription(
    command: MMGShopifySubscriptionReconciliationCommand,
  ): Promise<MMGShopifySubscriptionReconciliationResult>;
}

interface DeliveryRow extends Record<string, unknown> {
  status: string;
  payload_sha256: string;
}

interface EntitlementRow extends Record<string, unknown> {
  id: string;
  customer_id: string;
  plan_code: string;
  status: string;
  last_shopify_revision_id: string | number | null;
  last_shopify_triggered_at: Date | string | null;
}

interface CycleRow extends Record<string, unknown> {
  id: string;
}

const timestamp = (value: Date | string | null): number => {
  if (!value) return 0;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const revision = (value: string | number | null): bigint => {
  try {
    return value === null ? 0n : BigInt(String(value));
  } catch {
    return 0n;
  }
};

const plusDays = (value: Date, days: number): Date =>
  new Date(value.getTime() + days * 86_400_000);

const plusHours = (value: Date, hours: number): Date =>
  new Date(value.getTime() + hours * 3_600_000);

const windowOffsets = (planCode: MMGSubscriptionPlanCode): number[] => {
  switch (planCode) {
    case "monthly":
      return [0];
    case "biweekly":
      return [0, 14];
    case "weekly":
      return [0, 7, 14, 21];
  }
};

const isBillingSuccess = (
  command: MMGShopifySubscriptionReconciliationCommand,
): boolean => command.billingAttempt?.state === "succeeded";

const isTerminalStatus = (status: string): boolean =>
  status === "failed" || status === "canceled" || status === "expired";

const shouldIgnoreAsStale = (input: {
  currentRevision: string | number | null;
  currentTriggeredAt: Date | string | null;
  incomingRevision: string;
  incomingTriggeredAt: string;
}): boolean => {
  const current = revision(input.currentRevision);
  const incoming = revision(input.incomingRevision);
  if (current > incoming) return true;
  if (current < incoming) return false;
  return timestamp(input.currentTriggeredAt) >= timestamp(input.incomingTriggeredAt);
};

const createCycleAndWindows = async (input: {
  transaction: MMGSQLExecutor;
  entitlementId: string;
  planCode: MMGSubscriptionPlanCode;
  periodStart: Date;
  periodEnd: Date;
  triggeredAt: Date;
}): Promise<{ cycleId: string; created: boolean }> => {
  const plan = MMG_SUBSCRIPTION_PLANS[input.planCode];
  const priorCycleResult = await input.transaction.query(
    `
      SELECT 1
      FROM mmg_entitlement_cycles
      WHERE subscription_entitlement_id = $1
      LIMIT 1
    `,
    [input.entitlementId],
  );
  const firstCycle = priorCycleResult.rowCount === 0;
  const cycleStatus =
    input.periodStart.getTime() <= input.triggeredAt.getTime() &&
    input.triggeredAt.getTime() < input.periodEnd.getTime()
      ? "active"
      : "scheduled";

  const cycleResult = await input.transaction.query<CycleRow>(
    `
      INSERT INTO mmg_entitlement_cycles (
        subscription_entitlement_id,
        status,
        starts_at,
        ends_at,
        total_packages,
        total_units,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
      ON CONFLICT (subscription_entitlement_id, starts_at) DO NOTHING
      RETURNING id
    `,
    [
      input.entitlementId,
      cycleStatus,
      input.periodStart,
      input.periodEnd,
      plan.packagesPerBillingCycle,
      plan.assetsPerBillingCycle,
      input.triggeredAt,
    ],
  );

  const cycleId = cycleResult.rows[0]?.id;
  if (!cycleId) {
    const existing = await input.transaction.query<CycleRow>(
      `
        SELECT id
        FROM mmg_entitlement_cycles
        WHERE subscription_entitlement_id = $1
          AND starts_at = $2
        LIMIT 1
      `,
      [input.entitlementId, input.periodStart],
    );
    const existingId = existing.rows[0]?.id;
    if (!existingId) throw new Error("MMG_RECONCILIATION_CYCLE_LOOKUP_FAILED");
    return { cycleId: existingId, created: false };
  }

  const offsets = windowOffsets(input.planCode);
  if (offsets.length !== plan.packagesPerBillingCycle) {
    throw new Error("MMG_RECONCILIATION_WINDOW_PLAN_MISMATCH");
  }

  for (const [index, offset] of offsets.entries()) {
    const packageSequence = index + 1;
    const opensAt = plusDays(input.periodStart, offset);
    const closesAt = plusHours(opensAt, 48);
    const firstPackage = firstCycle && packageSequence === 1;
    const openImmediately =
      firstPackage &&
      opensAt.getTime() <= input.triggeredAt.getTime() &&
      input.triggeredAt.getTime() < closesAt.getTime();

    await input.transaction.query(
      `
        INSERT INTO mmg_entitlement_windows (
          cycle_id,
          package_sequence,
          window_type,
          status,
          total_units,
          target_asset_count,
          fallback_policy,
          opens_at,
          closes_at,
          opened_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, 2, 2, $5, $6, $7, $8, $9, $9)
        ON CONFLICT (cycle_id, package_sequence) DO NOTHING
      `,
      [
        cycleId,
        packageSequence,
        firstPackage ? "first_package" : "scheduled_package_review",
        openImmediately ? "open" : "scheduled",
        firstPackage ? "manual_recovery" : "auto_confirm_current_selection",
        opensAt,
        closesAt,
        openImmediately ? input.triggeredAt : null,
        input.triggeredAt,
      ],
    );
  }

  return { cycleId, created: true };
};

export class MMGPostgresShopifySubscriptionWebhookRepository
  implements MMGShopifySubscriptionWebhookRepository
{
  readonly #database: MMGTransactionalDatabase;

  constructor(database: MMGTransactionalDatabase) {
    this.#database = database;
  }

  async claimWebhookDelivery(input: {
    metadata: MMGShopifyWebhookMetadata;
    payloadSha256: string;
    receivedAt: Date;
  }): Promise<MMGShopifyWebhookClaimState> {
    return this.#database.transaction(async (transaction) => {
      const existing = await transaction.query<DeliveryRow>(
        `
          SELECT status, payload_sha256
          FROM mmg_shopify_webhook_deliveries
          WHERE webhook_id = $1
          FOR UPDATE
        `,
        [input.metadata.webhookId],
      );
      const row = existing.rows[0];

      if (!row) {
        await transaction.query(
          `
            INSERT INTO mmg_shopify_webhook_deliveries (
              webhook_id,
              event_id,
              shop_domain,
              topic,
              api_version,
              triggered_at,
              subscription_name,
              payload_sha256,
              status,
              delivery_attempts,
              first_received_at,
              last_received_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing', 1, $9, $9)
          `,
          [
            input.metadata.webhookId,
            input.metadata.eventId,
            input.metadata.shopDomain,
            input.metadata.topic,
            input.metadata.apiVersion,
            input.metadata.triggeredAt,
            input.metadata.subscriptionName,
            input.payloadSha256,
            input.receivedAt,
          ],
        );
        return "claimed";
      }

      if (row.payload_sha256 !== input.payloadSha256) {
        throw new Error("MMG_SHOPIFY_WEBHOOK_ID_PAYLOAD_COLLISION");
      }
      if (row.status === "processed" || row.status === "ignored") {
        return "duplicate_processed";
      }

      await transaction.query(
        `
          UPDATE mmg_shopify_webhook_deliveries
          SET
            status = 'processing',
            delivery_attempts = delivery_attempts + 1,
            last_received_at = $2,
            failure_code = NULL,
            retryable = NULL,
            updated_at = $2
          WHERE webhook_id = $1
        `,
        [input.metadata.webhookId, input.receivedAt],
      );
      return "retry_claimed";
    });
  }

  async markWebhookProcessed(input: {
    webhookId: string;
    processedAt: Date;
    outcome: Record<string, unknown>;
  }): Promise<void> {
    await this.#database.query(
      `
        UPDATE mmg_shopify_webhook_deliveries
        SET
          status = 'processed',
          processed_at = $2,
          processing_outcome = $3::jsonb,
          failure_code = NULL,
          retryable = NULL,
          updated_at = $2
        WHERE webhook_id = $1
      `,
      [input.webhookId, input.processedAt, JSON.stringify(input.outcome)],
    );
  }

  async markWebhookFailed(input: {
    webhookId: string;
    failedAt: Date;
    errorCode: string;
    retryable: boolean;
  }): Promise<void> {
    await this.#database.query(
      `
        UPDATE mmg_shopify_webhook_deliveries
        SET
          status = 'failed',
          failure_code = $2,
          retryable = $3,
          updated_at = $4
        WHERE webhook_id = $1
      `,
      [input.webhookId, input.errorCode, input.retryable, input.failedAt],
    );
  }

  async reconcileSubscription(
    command: MMGShopifySubscriptionReconciliationCommand,
  ): Promise<MMGShopifySubscriptionReconciliationResult> {
    return this.#database.transaction(async (transaction) => {
      const existing = await transaction.query<EntitlementRow>(
        `
          SELECT
            id,
            customer_id,
            plan_code,
            status,
            last_shopify_revision_id,
            last_shopify_triggered_at
          FROM mmg_subscription_entitlements
          WHERE provider = 'shopify'
            AND provider_contract_id = $1
          FOR UPDATE
        `,
        [command.contract.contractId],
      );
      const current = existing.rows[0];

      if (
        current &&
        shouldIgnoreAsStale({
          currentRevision: current.last_shopify_revision_id,
          currentTriggeredAt: current.last_shopify_triggered_at,
          incomingRevision: command.contract.revisionId,
          incomingTriggeredAt: command.metadata.triggeredAt,
        })
      ) {
        return {
          entitlementId: current.id,
          cycleId: null,
          cycleCreated: false,
          orderLinkUpdated: false,
          staleIgnored: true,
        };
      }

      if (current && current.customer_id !== command.contract.customerId) {
        throw new Error("MMG_SHOPIFY_CONTRACT_CUSTOMER_MISMATCH");
      }

      const entitlementResult = await transaction.query<EntitlementRow>(
        `
          INSERT INTO mmg_subscription_entitlements (
            customer_id,
            provider,
            provider_contract_id,
            plan_code,
            status,
            current_period_start,
            current_period_end,
            shop_domain,
            origin_order_id,
            shopify_variant_id,
            shopify_selling_plan_id,
            contract_status_raw,
            last_shopify_revision_id,
            last_shopify_triggered_at,
            last_shopify_webhook_id,
            created_at,
            updated_at
          )
          VALUES (
            $1, 'shopify', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15
          )
          ON CONFLICT (provider_contract_id)
          DO UPDATE SET
            customer_id = EXCLUDED.customer_id,
            plan_code = EXCLUDED.plan_code,
            status = EXCLUDED.status,
            current_period_start = COALESCE(EXCLUDED.current_period_start, mmg_subscription_entitlements.current_period_start),
            current_period_end = COALESCE(EXCLUDED.current_period_end, mmg_subscription_entitlements.current_period_end),
            shop_domain = EXCLUDED.shop_domain,
            origin_order_id = EXCLUDED.origin_order_id,
            shopify_variant_id = EXCLUDED.shopify_variant_id,
            shopify_selling_plan_id = EXCLUDED.shopify_selling_plan_id,
            contract_status_raw = EXCLUDED.contract_status_raw,
            last_shopify_revision_id = EXCLUDED.last_shopify_revision_id,
            last_shopify_triggered_at = EXCLUDED.last_shopify_triggered_at,
            last_shopify_webhook_id = EXCLUDED.last_shopify_webhook_id,
            version = mmg_subscription_entitlements.version + 1,
            updated_at = EXCLUDED.updated_at
          RETURNING id, customer_id, plan_code, status, last_shopify_revision_id, last_shopify_triggered_at
        `,
        [
          command.contract.customerId,
          command.contract.contractId,
          command.planCode,
          command.entitlementStatus,
          command.contract.currentPeriodStart,
          command.contract.currentPeriodEnd,
          command.metadata.shopDomain,
          command.contract.originOrderId,
          command.contract.canonicalLine.variantId,
          command.contract.canonicalLine.sellingPlanId,
          command.contract.status,
          command.contract.revisionId,
          command.metadata.triggeredAt,
          command.metadata.webhookId,
          new Date(command.metadata.triggeredAt),
        ],
      );
      const entitlementId = entitlementResult.rows[0]?.id;
      if (!entitlementId) throw new Error("MMG_RECONCILIATION_ENTITLEMENT_UPSERT_FAILED");

      await transaction.query(
        `
          INSERT INTO mmg_shopify_subscription_contracts (
            shop_domain,
            contract_id,
            customer_id,
            origin_order_id,
            revision_id,
            status,
            plan_code,
            product_id,
            variant_id,
            selling_plan_id,
            currency_code,
            next_billing_date,
            current_period_start,
            current_period_end,
            contract_updated_at,
            last_webhook_id,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
          ON CONFLICT (shop_domain, contract_id)
          DO UPDATE SET
            customer_id = EXCLUDED.customer_id,
            origin_order_id = EXCLUDED.origin_order_id,
            revision_id = EXCLUDED.revision_id,
            status = EXCLUDED.status,
            plan_code = EXCLUDED.plan_code,
            product_id = EXCLUDED.product_id,
            variant_id = EXCLUDED.variant_id,
            selling_plan_id = EXCLUDED.selling_plan_id,
            currency_code = EXCLUDED.currency_code,
            next_billing_date = EXCLUDED.next_billing_date,
            current_period_start = COALESCE(EXCLUDED.current_period_start, mmg_shopify_subscription_contracts.current_period_start),
            current_period_end = COALESCE(EXCLUDED.current_period_end, mmg_shopify_subscription_contracts.current_period_end),
            contract_updated_at = EXCLUDED.contract_updated_at,
            last_webhook_id = EXCLUDED.last_webhook_id,
            updated_at = EXCLUDED.updated_at
        `,
        [
          command.metadata.shopDomain,
          command.contract.contractId,
          command.contract.customerId,
          command.contract.originOrderId,
          command.contract.revisionId,
          command.contract.status,
          command.planCode,
          command.contract.canonicalLine.productId,
          command.contract.canonicalLine.variantId,
          command.contract.canonicalLine.sellingPlanId,
          command.contract.currencyCode,
          command.contract.nextBillingDate,
          command.contract.currentPeriodStart,
          command.contract.currentPeriodEnd,
          command.contract.updatedAt,
          command.metadata.webhookId,
          new Date(command.metadata.triggeredAt),
        ],
      );

      const orderLinkResult = await transaction.query(
        `
          UPDATE mmg_subscription_order_links
          SET
            customer_id = $4,
            subscription_entitlement_id = $5,
            link_status = 'linked',
            linked_at = COALESCE(linked_at, $6),
            failure_reason = NULL,
            updated_at = $6
          WHERE shop_domain = $1
            AND order_id = $2
            AND plan_code = $3
            AND link_status IN ('pending', 'linked')
        `,
        [
          command.metadata.shopDomain,
          command.contract.originOrderId,
          command.planCode,
          command.contract.customerId,
          entitlementId,
          new Date(command.metadata.triggeredAt),
        ],
      );

      if (command.billingAttempt) {
        await transaction.query(
          `
            INSERT INTO mmg_shopify_subscription_billing_attempts (
              shop_domain,
              idempotency_key,
              contract_id,
              entitlement_id,
              state,
              order_id,
              ready,
              error_code,
              error_message,
              webhook_id,
              triggered_at,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $11)
            ON CONFLICT (shop_domain, idempotency_key)
            DO UPDATE SET
              contract_id = EXCLUDED.contract_id,
              entitlement_id = EXCLUDED.entitlement_id,
              state = CASE
                WHEN mmg_shopify_subscription_billing_attempts.state = 'succeeded' THEN 'succeeded'
                WHEN EXCLUDED.state = 'succeeded' THEN 'succeeded'
                WHEN EXCLUDED.state = 'failed' THEN 'failed'
                ELSE EXCLUDED.state
              END,
              order_id = COALESCE(EXCLUDED.order_id, mmg_shopify_subscription_billing_attempts.order_id),
              ready = EXCLUDED.ready,
              error_code = EXCLUDED.error_code,
              error_message = EXCLUDED.error_message,
              webhook_id = EXCLUDED.webhook_id,
              triggered_at = GREATEST(mmg_shopify_subscription_billing_attempts.triggered_at, EXCLUDED.triggered_at),
              updated_at = EXCLUDED.updated_at
          `,
          [
            command.metadata.shopDomain,
            command.billingAttempt.idempotencyKey,
            command.contract.contractId,
            entitlementId,
            command.billingAttempt.state,
            command.billingAttempt.orderId,
            command.billingAttempt.ready,
            command.billingAttempt.errorCode,
            command.billingAttempt.errorMessage,
            command.metadata.webhookId,
            new Date(command.metadata.triggeredAt),
          ],
        );

        const successAt = command.billingAttempt.state === "succeeded"
          ? new Date(command.metadata.triggeredAt)
          : null;
        const failureAt = command.billingAttempt.state === "failed"
          ? new Date(command.metadata.triggeredAt)
          : null;
        await transaction.query(
          `
            UPDATE mmg_subscription_entitlements
            SET
              last_billing_attempt_at = $2,
              last_billing_success_at = COALESCE($3, last_billing_success_at),
              last_billing_failure_at = COALESCE($4, last_billing_failure_at),
              billing_failure_code = CASE WHEN $4 IS NOT NULL THEN $5 ELSE NULL END,
              updated_at = $2
            WHERE id = $1
          `,
          [
            entitlementId,
            new Date(command.metadata.triggeredAt),
            successAt,
            failureAt,
            command.billingAttempt.errorCode,
          ],
        );
      }

      let cycleId: string | null = null;
      let cycleCreated = false;
      if (
        command.entitlementStatus === "active" &&
        command.contract.currentPeriodStart &&
        command.contract.currentPeriodEnd
      ) {
        const cycle = await createCycleAndWindows({
          transaction,
          entitlementId,
          planCode: command.planCode,
          periodStart: new Date(command.contract.currentPeriodStart),
          periodEnd: new Date(command.contract.currentPeriodEnd),
          triggeredAt: new Date(command.metadata.triggeredAt),
        });
        cycleId = cycle.cycleId;
        cycleCreated = cycle.created;
      }

      if (command.entitlementStatus === "paused" || isTerminalStatus(command.entitlementStatus)) {
        await transaction.query(
          `
            UPDATE mmg_entitlement_cycles
            SET status = 'canceled', version = version + 1, updated_at = $2
            WHERE subscription_entitlement_id = $1
              AND status = 'scheduled'
              AND starts_at >= $2
          `,
          [entitlementId, new Date(command.metadata.triggeredAt)],
        );
      }

      await transaction.query(
        `
          INSERT INTO mmg_entitlement_events (
            customer_id,
            cycle_id,
            event_type,
            event_payload,
            created_at
          )
          VALUES ($1, $2, 'shopify_subscription_reconciled', $3::jsonb, $4)
        `,
        [
          command.contract.customerId,
          cycleId,
          JSON.stringify({
            webhookId: command.metadata.webhookId,
            topic: command.metadata.topic,
            contractId: command.contract.contractId,
            revisionId: command.contract.revisionId,
            contractStatus: command.contract.status,
            planCode: command.planCode,
            billingAttemptState: command.billingAttempt?.state ?? null,
            cycleCreated,
          }),
          new Date(command.metadata.triggeredAt),
        ],
      );

      return {
        entitlementId,
        cycleId,
        cycleCreated,
        orderLinkUpdated: orderLinkResult.rowCount > 0,
        staleIgnored: false,
      };
    });
  }
}
