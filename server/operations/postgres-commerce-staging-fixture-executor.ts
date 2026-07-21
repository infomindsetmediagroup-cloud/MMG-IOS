import type {
  MMGSQLExecutor,
  MMGTransactionalDatabase,
} from "../knowledge-library/persistence.js";
import { bootstrapMMGCommerceOperations } from "./commerce-operations-bootstrap.js";
import type { MMGCommerceRolloutStage } from "./commerce-operations-control.js";
import {
  executeMMGCommerceOperationsCommand,
  type MMGCommerceOperationsDependencies,
  type MMGCommerceOperationsPrincipal,
  type MMGCommerceOperationsState,
} from "./commerce-operations-service.js";
import {
  executeMMGCommerceRolloutCommand,
  type MMGCommerceRolloutDependencies,
} from "./commerce-rollout-service.js";
import type { MMGCommerceStagingFixtureExecutor } from "./commerce-staging-rehearsal-adapter-http.js";
import type {
  MMGCommerceRehearsalScenario,
  MMGCommerceRightsDigest,
} from "./commerce-staging-rehearsal.js";
import { MMGCommerceStagingFixtureEvidenceAdapter } from "./commerce-staging-fixture-evidence.js";
import { MMGCommerceStagingFixtureMetricsAdapter } from "./commerce-staging-fixture-metrics.js";

interface FixtureRow extends Record<string, unknown> {
  run_id: string;
  release_id: string;
  scenario: string | null;
  virtual_clock: Date | string;
  status: string;
  fixture_namespace: string;
}

interface LeaseRow extends Record<string, unknown> {
  run_id: string;
  expires_at: Date | string;
  released_at: Date | string | null;
}

interface RightsRow extends Record<string, unknown> {
  active_ownership_count: string | number;
  active_delivery_grant_count: string | number;
  delivered_window_count: string | number;
  active_entitlement_count: string | number;
  digest_sha256: string;
}

const scenarioIncident: Record<MMGCommerceRehearsalScenario, string> = {
  database_connectivity_sev1: "incident:staging:database_connectivity_ratio",
  webhook_failure_sev2: "incident:staging:webhook_delivery_failure_rate",
};

const integer = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("MMG_REHEARSAL_RIGHTS_COUNT_INVALID");
  }
  return parsed;
};

const isoDate = (value: Date | string): Date => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("MMG_REHEARSAL_FIXTURE_CLOCK_INVALID");
  }
  return date;
};

export class MMGPostgresCommerceStagingFixtureExecutor
  implements MMGCommerceStagingFixtureExecutor
{
  readonly #database: MMGTransactionalDatabase;
  readonly #baseDependencies: MMGCommerceOperationsDependencies;

  constructor(input: {
    database: MMGTransactionalDatabase;
    operations: MMGCommerceOperationsDependencies;
  }) {
    this.#database = input.database;
    this.#baseDependencies = input.operations;
  }

  async bootstrapSafeState(input: {
    runId: string;
    releaseId: string;
    occurredAt: Date;
    actorId: string;
  }): Promise<void> {
    await this.#database.transaction(async (transaction) => {
      await this.#acquireLease(transaction, input);
      await transaction.query(
        `INSERT INTO mmg_commerce_staging_fixture_state (
           run_id, release_id, environment, scenario, virtual_clock, status,
           fixture_namespace, publication_allowed, live_customer_data_allowed,
           created_by, created_at, updated_at
         ) VALUES ($1, $2, 'staging', NULL, $3, 'active', $4, FALSE, FALSE, $5, $3, $3)
         ON CONFLICT (run_id)
         DO UPDATE SET
           release_id = EXCLUDED.release_id,
           scenario = NULL,
           virtual_clock = EXCLUDED.virtual_clock,
           status = 'active',
           fixture_namespace = EXCLUDED.fixture_namespace,
           updated_at = EXCLUDED.updated_at,
           completed_at = NULL`,
        [
          input.runId,
          input.releaseId,
          input.occurredAt,
          `fixture:${input.runId}`.slice(0, 128),
          input.actorId,
        ],
      );
      await this.#event(transaction, input.runId, "fixture_bootstrapped", input.actorId, {
        releaseId: input.releaseId,
        publicationAllowed: false,
        liveCustomerDataAllowed: false,
      }, input.occurredAt);
    });
    await bootstrapMMGCommerceOperations({
      environment: "staging",
      releaseId: input.releaseId,
      principal: this.#principal(input.actorId),
      repository: this.#baseDependencies.repository,
      controls: this.#baseDependencies.controls,
      occurredAt: input.occurredAt,
    });
  }

  async setScenario(input: {
    runId: string;
    releaseId: string;
    scenario: MMGCommerceRehearsalScenario | null;
    occurredAt: Date;
    actorId: string;
  }): Promise<void> {
    await this.#database.transaction(async (transaction) => {
      await this.#assertActive(transaction, input.runId, input.releaseId);
      await transaction.query(
        `UPDATE mmg_commerce_staging_fixture_state
         SET scenario = $2, virtual_clock = $3, updated_at = $3
         WHERE run_id = $1 AND status = 'active'`,
        [input.runId, input.scenario, input.occurredAt],
      );
      await this.#event(
        transaction,
        input.runId,
        input.scenario ? "scenario_injected" : "scenario_cleared",
        input.actorId,
        { scenario: input.scenario },
        input.occurredAt,
      );
    });
  }

  async evaluate(input: {
    runId: string;
    releaseId: string;
    requestId: string;
    occurredAt: Date;
    actorId: string;
  }): Promise<MMGCommerceOperationsState> {
    const dependencies = await this.#operationsDependencies(input.runId, input.releaseId);
    await executeMMGCommerceOperationsCommand({
      command: {
        requestId: input.requestId,
        action: "evaluate",
        environment: "staging",
        releaseId: input.releaseId,
        allowAutomaticContainment: true,
      },
      principal: this.#principal(input.actorId),
      dependencies,
    });
    return dependencies.repository.loadState("staging");
  }

  async recoverScenario(input: {
    runId: string;
    releaseId: string;
    scenario: MMGCommerceRehearsalScenario;
    occurredAt: Date;
    actorId: string;
  }): Promise<MMGCommerceOperationsState> {
    const fixture = await this.#fixture(input.runId, input.releaseId);
    if (fixture.scenario !== null) {
      throw new Error("MMG_REHEARSAL_SCENARIO_MUST_BE_CLEARED");
    }
    const dependencies = await this.#operationsDependencies(input.runId, input.releaseId);
    await executeMMGCommerceOperationsCommand({
      command: {
        requestId: `${input.runId}:recover:${input.scenario}`.slice(0, 128),
        action: "evaluate",
        environment: "staging",
        releaseId: input.releaseId,
        allowAutomaticContainment: false,
      },
      principal: this.#principal(input.actorId),
      dependencies,
    });
    const incidentId = scenarioIncident[input.scenario];
    const incident = await dependencies.repository.loadIncident(incidentId);
    if (incident?.state === "monitoring") {
      await dependencies.repository.transitionIncident({
        incidentId,
        expectedVersion: incident.version,
        from: "monitoring",
        to: "resolved",
        actorId: input.actorId,
        reason: `staging_rehearsal_recovered:${input.scenario}`,
        occurredAt: input.occurredAt,
      });
    } else if (incident && !["resolved", "closed"].includes(incident.state)) {
      throw new Error("MMG_REHEARSAL_INCIDENT_NOT_READY_FOR_RESOLUTION");
    }
    return dependencies.repository.loadState("staging");
  }

  async runConsistencyAudit(input: {
    runId: string;
    releaseId: string;
    requestId: string;
    occurredAt: Date;
    actorId: string;
  }): Promise<{ passed: boolean; failedChecks: string[] }> {
    const dependencies = await this.#operationsDependencies(input.runId, input.releaseId);
    const result = await executeMMGCommerceOperationsCommand({
      command: {
        requestId: input.requestId,
        action: "run_consistency_audit",
        environment: "staging",
        releaseId: input.releaseId,
        allowAutomaticContainment: true,
      },
      principal: this.#principal(input.actorId),
      dependencies,
    });
    const audit = result.body.audit as
      | { status?: string; checks?: Array<{ code?: string; status?: string }> }
      | undefined;
    return {
      passed: audit?.status === "passed",
      failedChecks: Array.isArray(audit?.checks)
        ? audit.checks
            .filter((check) => check.status === "failed")
            .map((check) => String(check.code ?? "UNKNOWN_CHECK"))
        : ["AUDIT_RESPONSE_INVALID"],
    };
  }

  async grantStageApproval(input: {
    runId: string;
    releaseId: string;
    fromStage: MMGCommerceRolloutStage;
    toStage: MMGCommerceRolloutStage;
    occurredAt: Date;
    actorId: string;
  }): Promise<void> {
    await this.#assertActive(this.#database, input.runId, input.releaseId);
    const approvalId = `fixture:${input.runId.slice(0, 72)}:${input.fromStage}:${input.toStage}`;
    const expiresAt = new Date(input.occurredAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    await this.#database.query(
      `INSERT INTO mmg_commerce_rollout_approvals (
         approval_id, release_id, environment, from_stage, to_stage,
         approved_by, approved_at, expires_at, status, updated_at
       ) VALUES ($1, $2, 'staging', $3, $4, $5, $6, $7, 'active', $6)
       ON CONFLICT (approval_id)
       DO UPDATE SET
         approved_at = EXCLUDED.approved_at,
         expires_at = EXCLUDED.expires_at,
         status = 'active',
         updated_at = EXCLUDED.updated_at`,
      [
        approvalId,
        input.releaseId,
        input.fromStage,
        input.toStage,
        input.actorId,
        input.occurredAt,
        expiresAt,
      ],
    );
  }

  async advanceObservation(input: {
    runId: string;
    releaseId: string;
    hours: number;
    occurredAt: Date;
    actorId: string;
  }): Promise<Date> {
    if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > 168) {
      throw new Error("MMG_REHEARSAL_OBSERVATION_ADVANCE_INVALID");
    }
    const next = new Date(input.occurredAt.getTime() + input.hours * 60 * 60 * 1000);
    await this.#database.transaction(async (transaction) => {
      const fixture = await this.#assertActive(transaction, input.runId, input.releaseId);
      if (isoDate(fixture.virtual_clock).getTime() !== input.occurredAt.getTime()) {
        throw new Error("MMG_REHEARSAL_VIRTUAL_CLOCK_CONFLICT");
      }
      await transaction.query(
        `UPDATE mmg_commerce_staging_fixture_state
         SET virtual_clock = $2, updated_at = $2
         WHERE run_id = $1 AND status = 'active'`,
        [input.runId, next],
      );
      await this.#event(transaction, input.runId, "observation_advanced", input.actorId, {
        hours: input.hours,
        from: input.occurredAt.toISOString(),
        to: next.toISOString(),
      }, next);
    });
    return next;
  }

  async advanceRollout(input: {
    runId: string;
    releaseId: string;
    requestId: string;
    targetStage: MMGCommerceRolloutStage;
    occurredAt: Date;
    actorId: string;
  }): Promise<MMGCommerceOperationsState> {
    const dependencies = await this.#rolloutDependencies(input.runId, input.releaseId);
    await executeMMGCommerceRolloutCommand({
      command: {
        requestId: input.requestId,
        action: "advance_rollout",
        environment: "staging",
        releaseId: input.releaseId,
        targetStage: input.targetStage,
        reason: `staging_rehearsal:${input.runId}`,
      },
      principal: this.#principal(input.actorId),
      dependencies,
    });
    return dependencies.repository.loadState("staging");
  }

  async readRightsDigest(input: {
    runId: string;
    releaseId: string;
    occurredAt: Date;
    actorId: string;
  }): Promise<MMGCommerceRightsDigest> {
    await this.#assertActive(this.#database, input.runId, input.releaseId);
    const result = await this.#database.query<RightsRow>(
      `WITH ownership AS (
         SELECT COUNT(*) AS count,
           encode(digest(COALESCE(string_agg(
             customer_id || ':' || asset_id || ':' || source || ':' || source_reference,
             '|' ORDER BY customer_id, asset_id, source, source_reference
           ), ''), 'sha256'), 'hex') AS hash
         FROM mmg_ownership_grants WHERE status = 'active'
       ), delivery AS (
         SELECT COUNT(*) AS count,
           encode(digest(COALESCE(string_agg(
             customer_id || ':' || asset_id || ':' || window_id::text,
             '|' ORDER BY customer_id, asset_id, window_id::text
           ), ''), 'sha256'), 'hex') AS hash
         FROM mmg_delivery_grants WHERE status = 'active'
       ), delivered_windows AS (
         SELECT COUNT(*) AS count,
           encode(digest(COALESCE(string_agg(id::text, '|' ORDER BY id::text), ''), 'sha256'), 'hex') AS hash
         FROM mmg_entitlement_windows WHERE status = 'delivered'
       ), entitlements AS (
         SELECT COUNT(*) AS count,
           encode(digest(COALESCE(string_agg(
             id::text || ':' || customer_id || ':' || plan_code,
             '|' ORDER BY id::text
           ), ''), 'sha256'), 'hex') AS hash
         FROM mmg_subscription_entitlements WHERE status = 'active'
       )
       SELECT
         ownership.count AS active_ownership_count,
         delivery.count AS active_delivery_grant_count,
         delivered_windows.count AS delivered_window_count,
         entitlements.count AS active_entitlement_count,
         encode(digest(
           ownership.hash || delivery.hash || delivered_windows.hash || entitlements.hash,
           'sha256'
         ), 'hex') AS digest_sha256
       FROM ownership, delivery, delivered_windows, entitlements`,
    );
    const row = result.rows[0];
    if (!row || !/^[a-f0-9]{64}$/.test(row.digest_sha256)) {
      throw new Error("MMG_REHEARSAL_RIGHTS_DIGEST_INVALID");
    }
    return {
      activeOwnershipCount: integer(row.active_ownership_count),
      activeDeliveryGrantCount: integer(row.active_delivery_grant_count),
      deliveredWindowCount: integer(row.delivered_window_count),
      activeEntitlementCount: integer(row.active_entitlement_count),
      digestSha256: row.digest_sha256,
    };
  }

  async teardown(input: {
    runId: string;
    releaseId: string;
    occurredAt: Date;
    actorId: string;
  }): Promise<void> {
    const fixture = await this.#fixture(input.runId, input.releaseId);
    await bootstrapMMGCommerceOperations({
      environment: "staging",
      releaseId: input.releaseId,
      principal: this.#principal(input.actorId),
      repository: this.#baseDependencies.repository,
      controls: this.#baseDependencies.controls,
      occurredAt: isoDate(fixture.virtual_clock),
    });
    await this.#database.transaction(async (transaction) => {
      await transaction.query(
        `UPDATE mmg_commerce_staging_fixture_state
         SET scenario = NULL, status = 'torn_down', completed_at = $2, updated_at = $2
         WHERE run_id = $1 AND status = 'active'`,
        [input.runId, input.occurredAt],
      );
      await transaction.query(
        `UPDATE mmg_commerce_rehearsal_fixture_leases
         SET released_at = $2, updated_at = $2
         WHERE environment = 'staging' AND run_id = $1 AND released_at IS NULL`,
        [input.runId, input.occurredAt],
      );
      await this.#event(transaction, input.runId, "fixture_torn_down", input.actorId, {
        customerRecordsDeleted: false,
        ownershipRevoked: false,
        publicationAttempted: false,
      }, input.occurredAt);
    });
  }

  async #operationsDependencies(
    runId: string,
    releaseId: string,
  ): Promise<MMGCommerceOperationsDependencies> {
    const fixture = await this.#fixture(runId, releaseId);
    const clock = isoDate(fixture.virtual_clock);
    return {
      ...this.#baseDependencies,
      metrics: new MMGCommerceStagingFixtureMetricsAdapter({
        database: this.#database,
        base: this.#baseDependencies.metrics,
      }),
      now: () => clock,
    };
  }

  async #rolloutDependencies(
    runId: string,
    releaseId: string,
  ): Promise<MMGCommerceRolloutDependencies> {
    const operations = await this.#operationsDependencies(runId, releaseId);
    return {
      ...operations,
      rolloutEvidence: new MMGCommerceStagingFixtureEvidenceAdapter({
        database: this.#database,
        runId,
      }),
    };
  }

  #principal(actorId: string): MMGCommerceOperationsPrincipal {
    return {
      actorId,
      sessionId: `staging-rehearsal:${actorId}`.slice(0, 128),
      roles: ["mmg-commerce-operator", "mmg-commerce-monitor"],
    };
  }

  async #fixture(runId: string, releaseId: string): Promise<FixtureRow> {
    return this.#assertActive(this.#database, runId, releaseId);
  }

  async #assertActive(
    database: MMGSQLExecutor,
    runId: string,
    releaseId: string,
  ): Promise<FixtureRow> {
    const result = await database.query<FixtureRow>(
      `SELECT run_id, release_id, scenario, virtual_clock, status, fixture_namespace
       FROM mmg_commerce_staging_fixture_state
       WHERE run_id = $1 AND release_id = $2 AND environment = 'staging'
       LIMIT 1`,
      [runId, releaseId],
    );
    const row = result.rows[0];
    if (!row || row.status !== "active") {
      throw new Error("MMG_REHEARSAL_FIXTURE_NOT_ACTIVE");
    }
    return row;
  }

  async #acquireLease(
    transaction: MMGSQLExecutor,
    input: { runId: string; releaseId: string; occurredAt: Date; actorId: string },
  ): Promise<void> {
    const current = await transaction.query<LeaseRow>(
      `SELECT run_id, expires_at, released_at
       FROM mmg_commerce_rehearsal_fixture_leases
       WHERE environment = 'staging'
       FOR UPDATE`,
    );
    const row = current.rows[0];
    if (
      row &&
      row.run_id !== input.runId &&
      row.released_at === null &&
      isoDate(row.expires_at).getTime() > input.occurredAt.getTime()
    ) {
      throw new Error("MMG_REHEARSAL_FIXTURE_LEASE_BUSY");
    }
    const expiresAt = new Date(input.occurredAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    await transaction.query(
      `INSERT INTO mmg_commerce_rehearsal_fixture_leases (
         environment, run_id, fixture_namespace, acquired_at, expires_at,
         released_at, updated_at
       ) VALUES ('staging', $1, $2, $3, $4, NULL, $3)
       ON CONFLICT (environment)
       DO UPDATE SET
         run_id = EXCLUDED.run_id,
         fixture_namespace = EXCLUDED.fixture_namespace,
         acquired_at = EXCLUDED.acquired_at,
         expires_at = EXCLUDED.expires_at,
         released_at = NULL,
         updated_at = EXCLUDED.updated_at`,
      [
        input.runId,
        `fixture:${input.runId}`.slice(0, 128),
        input.occurredAt,
        expiresAt,
      ],
    );
  }

  async #event(
    transaction: MMGSQLExecutor,
    runId: string,
    eventType: string,
    actorId: string,
    payload: Record<string, unknown>,
    occurredAt: Date,
  ): Promise<void> {
    await transaction.query(
      `INSERT INTO mmg_commerce_staging_fixture_events (
         run_id, event_type, actor_id, payload, occurred_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [runId, eventType, actorId, JSON.stringify(payload), occurredAt],
    );
  }
}
