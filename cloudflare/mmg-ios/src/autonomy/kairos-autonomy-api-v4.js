/**
 * ============================================================================
 * KAIROS AUTONOMOUS BUSINESS OPERATIONS — SLICE 5E-3
 * AUTHENTICATED MANUAL COLLECTION PERSISTENCE API
 * Organization: Mindset Media Group / The Legacy, LLC
 * ============================================================================
 */

import {
  handleAutonomyApiRequest as handleAutonomyApiV3Request,
  KAIROS_AUTONOMY_API_BUILD as KAIROS_AUTONOMY_API_V3_BUILD,
  KAIROS_BUSINESS_COLLECTION_PATH,
} from "./kairos-autonomy-api-v3.js";

import {
  createAutonomyLedgerClient,
  KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD,
} from "./kairos-autonomy-ledger-client-v1.js";

export const KAIROS_AUTONOMY_API_BUILD =
  "kairos-autonomy-api-20260802-4-business-state-persistence";

export { KAIROS_BUSINESS_COLLECTION_PATH };

const STATUS_PATH = "/api/autonomy/status";
const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;
const MIN_MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_BUILD_LENGTH = 256;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/u;
const CANONICAL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export async function handleAutonomyApiRequest(
  request,
  env = {},
  ctx = {},
  options = {},
) {
  let pathname = null;
  let method = null;
  try {
    pathname = new URL(readProperty(request, "url")).pathname;
    method = readProperty(request, "method");
  } catch {
    // API v3 remains the route authority even when local inspection fails.
  }

  let delegated;
  try {
    delegated = await handleAutonomyApiV3Request(request, env, ctx, options);
  } catch {
    if (pathname === KAIROS_BUSINESS_COLLECTION_PATH) {
      return collectionError(
        502,
        "BUSINESS_COLLECTION_DELEGATION_FAILED",
        "The business-state collection API could not process the request.",
      );
    }
    if (pathname === STATUS_PATH && method === "GET") {
      return statusError(
        502,
        "STATUS_DELEGATION_FAILED",
        "The autonomy status API could not process the request.",
      );
    }
    return apiError(
      502,
      "AUTONOMY_API_DELEGATION_FAILED",
      "The autonomy API request could not be delegated.",
    );
  }

  if (delegated === null) return null;
  if (!(delegated instanceof Response)) {
    return pathname === KAIROS_BUSINESS_COLLECTION_PATH
      ? collectionError(
        502,
        "BUSINESS_COLLECTION_DELEGATION_FAILED",
        "The business-state collection API could not process the request.",
      )
      : apiError(
        502,
        "AUTONOMY_API_DELEGATION_FAILED",
        "The autonomy API request could not be delegated.",
      );
  }

  const maxResponseBytes = resolveMaximumResponseBytes(options);

  if (pathname === KAIROS_BUSINESS_COLLECTION_PATH) {
    return handleCollectionResponse(delegated, env, options, maxResponseBytes);
  }

  if (pathname === STATUS_PATH && method === "GET") {
    return handleStatusResponse(delegated, env, maxResponseBytes);
  }

  return upgradeDelegatedResponse(delegated, maxResponseBytes);
}

async function handleCollectionResponse(response, env, options, maxResponseBytes) {
  if (response.status !== 200) {
    return upgradeDelegatedResponse(response, maxResponseBytes, {
      collection: true,
      ledgerClient: true,
    });
  }

  const parsed = await readBoundedJsonResponse(response, maxResponseBytes);
  if (!parsed.ok || !isValidCollectionSuccess(parsed.value)) {
    return collectionError(
      502,
      "INVALID_BUSINESS_COLLECTION_RESPONSE",
      "The business-state collection API returned an invalid success response.",
      response.headers,
    );
  }

  const collection = parsed.value;
  const businessStateRead = readOwnDataProperty(collection, "businessState");
  const businessState = businessStateRead.value;
  const ledgerClient = resolveBusinessStateLedgerClient(env, options);
  const methodRead = readCallableProperty(ledgerClient, "storeBusinessSnapshot");
  if (!methodRead.ok) {
    return persistenceUnavailable(response.headers);
  }

  let ledgerResult;
  try {
    ledgerResult = await methodRead.value(businessState);
  } catch {
    return persistenceUnavailable(response.headers);
  }

  const copiedResult = copySafeJsonValue(ledgerResult, new WeakSet());
  if (!copiedResult.ok || !isPlainObject(copiedResult.value)) {
    return persistenceFailed(response.headers);
  }

  const result = copiedResult.value;
  if (result.code === "LEDGER_UNAVAILABLE") return persistenceUnavailable(response.headers);
  if (
    result.code === "SNAPSHOT_IDENTITY_CONFLICT"
    || result.disposition === "conflict"
  ) {
    return persistenceConflict(response.headers);
  }

  const persistence = validatePersistenceSuccess(result, businessState);
  if (!persistence.ok) return persistenceFailed(response.headers);

  return collectionJson({
    ok: true,
    build: KAIROS_AUTONOMY_API_BUILD,
    collectorBuild: collection.collectorBuild,
    observationBuild: collection.observationBuild,
    ledgerClientBuild: KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD,
    persistence: persistence.value,
    businessState,
  }, 200, response.headers);
}

async function handleStatusResponse(response, env, maxResponseBytes) {
  if (response.status !== 200) {
    return upgradeDelegatedResponse(response, maxResponseBytes, { ledgerClient: true });
  }

  const parsed = await readBoundedJsonResponse(response, maxResponseBytes);
  if (!parsed.ok || !isPlainObject(parsed.value)) {
    return statusError(
      502,
      "STATUS_RESPONSE_INVALID",
      "The autonomy status response is invalid.",
    );
  }

  const body = parsed.value;
  const builds = isPlainObject(body.builds) ? { ...body.builds } : {};
  const observation = isPlainObject(body.businessObservation)
    ? { ...body.businessObservation }
    : {};

  body.build = KAIROS_AUTONOMY_API_BUILD;
  body.builds = {
    ...builds,
    api: KAIROS_AUTONOMY_API_BUILD,
    apiV3: KAIROS_AUTONOMY_API_V3_BUILD,
    ledgerClient: KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD,
  };
  body.businessObservation = {
    ...observation,
    manualCollectionPath: KAIROS_BUSINESS_COLLECTION_PATH,
    manualCollectionAvailable: true,
    manualPersistenceEnabled: true,
    persistenceConfigured: configuredLedgerBinding(env),
    scheduledCollectionEnabled: false,
    scheduledPersistenceEnabled: false,
    prioritizationEnabled: false,
    orchestrationEnabled: false,
  };

  return jsonResponse(
    body,
    response.status,
    upgradedHeaders(response.headers, { ledgerClient: true }),
    response.statusText,
  );
}

async function upgradeDelegatedResponse(response, maxResponseBytes, flags = {}) {
  const headers = upgradedHeaders(response.headers, flags);
  const contentType = headers.get("Content-Type");
  if (!isJsonContentType(contentType)) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const parsed = await readBoundedJsonResponse(response, maxResponseBytes);
  if (!parsed.ok) {
    return flags.collection
      ? collectionError(
        502,
        "RESPONSE_UPGRADE_FAILED",
        "The business-state collection API returned an invalid response.",
        headers,
      )
      : apiError(
        502,
        "RESPONSE_UPGRADE_FAILED",
        "The autonomy API response could not be upgraded.",
        flags.ledgerClient,
      );
  }

  const value = parsed.value;
  if (isPlainObject(value)) value.build = KAIROS_AUTONOMY_API_BUILD;
  return jsonResponse(value, response.status, headers, response.statusText);
}

function isValidCollectionSuccess(value) {
  if (!isPlainObject(value) || !isSafeJsonGraph(value)) return false;
  const ok = readOwnDataProperty(value, "ok");
  const build = readOwnDataProperty(value, "build");
  const collectorBuild = readOwnDataProperty(value, "collectorBuild");
  const observationBuild = readOwnDataProperty(value, "observationBuild");
  const businessState = readOwnDataProperty(value, "businessState");
  if (![
    ok, build, collectorBuild, observationBuild, businessState,
  ].every((read) => read.ok && read.present)) return false;
  if (ok.value !== true || build.value !== KAIROS_AUTONOMY_API_V3_BUILD) return false;
  if (!isBoundedString(collectorBuild.value, MAX_BUILD_LENGTH)) return false;
  if (!isBoundedString(observationBuild.value, MAX_BUILD_LENGTH)) return false;
  return isValidBusinessStateIdentity(businessState.value);
}

function isValidBusinessStateIdentity(value) {
  if (!isPlainObject(value) || !isSafeJsonGraph(value)) return false;
  const ok = readOwnDataProperty(value, "ok");
  const tenantId = readOwnDataProperty(value, "tenantId");
  const generatedAt = readOwnDataProperty(value, "generatedAt");
  const snapshot = readOwnDataProperty(value, "snapshot");
  if (![ok, tenantId, generatedAt, snapshot].every((read) => read.ok && read.present)) {
    return false;
  }
  if (ok.value !== true) return false;
  if (!isValidIdentifier(tenantId.value)) return false;
  if (!isCanonicalTimestamp(generatedAt.value)) return false;
  if (!isPlainObject(snapshot.value)) return false;

  const snapshotOk = readOwnDataProperty(snapshot.value, "ok");
  const snapshotTenantId = readOwnDataProperty(snapshot.value, "tenantId");
  const snapshotGeneratedAt = readOwnDataProperty(snapshot.value, "generatedAt");
  const snapshotId = readOwnDataProperty(snapshot.value, "snapshotId");
  if (![
    snapshotOk, snapshotTenantId, snapshotGeneratedAt, snapshotId,
  ].every((read) => read.ok && read.present)) return false;

  return snapshotOk.value === true
    && snapshotTenantId.value === tenantId.value
    && snapshotGeneratedAt.value === generatedAt.value
    && isValidIdentifier(snapshotId.value);
}

function validatePersistenceSuccess(result, businessState) {
  if (result.ok !== true) return { ok: false };
  const stored = result.disposition === "stored" && result.duplicate === false;
  const duplicate = result.disposition === "duplicate" && result.duplicate === true;
  if (!stored && !duplicate) return { ok: false };
  if (!isPlainObject(result.record) || !isSafeJsonGraph(result.record)) {
    return { ok: false };
  }

  const snapshot = businessState.snapshot;
  const record = result.record;
  if (
    record.tenantId !== businessState.tenantId
    || record.snapshotId !== snapshot.snapshotId
    || record.generatedAt !== businessState.generatedAt
    || !isCanonicalTimestamp(record.storedAt)
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      ok: true,
      disposition: result.disposition,
      duplicate: result.duplicate,
      tenantId: businessState.tenantId,
      snapshotId: snapshot.snapshotId,
      generatedAt: businessState.generatedAt,
      storedAt: record.storedAt,
    },
  };
}

function resolveBusinessStateLedgerClient(env, options) {
  const injected = readOwnDataProperty(options, "businessStateLedgerClient");
  if (!injected.ok) return null;
  if (injected.present) return injected.value;
  try {
    return createAutonomyLedgerClient(env);
  } catch {
    return null;
  }
}

function configuredLedgerBinding(env) {
  const bindingRead = readOwnDataProperty(env, "KAIROS_AUTONOMY_LEDGER");
  if (!bindingRead.ok || !bindingRead.present) return false;
  const binding = bindingRead.value;
  return readCallableProperty(binding, "idFromName").ok
    && readCallableProperty(binding, "get").ok;
}

function readCallableProperty(object, key) {
  if (object === null || (typeof object !== "object" && typeof object !== "function")) {
    return { ok: false };
  }
  let current = object;
  const visited = new Set();
  while (current !== null) {
    if (visited.has(current)) return { ok: false };
    visited.add(current);
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(current, key);
    } catch {
      return { ok: false };
    }
    if (descriptor !== undefined) {
      return Object.hasOwn(descriptor, "value") && typeof descriptor.value === "function"
        ? { ok: true, value: descriptor.value }
        : { ok: false };
    }
    try {
      current = Object.getPrototypeOf(current);
    } catch {
      return { ok: false };
    }
  }
  return { ok: false };
}

async function readBoundedJsonResponse(response, maxBytes) {
  const text = await readBoundedText(response, maxBytes);
  if (!text.ok) return text;
  if (text.text.length === 0) return { ok: false, code: "INVALID_RESPONSE" };
  try {
    return { ok: true, value: JSON.parse(text.text) };
  } catch {
    return { ok: false, code: "INVALID_RESPONSE" };
  }
}

async function readBoundedText(response, maxBytes) {
  let body;
  try {
    body = response.body;
  } catch {
    return { ok: false, code: "INVALID_RESPONSE" };
  }

  if (!body || typeof body.getReader !== "function") {
    try {
      const text = await response.text();
      const bytes = new TextEncoder().encode(text);
      return bytes.byteLength <= maxBytes
        ? { ok: true, text }
        : { ok: false, code: "RESPONSE_TOO_LARGE" };
    } catch {
      return { ok: false, code: "INVALID_RESPONSE" };
    }
  }

  let reader;
  try {
    reader = body.getReader();
  } catch {
    return { ok: false, code: "INVALID_RESPONSE" };
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (!isPlainObject(chunk)) throw new TypeError("invalid stream result");
      if (chunk.done === true) break;
      if (!(chunk.value instanceof Uint8Array)) throw new TypeError("invalid stream chunk");
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel("response_limit_reached");
        } catch {
          // Best effort only.
        }
        return { ok: false, code: "RESPONSE_TOO_LARGE" };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch {
    return { ok: false, code: "INVALID_RESPONSE" };
  }
}

function resolveMaximumResponseBytes(options) {
  const read = readOwnDataProperty(options, "maxBusinessPersistenceResponseBytes");
  if (!read.ok || !read.present) return DEFAULT_MAX_RESPONSE_BYTES;
  return boundedInteger(
    read.value,
    DEFAULT_MAX_RESPONSE_BYTES,
    MIN_MAX_RESPONSE_BYTES,
    MAX_MAX_RESPONSE_BYTES,
  );
}

function copySafeJsonValue(value, ancestors) {
  if (value === null) return { ok: true, value: null };
  if (typeof value === "string" || typeof value === "boolean") {
    return { ok: true, value };
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  }
  if (typeof value !== "object" || ancestors.has(value)) return { ok: false };

  const arrayRead = safeIsArray(value);
  if (!arrayRead.ok) return { ok: false };
  const array = arrayRead.value;
  if (!array && !isPlainObject(value)) return { ok: false };

  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return { ok: false };
  }

  ancestors.add(value);
  try {
    if (array) {
      const lengthDescriptor = safeDescriptor(value, "length");
      if (
        !lengthDescriptor
        || !Object.hasOwn(lengthDescriptor, "value")
        || !Number.isInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0
        || keys.length !== lengthDescriptor.value + 1
      ) {
        return { ok: false };
      }
      const output = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const key = String(index);
        if (!keys.includes(key)) return { ok: false };
        const descriptor = safeDescriptor(value, key);
        if (
          !descriptor
          || !Object.hasOwn(descriptor, "value")
          || descriptor.enumerable !== true
        ) {
          return { ok: false };
        }
        const nested = copySafeJsonValue(descriptor.value, ancestors);
        if (!nested.ok) return nested;
        output.push(nested.value);
      }
      if (!keys.every((key) => key === "length" || (
        typeof key === "string" && /^\d+$/u.test(key)
      ))) {
        return { ok: false };
      }
      return { ok: true, value: output };
    }

    const output = Object.create(null);
    for (const key of keys) {
      if (typeof key !== "string") return { ok: false };
      const descriptor = safeDescriptor(value, key);
      if (
        !descriptor
        || !Object.hasOwn(descriptor, "value")
        || descriptor.enumerable !== true
      ) {
        return { ok: false };
      }
      const nested = copySafeJsonValue(descriptor.value, ancestors);
      if (!nested.ok) return nested;
      Object.defineProperty(output, key, {
        value: nested.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return { ok: true, value: output };
  } finally {
    ancestors.delete(value);
  }
}

function isSafeJsonGraph(value, ancestors = new WeakSet()) {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;

  const arrayRead = safeIsArray(value);
  if (!arrayRead.ok) return false;
  const array = arrayRead.value;
  if (!array && !isPlainObject(value)) return false;
  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }

  ancestors.add(value);
  try {
    if (array) {
      const lengthDescriptor = safeDescriptor(value, "length");
      if (
        !lengthDescriptor
        || !Object.hasOwn(lengthDescriptor, "value")
        || !Number.isInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0
        || keys.length !== lengthDescriptor.value + 1
        || !keys.every((key) => key === "length" || (
          typeof key === "string" && /^\d+$/u.test(key)
        ))
      ) return false;
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const descriptor = safeDescriptor(value, String(index));
        if (
          !descriptor
          || !Object.hasOwn(descriptor, "value")
          || descriptor.enumerable !== true
          || !isSafeJsonGraph(descriptor.value, ancestors)
        ) return false;
      }
      return true;
    }

    for (const key of keys) {
      if (typeof key !== "string") return false;
      const descriptor = safeDescriptor(value, key);
      if (
        !descriptor
        || !Object.hasOwn(descriptor, "value")
        || descriptor.enumerable !== true
        || !isSafeJsonGraph(descriptor.value, ancestors)
      ) return false;
    }
    return true;
  } finally {
    ancestors.delete(value);
  }
}

function readOwnDataProperty(object, key) {
  if (object === null || (typeof object !== "object" && typeof object !== "function")) {
    return { ok: false, present: false };
  }
  const descriptor = safeDescriptor(object, key);
  if (descriptor === null) return { ok: false, present: false };
  if (descriptor === undefined) return { ok: true, present: false };
  if (!Object.hasOwn(descriptor, "value")) return { ok: false, present: true };
  return { ok: true, present: true, value: descriptor.value };
}

function safeDescriptor(object, key) {
  try {
    return Object.getOwnPropertyDescriptor(object, key);
  } catch {
    return null;
  }
}

function readProperty(object, key) {
  if (object === null || (typeof object !== "object" && typeof object !== "function")) {
    throw new TypeError("invalid object");
  }
  return object[key];
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const arrayRead = safeIsArray(value);
  if (!arrayRead.ok || arrayRead.value) return false;
  let prototype;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    return false;
  }
  return prototype === Object.prototype || prototype === null;
}

function safeIsArray(value) {
  try {
    return { ok: true, value: Array.isArray(value) };
  } catch {
    return { ok: false, value: false };
  }
}

function isValidIdentifier(value) {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= MAX_IDENTIFIER_LENGTH
    && value === value.trim()
    && IDENTIFIER_PATTERN.test(value);
}

function isBoundedString(value, maximum) {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= maximum
    && value === value.trim();
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isJsonContentType(value) {
  if (typeof value !== "string") return false;
  return value.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(numeric)));
}

function upgradedHeaders(source, flags = {}) {
  let headers;
  try {
    headers = new Headers(source);
  } catch {
    headers = new Headers();
  }
  headers.set("X-Kairos-Autonomy-API-Build", KAIROS_AUTONOMY_API_BUILD);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  if (flags.ledgerClient || flags.collection) {
    headers.set(
      "X-Kairos-Autonomy-Ledger-Client-Build",
      KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD,
    );
  }
  return headers;
}

function persistenceUnavailable(sourceHeaders) {
  return collectionError(
    503,
    "BUSINESS_SNAPSHOT_PERSISTENCE_UNAVAILABLE",
    "The business-state snapshot could not be persisted because durable storage is unavailable.",
    sourceHeaders,
  );
}

function persistenceConflict(sourceHeaders) {
  return collectionError(
    409,
    "BUSINESS_SNAPSHOT_IDENTITY_CONFLICT",
    "The business-state snapshot identity conflicts with an existing durable record.",
    sourceHeaders,
  );
}

function persistenceFailed(sourceHeaders) {
  return collectionError(
    502,
    "BUSINESS_SNAPSHOT_PERSISTENCE_FAILED",
    "The business-state snapshot could not be confirmed in durable storage.",
    sourceHeaders,
  );
}

function statusError(status, code, message) {
  return apiError(status, code, message, true);
}

function collectionError(status, code, message, sourceHeaders = null) {
  return jsonResponse({
    ok: false,
    build: KAIROS_AUTONOMY_API_BUILD,
    error: { code, message },
  }, status, upgradedHeaders(sourceHeaders, { collection: true, ledgerClient: true }));
}

function apiError(status, code, message, ledgerClient = false) {
  const headers = {
    "X-Kairos-Autonomy-API-Build": KAIROS_AUTONOMY_API_BUILD,
  };
  if (ledgerClient) {
    headers["X-Kairos-Autonomy-Ledger-Client-Build"] =
      KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD;
  }
  return jsonResponse({
    ok: false,
    build: KAIROS_AUTONOMY_API_BUILD,
    error: { code, message },
  }, status, headers);
}

function collectionJson(value, status = 200, sourceHeaders = null) {
  return jsonResponse(
    value,
    status,
    upgradedHeaders(sourceHeaders, { collection: true, ledgerClient: true }),
  );
}

function jsonResponse(value, status = 200, headers = {}, statusText = undefined) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("X-Kairos-Autonomy-API-Build", KAIROS_AUTONOMY_API_BUILD);
  return new Response(JSON.stringify(value), {
    status,
    statusText,
    headers: responseHeaders,
  });
}
