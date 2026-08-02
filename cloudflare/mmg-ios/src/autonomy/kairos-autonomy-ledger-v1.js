export const KAIROS_AUTONOMY_LEDGER_BUILD = "kairos-autonomy-ledger-20260802-1";

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
const BLOCKABLE_STATUSES = new Set([
  AUTONOMY_EVENT_STATUS.ACCEPTED,
  AUTONOMY_EVENT_STATUS.FAILED,
]);
const DEFAULT_LEASE_DURATION_MS = 30_000;
const MIN_LEASE_DURATION_MS = 1_000;
const MAX_LEASE_DURATION_MS = 15 * 60_000;
const MAX_RECENT_EVENTS = 100;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_JSON_BYTES = 32 * 1024;
const MAX_ERROR_MESSAGE_LENGTH = 1_000;
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|secret|password|credential|api[-_]?key)/i;

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
    if (request.method !== "POST") {
      return jsonResponse({
        ok: false,
        code: "METHOD_NOT_ALLOWED",
        error: "Kairos autonomy ledger operations require POST.",
      }, 405, { Allow: "POST" });
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      const status = error?.code === "REQUEST_TOO_LARGE" ? 413 : 400;
      return jsonResponse({
        ok: false,
        code: error?.code || "INVALID_JSON",
        error: error instanceof Error ? error.message : "The request body is invalid.",
      }, status);
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
        default:
          return jsonResponse({ ok: false, code: "NOT_FOUND", error: "Ledger operation not found." }, 404);
      }
    } catch (error) {
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
      if (existing) {
        return success("duplicate", existing, { duplicate: true });
      }

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
    if (!record) return failure("not_found", "EVENT_NOT_FOUND", "The autonomy event was not found.", 404);
    return success("found", record);
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
        return failure("invalid_transition", "INVALID_STATE_TRANSITION", "The event cannot acquire a lease from its current state.", 409, record);
      }

      const now = this.currentDate();
      const activeLease = record.status === AUTONOMY_EVENT_STATUS.RUNNING
        && record.leaseExpiresAt
        && Date.parse(record.leaseExpiresAt) > now.getTime();
      if (activeLease) {
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
      if (!BLOCKABLE_STATUSES.has(record.status)) {
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
        leaseExpiresAt: null,
        leaseToken: null,
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
    };

    if (typeof this.storage.transactionSync === "function") {
      return this.storage.transactionSync(initialize);
    }
    return initialize();
  }

  transaction(callback) {
    if (typeof this.storage.transactionSync === "function") {
      return this.storage.transactionSync(() => callback(this));
    }
    return callback(this);
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
  return {
    truncated: true,
    message: "Stored value exceeded the ledger serialization limit.",
  };
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

function operationResponse(result) {
  return jsonResponse(result, result.statusCode || (result.ok ? 200 : 400));
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
