import type { MMGSubscriptionPlanCode } from "../knowledge-library/entitlements.js";
import type {
  MMGThankYouEntitlementSnapshot,
  MMGVerifiedThankYouOrder,
} from "./thank-you-first-title-handoff.js";
import type { MMGSQLExecutor, MMGTransactionalDatabase } from "../knowledge-library/persistence.js";

export interface MMGVerifiedSubscriptionOrderLink {
  shopDomain: string;
  orderId: string;
  checkoutTokenHash: string;
  customerId: string | null;
  planCode: MMGSubscriptionPlanCode;
  verifiedAt: Date;
}

export interface MMGThankYouHandoffRepository {
  recordVerifiedSubscriptionOrder(link: MMGVerifiedSubscriptionOrderLink): Promise<void>;
  loadEntitlementForOrder(input: {
    shopDomain: string;
    orderId: string;
    customerId: string;
  }): Promise<MMGThankYouEntitlementSnapshot | null>;
}

interface LinkRow extends Record<string, unknown> {
  subscription_entitlement_id: string | null;
}

interface EntitlementRow extends Record<string, unknown> {
  id: string;
  customer_id: string;
  status: string;
  plan_code: string;
}

interface WindowRow extends Record<string, unknown> {
  id: string;
  window_type: string;
  status: string;
  selected_asset_count: number | string;
  target_asset_count: number | string;
  closes_at: Date | string | null;
  recovery_reason: string | null;
}

const integer = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const iso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const planCode = (value: unknown): MMGSubscriptionPlanCode => {
  if (value === "monthly" || value === "biweekly" || value === "weekly") return value;
  throw new Error("The linked subscription entitlement has an invalid plan code.");
};

export class MMGPostgresThankYouHandoffRepository
  implements MMGThankYouHandoffRepository
{
  readonly #database: MMGTransactionalDatabase;

  constructor(database: MMGTransactionalDatabase) {
    this.#database = database;
  }

  async recordVerifiedSubscriptionOrder(
    link: MMGVerifiedSubscriptionOrderLink,
  ): Promise<void> {
    await this.#database.query(
      `
        INSERT INTO mmg_subscription_order_links (
          shop_domain,
          order_id,
          checkout_token_hash,
          customer_id,
          plan_code,
          link_status,
          verified_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'pending', $6, $6)
        ON CONFLICT (shop_domain, order_id)
        DO UPDATE SET
          checkout_token_hash = EXCLUDED.checkout_token_hash,
          customer_id = COALESCE(mmg_subscription_order_links.customer_id, EXCLUDED.customer_id),
          plan_code = EXCLUDED.plan_code,
          verified_at = GREATEST(mmg_subscription_order_links.verified_at, EXCLUDED.verified_at),
          updated_at = EXCLUDED.updated_at
      `,
      [
        link.shopDomain,
        link.orderId,
        link.checkoutTokenHash,
        link.customerId,
        link.planCode,
        link.verifiedAt,
      ],
    );
  }

  async loadEntitlementForOrder(input: {
    shopDomain: string;
    orderId: string;
    customerId: string;
  }): Promise<MMGThankYouEntitlementSnapshot | null> {
    return this.#database.transaction(async (transaction) => {
      const linkResult = await transaction.query<LinkRow>(
        `
          SELECT subscription_entitlement_id
          FROM mmg_subscription_order_links
          WHERE shop_domain = $1
            AND order_id = $2
            AND customer_id = $3
            AND link_status = 'linked'
          FOR SHARE
        `,
        [input.shopDomain, input.orderId, input.customerId],
      );

      const entitlementId = linkResult.rows[0]?.subscription_entitlement_id;
      if (!entitlementId) return null;

      const entitlementResult = await transaction.query<EntitlementRow>(
        `
          SELECT id, customer_id, status, plan_code
          FROM mmg_subscription_entitlements
          WHERE id = $1
            AND customer_id = $2
          LIMIT 1
        `,
        [entitlementId, input.customerId],
      );
      const entitlement = entitlementResult.rows[0];
      if (!entitlement) return null;

      const windowResult = await transaction.query<WindowRow>(
        `
          SELECT
            window.id,
            window.window_type,
            window.status,
            window.target_asset_count,
            window.closes_at,
            window.recovery_reason,
            COUNT(selection.asset_id)::integer AS selected_asset_count
          FROM mmg_entitlement_cycles cycle
          JOIN mmg_entitlement_windows window ON window.cycle_id = cycle.id
          LEFT JOIN mmg_entitlement_selections selection ON selection.window_id = window.id
          WHERE cycle.subscription_entitlement_id = $1
            AND window.package_sequence = 1
            AND window.window_type IN ('first_package', 'manual_recovery_window')
          GROUP BY window.id
          ORDER BY
            CASE window.status
              WHEN 'recovery_required' THEN 0
              WHEN 'open' THEN 1
              WHEN 'delivery_ready' THEN 2
              WHEN 'confirmed' THEN 3
              WHEN 'delivered' THEN 4
              WHEN 'scheduled' THEN 5
              ELSE 6
            END,
            window.updated_at DESC
          LIMIT 1
        `,
        [entitlement.id],
      );
      const window = windowResult.rows[0] ?? null;

      return {
        entitlementId: entitlement.id,
        customerId: entitlement.customer_id,
        status: entitlement.status as MMGThankYouEntitlementSnapshot["status"],
        planCode: planCode(entitlement.plan_code),
        firstWindow: window
          ? {
              id: window.id,
              type: window.window_type as MMGThankYouEntitlementSnapshot["firstWindow"] extends infer Window
                ? Window extends { type: infer Type }
                  ? Type
                  : never
                : never,
              status: window.status as MMGThankYouEntitlementSnapshot["firstWindow"] extends infer Window
                ? Window extends { status: infer Status }
                  ? Status
                  : never
                : never,
              selectedAssetCount: integer(window.selected_asset_count),
              targetAssetCount: integer(window.target_asset_count),
              closesAt: iso(window.closes_at),
              recoveryReason: window.recovery_reason,
            }
          : null,
      };
    });
  }
}

export interface MMGThankYouOrderGateway {
  loadVerifiedOrder(input: {
    shopDomain: string;
    orderId: string;
    checkoutToken: string;
  }): Promise<MMGVerifiedThankYouOrder | null>;
}
