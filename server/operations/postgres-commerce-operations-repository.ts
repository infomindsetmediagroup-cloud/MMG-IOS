import type { MMGSQLExecutor, MMGTransactionalDatabase } from "../knowledge-library/persistence.js";
import type { MMGCommerceConsistencyAudit } from "./commerce-consistency-audit.js";
import type {
  MMGCommerceControlChange,
  MMGCommerceHealthSnapshot,
  MMGCommerceOperationsEnvironment,
  MMGCommerceRolloutStage,
  MMGCommerceSignalEvaluation,
  MMGIncidentState,
} from "./commerce-operations-control.js";
import type {
  MMGCommerceControlState,
  MMGCommerceIncidentRecord,
  MMGCommerceOperationsAction,
  MMGCommerceOperationsRepository,
  MMGCommerceOperationsState,
  MMGCommerceRolloutApproval,
  MMGCommerceRolloutState,
} from "./commerce-operations-service.js";

const jsonValue = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
};

interface RequestRow extends Record<string, unknown> {
  action: string;
  environment: string;
  payload_sha256: string;
  status: string;
}

interface HealthRow extends Record<string, unknown> {
  run_id: string;
  environment: MMGCommerceOperationsEnvironment;
  release_id: string | null;
  schema_version: "1.0.0";
  overall_status: MMGCommerceHealthSnapshot["overallStatus"];
  signals: unknown;
  evaluated_at: Date | string;
}

interface AuditRow extends Record<string, unknown> {
  audit_id: string;
  environment: MMGCommerceOperationsEnvironment;
  release_id: string | null;
  schema_version: "1.0.0";
  status: MMGCommerceConsistencyAudit["status"];
  checks: unknown;
  started_at: Date | string;
  completed_at: Date | string;
}

interface IncidentRow extends Record<string, unknown> {
  incident_id: string;
  environment: MMGCommerceOperationsEnvironment;
  signal_code: string;
  severity: MMGCommerceIncidentRecord["severity"];
  state: MMGCommerceIncidentRecord["state"];
  title: string;
  summary: string;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  version: number;
}

interface ControlRow extends Record<string, unknown> {
  control_code: MMGCommerceControlState["control"];
  mode: MMGCommerceControlState["mode"];
  version: number;
  reason: string;
  changed_at: Date | string;
}

interface RolloutRow extends Record<string, unknown> {
  environment: MMGCommerceOperationsEnvironment;
  release_id: string;
  stage: MMGCommerceRolloutStage;
  cohort_percentage: string | number;
  entered_at: Date | string;
  observation_until: Date | string | null;
  version: number;
  status: MMGCommerceRolloutState["status"];
}

interface ApprovalRow extends Record<string, unknown> {
  approval_id: string;
  release_id: string;
  environment: MMGCommerceOperationsEnvironment;
  from_stage: MMGCommerceRolloutStage;
  to_stage: MMGCommerceRolloutStage;
  approved_by: string;
  approved_at: Date | string;
  expires_at: Date | string;
  status: MMGCommerceRolloutApproval["status"];
}

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const incident = (row: IncidentRow): MMGCommerceIncidentRecord => ({
  incidentId: row.incident_id,
  environment: row.environment,
  signalCode: row.signal_code,
  severity: row.severity,
  state: row.state,
  title: row.title,
  summary: row.summary,
  firstSeenAt: iso(row.first_seen_at),
  lastSeenAt: iso(row.last_seen_at),
  version: Number(row.version),
});

const control = (row: ControlRow): MMGCommerceControlState => ({
  control: row.control_code,
  mode: row.mode,
  version: Number(row.version),
  reason: row.reason,
  changedAt: iso(row.changed_at),
});

const rollout = (row: RolloutRow): MMGCommerceRolloutState => ({
  environment: row.environment,
  releaseId: row.release_id,
  stage: row.stage,
  cohortPercentage: Number(row.cohort_percentage),
  enteredAt: iso(row.entered_at),
  observationUntil: row.observation_until ? iso(row.observation_until) : null,
  version: Number(row.version),
  status: row.status,
});

const health = (row: HealthRow): MMGCommerceHealthSnapshot => ({
  schemaVersion: row.schema_version,
  environment: row.environment,
  runId: row.run_id,
  releaseId: row.release_id,
  overallStatus: row.overall_status,
  evaluatedAt: iso(row.evaluated_at),
  signals: jsonValue(row.signals, []),
});

const audit = (row: AuditRow): MMGCommerceConsistencyAudit => ({
  schemaVersion: row.schema_version,
  auditId: row.audit_id,
  environment: row.environment,
  releaseId: row.release_id,
  status: row.status,
  startedAt: iso(row.started_at),
  completedAt: iso(row.completed_at),
  checks: jsonValue(row.checks, []),
  destructiveRepairAllowed: false,
  deliveredOwnershipRevocationAllowed: false,
});

const loadIncidentForUpdate = async (
  transaction: MMGSQLExecutor,
  incidentId: string,
): Promise<IncidentRow> => {
  const result = await transaction.query<IncidentRow>(
    `SELECT incident_id, environment, signal_code, severity, state, title, summary,
       first_seen_at, last_seen_at, version
     FROM mmg_commerce_incidents
     WHERE incident_id = $1
     FOR UPDATE`,
    [incidentId],
  );
  if (!result.rows[0]) throw new Error("MMG_INCIDENT_NOT_FOUND");
  return result.rows[0];
};

export class MMGPostgresCommerceOperationsRepository
  implements MMGCommerceOperationsRepository
{
  readonly #database: MMGTransactionalDatabase;

  constructor(database: MMGTransactionalDatabase) {
    this.#database = database;
  }

  async claimRequest(input: {
    requestId: string;
    action: MMGCommerceOperationsAction;
    environment: MMGCommerceOperationsEnvironment;
    payloadHash: string;
    occurredAt: Date;
  }): Promise<"claimed" | "duplicate_completed" | "collision"> {
    return this.#database.transaction(async (transaction) => {
      const inserted = await transaction.query(
        `INSERT INTO mmg_commerce_operations_requests (
           request_id, action, environment, payload_sha256, status,
           first_received_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'processing', $5, $5)
         ON CONFLICT (request_id) DO NOTHING
         RETURNING request_id`,
        [
          input.requestId,
          input.action,
          input.environment,
          input.payloadHash,
          input.occurredAt,
        ],
      );
      if (inserted.rowCount === 1) return "claimed";
      const existing = await transaction.query<RequestRow>(
        `SELECT action, environment, payload_sha256, status
         FROM mmg_commerce_operations_requests
         WHERE request_id = $1
         FOR UPDATE`,
        [input.requestId],
      );
      const row = existing.rows[0];
      if (
        row &&
        row.action === input.action &&
        row.environment === input.environment &&
        row.payload_sha256 === input.payloadHash &&
        row.status === "completed"
      ) {
        return "duplicate_completed";
      }
      return "collision";
    });
  }

  async completeRequest(input: {
    requestId: string;
    outcome: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<void> {
    await this.#database.query(
      `UPDATE mmg_commerce_operations_requests
       SET status = 'completed', outcome = $2::jsonb, error_code = NULL,
         completed_at = $3, updated_at = $3
       WHERE request_id = $1`,
      [input.requestId, JSON.stringify(input.outcome), input.occurredAt],
    );
  }

  async failRequest(input: {
    requestId: string;
    errorCode: string;
    occurredAt: Date;
  }): Promise<void> {
    await this.#database.query(
      `UPDATE mmg_commerce_operations_requests
       SET status = 'failed', error_code = $2, updated_at = $3
       WHERE request_id = $1`,
      [input.requestId, input.errorCode.slice(0, 500), input.occurredAt],
    );
  }

  async loadState(
    environment: MMGCommerceOperationsEnvironment,
  ): Promise<MMGCommerceOperationsState> {
    const [healthResult, auditResult, rolloutResult, controlsResult, incidentsResult, e2eResult] =
      await Promise.all([
        this.#database.query<HealthRow>(
          `SELECT run_id, environment, release_id, schema_version, overall_status,
             signals, evaluated_at
           FROM mmg_commerce_health_snapshots
           WHERE environment = $1
           ORDER BY evaluated_at DESC
           LIMIT 1`,
          [environment],
        ),
        this.#database.query<AuditRow>(
          `SELECT audit_id, environment, release_id, schema_version, status,
             checks, started_at, completed_at
           FROM mmg_commerce_consistency_audits
           WHERE environment = $1
           ORDER BY completed_at DESC
           LIMIT 1`,
          [environment],
        ),
        this.#database.query<RolloutRow>(
          `SELECT environment, release_id, stage, cohort_percentage, entered_at,
             observation_until, version, status
           FROM mmg_commerce_rollout_state
           WHERE environment = $1
           LIMIT 1`,
          [environment],
        ),
        this.#database.query<ControlRow>(
          `SELECT control_code, mode, version, reason, changed_at
           FROM mmg_commerce_controls
           WHERE environment = $1
           ORDER BY control_code`,
          [environment],
        ),
        this.#database.query<IncidentRow>(
          `SELECT incident_id, environment, signal_code, severity, state, title,
             summary, first_seen_at, last_seen_at, version
           FROM mmg_commerce_incidents
           WHERE environment = $1 AND state NOT IN ('resolved', 'closed')
           ORDER BY
             CASE severity WHEN 'SEV1' THEN 1 WHEN 'SEV2' THEN 2 WHEN 'SEV3' THEN 3 ELSE 4 END,
             last_seen_at DESC`,
          [environment],
        ),
        this.#database.query<{ completed_at: Date | string }>(
          `SELECT completed_at
           FROM mmg_commerce_e2e_runs
           WHERE environment = $1 AND status = 'passed' AND completed_at IS NOT NULL
           ORDER BY completed_at DESC
           LIMIT 1`,
          [environment],
        ),
      ]);
    const e2eCompleted = e2eResult.rows[0]
      ? Date.parse(iso(e2eResult.rows[0].completed_at))
      : Number.NaN;
    return {
      environment,
      latestHealth: healthResult.rows[0] ? health(healthResult.rows[0]) : null,
      latestConsistencyAudit: auditResult.rows[0] ? audit(auditResult.rows[0]) : null,
      rollout: rolloutResult.rows[0] ? rollout(rolloutResult.rows[0]) : null,
      controls: controlsResult.rows.map(control),
      openIncidents: incidentsResult.rows.map(incident),
      freshE2EPassed:
        Number.isFinite(e2eCompleted) && Date.now() - e2eCompleted <= 86_400_000,
    };
  }

  async saveHealthSnapshot(snapshot: MMGCommerceHealthSnapshot): Promise<void> {
    await this.#database.transaction(async (transaction) => {
      await transaction.query(
        `INSERT INTO mmg_commerce_monitor_runs (
           run_id, environment, release_id, status, overall_status,
           started_at, completed_at
         ) VALUES ($1, $2, $3, 'completed', $4, $5, $5)
         ON CONFLICT (run_id) DO NOTHING`,
        [
          snapshot.runId,
          snapshot.environment,
          snapshot.releaseId,
          snapshot.overallStatus,
          snapshot.evaluatedAt,
        ],
      );
      await transaction.query(
        `INSERT INTO mmg_commerce_health_snapshots (
           run_id, environment, release_id, schema_version, overall_status,
           signals, evaluated_at
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (run_id) DO NOTHING`,
        [
          snapshot.runId,
          snapshot.environment,
          snapshot.releaseId,
          snapshot.schemaVersion,
          snapshot.overallStatus,
          JSON.stringify(snapshot.signals),
          snapshot.evaluatedAt,
        ],
      );
    });
  }

  async upsertSignalIncident(input: {
    incidentId: string;
    environment: MMGCommerceOperationsEnvironment;
    signal: MMGCommerceSignalEvaluation;
    summary: string;
    occurredAt: Date;
  }): Promise<MMGCommerceIncidentRecord> {
    if (!input.signal.severity) throw new Error("MMG_INCIDENT_SEVERITY_REQUIRED");
    return this.#database.transaction(async (transaction) => {
      const result = await transaction.query<IncidentRow>(
        `INSERT INTO mmg_commerce_incidents (
           incident_id, environment, signal_code, severity, state, title, summary,
           first_seen_at, last_seen_at, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'detected', $5, $6, $7, $7, 1, $7, $7)
         ON CONFLICT (incident_id)
         DO UPDATE SET
           severity = EXCLUDED.severity,
           state = CASE
             WHEN mmg_commerce_incidents.state IN ('resolved', 'closed') THEN 'detected'
             ELSE mmg_commerce_incidents.state
           END,
           title = EXCLUDED.title,
           summary = EXCLUDED.summary,
           last_seen_at = EXCLUDED.last_seen_at,
           version = mmg_commerce_incidents.version + 1,
           updated_at = EXCLUDED.updated_at
         RETURNING incident_id, environment, signal_code, severity, state, title,
           summary, first_seen_at, last_seen_at, version`,
        [
          input.incidentId,
          input.environment,
          input.signal.code,
          input.signal.severity,
          input.signal.title,
          input.summary,
          input.occurredAt,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("MMG_INCIDENT_UPSERT_FAILED");
      await transaction.query(
        `INSERT INTO mmg_commerce_incident_events (
           incident_id, event_type, actor_id, to_state, payload, occurred_at
         ) VALUES ($1, 'signal_observed', NULL, $2, $3::jsonb, $4)`,
        [
          input.incidentId,
          row.state,
          JSON.stringify({
            signalCode: input.signal.code,
            status: input.signal.status,
            severity: input.signal.severity,
            reasonCode: input.signal.reasonCode,
            value: input.signal.value,
            unit: input.signal.unit,
            sampleSize: input.signal.sampleSize,
          }),
          input.occurredAt,
        ],
      );
      return incident(row);
    });
  }

  async markSignalRecovered(input: {
    environment: MMGCommerceOperationsEnvironment;
    signalCode: string;
    occurredAt: Date;
  }): Promise<void> {
    await this.#database.transaction(async (transaction) => {
      const result = await transaction.query<IncidentRow>(
        `UPDATE mmg_commerce_incidents
         SET state = 'monitoring', version = version + 1, updated_at = $3
         WHERE environment = $1 AND signal_code = $2
           AND state IN ('detected', 'acknowledged', 'mitigating')
         RETURNING incident_id, environment, signal_code, severity, state, title,
           summary, first_seen_at, last_seen_at, version`,
        [input.environment, input.signalCode, input.occurredAt],
      );
      for (const row of result.rows) {
        await transaction.query(
          `INSERT INTO mmg_commerce_incident_events (
             incident_id, event_type, actor_id, to_state, payload, occurred_at
           ) VALUES ($1, 'signal_recovered', NULL, 'monitoring', '{}'::jsonb, $2)`,
          [row.incident_id, input.occurredAt],
        );
      }
    });
  }

  async loadIncident(incidentId: string): Promise<MMGCommerceIncidentRecord | null> {
    const result = await this.#database.query<IncidentRow>(
      `SELECT incident_id, environment, signal_code, severity, state, title,
         summary, first_seen_at, last_seen_at, version
       FROM mmg_commerce_incidents
       WHERE incident_id = $1
       LIMIT 1`,
      [incidentId],
    );
    return result.rows[0] ? incident(result.rows[0]) : null;
  }

  async transitionIncident(input: {
    incidentId: string;
    expectedVersion?: number;
    from: MMGIncidentState;
    to: MMGIncidentState;
    actorId: string;
    reason: string;
    occurredAt: Date;
  }): Promise<MMGCommerceIncidentRecord> {
    return this.#database.transaction(async (transaction) => {
      const current = await loadIncidentForUpdate(transaction, input.incidentId);
      if (current.state !== input.from) throw new Error("MMG_INCIDENT_STATE_CONFLICT");
      if (
        input.expectedVersion !== undefined &&
        Number(current.version) !== input.expectedVersion
      ) {
        throw new Error("MMG_INCIDENT_VERSION_CONFLICT");
      }
      const result = await transaction.query<IncidentRow>(
        `UPDATE mmg_commerce_incidents
         SET state = $2,
           acknowledged_at = CASE WHEN $2 = 'acknowledged' THEN $3 ELSE acknowledged_at END,
           resolved_at = CASE WHEN $2 = 'resolved' THEN $3 ELSE resolved_at END,
           closed_at = CASE WHEN $2 = 'closed' THEN $3 ELSE closed_at END,
           assigned_to = COALESCE(assigned_to, $4),
           version = version + 1,
           updated_at = $3
         WHERE incident_id = $1
         RETURNING incident_id, environment, signal_code, severity, state, title,
           summary, first_seen_at, last_seen_at, version`,
        [input.incidentId, input.to, input.occurredAt, input.actorId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("MMG_INCIDENT_TRANSITION_FAILED");
      await transaction.query(
        `INSERT INTO mmg_commerce_incident_events (
           incident_id, event_type, actor_id, from_state, to_state, payload,
           occurred_at
         ) VALUES ($1, 'state_transition', $2, $3, $4, $5::jsonb, $6)`,
        [
          input.incidentId,
          input.actorId,
          input.from,
          input.to,
          JSON.stringify({ reason: input.reason }),
          input.occurredAt,
        ],
      );
      return incident(row);
    });
  }

  async setControl(input: {
    environment: MMGCommerceOperationsEnvironment;
    change: MMGCommerceControlChange;
    actorId: string;
    expectedVersion?: number;
    occurredAt: Date;
  }): Promise<MMGCommerceControlState> {
    return this.#database.transaction(async (transaction) => {
      const current = await transaction.query<ControlRow>(
        `SELECT control_code, mode, version, reason, changed_at
         FROM mmg_commerce_controls
         WHERE environment = $1 AND control_code = $2
         FOR UPDATE`,
        [input.environment, input.change.control],
      );
      const existing = current.rows[0];
      if (
        input.expectedVersion !== undefined &&
        (!existing || Number(existing.version) !== input.expectedVersion)
      ) {
        throw new Error("MMG_CONTROL_VERSION_CONFLICT");
      }
      const result = await transaction.query<ControlRow>(
        `INSERT INTO mmg_commerce_controls (
           environment, control_code, mode, reason, changed_by, changed_at, version
         ) VALUES ($1, $2, $3, $4, $5, $6, 1)
         ON CONFLICT (environment, control_code)
         DO UPDATE SET mode = EXCLUDED.mode, reason = EXCLUDED.reason,
           changed_by = EXCLUDED.changed_by, changed_at = EXCLUDED.changed_at,
           version = mmg_commerce_controls.version + 1
         RETURNING control_code, mode, version, reason, changed_at`,
        [
          input.environment,
          input.change.control,
          input.change.mode,
          input.change.reasonCode,
          input.actorId,
          input.occurredAt,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("MMG_CONTROL_UPDATE_FAILED");
      await transaction.query(
        `INSERT INTO mmg_commerce_operations_events (
           environment, event_type, actor_id, payload, occurred_at
         ) VALUES ($1, 'control_changed', $2, $3::jsonb, $4)`,
        [
          input.environment,
          input.actorId,
          JSON.stringify({
            control: input.change.control,
            fromMode: existing?.mode ?? null,
            toMode: input.change.mode,
            automatic: input.change.automatic,
            reasonCode: input.change.reasonCode,
          }),
          input.occurredAt,
        ],
      );
      return control(row);
    });
  }

  async setRollout(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string;
    stage: MMGCommerceRolloutStage;
    cohortPercentage: number;
    observationUntil: Date | null;
    actorId: string;
    expectedVersion?: number;
    status: MMGCommerceRolloutState["status"];
    reason: string;
    occurredAt: Date;
  }): Promise<MMGCommerceRolloutState> {
    return this.#database.transaction(async (transaction) => {
      const currentResult = await transaction.query<RolloutRow>(
        `SELECT environment, release_id, stage, cohort_percentage, entered_at,
           observation_until, version, status
         FROM mmg_commerce_rollout_state
         WHERE environment = $1
         FOR UPDATE`,
        [input.environment],
      );
      const current = currentResult.rows[0];
      if (
        input.expectedVersion !== undefined &&
        (!current || Number(current.version) !== input.expectedVersion)
      ) {
        throw new Error("MMG_ROLLOUT_VERSION_CONFLICT");
      }
      const result = await transaction.query<RolloutRow>(
        `INSERT INTO mmg_commerce_rollout_state (
           environment, release_id, stage, cohort_percentage, status, entered_at,
           observation_until, changed_by, reason, version, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $6)
         ON CONFLICT (environment)
         DO UPDATE SET release_id = EXCLUDED.release_id, stage = EXCLUDED.stage,
           cohort_percentage = EXCLUDED.cohort_percentage, status = EXCLUDED.status,
           entered_at = EXCLUDED.entered_at,
           observation_until = EXCLUDED.observation_until,
           changed_by = EXCLUDED.changed_by, reason = EXCLUDED.reason,
           version = mmg_commerce_rollout_state.version + 1,
           updated_at = EXCLUDED.updated_at
         RETURNING environment, release_id, stage, cohort_percentage, entered_at,
           observation_until, version, status`,
        [
          input.environment,
          input.releaseId,
          input.stage,
          input.cohortPercentage,
          input.status,
          input.occurredAt,
          input.observationUntil,
          input.actorId,
          input.reason,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("MMG_ROLLOUT_UPDATE_FAILED");
      await transaction.query(
        `INSERT INTO mmg_commerce_rollout_history (
           environment, release_id, from_stage, to_stage, cohort_percentage,
           status, changed_by, reason, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          input.environment,
          input.releaseId,
          current?.stage ?? null,
          input.stage,
          input.cohortPercentage,
          input.status,
          input.actorId,
          input.reason,
          input.occurredAt,
        ],
      );
      return rollout(row);
    });
  }

  async loadRolloutApproval(input: {
    releaseId: string;
    environment: MMGCommerceOperationsEnvironment;
    fromStage: MMGCommerceRolloutStage;
    toStage: MMGCommerceRolloutStage;
    asOf: Date;
  }): Promise<MMGCommerceRolloutApproval | null> {
    const result = await this.#database.query<ApprovalRow>(
      `SELECT approval_id, release_id, environment, from_stage, to_stage,
         approved_by, approved_at, expires_at, status
       FROM mmg_commerce_rollout_approvals
       WHERE release_id = $1 AND environment = $2 AND from_stage = $3
         AND to_stage = $4 AND status = 'active'
         AND approved_at <= $5 AND expires_at > $5
       ORDER BY approved_at DESC
       LIMIT 1`,
      [
        input.releaseId,
        input.environment,
        input.fromStage,
        input.toStage,
        input.asOf,
      ],
    );
    const row = result.rows[0];
    return row
      ? {
          approvalId: row.approval_id,
          releaseId: row.release_id,
          environment: row.environment,
          fromStage: row.from_stage,
          toStage: row.to_stage,
          approvedBy: row.approved_by,
          approvedAt: iso(row.approved_at),
          expiresAt: iso(row.expires_at),
          status: row.status,
        }
      : null;
  }

  async saveConsistencyAudit(auditValue: MMGCommerceConsistencyAudit): Promise<void> {
    await this.#database.query(
      `INSERT INTO mmg_commerce_consistency_audits (
         audit_id, environment, release_id, schema_version, status, checks,
         started_at, completed_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT (audit_id) DO NOTHING`,
      [
        auditValue.auditId,
        auditValue.environment,
        auditValue.releaseId,
        auditValue.schemaVersion,
        auditValue.status,
        JSON.stringify(auditValue.checks),
        auditValue.startedAt,
        auditValue.completedAt,
      ],
    );
  }

  async recordOperationsEvent(input: {
    environment: MMGCommerceOperationsEnvironment;
    eventType: string;
    actorId: string | null;
    incidentId?: string | null;
    payload: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<void> {
    await this.#database.query(
      `INSERT INTO mmg_commerce_operations_events (
         environment, event_type, actor_id, incident_id, payload, occurred_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        input.environment,
        input.eventType,
        input.actorId,
        input.incidentId ?? null,
        JSON.stringify(input.payload),
        input.occurredAt,
      ],
    );
  }
}
