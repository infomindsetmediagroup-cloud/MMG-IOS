import {
  buildMMGEntitlementCounter,
  type MMGEntitlementCycleInput,
  type MMGEntitlementWindowInput,
  type MMGSubscriptionPlanCode,
} from "./entitlements.js";
import {
  buildMMGOwnershipSnapshot,
  type MMGOwnershipGrantRecord,
  type MMGOwnershipGrantSource,
  type MMGOwnershipGrantStatus,
} from "./ownership.js";
import type {
  MMGEntitlementOwnershipRepository,
  MMGSQLExecutor,
  MMGTransactionalDatabase,
} from "./persistence.js";
import type {
  MMGPickerAsset,
  MMGPickerSelection,
  MMGPickerState,
} from "./picker.js";
import type { MMGPickerPrincipal } from "./picker-service.js";

interface WindowRow extends Record<string, unknown> {
  id: string;
  cycle_id: string;
  window_type: string;
  status: string;
  total_units: number | string;
  target_asset_count: number | string;
  version: number | string;
  package_sequence: number | string;
  opens_at: Date | string | null;
  closes_at: Date | string | null;
  confirmed_at: Date | string | null;
  subscription_status: string;
}

interface CycleRow extends Record<string, unknown> {
  id: string;
  plan_code: string;
  status: string;
  starts_at: Date | string;
  ends_at: Date | string;
  total_packages: number | string;
  total_units: number | string;
  version: number | string;
}

interface SelectionRow extends Record<string, unknown> {
  window_id: string;
  asset_id: string;
  units: number | string;
  state: string;
  selected_at: Date | string;
}

interface AssetRow extends Record<string, unknown> {
  asset_id: string;
  shopify_product_id: string;
  handle: string;
  title: string;
  product_url: string;
  topic: string;
  experience_level: string;
  digital_format: string;
  series: string | null;
  series_order: number | string | null;
  portrait_cover_url: string;
  square_thumbnail_url: string;
  summary: string | null;
  product_type: string;
  asset_status: string;
  published: boolean;
  available: boolean;
  subscription_eligible: boolean;
  subscription_value: number | string;
  portrait_cover_present: boolean;
  square_thumbnail_present: boolean;
  delivery_package_verified: boolean;
  delivery_package_reference: string | null;
  customer_destination: string;
}

interface OwnershipRow extends Record<string, unknown> {
  id: string;
  customer_id: string;
  asset_id: string;
  source: string;
  source_reference: string;
  status: string;
  granted_at: Date | string;
  revoked_at: Date | string | null;
}

interface RequestRow extends Record<string, unknown> {
  request_id: string;
}

interface ConfirmationAssetRow extends Record<string, unknown> {
  asset_id: string;
  product_type: string;
  asset_status: string;
  published: boolean;
  available: boolean;
  subscription_eligible: boolean;
  subscription_value: number | string;
  portrait_cover_present: boolean;
  square_thumbnail_present: boolean;
  delivery_package_verified: boolean;
  delivery_package_reference: string | null;
  customer_destination: string;
}

interface CurrentWindowLockRow extends Record<string, unknown> {
  id: string;
  cycle_id: string;
  customer_id: string;
  status: string;
  version: number | string;
}

interface DeliveryUnitsRow extends Record<string, unknown> {
  delivered_units: number | string;
}

const asInteger = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const asBoolean = (value: unknown): boolean => value === true || value === "true";

const asISO = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const requiredISO = (value: unknown): string => asISO(value) ?? new Date(0).toISOString();

const mapAsset = (row: AssetRow): MMGPickerAsset => ({
  assetId: row.asset_id,
  shopifyProductId: row.shopify_product_id,
  handle: row.handle,
  title: row.title,
  url: row.product_url,
  topic: row.topic,
  experienceLevel: row.experience_level,
  format: row.digital_format,
  series: row.series,
  seriesOrder: row.series_order === null ? null : asInteger(row.series_order),
  portraitCoverUrl: row.portrait_cover_url,
  squareThumbnailUrl: row.square_thumbnail_url,
  summary: row.summary,
  productType: row.product_type,
  assetStatus: row.asset_status,
  published: asBoolean(row.published),
  available: asBoolean(row.available),
  subscriptionEligible: asBoolean(row.subscription_eligible),
  subscriptionValue: asInteger(row.subscription_value),
  portraitCoverPresent: asBoolean(row.portrait_cover_present),
  squareThumbnailPresent: asBoolean(row.square_thumbnail_present),
  deliveryPackageVerified: asBoolean(row.delivery_package_verified),
  customerDestination: row.customer_destination,
});

const mapSelection = (row: SelectionRow): MMGPickerSelection => ({
  assetId: row.asset_id,
  units: asInteger(row.units),
  state: row.state as MMGPickerSelection["state"],
  selectedAt: requiredISO(row.selected_at),
});

const mapOwnershipGrant = (row: OwnershipRow): MMGOwnershipGrantRecord => ({
  id: row.id,
  customerId: row.customer_id,
  assetId: row.asset_id,
  source: row.source as MMGOwnershipGrantSource,
  sourceReference: row.source_reference,
  status: row.status as MMGOwnershipGrantStatus,
  grantedAt: requiredISO(row.granted_at),
  revokedAt: asISO(row.revoked_at),
});

const WINDOW_FOR_CUSTOMER_SQL = `
  SELECT
    w.id,
    w.cycle_id,
    w.window_type,
    w.status,
    w.total_units,
    w.target_asset_count,
    w.version,
    w.package_sequence,
    w.opens_at,
    w.closes_at,
    w.confirmed_at,
    e.status AS subscription_status
  FROM mmg_entitlement_windows w
  JOIN mmg_entitlement_cycles c ON c.id = w.cycle_id
  JOIN mmg_subscription_entitlements e ON e.id = c.subscription_entitlement_id
  WHERE e.customer_id = $1
    AND e.status = 'active'
    AND c.status IN ('scheduled', 'active', 'completed')
    AND w.status IN ('open', 'scheduled', 'confirmed')
  ORDER BY
    CASE w.status WHEN 'open' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
    w.package_sequence DESC
  LIMIT 1
`;

const ASSETS_SQL = `
  SELECT
    asset_id,
    shopify_product_id,
    handle,
    title,
    product_url,
    topic,
    experience_level,
    digital_format,
    series,
    series_order,
    portrait_cover_url,
    square_thumbnail_url,
    summary,
    product_type,
    asset_status,
    published,
    available,
    subscription_eligible,
    subscription_value,
    portrait_cover_present,
    square_thumbnail_present,
    delivery_package_verified,
    delivery_package_reference,
    customer_destination
  FROM mmg_knowledge_assets
  WHERE catalog_visible = TRUE
  ORDER BY COALESCE(series, ''), COALESCE(series_order, 2147483647), title
`;

const ACTIVE_OWNERSHIP_SQL = `
  SELECT id, customer_id, asset_id, source, source_reference, status, granted_at, revoked_at
  FROM mmg_ownership_grants
  WHERE customer_id = $1
    AND status = 'active'
    AND (revoked_at IS NULL OR revoked_at > NOW())
  ORDER BY granted_at ASC
`;

const SELECTIONS_SQL = `
  SELECT window_id, asset_id, units, state, selected_at
  FROM mmg_entitlement_selections
  WHERE window_id = $1
  ORDER BY selected_at ASC, asset_id ASC
`;

const PROCESSED_REQUESTS_SQL = `
  SELECT request_id
  FROM mmg_picker_requests
  WHERE window_id = $1
  ORDER BY created_at DESC
  LIMIT 100
`;

export class MMGPostgresEntitlementOwnershipRepository
  implements MMGEntitlementOwnershipRepository
{
  readonly #database: MMGTransactionalDatabase;

  constructor(database: MMGTransactionalDatabase) {
    this.#database = database;
  }

  async load(principal: MMGPickerPrincipal): Promise<MMGPickerState | null> {
    return this.#database.transaction(async (transaction) => {
      const windowResult = await transaction.query<WindowRow>(
        WINDOW_FOR_CUSTOMER_SQL,
        [principal.customerId],
      );
      const window = windowResult.rows[0];
      if (!window) return null;

      const [assetsResult, ownershipResult, selectionsResult, requestsResult] =
        await Promise.all([
          transaction.query<AssetRow>(ASSETS_SQL),
          transaction.query<OwnershipRow>(ACTIVE_OWNERSHIP_SQL, [
            principal.customerId,
          ]),
          transaction.query<SelectionRow>(SELECTIONS_SQL, [window.id]),
          transaction.query<RequestRow>(PROCESSED_REQUESTS_SQL, [window.id]),
        ]);

      return {
        customerAuthenticated: true,
        subscriptionActive: window.subscription_status === "active",
        window: {
          id: window.id,
          type: window.window_type as MMGPickerState["window"]["type"],
          status: window.status as MMGPickerState["window"]["status"],
          totalUnits: asInteger(window.total_units),
          targetAssetCount: asInteger(window.target_asset_count),
          version: asInteger(window.version),
          opensAt: asISO(window.opens_at),
          closesAt: asISO(window.closes_at),
        },
        assets: assetsResult.rows.map(mapAsset),
        ownedAssetIds: ownershipResult.rows.map((row) => row.asset_id),
        selections: selectionsResult.rows.map(mapSelection),
        processedRequestIds: requestsResult.rows
          .map((row) => row.request_id)
          .reverse(),
        confirmedAt: asISO(window.confirmed_at),
      };
    });
  }

  async save(
    principal: MMGPickerPrincipal,
    state: MMGPickerState,
    expectedPreviousVersion: number,
  ): Promise<"saved" | "version_conflict"> {
    return this.#database.transaction(async (transaction) => {
      const lockResult = await transaction.query<CurrentWindowLockRow>(
        `
          SELECT w.id, w.cycle_id, e.customer_id, w.status, w.version
          FROM mmg_entitlement_windows w
          JOIN mmg_entitlement_cycles c ON c.id = w.cycle_id
          JOIN mmg_subscription_entitlements e ON e.id = c.subscription_entitlement_id
          WHERE w.id = $1 AND e.customer_id = $2
          FOR UPDATE
        `,
        [state.window.id, principal.customerId],
      );
      const current = lockResult.rows[0];

      if (!current || asInteger(current.version) !== expectedPreviousVersion) {
        return "version_conflict";
      }

      const updateResult = await transaction.query(
        `
          UPDATE mmg_entitlement_windows
          SET status = $1,
              version = $2,
              confirmed_at = $3,
              updated_at = NOW()
          WHERE id = $4 AND version = $5
        `,
        [
          state.window.status,
          state.window.version,
          state.confirmedAt,
          state.window.id,
          expectedPreviousVersion,
        ],
      );
      if (updateResult.rowCount !== 1) return "version_conflict";

      await this.#synchronizeSelections(transaction, state);
      await this.#synchronizeProcessedRequests(transaction, state);

      const confirming =
        current.status !== "confirmed" && state.window.status === "confirmed";
      if (confirming) {
        await this.#finalizeConfirmation(
          transaction,
          principal,
          state,
          current.cycle_id,
        );
      }

      await transaction.query(
        `
          INSERT INTO mmg_entitlement_events
            (customer_id, cycle_id, window_id, event_type, event_payload)
          VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [
          principal.customerId,
          current.cycle_id,
          state.window.id,
          confirming ? "package_confirmed" : "picker_state_saved",
          JSON.stringify({
            version: state.window.version,
            status: state.window.status,
            selectionCount: state.selections.length,
          }),
        ],
      );

      return "saved";
    });
  }

  async getEntitlementCounter(principal: MMGPickerPrincipal) {
    return this.#database.transaction(async (transaction) => {
      const cycleResult = await transaction.query<CycleRow>(
        `
          SELECT
            c.id,
            e.plan_code,
            c.status,
            c.starts_at,
            c.ends_at,
            c.total_packages,
            c.total_units,
            c.version
          FROM mmg_entitlement_cycles c
          JOIN mmg_subscription_entitlements e ON e.id = c.subscription_entitlement_id
          WHERE e.customer_id = $1
            AND e.status = 'active'
            AND c.status IN ('scheduled', 'active', 'completed')
          ORDER BY
            CASE c.status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
            c.starts_at DESC
          LIMIT 1
        `,
        [principal.customerId],
      );
      const cycleRow = cycleResult.rows[0];
      if (!cycleRow) return null;

      const windowsResult = await transaction.query<WindowRow>(
        `
          SELECT
            w.id,
            w.cycle_id,
            w.window_type,
            w.status,
            w.total_units,
            w.target_asset_count,
            w.version,
            w.package_sequence,
            w.opens_at,
            w.closes_at,
            w.confirmed_at,
            'active' AS subscription_status
          FROM mmg_entitlement_windows w
          WHERE w.cycle_id = $1
          ORDER BY w.package_sequence ASC
        `,
        [cycleRow.id],
      );
      const windowIds = windowsResult.rows.map((row) => row.id);
      const selectionsResult = windowIds.length
        ? await transaction.query<SelectionRow>(
            `
              SELECT window_id, asset_id, units, state, selected_at
              FROM mmg_entitlement_selections
              WHERE window_id = ANY($1::uuid[])
              ORDER BY selected_at ASC, asset_id ASC
            `,
            [windowIds],
          )
        : { rows: [], rowCount: 0 };
      const deliveryResult = await transaction.query<DeliveryUnitsRow>(
        `
          SELECT COALESCE(SUM(units), 0)::integer AS delivered_units
          FROM mmg_delivery_grants
          WHERE cycle_id = $1 AND status = 'active'
        `,
        [cycleRow.id],
      );

      const selectionsByWindow = new Map<string, SelectionRow[]>();
      for (const selection of selectionsResult.rows) {
        const current = selectionsByWindow.get(selection.window_id) ?? [];
        current.push(selection);
        selectionsByWindow.set(selection.window_id, current);
      }

      const cycle: MMGEntitlementCycleInput = {
        id: cycleRow.id,
        planCode: cycleRow.plan_code as MMGSubscriptionPlanCode,
        status: cycleRow.status as MMGEntitlementCycleInput["status"],
        startsAt: requiredISO(cycleRow.starts_at),
        endsAt: requiredISO(cycleRow.ends_at),
        totalPackages: asInteger(cycleRow.total_packages),
        totalUnits: asInteger(cycleRow.total_units),
        version: asInteger(cycleRow.version),
      };

      const windows: MMGEntitlementWindowInput[] = windowsResult.rows.map(
        (row) => ({
          id: row.id,
          packageSequence: asInteger(row.package_sequence),
          type: row.window_type as MMGEntitlementWindowInput["type"],
          status: row.status as MMGEntitlementWindowInput["status"],
          totalUnits: asInteger(row.total_units),
          targetAssetCount: asInteger(row.target_asset_count),
          version: asInteger(row.version),
          opensAt: asISO(row.opens_at),
          closesAt: asISO(row.closes_at),
          confirmedAt: asISO(row.confirmed_at),
          selections: (selectionsByWindow.get(row.id) ?? []).map((selection) => ({
            assetId: selection.asset_id,
            units: asInteger(selection.units),
            state: selection.state as MMGEntitlementWindowInput["selections"][number]["state"],
          })),
        }),
      );

      return buildMMGEntitlementCounter({
        cycle,
        windows,
        deliveredUnits: asInteger(deliveryResult.rows[0]?.delivered_units),
      });
    });
  }

  async getOwnershipSnapshot(principal: MMGPickerPrincipal, asOf: Date) {
    const result = await this.#database.query<OwnershipRow>(
      `
        SELECT id, customer_id, asset_id, source, source_reference, status, granted_at, revoked_at
        FROM mmg_ownership_grants
        WHERE customer_id = $1
        ORDER BY granted_at ASC, id ASC
      `,
      [principal.customerId],
    );

    return buildMMGOwnershipSnapshot({
      customerId: principal.customerId,
      grants: result.rows.map(mapOwnershipGrant),
      asOf,
    });
  }

  async #synchronizeSelections(
    transaction: MMGSQLExecutor,
    state: MMGPickerState,
  ): Promise<void> {
    const assetIds = state.selections.map((selection) => selection.assetId);

    if (assetIds.length === 0) {
      await transaction.query(
        "DELETE FROM mmg_entitlement_selections WHERE window_id = $1",
        [state.window.id],
      );
    } else {
      await transaction.query(
        `
          DELETE FROM mmg_entitlement_selections
          WHERE window_id = $1 AND NOT (asset_id = ANY($2::text[]))
        `,
        [state.window.id, assetIds],
      );
    }

    for (const selection of state.selections) {
      await transaction.query(
        `
          INSERT INTO mmg_entitlement_selections
            (window_id, asset_id, units, state, selected_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (window_id, asset_id)
          DO UPDATE SET
            units = EXCLUDED.units,
            state = EXCLUDED.state,
            selected_at = EXCLUDED.selected_at,
            updated_at = NOW()
        `,
        [
          state.window.id,
          selection.assetId,
          selection.units,
          selection.state,
          selection.selectedAt,
        ],
      );
    }
  }

  async #synchronizeProcessedRequests(
    transaction: MMGSQLExecutor,
    state: MMGPickerState,
  ): Promise<void> {
    for (const requestId of state.processedRequestIds.slice(-100)) {
      await transaction.query(
        `
          INSERT INTO mmg_picker_requests (window_id, request_id)
          VALUES ($1, $2)
          ON CONFLICT (window_id, request_id) DO NOTHING
        `,
        [state.window.id, requestId],
      );
    }

    await transaction.query(
      `
        DELETE FROM mmg_picker_requests
        WHERE window_id = $1
          AND request_id NOT IN (
            SELECT request_id
            FROM mmg_picker_requests
            WHERE window_id = $1
            ORDER BY created_at DESC
            LIMIT 100
          )
      `,
      [state.window.id],
    );
  }

  async #finalizeConfirmation(
    transaction: MMGSQLExecutor,
    principal: MMGPickerPrincipal,
    state: MMGPickerState,
    cycleId: string,
  ): Promise<void> {
    const assetIds = state.selections.map((selection) => selection.assetId);
    if (
      assetIds.length !== state.window.targetAssetCount ||
      new Set(assetIds).size !== assetIds.length
    ) {
      throw new Error("MMG_PERSISTENCE_CONFIRMATION_COUNT_INVALID");
    }

    const totalUnits = state.selections.reduce(
      (sum, selection) => sum + asInteger(selection.units),
      0,
    );
    if (totalUnits !== state.window.totalUnits) {
      throw new Error("MMG_PERSISTENCE_CONFIRMATION_UNITS_INVALID");
    }

    const assetsResult = await transaction.query<ConfirmationAssetRow>(
      `
        SELECT
          asset_id,
          product_type,
          asset_status,
          published,
          available,
          subscription_eligible,
          subscription_value,
          portrait_cover_present,
          square_thumbnail_present,
          delivery_package_verified,
          delivery_package_reference,
          customer_destination
        FROM mmg_knowledge_assets
        WHERE asset_id = ANY($1::text[])
        FOR SHARE
      `,
      [assetIds],
    );
    if (assetsResult.rows.length !== assetIds.length) {
      throw new Error("MMG_PERSISTENCE_CONFIRMATION_ASSET_MISSING");
    }

    const ownedResult = await transaction.query<{ asset_id: string }>(
      `
        SELECT asset_id
        FROM mmg_ownership_grants
        WHERE customer_id = $1
          AND asset_id = ANY($2::text[])
          AND status = 'active'
          AND (revoked_at IS NULL OR revoked_at > NOW())
        FOR SHARE
      `,
      [principal.customerId, assetIds],
    );
    if (ownedResult.rows.length > 0) {
      throw new Error("MMG_PERSISTENCE_CONFIRMATION_ASSET_ALREADY_OWNED");
    }

    const assetById = new Map(
      assetsResult.rows.map((asset) => [asset.asset_id, asset]),
    );
    for (const selection of state.selections) {
      const asset = assetById.get(selection.assetId);
      const eligible =
        asset &&
        asset.product_type === "digital_download" &&
        asset.asset_status === "active" &&
        asBoolean(asset.published) &&
        asBoolean(asset.available) &&
        asBoolean(asset.subscription_eligible) &&
        asBoolean(asset.portrait_cover_present) &&
        asBoolean(asset.square_thumbnail_present) &&
        asBoolean(asset.delivery_package_verified) &&
        Boolean(asset.delivery_package_reference) &&
        asset.customer_destination === "my_library" &&
        asInteger(asset.subscription_value) === asInteger(selection.units);

      if (!eligible) {
        throw new Error("MMG_PERSISTENCE_CONFIRMATION_ASSET_NOT_ELIGIBLE");
      }
    }

    const cycleResult = await transaction.query<{
      id: string;
      status: string;
      total_packages: number | string;
      confirmed_packages: number | string;
      total_units: number | string;
      consumed_units: number | string;
    }>(
      `
        SELECT id, status, total_packages, confirmed_packages, total_units, consumed_units
        FROM mmg_entitlement_cycles
        WHERE id = $1
        FOR UPDATE
      `,
      [cycleId],
    );
    const cycle = cycleResult.rows[0];
    if (!cycle || !["active", "scheduled"].includes(cycle.status)) {
      throw new Error("MMG_PERSISTENCE_CYCLE_NOT_ACTIVE");
    }
    if (
      asInteger(cycle.confirmed_packages) + 1 > asInteger(cycle.total_packages) ||
      asInteger(cycle.consumed_units) + totalUnits > asInteger(cycle.total_units)
    ) {
      throw new Error("MMG_PERSISTENCE_CYCLE_CAPACITY_EXCEEDED");
    }

    for (const selection of state.selections) {
      const asset = assetById.get(selection.assetId);
      if (!asset?.delivery_package_reference) {
        throw new Error("MMG_PERSISTENCE_DELIVERY_PACKAGE_MISSING");
      }

      const deliveryResult = await transaction.query(
        `
          INSERT INTO mmg_delivery_grants
            (cycle_id, window_id, customer_id, asset_id, units, delivery_package_reference, status, granted_at)
          VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
          ON CONFLICT (window_id, asset_id) DO NOTHING
        `,
        [
          cycleId,
          state.window.id,
          principal.customerId,
          selection.assetId,
          selection.units,
          asset.delivery_package_reference,
          state.confirmedAt,
        ],
      );
      if (deliveryResult.rowCount !== 1) {
        throw new Error("MMG_PERSISTENCE_DELIVERY_GRANT_CONFLICT");
      }

      const ownershipResult = await transaction.query(
        `
          INSERT INTO mmg_ownership_grants
            (customer_id, asset_id, source, source_reference, status, granted_at)
          VALUES ($1, $2, 'subscription_delivery', $3, 'active', $4)
          ON CONFLICT (customer_id, asset_id) WHERE status = 'active' DO NOTHING
        `,
        [
          principal.customerId,
          selection.assetId,
          `window:${state.window.id}`,
          state.confirmedAt,
        ],
      );
      if (ownershipResult.rowCount !== 1) {
        throw new Error("MMG_PERSISTENCE_OWNERSHIP_GRANT_CONFLICT");
      }
    }

    const cycleUpdate = await transaction.query(
      `
        UPDATE mmg_entitlement_cycles
        SET confirmed_packages = confirmed_packages + 1,
            consumed_units = consumed_units + $1,
            version = version + 1,
            status = CASE
              WHEN confirmed_packages + 1 = total_packages THEN 'completed'
              ELSE status
            END,
            updated_at = NOW()
        WHERE id = $2
          AND confirmed_packages + 1 <= total_packages
          AND consumed_units + $1 <= total_units
      `,
      [totalUnits, cycleId],
    );
    if (cycleUpdate.rowCount !== 1) {
      throw new Error("MMG_PERSISTENCE_CYCLE_VERSION_CONFLICT");
    }
  }
}
