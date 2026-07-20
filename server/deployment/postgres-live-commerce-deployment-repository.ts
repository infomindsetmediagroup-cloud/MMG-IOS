import type {
  MMGCommerceDeploymentRepository,
  MMGCommerceDeploymentCommand,
  MMGCommerceDeploymentPrincipal,
} from "./live-commerce-deployment-service.js";
import type {
  MMGCommerceDeploymentPhase,
  MMGCommerceDeploymentPlan,
  MMGCommerceE2EEvidence,
  MMGCommerceReleaseApproval,
  MMGShopifyRuntimeMapping,
} from "./live-commerce-deployment.js";
import type {
  MMGSQLExecutor,
  MMGTransactionalDatabase,
} from "../knowledge-library/persistence.js";

interface RequestRow extends Record<string, unknown> {
  payload_sha256: string;
  status: string;
}

interface ApprovalRow extends Record<string, unknown> {
  approval_id: string;
  approved_by: string;
  approved_at: Date | string;
  expires_at: Date | string;
  approved_actions: string[];
  approved_environment: string;
  release_commit_sha: string;
}

interface ReleaseRow extends Record<string, unknown> {
  release_version: number | string;
}

const integer = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("MMG_DEPLOYMENT_RELEASE_VERSION_INVALID");
  }
  return parsed;
};

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const recordEvent = async (
  database: MMGSQLExecutor,
  input: {
    releaseId: string;
    eventType: string;
    actorId?: string | null;
    phase?: string | null;
    payload?: Record<string, unknown>;
    occurredAt: Date;
  },
): Promise<void> => {
  await database.query(
    `
      INSERT INTO mmg_commerce_release_events
        (release_id, event_type, actor_id, phase, payload, occurred_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
    `,
    [
      input.releaseId,
      input.eventType,
      input.actorId ?? null,
      input.phase ?? null,
      JSON.stringify(input.payload ?? {}),
      input.occurredAt,
    ],
  );
};

export class MMGPostgresCommerceDeploymentRepository
  implements MMGCommerceDeploymentRepository
{
  readonly #database: MMGTransactionalDatabase;

  constructor(database: MMGTransactionalDatabase) {
    this.#database = database;
  }

  async claimRequest(input: {
    requestId: string;
    releaseId: string;
    action: MMGCommerceDeploymentCommand["action"];
    payloadHash: string;
    occurredAt: Date;
  }): Promise<"claimed" | "duplicate_completed" | "collision"> {
    return this.#database.transaction(async (transaction) => {
      const current = await transaction.query<RequestRow>(
        `
          SELECT payload_sha256, status
          FROM mmg_commerce_deployment_requests
          WHERE request_id = $1
          FOR UPDATE
        `,
        [input.requestId],
      );
      const row = current.rows[0];
      if (!row) {
        await transaction.query(
          `
            INSERT INTO mmg_commerce_deployment_requests
              (request_id, release_id, action, payload_sha256, status,
               first_received_at, updated_at)
            VALUES ($1, $2, $3, $4, 'processing', $5, $5)
          `,
          [
            input.requestId,
            input.releaseId,
            input.action,
            input.payloadHash,
            input.occurredAt,
          ],
        );
        return "claimed";
      }
      if (row.payload_sha256 !== input.payloadHash) return "collision";
      if (row.status === "completed") return "duplicate_completed";
      await transaction.query(
        `
          UPDATE mmg_commerce_deployment_requests
          SET status = 'processing', error_code = NULL, updated_at = $2
          WHERE request_id = $1
        `,
        [input.requestId, input.occurredAt],
      );
      return "claimed";
    });
  }

  async loadApproval(releaseId: string): Promise<MMGCommerceReleaseApproval | null> {
    const result = await this.#database.query<ApprovalRow>(
      `
        SELECT approval_id, approved_by, approved_at, expires_at,
          approved_actions, approved_environment, release_commit_sha
        FROM mmg_commerce_release_approvals
        WHERE release_id = $1
          AND status = 'active'
        ORDER BY approved_at DESC
        LIMIT 1
      `,
      [releaseId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      approvalId: row.approval_id,
      approvedBy: row.approved_by,
      approvedAt: iso(row.approved_at),
      expiresAt: iso(row.expires_at),
      approvedActions:
        row.approved_actions as MMGCommerceReleaseApproval["approvedActions"],
      approvedEnvironment:
        row.approved_environment as MMGCommerceReleaseApproval["approvedEnvironment"],
      releaseCommitSha: row.release_commit_sha,
    };
  }

  async loadReleaseVersion(releaseId: string): Promise<number | null> {
    const result = await this.#database.query<ReleaseRow>(
      `SELECT release_version FROM mmg_commerce_releases WHERE release_id = $1`,
      [releaseId],
    );
    return result.rows[0] ? integer(result.rows[0].release_version) : null;
  }

  async beginRelease(input: {
    command: MMGCommerceDeploymentCommand;
    principal: MMGCommerceDeploymentPrincipal;
    plan: MMGCommerceDeploymentPlan;
    occurredAt: Date;
  }): Promise<{ version: number; created: boolean }> {
    return this.#database.transaction(async (transaction) => {
      const inserted = await transaction.query<ReleaseRow>(
        `
          INSERT INTO mmg_commerce_releases
            (release_id, environment, release_commit_sha, status, current_phase,
             plan, created_by, created_at, updated_at)
          VALUES ($1, $2, $3, 'running', 'preflight', $4::jsonb, $5, $6, $6)
          ON CONFLICT (release_id) DO NOTHING
          RETURNING release_version
        `,
        [
          input.command.releaseId,
          input.command.environment,
          input.command.releaseCommitSha,
          JSON.stringify(input.plan),
          input.principal.actorId,
          input.occurredAt,
        ],
      );
      let created = inserted.rowCount === 1;
      let version = inserted.rows[0]
        ? integer(inserted.rows[0].release_version)
        : 0;
      if (!created) {
        const locked = await transaction.query<ReleaseRow & {
          environment: string;
          release_commit_sha: string;
        }>(
          `
            SELECT release_version, environment, release_commit_sha
            FROM mmg_commerce_releases
            WHERE release_id = $1
            FOR UPDATE
          `,
          [input.command.releaseId],
        );
        const row = locked.rows[0];
        if (!row) throw new Error("MMG_DEPLOYMENT_RELEASE_NOT_FOUND");
        if (
          row.environment !== input.command.environment ||
          row.release_commit_sha !== input.command.releaseCommitSha
        ) {
          throw new Error("MMG_DEPLOYMENT_RELEASE_ID_REUSE_MISMATCH");
        }
        const updated = await transaction.query<ReleaseRow>(
          `
            UPDATE mmg_commerce_releases
            SET status = CASE WHEN $2 = 'rollback' THEN 'rolling_back' ELSE 'running' END,
                plan = $3::jsonb,
                release_version = release_version + 1,
                updated_at = $4
            WHERE release_id = $1
            RETURNING release_version
          `,
          [
            input.command.releaseId,
            input.command.action,
            JSON.stringify(input.plan),
            input.occurredAt,
          ],
        );
        version = integer(updated.rows[0]?.release_version);
      }

      for (const step of input.plan.steps) {
        await transaction.query(
          `
            INSERT INTO mmg_commerce_release_steps
              (release_id, phase, status, result, updated_at)
            VALUES ($1, $2, $3, $4::jsonb, $5)
            ON CONFLICT (release_id, phase)
            DO UPDATE SET
              status = CASE
                WHEN mmg_commerce_release_steps.status IN ('completed', 'rolled_back')
                  THEN mmg_commerce_release_steps.status
                ELSE EXCLUDED.status
              END,
              result = CASE
                WHEN mmg_commerce_release_steps.status IN ('completed', 'rolled_back')
                  THEN mmg_commerce_release_steps.result
                ELSE EXCLUDED.result
              END,
              updated_at = EXCLUDED.updated_at
          `,
          [
            input.command.releaseId,
            step.phase,
            step.status,
            JSON.stringify({
              summary: step.summary,
              reasonCodes: step.reasonCodes,
            }),
            input.occurredAt,
          ],
        );
      }
      await recordEvent(transaction, {
        releaseId: input.command.releaseId,
        eventType: created ? "release_created" : "release_resumed",
        actorId: input.principal.actorId,
        payload: { action: input.command.action, version },
        occurredAt: input.occurredAt,
      });
      return { version, created };
    });
  }

  async recordStep(input: {
    releaseId: string;
    expectedReleaseVersion: number;
    phase: MMGCommerceDeploymentPhase;
    status: "running" | "completed" | "failed" | "rolled_back";
    result: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<{ version: number }> {
    return this.#database.transaction(async (transaction) => {
      const release = await transaction.query<ReleaseRow>(
        `
          UPDATE mmg_commerce_releases
          SET current_phase = $3,
              status = CASE
                WHEN $4 = 'failed' THEN 'failed'
                WHEN $4 = 'rolled_back' THEN 'rolling_back'
                ELSE status
              END,
              release_version = release_version + 1,
              updated_at = $5
          WHERE release_id = $1 AND release_version = $2
          RETURNING release_version
        `,
        [
          input.releaseId,
          input.expectedReleaseVersion,
          input.phase,
          input.status,
          input.occurredAt,
        ],
      );
      if (release.rowCount !== 1) {
        throw new Error("MMG_DEPLOYMENT_RELEASE_VERSION_CONFLICT");
      }
      await transaction.query(
        `
          UPDATE mmg_commerce_release_steps
          SET status = $3,
              attempt_count = CASE WHEN $3 = 'running' THEN attempt_count + 1 ELSE attempt_count END,
              result = $4::jsonb,
              started_at = CASE WHEN $3 = 'running' THEN COALESCE(started_at, $5) ELSE started_at END,
              completed_at = CASE WHEN $3 IN ('completed', 'failed', 'rolled_back') THEN $5 ELSE completed_at END,
              updated_at = $5
          WHERE release_id = $1 AND phase = $2
        `,
        [
          input.releaseId,
          input.phase,
          input.status,
          JSON.stringify(input.result),
          input.occurredAt,
        ],
      );
      const version = integer(release.rows[0]?.release_version);
      await recordEvent(transaction, {
        releaseId: input.releaseId,
        eventType: `phase_${input.status}`,
        phase: input.phase,
        payload: { version, result: input.result },
        occurredAt: input.occurredAt,
      });
      return { version };
    });
  }

  async completeRequest(input: {
    requestId: string;
    releaseId: string;
    outcome: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<void> {
    await this.#database.transaction(async (transaction) => {
      await transaction.query(
        `
          UPDATE mmg_commerce_deployment_requests
          SET status = 'completed', outcome = $3::jsonb,
              completed_at = $4, updated_at = $4, error_code = NULL
          WHERE request_id = $1 AND release_id = $2
        `,
        [
          input.requestId,
          input.releaseId,
          JSON.stringify(input.outcome),
          input.occurredAt,
        ],
      );
      const status = String(input.outcome.status ?? "");
      await transaction.query(
        `
          UPDATE mmg_commerce_releases
          SET status = CASE
                WHEN $2 = 'published' THEN 'published'
                WHEN $2 = 'verified' THEN 'verified'
                WHEN $2 = 'rolled_back' THEN 'rolled_back'
                ELSE status
              END,
              verified_at = CASE WHEN $2 = 'verified' THEN $3 ELSE verified_at END,
              published_at = CASE WHEN $2 = 'published' THEN $3 ELSE published_at END,
              rolled_back_at = CASE WHEN $2 = 'rolled_back' THEN $3 ELSE rolled_back_at END,
              updated_at = $3
          WHERE release_id = $1
        `,
        [input.releaseId, status, input.occurredAt],
      );
    });
  }

  async failRequest(input: {
    requestId: string;
    releaseId: string;
    errorCode: string;
    occurredAt: Date;
  }): Promise<void> {
    await this.#database.query(
      `
        UPDATE mmg_commerce_deployment_requests
        SET status = 'failed', error_code = $3, updated_at = $4
        WHERE request_id = $1 AND release_id = $2
      `,
      [input.requestId, input.releaseId, input.errorCode.slice(0, 500), input.occurredAt],
    );
  }

  async saveRuntimeMapping(input: {
    releaseId: string;
    mapping: MMGShopifyRuntimeMapping;
    occurredAt: Date;
  }): Promise<void> {
    await this.#database.query(
      `
        INSERT INTO mmg_shopify_runtime_mappings (
          shop_domain, mapping_key, api_version, product_gid,
          monthly_variant_gid, biweekly_variant_gid, weekly_variant_gid,
          selling_plan_group_gid, selling_plan_gid, online_store_publication_gid,
          product_status, source_release_id, verified_at, created_at, updated_at
        )
        VALUES ($1, 'mmg-knowledge-subscription', $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $13)
        ON CONFLICT (shop_domain, mapping_key)
        DO UPDATE SET
          api_version = EXCLUDED.api_version,
          product_gid = EXCLUDED.product_gid,
          monthly_variant_gid = EXCLUDED.monthly_variant_gid,
          biweekly_variant_gid = EXCLUDED.biweekly_variant_gid,
          weekly_variant_gid = EXCLUDED.weekly_variant_gid,
          selling_plan_group_gid = EXCLUDED.selling_plan_group_gid,
          selling_plan_gid = EXCLUDED.selling_plan_gid,
          online_store_publication_gid = EXCLUDED.online_store_publication_gid,
          product_status = EXCLUDED.product_status,
          source_release_id = EXCLUDED.source_release_id,
          verified_at = EXCLUDED.verified_at,
          updated_at = EXCLUDED.updated_at
      `,
      [
        input.mapping.shopDomain,
        input.mapping.apiVersion,
        input.mapping.productGid,
        input.mapping.variantGids.monthly,
        input.mapping.variantGids.biweekly,
        input.mapping.variantGids.weekly,
        input.mapping.sellingPlanGroupGid,
        input.mapping.sellingPlanGid,
        input.mapping.onlineStorePublicationGid,
        input.mapping.productStatus,
        input.releaseId,
        input.mapping.verifiedAt,
        input.occurredAt,
      ],
    );
  }

  async saveE2EEvidence(input: {
    releaseId: string;
    evidence: MMGCommerceE2EEvidence;
    occurredAt: Date;
  }): Promise<void> {
    const status = Object.values(input.evidence.checks).every(
      (value) => value === "passed",
    )
      ? "passed"
      : "failed";
    await this.#database.query(
      `
        INSERT INTO mmg_commerce_e2e_runs (
          run_id, release_id, environment, status, checks,
          test_order_id_sha256, test_customer_reference_sha256,
          started_at, completed_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $8)
        ON CONFLICT (run_id) DO UPDATE SET
          status = EXCLUDED.status,
          checks = EXCLUDED.checks,
          completed_at = EXCLUDED.completed_at
      `,
      [
        input.evidence.runId,
        input.releaseId,
        input.evidence.environment,
        status,
        JSON.stringify(input.evidence.checks),
        input.evidence.testOrderIdHash,
        input.evidence.testCustomerReferenceHash,
        input.evidence.completedAt,
      ],
    );
  }
}
