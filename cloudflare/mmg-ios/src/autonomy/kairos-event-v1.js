export const KAIROS_EVENT_SCHEMA_VERSION = 1;

const RISK_CLASSES = new Set(["low", "medium", "high", "critical"]);
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_EVENT_TYPE_LENGTH = 160;

export function validateEventEnvelope(rawEvent, options = {}) {
  if (!isPlainObject(rawEvent)) {
    return invalid("INVALID_EVENT_PAYLOAD", "Event payload must be a non-null object.");
  }

  const eventId = requiredString(rawEvent.eventId, "eventId", MAX_IDENTIFIER_LENGTH);
  if (!eventId.valid) return eventId;

  const eventType = requiredString(rawEvent.eventType, "eventType", MAX_EVENT_TYPE_LENGTH);
  if (!eventType.valid) return eventType;

  const source = requiredString(rawEvent.source, "source", MAX_IDENTIFIER_LENGTH);
  if (!source.valid) return source;

  const tenantId = requiredString(rawEvent.tenantId, "tenantId", MAX_IDENTIFIER_LENGTH);
  if (!tenantId.valid) return tenantId;

  const occurredAtMs = Date.parse(rawEvent.occurredAt);
  if (typeof rawEvent.occurredAt !== "string" || !Number.isFinite(occurredAtMs)) {
    return invalid("INVALID_OCCURRED_AT", "Missing or invalid occurredAt timestamp.");
  }

  const optionalFields = [
    ["correlationId", rawEvent.correlationId],
    ["causationId", rawEvent.causationId],
    ["projectId", rawEvent.projectId],
    ["workflowId", rawEvent.workflowId],
  ];

  for (const [field, value] of optionalFields) {
    if (value !== undefined && value !== null) {
      const result = optionalString(value, field, MAX_IDENTIFIER_LENGTH);
      if (!result.valid) return result;
    }
  }

  const riskClass = rawEvent.riskClass ?? "low";
  if (typeof riskClass !== "string" || !RISK_CLASSES.has(riskClass)) {
    return invalid("INVALID_RISK_CLASS", "riskClass must be one of: low, medium, high, critical.");
  }

  const payload = rawEvent.payload ?? {};
  if (!isPlainObject(payload)) {
    return invalid("INVALID_EVENT_PAYLOAD_BODY", "Event payload must be an object when provided.");
  }

  const metadata = rawEvent.metadata ?? {};
  if (!isPlainObject(metadata)) {
    return invalid("INVALID_EVENT_METADATA", "Event metadata must be an object when provided.");
  }

  let correlationId = rawEvent.correlationId?.trim();
  if (!correlationId) {
    try {
      const randomUUID = options.randomUUID || defaultRandomUUID;
      correlationId = `corr_${randomUUID()}`;
    } catch {
      return invalid("UUID_GENERATION_FAILED", "A secure correlation identifier could not be generated.");
    }
  }

  const now = options.now instanceof Date
    ? options.now
    : typeof options.now === "function"
      ? options.now()
      : new Date();

  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return invalid("INVALID_RECEIVED_AT", "The event receipt timestamp could not be generated.");
  }

  return {
    valid: true,
    event: {
      eventId: eventId.value,
      eventType: eventType.value,
      source: source.value,
      occurredAt: new Date(occurredAtMs).toISOString(),
      receivedAt: now.toISOString(),
      correlationId,
      causationId: normalizeOptional(rawEvent.causationId),
      tenantId: tenantId.value,
      projectId: normalizeOptional(rawEvent.projectId),
      workflowId: normalizeOptional(rawEvent.workflowId),
      riskClass,
      payload: structuredClone(payload),
      metadata: {
        ...structuredClone(metadata),
        schemaVersion: KAIROS_EVENT_SCHEMA_VERSION,
      },
    },
  };
}

function requiredString(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    return invalid(`INVALID_${field.toUpperCase()}`, `Missing or invalid ${field}.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return invalid(`${field.toUpperCase()}_TOO_LONG`, `${field} exceeds the maximum length of ${maxLength}.`);
  }
  return { valid: true, value: normalized };
}

function optionalString(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    return invalid(`INVALID_${field.toUpperCase()}`, `${field} must be a non-empty string when provided.`);
  }
  if (value.trim().length > maxLength) {
    return invalid(`${field.toUpperCase()}_TOO_LONG`, `${field} exceeds the maximum length of ${maxLength}.`);
  }
  return { valid: true, value: value.trim() };
}

function normalizeOptional(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function defaultRandomUUID() {
  if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") {
    throw new Error("Secure random UUID generation is unavailable.");
  }
  return globalThis.crypto.randomUUID();
}

function invalid(code, error) {
  return { valid: false, code, error };
}
