import type {
  MMGPortalCycleRecord,
  MMGPortalSelectionRecord,
  MMGPortalSubscriptionRecord,
  MMGPortalSubscriptionStatus,
  MMGPortalWindowRecord,
} from "./subscription-dashboard.js";
import type { MMGSubscriptionPlanCode } from "../knowledge-library/entitlements.js";
import type {
  MMGSQLExecutor,
  MMGTransactionalDatabase,
} from "../knowledge-library/persistence.js";

export interface MMGCustomerPortalSubscriptionRepository {
  loadSubscriptionDashboardRecord(
    customerId: string,
    asOf: Date,
  ): Promise<MMGPortalSubscriptionRecord | null>;
}

interface SubscriptionRow extends Record<string, unknown> {
  id: string;
  status: string;
  plan_code: string;
  current_period_start: Date | string | null;
  current_period_end: Date | string | null;
}

interface CycleRow extends Record<string, unknown> {
  id: string;
  status: string;
  starts_at: Date | string;
  ends_at: Date | string;
  total_packages: number | string;
  confirmed_packages: number | string;
  total_units: number | string;
  consumed_units: number | string;
}

interface WindowRow extends Record<string, unknown> {
  id: string;
  package_sequence: number | string;
  window_type: string;
  status: string;
  total_units: number | string;
  target_asset_count: number | string;
  opens_at: Date | string | null;
  closes_at: Date | string | null;
  confirmed_at: Date | string | null;
  delivery_ready_at: Date | string | null;
  delivered_at: Date | string | null;
  delivery_reference: string | null;
  recovery_reason: string | null;
}

interface SelectionRow extends Record<string, unknown> {
  window_id: string;
  asset_id: string;
  title: string;
  product_url: string;
  square_thumbnail_url: string;
  topic: string;
  digital_format: string;
  units: number | string;
  state: string;
}

interface OwnershipCountRow extends Record<string, unknown> {
  total_owned_assets: number | string;
}

const integer = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const iso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const requiredISO = (value: unknown): string => iso(value) ?? new Date(0).toISOString();

const selectCurrentSubscription = async (
  database: MMGSQLExecutor,
  customerId: string,
): Promise<SubscriptionRow | null> => {
  const result = await database.query<SubscriptionRow>(
    `
      SELECT id, status, plan_code, current_period_start, current_period_end
      FROM mmg_subscription_entitlements
      WHERE customer_id = $1
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'paused' THEN 1
          WHEN 'pending' THEN 2
          WHEN 'canceled' THEN 3
          ELSE 4
        END,
        updated_at DESC
      LIMIT 1
    `,
    [customerId],
  );
  return result.rows[0] ?? null;
};

const selectCurrentCycle = async (
  database: MMGSQLExecutor,
  subscriptionId: string,
  asOf: Date,
): Promise<CycleRow | null> => {
  const result = await database.query<CycleRow>(
    `
      SELECT
        id,
        status,
        starts_at,
        ends_at,
        total_packages,
        confirmed_packages,
        total_units,
        consumed_units
      FROM mmg_entitlement_cycles
      WHERE subscription_entitlement_id = $1
      ORDER BY
        CASE
          WHEN starts_at <= $2 AND ends_at > $2 THEN 0
          WHEN status = 'active' THEN 1
          WHEN status = 'scheduled' THEN 2
          ELSE 3
        END,
        starts_at DESC
      LIMIT 1
    `,
    [subscriptionId, asOf.toISOString()],
  );
  return result.rows[0] ?? null;
};

const selectWindows = async (
  database: MMGSQLExecutor,
  cycleId: string,
): Promise<WindowRow[]> => {
  const result = await database.query<WindowRow>(
    `
      SELECT
        id,
        package_sequence,
        window_type,
        status,
        total_units,
        target_asset_count,
        opens_at,
        closes_at,
        confirmed_at,
        delivery_ready_at,
        delivered_at,
        delivery_reference,
        recovery_reason
      FROM mmg_entitlement_windows
      WHERE cycle_id = $1
      ORDER BY package_sequence ASC
    `,
    [cycleId],
  );
  return result.rows;
};

const selectSelections = async (
  database: MMGSQLExecutor,
  windowIds: string[],
): Promise<SelectionRow[]> => {
  if (windowIds.length === 0) return [];
  const result = await database.query<SelectionRow>(
    `
      SELECT
        s.window_id,
        s.asset_id,
        a.title,
        a.product_url,
        a.square_thumbnail_url,
        a.topic,
        a.digital_format,
        s.units,
        s.state
      FROM mmg_entitlement_selections s
      JOIN mmg_knowledge_assets a ON a.asset_id = s.asset_id
      WHERE s.window_id = ANY($1::uuid[])
      ORDER BY s.selected_at ASC, a.title ASC
    `,
    [windowIds],
  );
  return result.rows;
};

const selectOwnershipCount = async (
  database: MMGSQLExecutor,
  customerId: string,
  asOf: Date,
): Promise<number> => {
  const result = await database.query<OwnershipCountRow>(
    `
      SELECT COUNT(DISTINCT asset_id)::integer AS total_owned_assets
      FROM mmg_ownership_grants
      WHERE customer_id = $1
        AND status = 'active'
        AND (revoked_at IS NULL OR revoked_at > $2)
    `,
    [customerId, asOf.toISOString()],
  );
  return integer(result.rows[0]?.total_owned_assets);
};

const mapSelection = (row: SelectionRow): MMGPortalSelectionRecord => ({
  assetId: row.asset_id,
  title: row.title,
  url: row.product_url,
  squareThumbnailUrl: row.square_thumbnail_url,
  topic: row.topic,
  format: row.digital_format,
  units: integer(row.units),
  state: row.state as MMGPortalSelectionRecord["state"],
});

const mapWindow = (
  row: WindowRow,
  selections: MMGPortalSelectionRecord[],
): MMGPortalWindowRecord => ({
  id: row.id,
  packageSequence: integer(row.package_sequence),
  type: row.window_type as MMGPortalWindowRecord["type"],
  status: row.status as MMGPortalWindowRecord["status"],
  totalUnits: integer(row.total_units),
  targetAssetCount: integer(row.target_asset_count),
  opensAt: iso(row.opens_at),
  closesAt: iso(row.closes_at),
  confirmedAt: iso(row.confirmed_at),
  deliveryReadyAt: iso(row.delivery_ready_at),
  deliveredAt: iso(row.delivered_at),
  deliveryReference: row.delivery_reference,
  recoveryReason: row.recovery_reason,
  selections,
});

export class MMGPostgresCustomerPortalSubscriptionRepository
  implements MMGCustomerPortalSubscriptionRepository
{
  readonly #database: MMGTransactionalDatabase;

  constructor(database: MMGTransactionalDatabase) {
    this.#database = database;
  }

  async loadSubscriptionDashboardRecord(
    customerId: string,
    asOf: Date,
  ): Promise<MMGPortalSubscriptionRecord | null> {
    return this.#database.transaction(async (transaction) => {
      const subscription = await selectCurrentSubscription(transaction, customerId);
      if (!subscription) return null;

      const [cycle, totalOwnedAssets] = await Promise.all([
        selectCurrentCycle(transaction, subscription.id, asOf),
        selectOwnershipCount(transaction, customerId, asOf),
      ]);

      let mappedCycle: MMGPortalCycleRecord | null = null;
      if (cycle) {
        const windowRows = await selectWindows(transaction, cycle.id);
        const selectionRows = await selectSelections(
          transaction,
          windowRows.map((window) => window.id),
        );
        const selectionsByWindow = new Map<string, MMGPortalSelectionRecord[]>();
        for (const row of selectionRows) {
          const current = selectionsByWindow.get(row.window_id) ?? [];
          current.push(mapSelection(row));
          selectionsByWindow.set(row.window_id, current);
        }

        mappedCycle = {
          id: cycle.id,
          status: cycle.status as MMGPortalCycleRecord["status"],
          startsAt: requiredISO(cycle.starts_at),
          endsAt: requiredISO(cycle.ends_at),
          totalPackages: integer(cycle.total_packages),
          confirmedPackages: integer(cycle.confirmed_packages),
          totalUnits: integer(cycle.total_units),
          consumedUnits: integer(cycle.consumed_units),
          windows: windowRows.map((window) =>
            mapWindow(window, selectionsByWindow.get(window.id) ?? []),
          ),
        };
      }

      return {
        status: subscription.status as MMGPortalSubscriptionStatus,
        planCode: subscription.plan_code as MMGSubscriptionPlanCode,
        currentPeriodStart: iso(subscription.current_period_start),
        currentPeriodEnd: iso(subscription.current_period_end),
        cycle: mappedCycle,
        totalOwnedAssets,
      };
    });
  }
}
