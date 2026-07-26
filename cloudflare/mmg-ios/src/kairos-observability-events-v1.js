export const KAIROS_OBSERVABILITY_EVENTS_BUILD = "kairos-observability-events-20260725-1";

const ALLOWED_PHASES = new Set([
  "request_received",
  "authentication_completed",
  "knowledge_retrieval_completed",
  "tool_proposed",
  "approval_consumed",
  "tool_execution_completed",
  "tool_execution_failed",
  "verification_completed",
  "response_completed",
]);

const ALLOWED_OUTCOMES = new Set(["success", "failure", "blocked", "pending"]);

export function createKairosObservabilityEvent(input = {}) {
  const phase = clean(input.phase, 80);
  const outcome = clean(input.outcome, 40);
  if (!ALLOWED_PHASES.has(phase)) throw observabilityError("OBSERVABILITY_PHASE_INVALID", "The observability phase is not registered.");
  if (!ALLOWED_OUTCOMES.has(outcome)) throw observabilityError("OBSERVABILITY_OUTCOME_INVALID", "The observability outcome is not registered.");

  const startedAt = normalizeIso(input.startedAt) || new Date().toISOString();
  const completedAt = normalizeIso(input.completedAt) || startedAt;
  const durationMs = Math.max(0, Math.min(300000, Number(input.durationMs) || Math.max(0, Date.parse(completedAt) - Date.parse(startedAt))));

  return Object.freeze({
    eventId: clean(input.eventId || crypto.randomUUID(), 160),
    requestId: clean(input.requestId, 160),
    approvalId: clean(input.approvalId, 160) || null,
    identityHash: clean(input.identityHash, 128) || null,
    department: clean(input.department, 120) || null,
    toolId: clean(input.toolId, 160) || null,
    executor: clean(input.executor, 160) || null,
    phase,
    outcome,
    startedAt,
    completedAt,
    durationMs,
    errorCode: clean(input.errorCode, 160) || null,
    evidenceCount: boundedInteger(input.evidenceCount, 0, 1000),
    verificationPassed: typeof input.verificationPassed === "boolean" ? input.verificationPassed : null,
    metadata: sanitizeMetadata(input.metadata),
    build: KAIROS_OBSERVABILITY_EVENTS_BUILD,
  });
}

export function sanitizeObservabilityEvent(event) {
  return createKairosObservabilityEvent({
    ...event,
    metadata: sanitizeMetadata(event?.metadata),
  });
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 24)) {
    if (/secret|token|authorization|password|api.?key|objective|prompt|content|body/i.test(key)) continue;
    if (["string", "number", "boolean"].includes(typeof item) || item == null) output[clean(key, 80)] = typeof item === "string" ? clean(item, 500) : item;
  }
  return Object.freeze(output);
}

function boundedInteger(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : min;
}

function normalizeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function observabilityError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}
