/**
 * ============================================================================
 * KAIROS AUTONOMOUS BUSINESS OPERATIONS — SLICE 5D-1
 * AUTHENTICATED BUSINESS-STATE COLLECTION API
 * Organization: Mindset Media Group / The Legacy, LLC
 * ============================================================================
 */

import {
  handleAutonomyApiRequest as handleAutonomyApiV2Request,
  KAIROS_AUTONOMY_API_BUILD as KAIROS_AUTONOMY_API_V2_BUILD,
} from "./kairos-autonomy-api-v2.js";

import {
  collectBusinessState,
  KAIROS_BUSINESS_COLLECTOR_BUILD,
} from "./kairos-business-collector-v1.js";

import {
  KAIROS_BUSINESS_OBSERVATION_BUILD,
} from "./kairos-business-observation-v1.js";

export const KAIROS_AUTONOMY_API_BUILD =
  "kairos-autonomy-api-20260802-3";

export const KAIROS_BUSINESS_COLLECTION_PATH =
  "/api/autonomy/business-state/collect";

const STATUS_PATH = "/api/autonomy/status";
const DEFAULT_MAX_REQUEST_BYTES = 16_384;
const MIN_MAX_REQUEST_BYTES = 1_024;
const MAX_MAX_REQUEST_BYTES = 65_536;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_ERROR_FIELD_LENGTH = 128;
const MAX_ERROR_INDEX = 1_000;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/u;
const ERROR_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_]*$/u;
const ERROR_FIELD_PATTERN = /^[A-Za-z0-9._\-\[\]]+$/u;
const CANONICAL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const VALIDATION_ERROR_CODES = new Set([
  "INVALID_INPUT",
  "UNKNOWN_INPUT_FIELD",
  "INVALID_TENANT_ID",
  "INVALID_COLLECTORS",
  "UNSUPPORTED_COLLECTOR",
  "DUPLICATE_COLLECTOR",
  "INVALID_WEBSITE_INPUT",
  "UNKNOWN_WEBSITE_FIELD",
  "INVALID_TARGET_URL_INPUT",
  "INVALID_OPTIONS",
  "UNKNOWN_OPTION_FIELD",
  "INVALID_CLOCK",
  "INVALID_WEBSITE_EXECUTOR",
  "INVALID_FETCH_IMPL",
  "INVALID_WEBSITE_TIMEOUT",
  "INVALID_WEBSITE_BODY_LIMIT",
  "INVALID_SNAPSHOT_WINDOW",
  "INVALID_SNAPSHOT_RECENT_LIMIT",
]);

export async function handleAutonomyApiRequest(
  request,
  env = {},
  ctx = {},
  options = {},
) {
  let pathname = null;
  let ownsCollection = false;
  let ownsStatus = false;

  try {
    const requestUrl = readRequestProperty(request, "url");
    const url = new URL(requestUrl);
    pathname = url.pathname;
    ownsCollection = pathname === KAIROS_BUSINESS_COLLECTION_PATH;
    ownsStatus = pathname === STATUS_PATH
      && readRequestProperty(request, "method") === "GET";

    if (ownsCollection) {
      return await handleCollectionRequest(request, url, env, ctx, options);
    }

    const delegated = await handleAutonomyApiV2Request(request, env, ctx, options);
    if (delegated === null) return null;

    if (ownsStatus) {
      return await upgradeStatusResponse(delegated);
    }
    return await upgradeDelegatedResponse(delegated);
  } catch {
    if (ownsCollection || ownsStatus || pathname === KAIROS_BUSINESS_COLLECTION_PATH) {
      return collectionError(
        500,
        "BUSINESS_COLLECTION_API_FAILED",
        "The business-state collection API could not process the request.",
      );
    }
    return apiError(
      500,
      "AUTONOMY_API_DELEGATION_FAILED",
      "The autonomy API request could not be delegated.",
    );
  }
}

async function handleCollectionRequest(request, url, env, ctx, options) {
  const authentication = await authenticateThroughV2(request, url, env, ctx, options);
  if (!(authentication instanceof Response)) {
    return collectionError(
      500,
      "BUSINESS_COLLECTION_API_FAILED",
      "The business-state collection API could not process the request.",
    );
  }
  if (authentication.status !== 200) {
    return upgradeDelegatedResponse(authentication, true);
  }

  const method = readRequestProperty(request, "method");
  if (method !== "POST") {
    return collectionError(
      405,
      "METHOD_NOT_ALLOWED",
      "The request method is not allowed for this endpoint.",
      { Allow: "POST" },
    );
  }

  const headers = readRequestProperty(request, "headers");
  if (!(headers instanceof Headers)) {
    throw new TypeError("invalid request headers");
  }
  if (!isJsonContentType(headers.get("Content-Type"))) {
    return collectionError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "The business-state collection request must use application/json.",
    );
  }

  const maxBytes = resolveMaximumRequestBytes(options);
  const body = await readBoundedBody(request, maxBytes);
  if (!body.ok) {
    if (body.code === "REQUEST_TOO_LARGE") {
      return collectionError(
        413,
        "REQUEST_TOO_LARGE",
        "The business-state collection request exceeds the permitted size.",
      );
    }
    return collectionError(
      400,
      "INVALID_REQUEST_BODY",
      "The business-state collection request body could not be read.",
    );
  }

  let parsedBody;
  try {
    parsedBody = JSON.parse(body.text);
  } catch {
    return collectionError(
      400,
      "INVALID_JSON_BODY",
      "The business-state collection request must contain a valid JSON object.",
    );
  }
  if (!isPlainObject(parsedBody)) {
    return collectionError(
      400,
      "INVALID_JSON_BODY",
      "The business-state collection request must contain a valid JSON object.",
    );
  }

  const optionResolution = resolveCollectionOptions(options, env);
  if (!optionResolution.ok) {
    return collectionError(
      500,
      "BUSINESS_COLLECTION_API_FAILED",
      "The business-state collection API could not process the request.",
    );
  }

  let collectorResult;
  try {
    collectorResult = await optionResolution.businessCollector(
      parsedBody,
      optionResolution.collectorEnvironment,
      optionResolution.collectorOptions,
    );
  } catch {
    return collectionError(
      502,
      "INVALID_BUSINESS_COLLECTOR_RESULT",
      "The business-state collector returned an invalid result.",
    );
  }

  const failureMapping = mapCollectorFailure(collectorResult);
  if (failureMapping) return failureMapping;

  if (!isValidCollectorSuccess(collectorResult)) {
    return collectionError(
      502,
      "INVALID_BUSINESS_COLLECTOR_RESULT",
      "The business-state collector returned an invalid result.",
    );
  }

  return collectionJson({
    ok: true,
    build: KAIROS_AUTONOMY_API_BUILD,
    collectorBuild: KAIROS_BUSINESS_COLLECTOR_BUILD,
    observationBuild: KAIROS_BUSINESS_OBSERVATION_BUILD,
    businessState: collectorResult,
  });
}

async function authenticateThroughV2(request, url, env, ctx, options) {
  const headers = readRequestProperty(request, "headers");
  if (!(headers instanceof Headers)) throw new TypeError("invalid headers");

  const probeUrl = new URL(url.toString());
  probeUrl.pathname = STATUS_PATH;
  probeUrl.search = "";
  const probe = new Request(probeUrl.toString(), {
    method: "GET",
    headers: new Headers(headers),
  });
  return handleAutonomyApiV2Request(probe, env, ctx, options);
}

async function upgradeStatusResponse(response) {
  if (!(response instanceof Response)) {
    return apiError(
      500,
      "RESPONSE_UPGRADE_FAILED",
      "The autonomy API response could not be upgraded.",
    );
  }
  if (response.status !== 200) return upgradeDelegatedResponse(response);

  const parsed = await readJsonResponse(response);
  if (!parsed.ok || !isPlainObject(parsed.value)) {
    return apiError(
      500,
      "RESPONSE_UPGRADE_FAILED",
      "The autonomy API response could not be upgraded.",
    );
  }

  const body = cloneParsedJsonObject(parsed.value);
  const existingBuilds = isPlainObject(body.builds)
    ? cloneParsedJsonObject(body.builds)
    : {};

  body.build = KAIROS_AUTONOMY_API_BUILD;
  body.builds = {
    ...existingBuilds,
    api: KAIROS_AUTONOMY_API_BUILD,
    apiV2: KAIROS_AUTONOMY_API_V2_BUILD,
    businessCollector: KAIROS_BUSINESS_COLLECTOR_BUILD,
    businessObservation: KAIROS_BUSINESS_OBSERVATION_BUILD,
  };
  body.businessObservation = {
    manualCollectionPath: KAIROS_BUSINESS_COLLECTION_PATH,
    manualCollectionAvailable: true,
    scheduledCollectionEnabled: false,
    persistenceConfigured: false,
    prioritizationEnabled: false,
    orchestrationEnabled: false,
  };

  return jsonResponse(
    body,
    response.status,
    upgradedHeaders(response.headers),
    response.statusText,
  );
}

async function upgradeDelegatedResponse(response, collection = false) {
  if (response === null) return null;
  if (!(response instanceof Response)) {
    return collection
      ? collectionError(
        500,
        "RESPONSE_UPGRADE_FAILED",
        "The autonomy API response could not be upgraded.",
      )
      : apiError(
        500,
        "RESPONSE_UPGRADE_FAILED",
        "The autonomy API response could not be upgraded.",
      );
  }

  const headers = upgradedHeaders(response.headers, collection);
  if (!isJsonContentType(headers.get("Content-Type"))) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const parsed = await readJsonResponse(response);
  if (!parsed.ok || !isPlainObject(parsed.value)) {
    return collection
      ? collectionError(
        500,
        "RESPONSE_UPGRADE_FAILED",
        "The autonomy API response could not be upgraded.",
      )
      : apiError(
        500,
        "RESPONSE_UPGRADE_FAILED",
        "The autonomy API response could not be upgraded.",
      );
  }

  const body = cloneParsedJsonObject(parsed.value);
  body.build = KAIROS_AUTONOMY_API_BUILD;
  return jsonResponse(
    body,
    response.status,
    headers,
    response.statusText,
  );
}

async function readJsonResponse(response) {
  let text;
  try {
    text = await response.text();
  } catch {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function resolveCollectionOptions(options, env) {
  if (!isPlainObject(options)) return { ok: false };

  const collectorRead = readOwnDataProperty(options, "businessCollector");
  if (!collectorRead.ok) return { ok: false };
  const businessCollector = collectorRead.present
    ? collectorRead.value
    : collectBusinessState;
  if (typeof businessCollector !== "function") return { ok: false };

  const environmentRead = readOwnDataProperty(options, "collectorEnvironment");
  if (!environmentRead.ok) return { ok: false };
  const collectorEnvironment = environmentRead.present
    ? environmentRead.value
    : env;

  const optionsRead = readOwnDataProperty(options, "collectorOptions");
  if (!optionsRead.ok) return { ok: false };
  const collectorOptions = optionsRead.present
    ? cloneCollectorOptions(optionsRead.value)
    : {};
  if (collectorOptions === null) return { ok: false };

  return {
    ok: true,
    businessCollector,
    collectorEnvironment,
    collectorOptions,
  };
}

function cloneCollectorOptions(value) {
  if (!isPlainObject(value)) return null;
  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return null;
  }
  const clone = {};
  for (const key of keys) {
    if (typeof key !== "string") return null;
    const descriptor = safeDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
    clone[key] = descriptor.value;
  }
  return clone;
}

function resolveMaximumRequestBytes(options) {
  if (!isPlainObject(options)) return DEFAULT_MAX_REQUEST_BYTES;
  const read = readOwnDataProperty(options, "maxBusinessCollectionRequestBytes");
  if (!read.ok || !read.present) return DEFAULT_MAX_REQUEST_BYTES;
  return Number.isInteger(read.value)
    && read.value >= MIN_MAX_REQUEST_BYTES
    && read.value <= MAX_MAX_REQUEST_BYTES
    ? read.value
    : DEFAULT_MAX_REQUEST_BYTES;
}

async function readBoundedBody(request, maxBytes) {
  let headers;
  try {
    headers = readRequestProperty(request, "headers");
  } catch {
    return { ok: false, code: "INVALID_REQUEST_BODY" };
  }
  const contentLength = headers instanceof Headers
    ? headers.get("Content-Length")
    : null;
  if (typeof contentLength === "string" && /^\d+$/u.test(contentLength)) {
    const numericLength = Number(contentLength);
    if (Number.isSafeInteger(numericLength) && numericLength > maxBytes) {
      return { ok: false, code: "REQUEST_TOO_LARGE" };
    }
  }

  let stream;
  try {
    stream = readRequestProperty(request, "body");
  } catch {
    return { ok: false, code: "INVALID_REQUEST_BODY" };
  }
  if (stream === null) return { ok: true, text: "" };

  let reader;
  try {
    reader = stream.getReader();
  } catch {
    return { ok: false, code: "INVALID_REQUEST_BODY" };
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (!isPlainObject(chunk)) throw new TypeError("invalid stream result");
      if (chunk.done === true) break;
      if (!(chunk.value instanceof Uint8Array)) throw new TypeError("invalid body chunk");
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Cancellation is best effort.
        }
        return { ok: false, code: "REQUEST_TOO_LARGE" };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch {
    return { ok: false, code: "INVALID_REQUEST_BODY" };
  }
}

function mapCollectorFailure(result) {
  if (!isPlainObject(result)) return null;
  const okRead = readOwnDataProperty(result, "ok");
  if (!okRead.ok || !okRead.present || okRead.value !== false) return null;

  const buildRead = readOwnDataProperty(result, "build");
  const schemaRead = readOwnDataProperty(result, "schemaVersion");
  const errorRead = readOwnDataProperty(result, "error");
  if (
    !buildRead.ok
    || buildRead.value !== KAIROS_BUSINESS_COLLECTOR_BUILD
    || !schemaRead.ok
    || schemaRead.value !== 1
    || !errorRead.ok
    || !isPlainObject(errorRead.value)
  ) {
    return collectionError(
      502,
      "INVALID_BUSINESS_COLLECTOR_RESULT",
      "The business-state collector returned an invalid result.",
    );
  }

  const codeRead = readOwnDataProperty(errorRead.value, "code");
  if (!codeRead.ok || !isSafeErrorCode(codeRead.value)) {
    return collectionError(
      502,
      "INVALID_BUSINESS_COLLECTOR_RESULT",
      "The business-state collector returned an invalid result.",
    );
  }

  if (codeRead.value === "SNAPSHOT_BUILD_FAILED") {
    return collectionError(
      503,
      "BUSINESS_SNAPSHOT_UNAVAILABLE",
      "The business-state snapshot could not be assembled.",
    );
  }

  if (!VALIDATION_ERROR_CODES.has(codeRead.value)) {
    return collectionError(
      502,
      "INVALID_BUSINESS_COLLECTOR_RESULT",
      "The business-state collector returned an invalid result.",
    );
  }

  const fieldRead = readOwnDataProperty(errorRead.value, "field");
  const indexRead = readOwnDataProperty(errorRead.value, "index");
  const field = fieldRead.ok && fieldRead.present && isSafeErrorField(fieldRead.value)
    ? fieldRead.value
    : null;
  const index = indexRead.ok && indexRead.present && isSafeErrorIndex(indexRead.value)
    ? indexRead.value
    : null;

  return collectionJson({
    ok: false,
    build: KAIROS_AUTONOMY_API_BUILD,
    error: {
      code: codeRead.value,
      message: "The business-state collection request is invalid.",
      field,
      index,
    },
  }, 400);
}

function isValidCollectorSuccess(result) {
  if (!isPlainObject(result) || !isSafeJsonGraph(result)) return false;

  const ok = readOwnDataProperty(result, "ok");
  const build = readOwnDataProperty(result, "build");
  const schemaVersion = readOwnDataProperty(result, "schemaVersion");
  const snapshot = readOwnDataProperty(result, "snapshot");
  const tenantId = readOwnDataProperty(result, "tenantId");
  const generatedAt = readOwnDataProperty(result, "generatedAt");
  const collectorCount = readOwnDataProperty(result, "collectorCount");
  const collectedCount = readOwnDataProperty(result, "collectedCount");
  const blockedCount = readOwnDataProperty(result, "blockedCount");
  const failedCount = readOwnDataProperty(result, "failedCount");
  const selectedCollectors = readOwnDataProperty(result, "selectedCollectors");
  const collectors = readOwnDataProperty(result, "collectors");

  if (![
    ok, build, schemaVersion, snapshot, tenantId, generatedAt,
    collectorCount, collectedCount, blockedCount, failedCount,
    selectedCollectors, collectors,
  ].every((read) => read.ok && read.present)) return false;

  if (ok.value !== true) return false;
  if (build.value !== KAIROS_BUSINESS_COLLECTOR_BUILD) return false;
  if (schemaVersion.value !== 1) return false;
  if (!isPlainObject(snapshot.value)) return false;
  const snapshotOk = readOwnDataProperty(snapshot.value, "ok");
  if (!snapshotOk.ok || !snapshotOk.present || snapshotOk.value !== true) return false;
  if (!isValidIdentifier(tenantId.value)) return false;
  if (!isCanonicalTimestamp(generatedAt.value)) return false;

  const counts = [
    collectorCount.value,
    collectedCount.value,
    blockedCount.value,
    failedCount.value,
  ];
  if (!counts.every(Number.isInteger)) return false;
  if (collectorCount.value < 0 || collectorCount.value > 8) return false;
  if (
    collectedCount.value < 0
    || blockedCount.value < 0
    || failedCount.value < 0
    || collectedCount.value > collectorCount.value
    || blockedCount.value > collectorCount.value
    || failedCount.value > collectorCount.value
  ) return false;
  if (
    collectedCount.value + blockedCount.value + failedCount.value
    !== collectorCount.value
  ) return false;

  if (!isCanonicalArray(selectedCollectors.value)) return false;
  if (!isCanonicalArray(collectors.value)) return false;
  if (selectedCollectors.value.length !== collectorCount.value) return false;
  if (collectors.value.length !== collectorCount.value) return false;
  return true;
}

function isSafeJsonGraph(value, ancestors = new WeakSet()) {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  if (!isPlainObject(value) && !Array.isArray(value)) return false;

  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    if (!isCanonicalArray(value, keys)) {
      ancestors.delete(value);
      return false;
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = safeDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, "value")) {
        ancestors.delete(value);
        return false;
      }
      if (!isSafeJsonGraph(descriptor.value, ancestors)) {
        ancestors.delete(value);
        return false;
      }
    }
    ancestors.delete(value);
    return true;
  }

  for (const key of keys) {
    if (typeof key !== "string") {
      ancestors.delete(value);
      return false;
    }
    const descriptor = safeDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      ancestors.delete(value);
      return false;
    }
    if (!isSafeJsonGraph(descriptor.value, ancestors)) {
      ancestors.delete(value);
      return false;
    }
  }
  ancestors.delete(value);
  return true;
}

function isCanonicalArray(value, existingKeys = null) {
  if (!Array.isArray(value)) return false;
  let keys = existingKeys;
  if (!keys) {
    try {
      keys = Reflect.ownKeys(value);
    } catch {
      return false;
    }
  }
  if (keys.length !== value.length + 1) return false;
  if (!keys.includes("length")) return false;
  const lengthDescriptor = safeDescriptor(value, "length");
  if (!lengthDescriptor || lengthDescriptor.value !== value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!keys.includes(String(index))) return false;
    const descriptor = safeDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      return false;
    }
  }
  return keys.every((key) => key === "length" || /^\d+$/u.test(String(key)));
}

function isValidIdentifier(value) {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= MAX_IDENTIFIER_LENGTH
    && value === value.trim()
    && IDENTIFIER_PATTERN.test(value);
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isSafeErrorCode(value) {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 128
    && value === value.trim()
    && ERROR_CODE_PATTERN.test(value);
}

function isSafeErrorField(value) {
  return value === null || (
    typeof value === "string"
    && value.length >= 1
    && value.length <= MAX_ERROR_FIELD_LENGTH
    && value === value.trim()
    && ERROR_FIELD_PATTERN.test(value)
  );
}

function isSafeErrorIndex(value) {
  return value === null || (
    Number.isInteger(value)
    && value >= 0
    && value <= MAX_ERROR_INDEX
  );
}

function isJsonContentType(value) {
  if (typeof value !== "string") return false;
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json";
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  let prototype;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    return false;
  }
  return prototype === Object.prototype || prototype === null;
}

function readOwnDataProperty(object, key) {
  if (!isPlainObject(object)) return { ok: false, present: false };
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

function readRequestProperty(request, key) {
  if (request === null || (typeof request !== "object" && typeof request !== "function")) {
    throw new TypeError("invalid request");
  }
  return request[key];
}

function cloneParsedJsonObject(value) {
  const clone = {};
  for (const key of Object.keys(value)) clone[key] = value[key];
  return clone;
}

function upgradedHeaders(source, collection = false) {
  const headers = new Headers(source);
  headers.set("X-Kairos-Autonomy-API-Build", KAIROS_AUTONOMY_API_BUILD);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  if (collection) {
    headers.set(
      "X-Kairos-Business-Collector-Build",
      KAIROS_BUSINESS_COLLECTOR_BUILD,
    );
  }
  return headers;
}

function apiError(status, code, message, extraHeaders = {}) {
  return jsonResponse({
    ok: false,
    build: KAIROS_AUTONOMY_API_BUILD,
    error: { code, message },
  }, status, {
    ...extraHeaders,
    "X-Kairos-Autonomy-API-Build": KAIROS_AUTONOMY_API_BUILD,
  });
}

function collectionError(status, code, message, extraHeaders = {}) {
  return collectionJson({
    ok: false,
    build: KAIROS_AUTONOMY_API_BUILD,
    error: { code, message },
  }, status, extraHeaders);
}

function collectionJson(value, status = 200, extraHeaders = {}) {
  return jsonResponse(value, status, {
    ...extraHeaders,
    "X-Kairos-Autonomy-API-Build": KAIROS_AUTONOMY_API_BUILD,
    "X-Kairos-Business-Collector-Build": KAIROS_BUSINESS_COLLECTOR_BUILD,
  });
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
