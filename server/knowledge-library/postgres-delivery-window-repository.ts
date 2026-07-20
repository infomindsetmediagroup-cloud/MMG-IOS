import {
  getMMGSubscriptionPlan,
  type MMGSubscriptionPlanCode,
} from "./entitlements.js";
import type {
  MMGDeliveryWindowCandidate,
  MMGDeliveryWindowControllerRepository,
  MMGDeliveryWindowProposal,
  MMGDeliveryWindowRunSummary,
  MMGDeliveryWindowSubscription,
} from "./delivery-window-service.js";
import type {
  MMGDeliveryWindowRuntimeState,
  MMGDeliveryWindowScheduleEntry,
  MMGWindowFallbackPolicy,
} from "./delivery-windows.js";
import type {
  MMGSQLExecutor,
  MMGTransactionalDatabase,
} from "./persistence.js";

interface SubscriptionRow extends Record<string, unknown> {
  id: string;
  customer_id: string;
  plan_code: string;
  current_period_start: Date | string;
  current_period_end: Date | string;
  initial_subscription_cycle: boolean;
}

interface CycleIdRow extends Record<string, unknown> {
  id: string;
}

interface ActionableWindowRow extends Record<string, unknown> {
  id: string;
  customer_id: string;
  cycle_id: string;
  package_sequence: number | string;
  window_type: string;
  status: string;
  total_units: number | string;
  target_asset_count: number | string;
  selected_units: number | string;
  selected_asset_count: number | string;
  version: number | string;
  opens_at: Date | string | null;
  closes_at: Date | string | null;
  fallback_policy: string;
  delivery_dispatch_id: string | null;
}

interface CandidateRow extends Record<string, unknown> {
  asset_id: string;
  title: string;
  topic: string;
  experience_level: string;
  digital_format: string;
  series: string | null;
  series_order: number | string | null;
  subscription_value: number | string;
}

interface LockedWindowRow extends Record<string, unknown> {
  id: string;
  customer_id: string;
  cycle_id: string;
  status: string;
  version: number | string;
  total_units: number | string;
  target_asset_count: number | string;
  opens_at: Date | string | null;
  closes_at: Date | string | null;
  ends_at: Date | string;
}

interface EligibleAssetRow extends Record<string, unknown> {
  asset_id: string;
  subscription_value: number | string;
}

const integer = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const iso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const requiredISO = (value: unknown): string =>
  iso(value) ?? new Date(0).toISOString();

const mapWindow = (row: ActionableWindowRow): MMGDeliveryWindowRuntimeState => ({
  id: row.id,
  customerId: row.customer_id,
  cycleId: row.cycle_id,
  packageSequence: integer(row.package_sequence),
  type: row.window_type as MMGDeliveryWindowRuntimeState["type"],
  status: row.status as MMGDeliveryWindowRuntimeState["status"],
  totalUnits: integer(row.total_units),
  targetAssetCount: integer(row.target_asset_count),
  selectedUnits: integer(row.selected_units),
  selectedAssetCount: integer(row.selected_asset_count),
  version: integer(row.version),
  opensAt: iso(row.opens_at),
  closesAt: iso(row.closes_at),
  fallbackPolicy: row.fallback_policy as MMGWindowFallbackPolicy,
  deliveryDispatchId: row.delivery_dispatch_id,
});

const LOCK_WINDOW_SQL = `
  SELECT
    w.id,
    e.customer_id,
    w.cycle_id,
    w.status,
    w.version,
    w.total_units,
    w.target_asset_count,
    w.opens_at,
    w.closes_at,
    c.ends_at
  FROM mmg_entitlement_windows w
  JOIN mmg_entitlement_cycles c ON c.id = w.cycle_id
  JOIN mmg_subscription_entitlements e ON e.id = c.subscription_entitlement_id
  WHERE w.id = $1
  FOR UPDATE
`;

const recordEvent = async (
  transaction: MMGSQLExecutor,
  input: {
    customerId: string;
    cycleId: string;
    windowId: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<void> => {
  await transaction.query(
    `
      INSERT INTO mmg_entitlement_events
        (customer_id, cycle_id, window_id, event_type, event_payload)
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      input.customerId,
      input.cycleId,
      input.windowId,
      input.eventType,
      JSON.stringify(input.payload),
    ],
  );
};

export class MMGPostgresDeliveryWindowRepository
  implements MMGDeliveryWindowControllerRepository
{
  readonly #database: MMGTransactionalDatabase;

  constructor(database: MMGTransactionalDatabase) {
    this.#database = database;
  }

  async beginRun(
    runId: string,
    startedAt: Date,
  ): Promise<"started" | "duplicate"> {
    const result = await this.#database.query(
      `
        INSERT INTO mmg_delivery_controller_runs
          (run_id, status, started_at)
        VALUES ($1, 'running', $2)
        ON CONFLICT (run_id) DO NOTHING
      `,
      [runId, startedAt.toISOString()],
    );
    return result.rowCount === 1 ? "started" : "duplicate";
  }

  async finishRun(
    runId: string,
    finishedAt: Date,
    summary: MMGDeliveryWindowRunSummary,
  ): Promise<void> {
    await this.#database.query(
      `
        UPDATE mmg_delivery_controller_runs
        SET status = $1,
            finished_at = $2,
            summary = $3::jsonb,
            updated_at = NOW()
        WHERE run_id = $4
      `,
      [
        summary.failures > 0 ? "failed" : "completed",
        finishedAt.toISOString(),
        JSON.stringify(summary),
        runId,
      ],
    );
  }

  async listSubscriptionsForReconciliation(
    now: Date,
    limit: number,
  ): Promise<MMGDeliveryWindowSubscription[]> {
    const result = await this.#database.query<SubscriptionRow>(
      `
        SELECT
          e.id,
          e.customer_id,
          e.plan_code,
          e.current_period_start,
          e.current_period_end,
          NOT EXISTS (
            SELECT 1
            FROM mmg_entitlement_cycles existing_cycle
            WHERE existing_cycle.subscription_entitlement_id = e.id
          ) AS initial_subscription_cycle
        FROM mmg_subscription_entitlements e
        WHERE e.status = 'active'
          AND e.current_period_start IS NOT NULL
          AND e.current_period_end IS NOT NULL
          AND e.current_period_end > $1
        ORDER BY e.current_period_start ASC, e.id ASC
        LIMIT $2
      `,
      [now.toISOString(), limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      planCode: row.plan_code as MMGSubscriptionPlanCode,
      periodStart: requiredISO(row.current_period_start),
      periodEnd: requiredISO(row.current_period_end),
      initialSubscriptionCycle: row.initial_subscription_cycle === true,
    }));
  }

  async ensureCycleAndWindows(
    subscription: MMGDeliveryWindowSubscription,
    schedule: MMGDeliveryWindowScheduleEntry[],
    now: Date,
  ): Promise<{ cycleId: string; created: boolean; windowsCreated: number }> {
    return this.#database.transaction(async (transaction) => {
      const entitlementResult = await transaction.query<{
        id: string;
        plan_code: string;
        status: string;
      }>(
        `
          SELECT id, plan_code, status
          FROM mmg_subscription_entitlements
          WHERE id = $1 AND customer_id = $2
          FOR UPDATE
        `,
        [subscription.id, subscription.customerId],
      );
      const entitlement = entitlementResult.rows[0];
      if (!entitlement || entitlement.status !== "active") {
        throw new Error("MMG_DELIVERY_WINDOW_SUBSCRIPTION_NOT_ACTIVE");
      }
      if (entitlement.plan_code !== subscription.planCode) {
        throw new Error("MMG_DELIVERY_WINDOW_PLAN_CHANGED_DURING_RECONCILIATION");
      }

      const plan = getMMGSubscriptionPlan(subscription.planCode);
      if (
        schedule.length !== plan.packagesPerBillingCycle ||
        schedule.some(
          (window) =>
            window.totalUnits !== plan.assetsPerPackage ||
            window.targetAssetCount !== plan.assetsPerPackage,
        )
      ) {
        throw new Error("MMG_DELIVERY_WINDOW_SCHEDULE_PLAN_MISMATCH");
      }

      await transaction.query(
        `
          UPDATE mmg_entitlement_cycles
          SET status = 'completed', version = version + 1, updated_at = NOW()
          WHERE subscription_entitlement_id = $1
            AND status IN ('scheduled', 'active')
            AND ends_at <= $2
        `,
        [subscription.id, subscription.periodStart],
      );

      const cycleStatus =
        new Date(subscription.periodStart).getTime() <= now.getTime()
          ? "active"
          : "scheduled";
      const inserted = await transaction.query<CycleIdRow>(
        `
          INSERT INTO mmg_entitlement_cycles
            (subscription_entitlement_id, status, starts_at, ends_at, total_packages, total_units)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (subscription_entitlement_id, starts_at) DO NOTHING
          RETURNING id
        `,
        [
          subscription.id,
          cycleStatus,
          subscription.periodStart,
          subscription.periodEnd,
          plan.packagesPerBillingCycle,
          plan.assetsPerBillingCycle,
        ],
      );

      const created = inserted.rowCount === 1;
      let cycleId = inserted.rows[0]?.id;
      if (!cycleId) {
        const existing = await transaction.query<CycleIdRow>(
          `
            SELECT id
            FROM mmg_entitlement_cycles
            WHERE subscription_entitlement_id = $1 AND starts_at = $2
            FOR UPDATE
          `,
          [subscription.id, subscription.periodStart],
        );
        cycleId = existing.rows[0]?.id;
      }
      if (!cycleId) {
        throw new Error("MMG_DELIVERY_WINDOW_CYCLE_RESOLUTION_FAILED");
      }

      let windowsCreated = 0;
      for (const window of schedule) {
        const result = await transaction.query(
          `
            INSERT INTO mmg_entitlement_windows
              (cycle_id, package_sequence, window_type, status, total_units,
               target_asset_count, opens_at, closes_at, fallback_policy)
            VALUES ($1, $2, $3, 'scheduled', $4, $5, $6, $7, $8)
            ON CONFLICT (cycle_id, package_sequence) DO NOTHING
          `,
          [
            cycleId,
            window.packageSequence,
            window.type,
            window.totalUnits,
            window.targetAssetCount,
            window.opensAt,
            window.closesAt,
            window.fallbackPolicy,
          ],
        );
        windowsCreated += result.rowCount;
      }

      await transaction.query(
        `
          UPDATE mmg_entitlement_cycles
          SET status = CASE
                WHEN starts_at <= $2 AND ends_at > $2 THEN 'active'
                ELSE status
              END,
              updated_at = NOW()
          WHERE id = $1
        `,
        [cycleId, now.toISOString()],
      );

      return { cycleId, created, windowsCreated };
    });
  }

  async listActionableWindows(
    now: Date,
    limit: number,
  ): Promise<MMGDeliveryWindowRuntimeState[]> {
    const result = await this.#database.query<ActionableWindowRow>(
      `
        SELECT
          w.id,
          e.customer_id,
          w.cycle_id,
          w.package_sequence,
          w.window_type,
          w.status,
          w.total_units,
          w.target_asset_count,
          COALESCE(SUM(s.units) FILTER (
            WHERE s.state IN ('selected', 'reserved', 'confirmed')
          ), 0)::integer AS selected_units,
          COUNT(s.asset_id) FILTER (
            WHERE s.state IN ('selected', 'reserved', 'confirmed')
          )::integer AS selected_asset_count,
          w.version,
          w.opens_at,
          w.closes_at,
          w.fallback_policy,
          w.delivery_dispatch_id
        FROM mmg_entitlement_windows w
        JOIN mmg_entitlement_cycles c ON c.id = w.cycle_id
        JOIN mmg_subscription_entitlements e ON e.id = c.subscription_entitlement_id
        LEFT JOIN mmg_entitlement_selections s ON s.window_id = w.id
        WHERE e.status = 'active'
          AND c.status IN ('scheduled', 'active', 'completed')
          AND (
            (w.status = 'scheduled' AND w.opens_at <= $1)
            OR (w.status = 'open' AND w.closes_at <= $1)
            OR (w.status = 'confirmed' AND w.delivery_dispatch_id IS NULL)
          )
        GROUP BY
          w.id,
          e.customer_id,
          w.cycle_id,
          w.package_sequence,
          w.window_type,
          w.status,
          w.total_units,
          w.target_asset_count,
          w.version,
          w.opens_at,
          w.closes_at,
          w.fallback_policy,
          w.delivery_dispatch_id
        ORDER BY
          CASE w.status
            WHEN 'confirmed' THEN 0
            WHEN 'open' THEN 1
            ELSE 2
          END,
          COALESCE(w.closes_at, w.opens_at) ASC,
          w.package_sequence ASC
        LIMIT $2
      `,
      [now.toISOString(), limit],
    );

    return result.rows.map(mapWindow);
  }

  async listCurationCandidates(
    window: MMGDeliveryWindowRuntimeState,
    limit: number,
  ): Promise<MMGDeliveryWindowCandidate[]> {
    const result = await this.#database.query<CandidateRow>(
      `
        SELECT
          a.asset_id,
          a.title,
          a.topic,
          a.experience_level,
          a.digital_format,
          a.series,
          a.series_order,
          a.subscription_value
        FROM mmg_knowledge_assets a
        WHERE a.product_type = 'digital_download'
          AND a.asset_status = 'active'
          AND a.published = TRUE
          AND a.available = TRUE
          AND a.catalog_visible = TRUE
          AND a.subscription_eligible = TRUE
          AND a.portrait_cover_present = TRUE
          AND a.square_thumbnail_present = TRUE
          AND a.delivery_package_verified = TRUE
          AND a.delivery_package_reference IS NOT NULL
          AND a.customer_destination = 'my_library'
          AND NOT EXISTS (
            SELECT 1
            FROM mmg_ownership_grants ownership
            WHERE ownership.customer_id = $1
              AND ownership.asset_id = a.asset_id
              AND ownership.status = 'active'
              AND (ownership.revoked_at IS NULL OR ownership.revoked_at > NOW())
          )
          AND NOT EXISTS (
            SELECT 1
            FROM mmg_entitlement_selections selection
            WHERE selection.window_id = $2 AND selection.asset_id = a.asset_id
          )
        ORDER BY COALESCE(a.series, ''), COALESCE(a.series_order, 2147483647), a.title
        LIMIT $3
      `,
      [window.customerId, window.id, limit],
    );

    return result.rows.map((row) => ({
      assetId: row.asset_id,
      title: row.title,
      topic: row.topic,
      experienceLevel: row.experience_level,
      format: row.digital_format,
      series: row.series,
      seriesOrder: row.series_order === null ? null : integer(row.series_order),
      subscriptionValue: integer(row.subscription_value),
    }));
  }

  async openWindow(input: {
    window: MMGDeliveryWindowRuntimeState;
    selections: MMGDeliveryWindowProposal | null;
    openedAt: Date;
  }): Promise<"opened" | "version_conflict" | "already_processed"> {
    return this.#database.transaction(async (transaction) => {
      const locked = await transaction.query<LockedWindowRow>(LOCK_WINDOW_SQL, [
        input.window.id,
      ]);
      const current = locked.rows[0];
      if (!current) return "already_processed";
      if (current.status !== "scheduled") return "already_processed";
      if (integer(current.version) !== input.window.version) {
        return "version_conflict";
      }

      const proposal = input.selections;
      if (proposal) {
        const assetIds = [...new Set(proposal.assetIds)];
        if (
          assetIds.length !== integer(current.target_asset_count) ||
          assetIds.length !== proposal.assetIds.length
        ) {
          throw new Error("MMG_DELIVERY_WINDOW_PROPOSAL_COUNT_INVALID");
        }

        const assets = await transaction.query<EligibleAssetRow>(
          `
            SELECT a.asset_id, a.subscription_value
            FROM mmg_knowledge_assets a
            WHERE a.asset_id = ANY($1::text[])
              AND a.product_type = 'digital_download'
              AND a.asset_status = 'active'
              AND a.published = TRUE
              AND a.available = TRUE
              AND a.catalog_visible = TRUE
              AND a.subscription_eligible = TRUE
              AND a.portrait_cover_present = TRUE
              AND a.square_thumbnail_present = TRUE
              AND a.delivery_package_verified = TRUE
              AND a.delivery_package_reference IS NOT NULL
              AND a.customer_destination = 'my_library'
              AND NOT EXISTS (
                SELECT 1
                FROM mmg_ownership_grants ownership
                WHERE ownership.customer_id = $2
                  AND ownership.asset_id = a.asset_id
                  AND ownership.status = 'active'
                  AND (ownership.revoked_at IS NULL OR ownership.revoked_at > NOW())
              )
            FOR SHARE
          `,
          [assetIds, current.customer_id],
        );
        if (assets.rows.length !== assetIds.length) {
          throw new Error("MMG_DELIVERY_WINDOW_PROPOSAL_REVALIDATION_FAILED");
        }
        const totalUnits = assets.rows.reduce(
          (sum, asset) => sum + integer(asset.subscription_value),
          0,
        );
        if (totalUnits !== integer(current.total_units)) {
          throw new Error("MMG_DELIVERY_WINDOW_PROPOSAL_UNITS_INVALID");
        }

        const unitsByAsset = new Map(
          assets.rows.map((asset) => [
            asset.asset_id,
            integer(asset.subscription_value),
          ]),
        );
        for (const assetId of assetIds) {
          await transaction.query(
            `
              INSERT INTO mmg_entitlement_selections
                (window_id, asset_id, units, state, selected_at, updated_at)
              VALUES ($1, $2, $3, 'selected', $4, NOW())
              ON CONFLICT (window_id, asset_id) DO NOTHING
            `,
            [
              current.id,
              assetId,
              unitsByAsset.get(assetId),
              input.openedAt.toISOString(),
            ],
          );
        }
      }

      const update = await transaction.query(
        `
          UPDATE mmg_entitlement_windows w
          SET status = 'open',
              version = version + 1,
              opened_at = $1,
              opens_at = $1,
              closes_at = LEAST(
                c.ends_at,
                $1::timestamptz + GREATEST(
                  INTERVAL '24 hours',
                  COALESCE(w.closes_at - w.opens_at, INTERVAL '48 hours')
                )
              ),
              proposal_source = $2,
              proposal_rationale = $3,
              recovery_reason = NULL,
              updated_at = NOW()
          FROM mmg_entitlement_cycles c
          WHERE w.id = $4
            AND c.id = w.cycle_id
            AND w.status = 'scheduled'
            AND w.version = $5
        `,
        [
          input.openedAt.toISOString(),
          proposal?.source ?? null,
          proposal?.rationale ?? null,
          current.id,
          input.window.version,
        ],
      );
      if (update.rowCount !== 1) return "version_conflict";

      await recordEvent(transaction, {
        customerId: current.customer_id,
        cycleId: current.cycle_id,
        windowId: current.id,
        eventType: proposal
          ? "curated_package_window_opened"
          : "first_package_window_opened",
        payload: {
          previousVersion: input.window.version,
          proposalSource: proposal?.source ?? null,
          assetIds: proposal?.assetIds ?? [],
        },
      });
      return "opened";
    });
  }

  async moveWindowToRecovery(input: {
    window: MMGDeliveryWindowRuntimeState;
    reason: string;
    occurredAt: Date;
  }): Promise<"updated" | "version_conflict" | "already_processed"> {
    return this.#database.transaction(async (transaction) => {
      const locked = await transaction.query<LockedWindowRow>(LOCK_WINDOW_SQL, [
        input.window.id,
      ]);
      const current = locked.rows[0];
      if (!current) return "already_processed";
      if (current.status === "recovery_required") return "already_processed";
      if (integer(current.version) !== input.window.version) {
        return "version_conflict";
      }

      const update = await transaction.query(
        `
          UPDATE mmg_entitlement_windows
          SET status = 'recovery_required',
              version = version + 1,
              expired_at = CASE WHEN status = 'open' THEN $1 ELSE expired_at END,
              recovery_reason = $2,
              updated_at = NOW()
          WHERE id = $3 AND version = $4
        `,
        [
          input.occurredAt.toISOString(),
          input.reason,
          current.id,
          input.window.version,
        ],
      );
      if (update.rowCount !== 1) return "version_conflict";

      await recordEvent(transaction, {
        customerId: current.customer_id,
        cycleId: current.cycle_id,
        windowId: current.id,
        eventType: "delivery_window_recovery_required",
        payload: { reason: input.reason, previousStatus: current.status },
      });
      return "updated";
    });
  }

  async markDeliveryReady(input: {
    window: MMGDeliveryWindowRuntimeState;
    dispatchId: string;
    occurredAt: Date;
  }): Promise<"updated" | "version_conflict" | "already_processed"> {
    if (!input.dispatchId.trim()) {
      throw new Error("MMG_DELIVERY_WINDOW_DISPATCH_ID_REQUIRED");
    }

    return this.#database.transaction(async (transaction) => {
      const locked = await transaction.query<LockedWindowRow>(LOCK_WINDOW_SQL, [
        input.window.id,
      ]);
      const current = locked.rows[0];
      if (!current) return "already_processed";
      if (["delivery_ready", "delivered"].includes(current.status)) {
        return "already_processed";
      }
      if (current.status !== "confirmed") return "already_processed";
      if (integer(current.version) !== input.window.version) {
        return "version_conflict";
      }

      const update = await transaction.query(
        `
          UPDATE mmg_entitlement_windows
          SET status = 'delivery_ready',
              version = version + 1,
              delivery_dispatch_id = $1,
              delivery_ready_at = $2,
              updated_at = NOW()
          WHERE id = $3 AND status = 'confirmed' AND version = $4
        `,
        [
          input.dispatchId.trim(),
          input.occurredAt.toISOString(),
          current.id,
          input.window.version,
        ],
      );
      if (update.rowCount !== 1) return "version_conflict";

      await recordEvent(transaction, {
        customerId: current.customer_id,
        cycleId: current.cycle_id,
        windowId: current.id,
        eventType: "delivery_package_queued",
        payload: { dispatchId: input.dispatchId.trim() },
      });
      return "updated";
    });
  }

  async markDelivered(input: {
    windowId: string;
    deliveryReference: string;
    occurredAt: Date;
  }): Promise<"updated" | "not_found" | "already_delivered"> {
    if (!input.deliveryReference.trim()) {
      throw new Error("MMG_DELIVERY_WINDOW_DELIVERY_REFERENCE_REQUIRED");
    }

    return this.#database.transaction(async (transaction) => {
      const locked = await transaction.query<LockedWindowRow>(LOCK_WINDOW_SQL, [
        input.windowId,
      ]);
      const current = locked.rows[0];
      if (!current) return "not_found";
      if (current.status === "delivered") return "already_delivered";
      if (current.status !== "delivery_ready") return "not_found";

      const update = await transaction.query(
        `
          UPDATE mmg_entitlement_windows
          SET status = 'delivered',
              version = version + 1,
              delivery_reference = $1,
              delivered_at = $2,
              updated_at = NOW()
          WHERE id = $3 AND status = 'delivery_ready'
        `,
        [
          input.deliveryReference.trim(),
          input.occurredAt.toISOString(),
          current.id,
        ],
      );
      if (update.rowCount !== 1) return "not_found";

      await recordEvent(transaction, {
        customerId: current.customer_id,
        cycleId: current.cycle_id,
        windowId: current.id,
        eventType: "delivery_package_delivered",
        payload: { deliveryReference: input.deliveryReference.trim() },
      });
      return "updated";
    });
  }

  async reopenRecoveryWindow(input: {
    windowId: string;
    reviewWindowHours: number;
    occurredAt: Date;
  }): Promise<"opened" | "not_found" | "invalid_state"> {
    if (
      !Number.isInteger(input.reviewWindowHours) ||
      input.reviewWindowHours < 24 ||
      input.reviewWindowHours > 48
    ) {
      throw new Error("MMG_DELIVERY_WINDOW_RECOVERY_HOURS_INVALID");
    }

    return this.#database.transaction(async (transaction) => {
      const locked = await transaction.query<LockedWindowRow>(LOCK_WINDOW_SQL, [
        input.windowId,
      ]);
      const current = locked.rows[0];
      if (!current) return "not_found";
      if (current.status !== "recovery_required") return "invalid_state";

      const otherOpen = await transaction.query<{ id: string }>(
        `
          SELECT id
          FROM mmg_entitlement_windows
          WHERE cycle_id = $1 AND status = 'open' AND id <> $2
          FOR SHARE
        `,
        [current.cycle_id, current.id],
      );
      if (otherOpen.rowCount > 0) return "invalid_state";

      const closesAt = new Date(
        input.occurredAt.getTime() + input.reviewWindowHours * 60 * 60 * 1000,
      );
      await transaction.query(
        `
          UPDATE mmg_entitlement_windows
          SET status = 'open',
              window_type = 'manual_recovery_window',
              version = version + 1,
              opened_at = $1,
              opens_at = $1,
              closes_at = $2,
              expired_at = NULL,
              recovery_reason = NULL,
              fallback_policy = 'manual_recovery',
              updated_at = NOW()
          WHERE id = $3 AND status = 'recovery_required'
        `,
        [input.occurredAt.toISOString(), closesAt.toISOString(), current.id],
      );

      await recordEvent(transaction, {
        customerId: current.customer_id,
        cycleId: current.cycle_id,
        windowId: current.id,
        eventType: "delivery_window_recovery_opened",
        payload: { reviewWindowHours: input.reviewWindowHours },
      });
      return "opened";
    });
  }

  async recordWindowFailure(input: {
    window: MMGDeliveryWindowRuntimeState;
    code: string;
    message: string;
    occurredAt: Date;
  }): Promise<void> {
    await this.#database.query(
      `
        INSERT INTO mmg_entitlement_events
          (customer_id, cycle_id, window_id, event_type, event_payload, created_at)
        VALUES ($1, $2, $3, 'delivery_window_controller_failure', $4::jsonb, $5)
      `,
      [
        input.window.customerId,
        input.window.cycleId,
        input.window.id,
        JSON.stringify({ code: input.code, message: input.message }),
        input.occurredAt.toISOString(),
      ],
    );
  }
}
