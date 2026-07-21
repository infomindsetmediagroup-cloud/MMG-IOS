import type { MMGTransactionalDatabase } from "../knowledge-library/persistence.js";
import type {
  MMGCommerceControlCode,
  MMGCommerceControlMode,
  MMGCommerceRolloutStage,
} from "./commerce-operations-control.js";
import type { MMGRuntimeControlBoundary } from "./runtime-control-http.js";

const STAGE_PERCENTAGE: Record<MMGCommerceRolloutStage, number> = {
  paused: 0,
  internal: 0,
  pilot: 5,
  limited: 25,
  expanded: 50,
  full: 100,
};

const stagingOnly = (environment: string): void => {
  if (environment !== "staging") {
    throw new Error("MMG_STAGING_RUNTIME_BOUNDARY_STAGING_ONLY");
  }
};

const safeControl = (
  control: MMGCommerceControlCode,
  mode: MMGCommerceControlMode,
): void => {
  if (control === "webhook_ingestion" && mode === "disabled") {
    throw new Error("MMG_WEBHOOK_INGESTION_DISABLE_FORBIDDEN");
  }
  if (control === "product_publication" && mode === "enabled") {
    throw new Error("MMG_PUBLICATION_ENABLE_REQUIRES_DEPLOYMENT_CONTROL");
  }
};

export class MMGPostgresStagingRuntimeControlBoundary
  implements MMGRuntimeControlBoundary
{
  readonly #database: MMGTransactionalDatabase;

  constructor(database: MMGTransactionalDatabase) {
    this.#database = database;
  }

  async applyControl(input: {
    environment: "staging" | "production";
    control: MMGCommerceControlCode;
    mode: MMGCommerceControlMode;
    reasonCode: string;
    automatic: boolean;
    actorId: string;
    receiptId: string;
    occurredAt: Date;
  }): Promise<void> {
    stagingOnly(input.environment);
    safeControl(input.control, input.mode);
    await this.#database.transaction(async (transaction) => {
      await transaction.query(
        `INSERT INTO mmg_staging_runtime_controls (
           environment, control_code, mode, release_id, reason_code,
           changed_by, changed_at, version
         ) VALUES ('staging', $1, $2, NULL, $3, $4, $5, 1)
         ON CONFLICT (environment, control_code)
         DO UPDATE SET
           mode = EXCLUDED.mode,
           reason_code = EXCLUDED.reason_code,
           changed_by = EXCLUDED.changed_by,
           changed_at = EXCLUDED.changed_at,
           version = mmg_staging_runtime_controls.version + 1`,
        [
          input.control,
          input.mode,
          input.reasonCode,
          input.actorId,
          input.occurredAt,
        ],
      );
      await transaction.query(
        `INSERT INTO mmg_commerce_runtime_control_receipts (
           receipt_id, environment, release_id, control_code, requested_mode,
           outcome, provider_reference_hash, error_code, requested_at,
           completed_at
         ) VALUES ($1, 'staging', NULL, $2, $3, 'applied', NULL, NULL, $4, $4)
         ON CONFLICT (receipt_id) DO NOTHING`,
        [input.receiptId, input.control, input.mode, input.occurredAt],
      );
      await transaction.query(
        `INSERT INTO mmg_commerce_operations_events (
           environment, event_type, actor_id, payload, occurred_at
         ) VALUES ('staging', 'runtime_control_applied', $1, $2::jsonb, $3)`,
        [
          input.actorId,
          JSON.stringify({
            receiptId: input.receiptId,
            control: input.control,
            mode: input.mode,
            reasonCode: input.reasonCode,
            automatic: input.automatic,
          }),
          input.occurredAt,
        ],
      );
    });
  }

  async applyRollout(input: {
    environment: "staging" | "production";
    releaseId: string;
    stage: MMGCommerceRolloutStage;
    cohortPercentage: number;
    actorId: string;
    receiptId: string;
    occurredAt: Date;
  }): Promise<void> {
    stagingOnly(input.environment);
    const expected = STAGE_PERCENTAGE[input.stage];
    if (input.cohortPercentage !== expected) {
      throw new Error("MMG_STAGING_RUNTIME_ROLLOUT_PERCENTAGE_MISMATCH");
    }
    await this.#database.transaction(async (transaction) => {
      await transaction.query(
        `INSERT INTO mmg_staging_runtime_rollout (
           environment, release_id, stage, cohort_percentage, changed_by,
           changed_at, version
         ) VALUES ('staging', $1, $2, $3, $4, $5, 1)
         ON CONFLICT (environment)
         DO UPDATE SET
           release_id = EXCLUDED.release_id,
           stage = EXCLUDED.stage,
           cohort_percentage = EXCLUDED.cohort_percentage,
           changed_by = EXCLUDED.changed_by,
           changed_at = EXCLUDED.changed_at,
           version = mmg_staging_runtime_rollout.version + 1`,
        [
          input.releaseId,
          input.stage,
          input.cohortPercentage,
          input.actorId,
          input.occurredAt,
        ],
      );
      await transaction.query(
        `INSERT INTO mmg_commerce_runtime_control_receipts (
           receipt_id, environment, release_id, control_code, requested_mode,
           outcome, provider_reference_hash, error_code, requested_at,
           completed_at
         ) VALUES ($1, 'staging', $2, 'rollout', $3, 'applied', NULL, NULL, $4, $4)
         ON CONFLICT (receipt_id) DO NOTHING`,
        [input.receiptId, input.releaseId, input.stage, input.occurredAt],
      );
      await transaction.query(
        `INSERT INTO mmg_commerce_operations_events (
           environment, event_type, actor_id, payload, occurred_at
         ) VALUES ('staging', 'runtime_rollout_applied', $1, $2::jsonb, $3)`,
        [
          input.actorId,
          JSON.stringify({
            receiptId: input.receiptId,
            releaseId: input.releaseId,
            stage: input.stage,
            cohortPercentage: input.cohortPercentage,
          }),
          input.occurredAt,
        ],
      );
    });
  }
}
