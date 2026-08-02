import {
  KAIROS_BUSINESS_COLLECTOR_BUILD,
  KAIROS_BUSINESS_COLLECTOR_SCHEMA_VERSION,
} from "./kairos-business-collector-v1.js";
import {
  KAIROS_BUSINESS_OBSERVATION_BUILD,
} from "./kairos-business-observation-v1.js";

export const KAIROS_AUTONOMY_LEDGER_BUILD =
  "kairos-autonomy-ledger-20260802-3-business-state-store";
export const KAIROS_BUSINESS_STATE_STORE_BUILD =
  "kairos-business-state-store-20260802-1";
export const KAIROS_BUSINESS_STATE_STORE_SCHEMA_VERSION = 1;

export const AUTONOMY_EVENT_STATUS = Object.freeze({
  ACCEPTED: "accepted",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  BLOCKED: "blocked",
});

const TERMINAL_STATUSES = new Set([
  AUTONOMY_EVENT_STATUS.COMPLETED,
  AUTONOMY_EVENT_STATUS.BLOCKED,
]);
const EXECUTABLE_STATUSES = new Set([
  AUTONOMY_EVENT_STATUS.ACCEPTED,
  AUTONOMY_EVENT_STATUS.FAILED,
  AUTONOMY_EVENT_STATUS.RUNNING,
]);
const DIRECTLY_BLOCKABLE_STATUSES = new Set([
  AUTONOMY_EVENT_STATUS.ACCEPTED,
  AUTONOMY_EVENT_STATUS.FAILED,
]);
const BUSINESS_SNAPSHOT_ROUTES = new Set([
  "/business-snapshots/store",
  "/business-snapshots/get",
  "/business-snapshots/latest",
  "/business-snapshots/recent",
]);
const BUSINESS_STATE_FIELDS = Object.freeze([
  "ok",
  "build",
  "schemaVersion",
  "generatedAt",
  "tenantId",
  "observationBuild",
  "websiteWorkflowBuild",
  "selectedCollectors",
  "collectorCount",
  "collectedCount",
  "blockedCount",
  "failedCount",
  "collectors",
  "snapshot",
]);
const REQUIRED_SNAPSHOT_FIELDS = Object.freeze([
  "ok",
  "build",
  "schemaVersion",
  "tenantId",
  "generatedAt",
  "snapshotId",
]);
const DEFAULT_LEASE_DURATION_MS = 30_000;
const MIN_LEASE_DURATION_MS = 1_000;
const MAX_LEASE_DURATION_MS = 15 * 60_000;
const MAX_RECENT_EVENTS = 100;
const MAX_RECENT_BUSINESS_SNAPSHOTS = 100;
const DEFAULT_RECENT_BUSINESS_SNAPSHOTS = 10;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_JSON_BYTES = 32 * 1024;
const MAX_BUSINESS_STATE_BYTES = 256 * 1024;
const MAX_ERROR_MESSAGE_LENGTH = 1_000;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/u;
const CANONICAL_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|secret|password|credential|api[-_]?key)/i;
const SENSITIVE_BUSINESS_STATE_KEY_PATTERN = /^(authorization|cookie|token|secret|password|credential|api[-_]?key|targeturl)$/iu;
const BUSINESS_SNAPSHOT_ERROR_MESSAGES = Object.freeze({
  INVALID_BUSINESS_STATE: "A complete successful business-state result is required.",
  UNKNOWN_BUSINESS_STATE_FIELD: "The business-state result contains an unsupported field.",
  INVALID_BUSINESS_STATE_BUILD: "The business-state result has an unsupported build identifier.",
  INVALID_BUSINESS_STATE_SCHEMA: "The business-state result has an unsupported schema version.",
  INVALID_BUSINESS_STATE_TENANT: "The business-state tenant identifier is invalid.",
  INVALID_BUSINESS_STATE_TIMESTAMP: "The business-state timestamp is invalid.",
  INVALID_BUSINESS_STATE_COUNTS: "The business-state collector counts are invalid.",
  INVALID_SELECTED_COLLECTORS: "The selected collector list is invalid.",
  INVALID_COLLECTOR_SUMMARIES: "The collector summaries are invalid.",
  INVALID_BUSINESS_SNAPSHOT: "The nested business-state snapshot is invalid.",
  INVALID_SNAPSHOT_ID: "The business-state snapshot identifier is invalid.",
  INVALID_SNAPSHOT_TIMESTAMP: "The nested business-state snapshot timestamp is invalid.",
  BUSINESS_SNAPSHOT_TOO_LARGE: "The business-state snapshot exceeds the storage limit.",
  SENSITIVE_BUSINESS_STATE_FIELD: "The business-state snapshot contains a prohibited sensitive field.",
  INVALID_BUSINESS_SNAPSHOT_REQUEST: "The business-state snapshot request is invalid.",
  INVALID_BUSINESS_SNAPSHOT_LIMIT: "The business-state snapshot limit is invalid.",
});

export class KairosAutonomyLedger {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.repository = new SqlAutonomyLedgerRepository(state.storage);
    this.store = new AutonomyLedgerStore(this.repository);
    this.ready = typeof state.blockConcurrencyWhile === "function"
      ? state.blockConcurrencyWhile(() => this.repository.initialize())
      : Promise.resolve(this.repository.initialize());
  }

  async fetch(request) {
    await this.ready;

    const url = new URL(request.url);
    const snapshotRoute = BUSINESS_SNAPSHOT_ROUTES.has(url.pathname);
    const routeHeaders = snapshotRoute ? businessSnapshotHeaders() : {};
    if (request.method !== "POST") {
      return jsonResponse({
        ok: false,
        code: "METHOD_NOT_ALLOWED",
        error: "Kairos autonomy ledger operations require POST.",
      }, 405, { Allow: "POST", ...routeHeaders });
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      return jsonResponse({
        ok: false,
        code: error?.code || "INVALID_JSON",
        error: error instanceof Error ? error.message : "The request body is invalid.",
      }, error?.code === "REQUEST_TOO_LARGE" ? 413 : 400, routeHeaders);
    }

    try {
      switch (url.pathname) {
        case "/reserve":
          return operationResponse(this.store.reserveEvent(body.event));
        case "/get":
          return operationResponse(this.store.getEvent(body.tenantId, body.eventId));
        case "/recent":
          return operationResponse(this.store.listRecentEvents(body.tenantId, body.limit));
        case "/acquire-lease":
          return operationResponse(this.store.acquireLease(body));
        case "/complete":
          return operationResponse(this.store.markCompleted(body));
        case "/fail":
          return operationResponse(this.store.markFailed(body));
        case "/block":
          return operationResponse(this.store.markBlocked(body));
        case "/business-snapshots/store":
          return operationResponse(handleBusinessSnapshotStoreRequest(this.store, body), routeHeaders);
        case "/business-snapshots/get":
          return operationResponse(handleBusinessSnapshotGetRequest(this.store, body), routeHeaders);
        case "/business-snapshots/latest":
          return operationResponse(handleBusinessSnapshotLatestRequest(this.store, body), routeHeaders);
        case "/business-snapshots/recent":
          return operationResponse(handleBusinessSnapshotRecentRequest(this.store, body), routeHeaders);
        default:
          return jsonResponse({ ok: false, code: "NOT_FOUND", error: "Ledger operation not found." }, 404);
      }
    } catch (error) {
      if (snapshotRoute) {
        return operationResponse(businessSnapshotStorageFailure(), routeHeaders);
      }
      return jsonResponse({
        ok: false,
        code: "LEDGER_OPERATION_FAILED",
        error: error instanceof Error ? error.message : "Ledger operation failed.",
      }, 500);
    }
  }
}

export class AutonomyLedgerStore {
  constructor(repository, options = {}) {
    if (!repository || typeof repository.transaction !== "function") {
      throw new TypeError("A transactional autonomy ledger repository is required.");
    }
    this.repository = repository;
    this.now = typeof options.now === "function" ? options.now : () => new Date();
    this.randomUUID = typeof options.randomUUID === "function"
      ? options.randomUUID
      : defaultRandomUUID;
  }

  reserveEvent(event) {
    const normalized = normalizeEvent(event);
    if (!normalized.ok) return normalized;

    return this.repository.transaction((repository) => {
      const existing = repository.get(normalized.event.tenantId, normalized.event.eventId);
      if (existing) return success("duplicate", existing, { duplicate: true });

      const timestamp = this.timestamp();
      const record = {
        eventId: normalized.event.eventId,
        tenantId: normalized.event.tenantId,
        workflowId: normalized.event.workflowId,
        eventType: normalized.event.eventType,
        correlationId: normalized.event.correlationId,
        causationId: normalized.event.causationId,
        riskClass: normalized.event.riskClass,
        status: AUTONOMY_EVENT_STATUS.ACCEPTED,
        attempt: 0,
        acceptedAt: timestamp,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        leaseExpiresAt: null,
        leaseToken: null,
        result: null,
        error: null,
        policyDecision: null,
        updatedAt: timestamp,
      };

      repository.insert(record);
      return success("reserved", record, { duplicate: false });
    });
  }

  getEvent(tenantId, eventId) {
    const identity = normalizeIdentity(tenantId, eventId);
    if (!identity.ok) return identity;
    const record = this.repository.get(identity.tenantId, identity.eventId);
    return record
      ? success("found", record)
      : failure("not_found", "EVENT_NOT_FOUND", "The autonomy event was not found.", 404);
  }

  listRecentEvents(tenantId, limit = 10) {
    const normalizedTenantId = normalizeRequiredString(tenantId, "tenantId", 256);
    if (!normalizedTenantId.ok) return normalizedTenantId;
    const boundedLimit = boundedInteger(limit, 10, 1, MAX_RECENT_EVENTS);
    return {
      ok: true,
      disposition: "listed",
      records: this.repository.list(normalizedTenantId.value, boundedLimit),
      limit: boundedLimit,
      statusCode: 200,
    };
  }

  storeBusinessSnapshot(businessState) {
    const validation = validateBusinessState(businessState);
    if (!validation.ok) return businessSnapshotRejection(validation.code);

    try {
      return this.repository.transaction((repository) => {
        const snapshotId = validation.value.snapshot.snapshotId;
        const existing = typeof repository.getBusinessSnapshotStoredValue === "function"
          ? repository.getBusinessSnapshotStoredValue(validation.value.tenantId, snapshotId)
          : null;
        if (existing) {
          if (!existing.malformed && existing.serializedBusinessState === validation.serialized) {
            return businessSnapshotSuccess("duplicate", existing.record, { duplicate: true });
          }
          return businessSnapshotFailure(
            "conflict",
            "SNAPSHOT_IDENTITY_CONFLICT",
            "The snapshot identity is already associated with different business state.",
            409,
            existing.record,
          );
        }

        const record = {
          tenantId: validation.value.tenantId,
          snapshotId,
          generatedAt: validation.value.generatedAt,
          storedAt: this.timestamp(),
          collectorBuild: validation.value.build,
          observationBuild: validation.value.observationBuild,
          schemaVersion: validation.value.snapshot.schemaVersion,
          collectorCount: validation.value.collectorCount,
          collectedCount: validation.value.collectedCount,
          blockedCount: validation.value.blockedCount,
          failedCount: validation.value.failedCount,
          businessState: validation.value,
        };
        repository.insertBusinessSnapshot(record);
        return businessSnapshotSuccess("stored", record, { duplicate: false });
      });
    } catch {
      return businessSnapshotStorageFailure();
    }
  }

  getBusinessSnapshot(tenantId, snapshotId) {
    if (!isValidBusinessIdentifier(tenantId) || !isValidBusinessIdentifier(snapshotId)) {
      return businessSnapshotRejection("INVALID_BUSINESS_SNAPSHOT_REQUEST");
    }
    try {
      const record = this.repository.getBusinessSnapshot(tenantId, snapshotId);
      return record
        ? businessSnapshotSuccess("found", record)
        : businessSnapshotFailure(
          "not_found",
          "BUSINESS_SNAPSHOT_NOT_FOUND",
          "The business-state snapshot was not found.",
          404,
        );
    } catch {
      return businessSnapshotStorageFailure();
    }
  }

  getLatestBusinessSnapshot(tenantId) {
    if (!isValidBusinessIdentifier(tenantId)) {
      return businessSnapshotRejection("INVALID_BUSINESS_SNAPSHOT_REQUEST");
    }
    try {
      const record = this.repository.getLatestBusinessSnapshot(tenantId);
      return record
        ? businessSnapshotSuccess("found", record)
        : businessSnapshotFailure(
          "not_found",
          "BUSINESS_SNAPSHOT_NOT_FOUND",
          "No business-state snapshot was found for the tenant.",
          404,
        );
    } catch {
      return businessSnapshotStorageFailure();
    }
  }

  listRecentBusinessSnapshots(tenantId, limit = DEFAULT_RECENT_BUSINESS_SNAPSHOTS) {
    if (!isValidBusinessIdentifier(tenantId)) {
      return businessSnapshotRejection("INVALID_BUSINESS_SNAPSHOT_REQUEST", { records: [] });
    }
    if (!Number.isInteger(limit)
      || limit < 1
      || limit > MAX_RECENT_BUSINESS_SNAPSHOTS) {
      return businessSnapshotRejection("INVALID_BUSINESS_SNAPSHOT_LIMIT", {
        records: [],
        limit,
      });
    }
    try {
      return {
        ok: true,
        disposition: "listed",
        records: this.repository.listBusinessSnapshots(tenantId, limit)
          .map(cloneBusinessSnapshotRecord),
        limit,
        statusCode: 200,
      };
    } catch {
      return businessSnapshotStorageFailure({ records: [], limit });
    }
  }

  acquireLease(input = {}) {
    const identity = normalizeIdentity(input.tenantId, input.eventId);
    if (!identity.ok) return identity;
    const leaseDurationMs = boundedInteger(
      input.leaseDurationMs,
      DEFAULT_LEASE_DURATION_MS,
      MIN_LEASE_DURATION_MS,
      MAX_LEASE_DURATION_MS,
    );

    return this.repository.transaction((repository) => {
      const record = repository.get(identity.tenantId, identity.eventId);
      if (!record) return failure("not_found", "EVENT_NOT_FOUND", "The autonomy event was not found.", 404);
      if (TERMINAL_STATUSES.has(record.status)) {
        return failure(
          "terminal",
          "EVENT_TERMINAL",
          `Event status ${record.status} cannot transition to running.`,
          409,
          record,
        );
      }
      if (!EXECUTABLE_STATUSES.has(record.status)) {
        return failure(
          "invalid_transition",
          "INVALID_STATE_TRANSITION",
          "The event cannot acquire a lease from its current state.",
          409,
          record,
        );
      }

      const now = this.currentDate();
      if (record.status === AUTONOMY_EVENT_STATUS.RUNNING && isLeaseActive(record, now)) {
        return failure("lease_conflict", "ACTIVE_LEASE_EXISTS", "Another executor holds an active lease.", 409, record);
      }

      const recovered = record.status === AUTONOMY_EVENT_STATUS.RUNNING;
      const leaseToken = `lease_${this.randomUUID()}`;
      const timestamp = now.toISOString();
      const nextRecord = {
        ...record,
        status: AUTONOMY_EVENT_STATUS.RUNNING,
        attempt: Number(record.attempt || 0) + 1,
        startedAt: timestamp,
        completedAt: null,
        failedAt: null,
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs).toISOString(),
        leaseToken,
        result: null,
        error: null,
        updatedAt: timestamp,
      };
      repository.replace(nextRecord);
      return success(recovered ? "lease_recovered" : "lease_acquired", nextRecord, {
        recovered,
        leaseToken,
      });
    });
  }

  markCompleted(input = {}) {
    return this.finishRunningEvent(input, AUTONOMY_EVENT_STATUS.COMPLETED);
  }

  markFailed(input = {}) {
    return this.finishRunningEvent(input, AUTONOMY_EVENT_STATUS.FAILED);
  }

  markBlocked(input = {}) {
    const identity = normalizeIdentity(input.tenantId, input.eventId);
    if (!identity.ok) return identity;

    return this.repository.transaction((repository) => {
      const record = repository.get(identity.tenantId, identity.eventId);
      if (!record) return failure("not_found", "EVENT_NOT_FOUND", "The autonomy event was not found.", 404);

      if (record.status === AUTONOMY_EVENT_STATUS.BLOCKED) {
        return success("duplicate", record, { duplicate: true });
      }
      if (record.status === AUTONOMY_EVENT_STATUS.COMPLETED) {
        return failure(
          "invalid_transition",
          "INVALID_STATE_TRANSITION",
          "Completed events cannot transition to blocked.",
          409,
          record,
        );
      }

      if (record.status === AUTONOMY_EVENT_STATUS.RUNNING) {
        const leaseToken = normalizeRequiredString(input.leaseToken, "leaseToken", 512);
        if (!leaseToken.ok) return leaseToken;
        const now = this.currentDate();
        if (!record.leaseToken
          || record.leaseToken !== leaseToken.value
          || !isLeaseActive(record, now)) {
          return failure(
            "lease_conflict",
            "STALE_OR_INVALID_LEASE",
            "The execution lease is stale, expired, or invalid.",
            409,
            record,
          );
        }
      } else if (!DIRECTLY_BLOCKABLE_STATUSES.has(record.status)) {
        return failure(
          "invalid_transition",
          "INVALID_STATE_TRANSITION",
          `Event status ${record.status} cannot transition to blocked.`,
          409,
          record,
        );
      }

      const timestamp = this.timestamp();
      const nextRecord = {
        ...record,
        status: AUTONOMY_EVENT_STATUS.BLOCKED,
        completedAt: null,
        failedAt: null,
        leaseExpiresAt: null,
        leaseToken: null,
        result: null,
        error: null,
        policyDecision: sanitizeJson(input.policyDecision),
        updatedAt: timestamp,
      };
      repository.replace(nextRecord);
      return success("blocked", nextRecord);
    });
  }

  finishRunningEvent(input, targetStatus) {
    const identity = normalizeIdentity(input.tenantId, input.eventId);
    if (!identity.ok) return identity;
    const leaseToken = normalizeRequiredString(input.leaseToken, "leaseToken", 512);
    if (!leaseToken.ok) return leaseToken;

    return this.repository.transaction((repository) => {
      const record = repository.get(identity.tenantId, identity.eventId);
      if (!record) return failure("not_found", "EVENT_NOT_FOUND", "The autonomy event was not found.", 404);
      if (record.status !== AUTONOMY_EVENT_STATUS.RUNNING) {
        return failure(
          "invalid_transition",
          "INVALID_STATE_TRANSITION",
          `Only running events can transition to ${targetStatus}.`,
          409,
          record,
        );
      }
      if (!record.leaseToken || record.leaseToken !== leaseToken.value) {
        return failure("lease_conflict", "STALE_OR_INVALID_LEASE", "The execution lease is stale or invalid.", 409, record);
      }

      const timestamp = this.timestamp();
      const completed = targetStatus === AUTONOMY_EVENT_STATUS.COMPLETED;
      const nextRecord = {
        ...record,
        status: targetStatus,
        completedAt: completed ? timestamp : null,
        failedAt: completed ? null : timestamp,
        leaseExpiresAt: null,
        leaseToken: null,
        result: completed ? sanitizeJson(input.result) : null,
        error: completed ? null : sanitizeError(input.error),
        updatedAt: timestamp,
      };
      repository.replace(nextRecord);
      return success(completed ? "completed" : "failed", nextRecord);
    });
  }

  currentDate() {
    const value = this.now();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error("The ledger clock returned an invalid timestamp.");
    return date;
  }

  timestamp() {
    return this.currentDate().toISOString();
  }
}

export class SqlAutonomyLedgerRepository {
  constructor(storage) {
    if (!storage?.sql || typeof storage.sql.exec !== "function") {
      throw new TypeError("SQLite-backed Durable Object storage is required.");
    }
    this.storage = storage;
    this.sql = storage.sql;
  }

  initialize() {
    const initialize = () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS _kairos_autonomy_schema_migrations (
          version INTEGER PRIMARY KEY,
          appliedAt TEXT NOT NULL
        );
      `);
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS autonomy_events (
          eventId TEXT NOT NULL,
          tenantId TEXT NOT NULL,
          workflowId TEXT NOT NULL,
          eventType TEXT NOT NULL,
          correlationId TEXT,
          causationId TEXT,
          riskClass TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('accepted', 'running', 'completed', 'failed', 'blocked')),
          attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
          acceptedAt TEXT NOT NULL,
          startedAt TEXT,
          completedAt TEXT,
          failedAt TEXT,
          leaseExpiresAt TEXT,
          leaseToken TEXT,
          result TEXT,
          error TEXT,
          policyDecision TEXT,
          updatedAt TEXT NOT NULL,
          PRIMARY KEY (tenantId, eventId)
        );
      `);
      this.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_autonomy_events_tenant_recent
        ON autonomy_events (tenantId, acceptedAt DESC, eventId DESC);
      `);
      this.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_autonomy_events_active_leases
        ON autonomy_events (status, leaseExpiresAt)
        WHERE status = 'running';
      `);
      this.sql.exec(
        `INSERT OR IGNORE INTO _kairos_autonomy_schema_migrations (version, appliedAt) VALUES (?, ?);`,
        1,
        new Date().toISOString(),
      );
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS business_state_snapshots (
          tenantId TEXT NOT NULL,
          snapshotId TEXT NOT NULL,
          generatedAt TEXT NOT NULL,
          storedAt TEXT NOT NULL,
          collectorBuild TEXT NOT NULL,
          observationBuild TEXT NOT NULL,
          schemaVersion INTEGER NOT NULL,
          collectorCount INTEGER NOT NULL,
          collectedCount INTEGER NOT NULL,
          blockedCount INTEGER NOT NULL,
          failedCount INTEGER NOT NULL,
          businessState TEXT NOT NULL,
          PRIMARY KEY (tenantId, snapshotId)
        );
      `);
      this.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_business_state_snapshots_tenant_generated
        ON business_state_snapshots (tenantId, generatedAt DESC, snapshotId DESC);
      `);
      this.sql.exec(
        `INSERT OR IGNORE INTO _kairos_autonomy_schema_migrations (version, appliedAt) VALUES (?, ?);`,
        2,
        new Date().toISOString(),
      );
    };
    return typeof this.storage.transactionSync === "function"
      ? this.storage.transactionSync(initialize)
      : initialize();
  }

  transaction(callback) {
    return typeof this.storage.transactionSync === "function"
      ? this.storage.transactionSync(() => callback(this))
      : callback(this);
  }

  get(tenantId, eventId) {
    const rows = this.sql.exec(
      `SELECT * FROM autonomy_events WHERE tenantId = ? AND eventId = ? LIMIT 1;`,
      tenantId,
      eventId,
    ).toArray();
    return rows.length ? decodeRecord(rows[0]) : null;
  }

  insert(record) {
    this.sql.exec(`
      INSERT INTO autonomy_events (
        eventId, tenantId, workflowId, eventType, correlationId, causationId, riskClass,
        status, attempt, acceptedAt, startedAt, completedAt, failedAt, leaseExpiresAt,
        leaseToken, result, error, policyDecision, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    record.eventId,
    record.tenantId,
    record.workflowId,
    record.eventType,
    record.correlationId,
    record.causationId,
    record.riskClass,
    record.status,
    record.attempt,
    record.acceptedAt,
    record.startedAt,
    record.completedAt,
    record.failedAt,
    record.leaseExpiresAt,
    record.leaseToken,
    encodeJson(record.result),
    encodeJson(record.error),
    encodeJson(record.policyDecision),
    record.updatedAt);
  }

  replace(record) {
    this.sql.exec(`
      UPDATE autonomy_events SET
        workflowId = ?, eventType = ?, correlationId = ?, causationId = ?, riskClass = ?,
        status = ?, attempt = ?, acceptedAt = ?, startedAt = ?, completedAt = ?, failedAt = ?,
        leaseExpiresAt = ?, leaseToken = ?, result = ?, error = ?, policyDecision = ?, updatedAt = ?
      WHERE tenantId = ? AND eventId = ?;
    `,
    record.workflowId,
    record.eventType,
    record.correlationId,
    record.causationId,
    record.riskClass,
    record.status,
    record.attempt,
    record.acceptedAt,
    record.startedAt,
    record.completedAt,
    record.failedAt,
    record.leaseExpiresAt,
    record.leaseToken,
    encodeJson(record.result),
    encodeJson(record.error),
    encodeJson(record.policyDecision),
    record.updatedAt,
    record.tenantId,
    record.eventId);
  }

  list(tenantId, limit) {
    return this.sql.exec(`
      SELECT * FROM autonomy_events
      WHERE tenantId = ?
      ORDER BY acceptedAt DESC, eventId DESC
      LIMIT ?;
    `, tenantId, limit).toArray().map(decodeRecord);
  }

  getBusinessSnapshotStoredValue(tenantId, snapshotId) {
    const rows = this.sql.exec(`
      SELECT * FROM business_state_snapshots
      WHERE tenantId = ? AND snapshotId = ?
      LIMIT 1;
    `, tenantId, snapshotId).toArray();
    return rows.length ? decodeBusinessSnapshotStoredValue(rows[0]) : null;
  }

  getBusinessSnapshot(tenantId, snapshotId) {
    const stored = this.getBusinessSnapshotStoredValue(tenantId, snapshotId);
    return stored ? stored.record : null;
  }

  insertBusinessSnapshot(record) {
    this.sql.exec(`
      INSERT INTO business_state_snapshots (
        tenantId, snapshotId, generatedAt, storedAt, collectorBuild, observationBuild,
        schemaVersion, collectorCount, collectedCount, blockedCount, failedCount, businessState
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    record.tenantId,
    record.snapshotId,
    record.generatedAt,
    record.storedAt,
    record.collectorBuild,
    record.observationBuild,
    record.schemaVersion,
    record.collectorCount,
    record.collectedCount,
    record.blockedCount,
    record.failedCount,
    JSON.stringify(record.businessState));
  }

  getLatestBusinessSnapshot(tenantId) {
    const rows = this.sql.exec(`
      SELECT * FROM business_state_snapshots
      WHERE tenantId = ?
      ORDER BY generatedAt DESC, snapshotId DESC
      LIMIT 1;
    `, tenantId).toArray();
    return rows.length ? decodeBusinessSnapshotStoredValue(rows[0]).record : null;
  }

  listBusinessSnapshots(tenantId, limit) {
    return this.sql.exec(`
      SELECT * FROM business_state_snapshots
      WHERE tenantId = ?
      ORDER BY generatedAt DESC, snapshotId DESC
      LIMIT ?;
    `, tenantId, limit).toArray().map((row) => decodeBusinessSnapshotStoredValue(row).record);
  }
}

function normalizeEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return failure("rejected", "INVALID_EVENT", "A validated event object is required.", 400);
  }
  const fields = [
    ["eventId", event.eventId, 256],
    ["tenantId", event.tenantId, 256],
    ["workflowId", event.workflowId, 256],
    ["eventType", event.eventType, 160],
  ];
  const normalized = {};
  for (const [field, value, maxLength] of fields) {
    const result = normalizeRequiredString(value, field, maxLength);
    if (!result.ok) return result;
    normalized[field] = result.value;
  }
  return {
    ok: true,
    event: {
      ...normalized,
      correlationId: normalizeOptionalString(event.correlationId, 256),
      causationId: normalizeOptionalString(event.causationId, 256),
      riskClass: normalizeOptionalString(event.riskClass, 32) || "low",
    },
  };
}

function normalizeIdentity(tenantId, eventId) {
  const tenant = normalizeRequiredString(tenantId, "tenantId", 256);
  if (!tenant.ok) return tenant;
  const event = normalizeRequiredString(eventId, "eventId", 256);
  if (!event.ok) return event;
  return { ok: true, tenantId: tenant.value, eventId: event.value };
}

function normalizeRequiredString(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    return failure("rejected", `INVALID_${field.toUpperCase()}`, `${field} must be a non-empty string.`, 400);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return failure("rejected", `${field.toUpperCase()}_TOO_LONG`, `${field} exceeds ${maxLength} characters.`, 400);
  }
  return { ok: true, value: normalized };
}

function normalizeOptionalString(value, maxLength) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, maxLength);
}

function isLeaseActive(record, now) {
  const expiry = Date.parse(record.leaseExpiresAt);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

function handleBusinessSnapshotStoreRequest(store, body) {
  const request = inspectRequestObject(body, ["businessState"], ["businessState"]);
  return request.ok
    ? store.storeBusinessSnapshot(request.values.businessState)
    : businessSnapshotRejection("INVALID_BUSINESS_SNAPSHOT_REQUEST");
}

function handleBusinessSnapshotGetRequest(store, body) {
  const request = inspectRequestObject(body, ["tenantId", "snapshotId"], ["tenantId", "snapshotId"]);
  return request.ok
    ? store.getBusinessSnapshot(request.values.tenantId, request.values.snapshotId)
    : businessSnapshotRejection("INVALID_BUSINESS_SNAPSHOT_REQUEST");
}

function handleBusinessSnapshotLatestRequest(store, body) {
  const request = inspectRequestObject(body, ["tenantId"], ["tenantId"]);
  return request.ok
    ? store.getLatestBusinessSnapshot(request.values.tenantId)
    : businessSnapshotRejection("INVALID_BUSINESS_SNAPSHOT_REQUEST");
}

function handleBusinessSnapshotRecentRequest(store, body) {
  const request = inspectRequestObject(body, ["tenantId", "limit"], ["tenantId"]);
  if (!request.ok) return businessSnapshotRejection("INVALID_BUSINESS_SNAPSHOT_REQUEST", { records: [] });
  const limit = request.present.has("limit")
    ? request.values.limit
    : DEFAULT_RECENT_BUSINESS_SNAPSHOTS;
  return store.listRecentBusinessSnapshots(request.values.tenantId, limit);
}

function inspectRequestObject(value, allowedFields, requiredFields) {
  const shape = inspectDataObject(value);
  if (!shape.ok) return shape;
  const allowed = new Set(allowedFields);
  for (const key of shape.present) {
    if (!allowed.has(key)) return { ok: false };
  }
  for (const field of requiredFields) {
    if (!shape.present.has(field)) return { ok: false };
  }
  return shape;
}

function validateBusinessState(value) {
  const shape = inspectDataObject(value);
  if (!shape.ok) return { ok: false, code: "INVALID_BUSINESS_STATE" };
  const allowed = new Set(BUSINESS_STATE_FIELDS);
  for (const key of shape.present) {
    if (!allowed.has(key)) return { ok: false, code: "UNKNOWN_BUSINESS_STATE_FIELD" };
  }
  for (const field of BUSINESS_STATE_FIELDS) {
    if (!shape.present.has(field)) return { ok: false, code: "INVALID_BUSINESS_STATE" };
  }

  const businessState = shape.values;
  if (businessState.ok !== true) return { ok: false, code: "INVALID_BUSINESS_STATE" };
  if (businessState.build !== KAIROS_BUSINESS_COLLECTOR_BUILD
    || businessState.observationBuild !== KAIROS_BUSINESS_OBSERVATION_BUILD) {
    return { ok: false, code: "INVALID_BUSINESS_STATE_BUILD" };
  }
  if (businessState.schemaVersion !== KAIROS_BUSINESS_COLLECTOR_SCHEMA_VERSION) {
    return { ok: false, code: "INVALID_BUSINESS_STATE_SCHEMA" };
  }
  if (!isValidBusinessIdentifier(businessState.tenantId)) {
    return { ok: false, code: "INVALID_BUSINESS_STATE_TENANT" };
  }
  if (!isCanonicalTimestamp(businessState.generatedAt)) {
    return { ok: false, code: "INVALID_BUSINESS_STATE_TIMESTAMP" };
  }
  if (typeof businessState.websiteWorkflowBuild !== "string"
    || !businessState.websiteWorkflowBuild
    || businessState.websiteWorkflowBuild.length > 256) {
    return { ok: false, code: "INVALID_BUSINESS_STATE" };
  }

  const counts = [
    businessState.collectorCount,
    businessState.collectedCount,
    businessState.blockedCount,
    businessState.failedCount,
  ];
  if (!counts.every(Number.isInteger)
    || businessState.collectorCount < 0
    || businessState.collectorCount > 8
    || businessState.collectedCount < 0
    || businessState.blockedCount < 0
    || businessState.failedCount < 0
    || businessState.collectedCount > businessState.collectorCount
    || businessState.blockedCount > businessState.collectorCount
    || businessState.failedCount > businessState.collectorCount
    || businessState.collectedCount + businessState.blockedCount + businessState.failedCount
      !== businessState.collectorCount) {
    return { ok: false, code: "INVALID_BUSINESS_STATE_COUNTS" };
  }

  const selectedCollectors = inspectCanonicalArray(businessState.selectedCollectors);
  if (!selectedCollectors.ok
    || selectedCollectors.values.length !== businessState.collectorCount) {
    return { ok: false, code: "INVALID_SELECTED_COLLECTORS" };
  }
  const selected = new Set();
  for (const collectorId of selectedCollectors.values) {
    if (!isValidBusinessIdentifier(collectorId) || selected.has(collectorId)) {
      return { ok: false, code: "INVALID_SELECTED_COLLECTORS" };
    }
    selected.add(collectorId);
  }

  const collectors = inspectCanonicalArray(businessState.collectors);
  if (!collectors.ok || collectors.values.length !== businessState.collectorCount) {
    return { ok: false, code: "INVALID_COLLECTOR_SUMMARIES" };
  }
  for (const collector of collectors.values) {
    if (!isPlainDataObject(collector)) {
      return { ok: false, code: "INVALID_COLLECTOR_SUMMARIES" };
    }
  }

  const snapshot = inspectDataObject(businessState.snapshot);
  if (!snapshot.ok) return { ok: false, code: "INVALID_BUSINESS_SNAPSHOT" };
  for (const field of REQUIRED_SNAPSHOT_FIELDS) {
    if (!snapshot.present.has(field)) return { ok: false, code: "INVALID_BUSINESS_SNAPSHOT" };
  }
  if (snapshot.values.ok !== true
    || snapshot.values.build !== KAIROS_BUSINESS_OBSERVATION_BUILD
    || snapshot.values.schemaVersion !== KAIROS_BUSINESS_STATE_STORE_SCHEMA_VERSION
    || snapshot.values.tenantId !== businessState.tenantId) {
    return { ok: false, code: "INVALID_BUSINESS_SNAPSHOT" };
  }
  if (!isValidBusinessIdentifier(snapshot.values.snapshotId)) {
    return { ok: false, code: "INVALID_SNAPSHOT_ID" };
  }
  if (!isCanonicalTimestamp(snapshot.values.generatedAt)
    || snapshot.values.generatedAt !== businessState.generatedAt) {
    return { ok: false, code: "INVALID_SNAPSHOT_TIMESTAMP" };
  }

  const copied = copyJsonSafe(value);
  if (!copied.ok) {
    return {
      ok: false,
      code: copied.code === "SENSITIVE_BUSINESS_STATE_FIELD"
        ? copied.code
        : "INVALID_BUSINESS_STATE",
    };
  }
  let serialized;
  try {
    serialized = JSON.stringify(copied.value);
  } catch {
    return { ok: false, code: "INVALID_BUSINESS_STATE" };
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_BUSINESS_STATE_BYTES) {
    return { ok: false, code: "BUSINESS_SNAPSHOT_TOO_LARGE" };
  }
  return {
    ok: true,
    value: JSON.parse(serialized),
    serialized,
  };
}

function inspectDataObject(value) {
  if (!isPlainDataObject(value)) return { ok: false };
  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return { ok: false };
  }
  const values = Object.create(null);
  const present = new Set();
  for (const key of keys) {
    if (typeof key !== "string") return { ok: false };
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return { ok: false };
    }
    if (!descriptor
      || descriptor.enumerable !== true
      || !Object.hasOwn(descriptor, "value")) {
      return { ok: false };
    }
    present.add(key);
    values[key] = descriptor.value;
  }
  return { ok: true, present, values };
}

function inspectCanonicalArray(value) {
  let array;
  try {
    array = Array.isArray(value);
  } catch {
    return { ok: false };
  }
  if (!array) return { ok: false };

  let keys;
  let lengthDescriptor;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return { ok: false };
    keys = Reflect.ownKeys(value);
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  } catch {
    return { ok: false };
  }
  if (!lengthDescriptor
    || lengthDescriptor.enumerable !== false
    || !Object.hasOwn(lengthDescriptor, "value")
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0) {
    return { ok: false };
  }
  const length = lengthDescriptor.value;
  if (keys.length !== length + 1) return { ok: false };

  const values = [];
  for (const key of keys) {
    if (typeof key !== "string") return { ok: false };
    if (key === "length") continue;
    if (!/^(0|[1-9]\d*)$/u.test(key)) return { ok: false };
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index >= length) return { ok: false };
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return { ok: false };
    }
    if (!descriptor
      || descriptor.enumerable !== true
      || !Object.hasOwn(descriptor, "value")) {
      return { ok: false };
    }
    values[index] = descriptor.value;
  }
  if (values.length !== length) return { ok: false };
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(values, index)) return { ok: false };
  }
  return { ok: true, values };
}

function copyJsonSafe(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return { ok: true, value };
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, code: "INVALID_JSON_VALUE" };
  }
  if (typeof value !== "object") return { ok: false, code: "INVALID_JSON_VALUE" };
  if (ancestors.has(value)) return { ok: false, code: "CIRCULAR_JSON_VALUE" };
  ancestors.add(value);

  const array = inspectCanonicalArray(value);
  if (array.ok) {
    const copiedArray = [];
    for (const nested of array.values) {
      const copied = copyJsonSafe(nested, ancestors);
      if (!copied.ok) return copied;
      copiedArray.push(copied.value);
    }
    ancestors.delete(value);
    return { ok: true, value: copiedArray };
  }

  const object = inspectDataObject(value);
  if (!object.ok) return { ok: false, code: "INVALID_JSON_OBJECT" };
  const copiedObject = Object.create(null);
  for (const key of object.present) {
    if (SENSITIVE_BUSINESS_STATE_KEY_PATTERN.test(key)) {
      return { ok: false, code: "SENSITIVE_BUSINESS_STATE_FIELD" };
    }
    const copied = copyJsonSafe(object.values[key], ancestors);
    if (!copied.ok) return copied;
    copiedObject[key] = copied.value;
  }
  ancestors.delete(value);
  return { ok: true, value: copiedObject };
}

function isPlainDataObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isValidBusinessIdentifier(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && IDENTIFIER_PATTERN.test(value);
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP_PATTERN.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  try {
    return new Date(timestamp).toISOString() === value;
  } catch {
    return false;
  }
}

function decodeBusinessSnapshotStoredValue(row) {
  const serializedBusinessState = typeof row.businessState === "string"
    ? row.businessState
    : "";
  let businessState;
  let malformed = false;
  try {
    businessState = JSON.parse(serializedBusinessState);
  } catch {
    businessState = { malformed: true };
    malformed = true;
  }
  return {
    record: {
      tenantId: row.tenantId,
      snapshotId: row.snapshotId,
      generatedAt: row.generatedAt,
      storedAt: row.storedAt,
      collectorBuild: row.collectorBuild,
      observationBuild: row.observationBuild,
      schemaVersion: Number(row.schemaVersion),
      collectorCount: Number(row.collectorCount),
      collectedCount: Number(row.collectedCount),
      blockedCount: Number(row.blockedCount),
      failedCount: Number(row.failedCount),
      businessState,
    },
    serializedBusinessState,
    malformed,
  };
}

function businessSnapshotSuccess(disposition, record, extra = {}) {
  return {
    ok: true,
    disposition,
    record: cloneBusinessSnapshotRecord(record),
    statusCode: disposition === "stored" ? 201 : 200,
    ...extra,
  };
}

function businessSnapshotFailure(disposition, code, error, statusCode, record = null, extra = {}) {
  return {
    ok: false,
    disposition,
    code,
    error,
    record: record ? cloneBusinessSnapshotRecord(record) : null,
    statusCode,
    ...extra,
  };
}

function businessSnapshotRejection(code, extra = {}) {
  return businessSnapshotFailure(
    "rejected",
    code,
    BUSINESS_SNAPSHOT_ERROR_MESSAGES[code]
      || BUSINESS_SNAPSHOT_ERROR_MESSAGES.INVALID_BUSINESS_SNAPSHOT_REQUEST,
    400,
    null,
    extra,
  );
}

function businessSnapshotStorageFailure(extra = {}) {
  return businessSnapshotFailure(
    "failed",
    "BUSINESS_SNAPSHOT_STORAGE_FAILED",
    "The business-state snapshot operation failed.",
    500,
    null,
    extra,
  );
}

function cloneBusinessSnapshotRecord(record) {
  return record ? structuredClone(record) : null;
}

function businessSnapshotHeaders() {
  return {
    "X-Kairos-Business-State-Store-Build": KAIROS_BUSINESS_STATE_STORE_BUILD,
  };
}

function sanitizeError(value) {
  const source = value instanceof Error
    ? { name: value.name, message: value.message, code: value.code, retriable: value.retriable }
    : typeof value === "string"
      ? { message: value }
      : value && typeof value === "object"
        ? value
        : { message: "Autonomy execution failed." };
  const sanitized = sanitizeJson(source) || { message: "Autonomy execution failed." };
  if (typeof sanitized.message === "string") {
    sanitized.message = sanitized.message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }
  delete sanitized.stack;
  return sanitized;
}

function sanitizeJson(value) {
  if (value === undefined || value === null) return null;
  const seen = new WeakSet();
  const json = JSON.stringify(value, (key, nested) => {
    if (key === "stack") return undefined;
    if (SENSITIVE_KEY_PATTERN.test(key)) return "[REDACTED]";
    if (nested instanceof Error) {
      return { name: nested.name, message: nested.message, code: nested.code, retriable: nested.retriable };
    }
    if (typeof nested === "bigint") return nested.toString();
    if (typeof nested === "object" && nested !== null) {
      if (seen.has(nested)) return "[Circular]";
      seen.add(nested);
    }
    return nested;
  });
  if (!json) return null;
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength <= MAX_JSON_BYTES) return JSON.parse(json);
  return { truncated: true, message: "Stored value exceeded the ledger serialization limit." };
}

function encodeJson(value) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function decodeJson(value) {
  if (value === null || value === undefined || value === "") return null;
  try {
    return JSON.parse(value);
  } catch {
    return { malformed: true };
  }
}

function decodeRecord(row) {
  return {
    ...row,
    attempt: Number(row.attempt || 0),
    result: decodeJson(row.result),
    error: decodeJson(row.error),
    policyDecision: decodeJson(row.policyDecision),
  };
}

function success(disposition, record, extra = {}) {
  return {
    ok: true,
    disposition,
    record: cloneRecord(record),
    statusCode: disposition === "reserved" ? 201 : 200,
    ...extra,
  };
}

function failure(disposition, code, error, statusCode, record = null) {
  return {
    ok: false,
    disposition,
    code,
    error,
    record: record ? cloneRecord(record) : null,
    statusCode,
  };
}

function cloneRecord(record) {
  return record ? structuredClone(record) : null;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(numeric)));
}

function defaultRandomUUID() {
  if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") {
    throw new Error("Secure UUID generation is unavailable.");
  }
  return globalThis.crypto.randomUUID();
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    const error = new Error("The request body exceeds the ledger limit.");
    error.code = "REQUEST_TOO_LARGE";
    throw error;
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    const error = new Error("The request body exceeds the ledger limit.");
    error.code = "REQUEST_TOO_LARGE";
    throw error;
  }
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    const error = new Error("The request body must contain a JSON object.");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function operationResponse(result, extraHeaders = {}) {
  return jsonResponse(result, result.statusCode || (result.ok ? 200 : 400), extraHeaders);
}

function jsonResponse(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Autonomy-Ledger-Build": KAIROS_AUTONOMY_LEDGER_BUILD,
      ...extraHeaders,
    },
  });
}
