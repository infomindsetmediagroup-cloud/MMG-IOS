import type { MMGSQLExecutor } from "../knowledge-library/persistence.js";
import type {
  MMGCommerceControlCode,
  MMGCommerceControlMode,
  MMGCommerceRolloutStage,
} from "./commerce-operations-control.js";

interface ControlRow extends Record<string, unknown> {
  control_code: string;
  mode: string;
  version: number | string;
}

interface RolloutRow extends Record<string, unknown> {
  release_id: string;
  stage: string;
  cohort_percentage: number | string;
  version: number | string;
}

export interface MMGStagingRuntimePolicySnapshot {
  environment: "staging";
  controls: Record<MMGCommerceControlCode, MMGCommerceControlMode>;
  rollout: {
    releaseId: string;
    stage: MMGCommerceRolloutStage;
    cohortPercentage: number;
    version: number;
  } | null;
}

export interface MMGStagingRuntimePolicyHasher {
  sha256(value: string): Promise<string>;
}

const DEFAULT_CONTROLS: Record<MMGCommerceControlCode, MMGCommerceControlMode> = {
  product_publication: "observe_only",
  subscription_checkout: "disabled",
  webhook_ingestion: "enabled",
  delivery_scheduler: "disabled",
  delivery_dispatcher: "disabled",
  recommendation_automation: "observe_only",
  signed_library_access: "disabled",
  thank_you_handoff: "disabled",
};

const number = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("MMG_STAGING_RUNTIME_POLICY_NUMBER_INVALID");
  return parsed;
};

export class MMGPostgresStagingRuntimePolicy {
  readonly #database: MMGSQLExecutor;
  readonly #hasher: MMGStagingRuntimePolicyHasher;
  readonly #internalAllowlist: ReadonlySet<string>;

  constructor(input: {
    database: MMGSQLExecutor;
    hasher: MMGStagingRuntimePolicyHasher;
    internalAllowlistHashes?: ReadonlySet<string>;
  }) {
    this.#database = input.database;
    this.#hasher = input.hasher;
    this.#internalAllowlist = input.internalAllowlistHashes ?? new Set<string>();
  }

  async snapshot(): Promise<MMGStagingRuntimePolicySnapshot> {
    const [controlsResult, rolloutResult] = await Promise.all([
      this.#database.query<ControlRow>(
        `SELECT control_code, mode, version
         FROM mmg_staging_runtime_controls
         WHERE environment = 'staging'`,
      ),
      this.#database.query<RolloutRow>(
        `SELECT release_id, stage, cohort_percentage, version
         FROM mmg_staging_runtime_rollout
         WHERE environment = 'staging'
         LIMIT 1`,
      ),
    ]);
    const controls = { ...DEFAULT_CONTROLS };
    for (const row of controlsResult.rows) {
      controls[row.control_code as MMGCommerceControlCode] =
        row.mode as MMGCommerceControlMode;
    }
    const rolloutRow = rolloutResult.rows[0];
    return {
      environment: "staging",
      controls,
      rollout: rolloutRow
        ? {
            releaseId: rolloutRow.release_id,
            stage: rolloutRow.stage as MMGCommerceRolloutStage,
            cohortPercentage: number(rolloutRow.cohort_percentage),
            version: number(rolloutRow.version),
          }
        : null,
    };
  }

  async allows(input: {
    control: MMGCommerceControlCode;
    customerReferenceHash?: string | null;
  }): Promise<boolean> {
    const policy = await this.snapshot();
    const mode = policy.controls[input.control];
    if (mode === "disabled" || mode === "observe_only" || mode === "drain_only") {
      return false;
    }
    if (input.control === "webhook_ingestion") return true;
    const rollout = policy.rollout;
    if (!rollout || rollout.stage === "paused") return false;
    const reference = String(input.customerReferenceHash ?? "").trim();
    if (!/^[a-f0-9]{64}$/.test(reference)) return false;
    if (rollout.stage === "internal") return this.#internalAllowlist.has(reference);
    const digest = await this.#hasher.sha256(`${rollout.releaseId}:${reference}`);
    if (!/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error("MMG_STAGING_RUNTIME_POLICY_DIGEST_INVALID");
    }
    const bucket = Number.parseInt(digest.slice(0, 8), 16) / 0x1_0000_0000;
    return bucket * 100 < rollout.cohortPercentage;
  }
}
