export const KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD =
  "kairos-autonomy-ledger-client-20260802-2-business-state-store";

const LEDGER_OBJECT_NAME = "kairos-autonomy-ledger-v1";
const INTERNAL_LEDGER_ORIGIN = "https://kairos-autonomy-ledger.internal";
const EXPECTED_BUSINESS_STATE_STORE_BUILD =
  "kairos-business-state-store-20260802-1";
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 128 * 1024;
const MIN_MAX_RESPONSE_BYTES = 1_024;
const MAX_MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_MAX_BUSINESS_SNAPSHOT_RESPONSE_BYTES = 512 * 1024;
const MIN_MAX_BUSINESS_SNAPSHOT_RESPONSE_BYTES = 64 * 1024;
const MAX_MAX_BUSINESS_SNAPSHOT_RESPONSE_BYTES = 1024 * 1024;
const MAX_BUSINESS_SNAPSHOT_REQUEST_BYTES = 64 * 1024;

export function createAutonomyLedgerClient(env = {}, options = {}) {
  const timeoutMs = boundedInteger(
    options.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  );
  const maxResponseBytes = boundedInteger(
    options.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES,
    MIN_MAX_RESPONSE_BYTES,
    MAX_MAX_RESPONSE_BYTES,
  );
  const maxBusinessSnapshotResponseBytes = boundedInteger(
    readSafeOwnDataOption(options, "maxBusinessSnapshotResponseBytes"),
    DEFAULT_MAX_BUSINESS_SNAPSHOT_RESPONSE_BYTES,
    MIN_MAX_BUSINESS_SNAPSHOT_RESPONSE_BYTES,
    MAX_MAX_BUSINESS_SNAPSHOT_RESPONSE_BYTES,
  );

  let stub = options.stub || null;
  if (!stub) {
    const binding = options.ledgerBinding || env?.KAIROS_AUTONOMY_LEDGER;
    if (!binding
      || typeof binding.idFromName !== "function"
      || typeof binding.get !== "function") {
      return unavailableClient("The autonomy ledger binding is unavailable or invalid.");
    }

    try {
      const id = binding.idFromName(LEDGER_OBJECT_NAME);
      stub = binding.get(id);
    } catch {
      return unavailableClient("The autonomy ledger object could not be resolved.");
    }
  }

  if (!stub || typeof stub.fetch !== "function") {
    return unavailableClient("The autonomy ledger stub is unavailable or invalid.");
  }

  const invoke = (path, payload) => callLedger(stub, path, payload, {
    timeoutMs,
    maxResponseBytes,
  });
  const invokeBusinessSnapshot = (path, payload) => callBusinessSnapshotLedger(
    stub,
    path,
    payload,
    {
      timeoutMs,
      maxResponseBytes: maxBusinessSnapshotResponseBytes,
    },
  );

  return Object.freeze({
    reserveEvent(event) {
      return invoke("/reserve", { event });
    },
    getEvent(tenantId, eventId) {
      return invoke("/get", { tenantId, eventId });
    },
    listRecentEvents(tenantId, limit = 50) {
      return invoke("/recent", { tenantId, limit });
    },
    acquireLease(input) {
      return invoke("/acquire-lease", input);
    },
    markCompleted(input) {
      return invoke("/complete", input);
    },
    markFailed(input) {
      return invoke("/fail", input);
    },
    markBlocked(input) {
      return invoke("/block", input);
    },
    storeBusinessSnapshot(businessState) {
      return invokeBusinessSnapshot("/business-snapshots/store", { businessState });
    },
    getBusinessSnapshot(tenantId, snapshotId) {
      return invokeBusinessSnapshot("/business-snapshots/get", { tenantId, snapshotId });
    },
    getLatestBusinessSnapshot(tenantId) {
      return invokeBusinessSnapshot("/business-snapshots/latest", { tenantId });
    },
    listRecentBusinessSnapshots(tenantId, limit = 10) {
      return invokeBusinessSnapshot("/business-snapshots/recent", { tenantId, limit });
    },
  });
}

async function callLedger(stub, path, payload, options) {
  const controller = new AbortController();
  let timer = null;
  const observedFetch = Promise.resolve()
    .then(() => stub.fetch(`${INTERNAL_LEDGER_ORIGIN}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
    }))
    .then(
      (response) => ({ status: "fulfilled", response }),
      () => ({ status: "rejected" }),
    );
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout" }), options.timeoutMs);
  });

  const settled = await Promise.race([observedFetch, deadline]);
  if (timer) clearTimeout(timer);

  if (settled.status === "timeout") {
    controller.abort("ledger_request_timeout");
    return failure("LEDGER_UNAVAILABLE", "The autonomy ledger request exceeded its deadline.");
  }
  if (settled.status === "rejected") {
    return failure("LEDGER_UNAVAILABLE", "The autonomy ledger could not be reached.");
  }

  const response = settled.response;
  if (!response || typeof response.status !== "number") {
    return failure("LEDGER_INVALID_RESPONSE", "The autonomy ledger returned an invalid response.");
  }

  try {
    const textResult = await readBoundedText(response, options.maxResponseBytes);
    if (!textResult.ok) return textResult;
    if (!textResult.text) {
      return failure("LEDGER_INVALID_RESPONSE", "The autonomy ledger returned an empty response.", response.status);
    }

    let data;
    try {
      data = JSON.parse(textResult.text);
    } catch {
      return failure("LEDGER_INVALID_RESPONSE", "The autonomy ledger returned malformed JSON.", response.status);
    }

    if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.ok !== "boolean") {
      return failure("LEDGER_INVALID_RESPONSE", "The autonomy ledger returned an invalid result object.", response.status);
    }

    return {
      ...data,
      statusCode: Number.isInteger(data.statusCode) ? data.statusCode : response.status,
    };
  } catch {
    return failure("LEDGER_INVALID_RESPONSE", "The autonomy ledger response could not be read.", response.status);
  }
}

async function callBusinessSnapshotLedger(stub, path, payload, options) {
  const serialized = serializeBusinessSnapshotRequest(payload);
  if (!serialized.ok) {
    return serialized.code === "LEDGER_REQUEST_TOO_LARGE"
      ? failure(
        "LEDGER_REQUEST_TOO_LARGE",
        "The business-state ledger request exceeds the permitted size.",
      )
      : failure(
        "LEDGER_INVALID_REQUEST",
        "The business-state ledger request is invalid.",
      );
  }

  const controller = new AbortController();
  let timer = null;
  const observedFetch = Promise.resolve()
    .then(() => stub.fetch(`${INTERNAL_LEDGER_ORIGIN}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: serialized.text,
      signal: controller.signal,
    }))
    .then(
      (response) => ({ status: "fulfilled", response }),
      () => ({ status: "rejected" }),
    );
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout" }), options.timeoutMs);
  });

  const settled = await Promise.race([observedFetch, deadline]);
  if (timer) clearTimeout(timer);

  if (settled.status === "timeout") {
    controller.abort("ledger_request_timeout");
    return failure("LEDGER_UNAVAILABLE", "The autonomy ledger request exceeded its deadline.");
  }
  if (settled.status === "rejected") {
    return failure("LEDGER_UNAVAILABLE", "The autonomy ledger could not be reached.");
  }

  const response = settled.response;
  if (!response || typeof response.status !== "number") {
    return failure("LEDGER_INVALID_RESPONSE", "The autonomy ledger returned an invalid response.");
  }

  let buildHeader;
  try {
    buildHeader = response.headers?.get("X-Kairos-Business-State-Store-Build");
  } catch {
    buildHeader = null;
  }
  if (buildHeader !== EXPECTED_BUSINESS_STATE_STORE_BUILD) {
    return failure(
      "LEDGER_INVALID_RESPONSE",
      "The business-state ledger returned an incompatible response.",
      response.status,
    );
  }

  try {
    const textResult = await readBoundedText(response, options.maxResponseBytes);
    if (!textResult.ok) return textResult;
    if (!textResult.text) {
      return failure("LEDGER_INVALID_RESPONSE", "The autonomy ledger returned an empty response.", response.status);
    }

    let data;
    try {
      data = JSON.parse(textResult.text);
    } catch {
      return failure("LEDGER_INVALID_RESPONSE", "The autonomy ledger returned malformed JSON.", response.status);
    }

    if (!isValidBusinessSnapshotResponse(data)) {
      return failure("LEDGER_INVALID_RESPONSE", "The autonomy ledger returned an invalid result object.", response.status);
    }

    return {
      ...data,
      statusCode: Number.isInteger(data.statusCode) ? data.statusCode : response.status,
    };
  } catch {
    return failure("LEDGER_INVALID_RESPONSE", "The autonomy ledger response could not be read.", response.status);
  }
}

async function readBoundedText(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    const encoded = new TextEncoder().encode(text);
    if (encoded.byteLength > maxBytes) {
      return failure("LEDGER_INVALID_RESPONSE", "The autonomy ledger response exceeded the permitted size.", response.status);
    }
    return { ok: true, text };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      try {
        await reader.cancel("ledger_response_limit_reached");
      } catch {
        // Best-effort cancellation only.
      }
      return failure("LEDGER_INVALID_RESPONSE", "The autonomy ledger response exceeded the permitted size.", response.status);
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(combined) };
}

function serializeBusinessSnapshotRequest(payload) {
  const copied = copySafeJsonValue(payload, new WeakSet());
  if (!copied.ok) return { ok: false, code: "LEDGER_INVALID_REQUEST" };

  let text;
  try {
    text = JSON.stringify(copied.value);
  } catch {
    return { ok: false, code: "LEDGER_INVALID_REQUEST" };
  }

  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > MAX_BUSINESS_SNAPSHOT_REQUEST_BYTES) {
    return { ok: false, code: "LEDGER_REQUEST_TOO_LARGE" };
  }
  return { ok: true, text };
}

function copySafeJsonValue(value, ancestors) {
  if (value === null) return { ok: true, value: null };
  if (typeof value === "string" || typeof value === "boolean") {
    return { ok: true, value };
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false };
  }
  if (typeof value !== "object") return { ok: false };
  if (ancestors.has(value)) return { ok: false };

  const array = Array.isArray(value);
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
      const lengthDescriptor = safeOwnDescriptor(value, "length");
      if (
        !lengthDescriptor
        || !Object.hasOwn(lengthDescriptor, "value")
        || !Number.isInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0
        || keys.length !== lengthDescriptor.value + 1
        || keys.some((key) => typeof key !== "string")
      ) {
        return { ok: false };
      }

      const output = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const key = String(index);
        if (!keys.includes(key)) return { ok: false };
        const descriptor = safeOwnDescriptor(value, key);
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
      if (!keys.every((key) => key === "length" || /^\d+$/u.test(key))) {
        return { ok: false };
      }
      return { ok: true, value: output };
    }

    const output = Object.create(null);
    for (const key of keys) {
      if (typeof key !== "string") return { ok: false };
      const descriptor = safeOwnDescriptor(value, key);
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

function isValidBusinessSnapshotResponse(data) {
  if (!isPlainObject(data) || typeof data.ok !== "boolean") return false;
  if (Object.hasOwn(data, "disposition") && typeof data.disposition !== "string") {
    return false;
  }
  if (Object.hasOwn(data, "statusCode") && !Number.isInteger(data.statusCode)) {
    return false;
  }
  if (Object.hasOwn(data, "duplicate") && typeof data.duplicate !== "boolean") {
    return false;
  }
  if (Object.hasOwn(data, "record") && data.record !== null) {
    if (!isPlainObject(data.record) || !isSafeParsedJsonGraph(data.record)) return false;
  }
  if (Object.hasOwn(data, "records") && data.records !== null) {
    if (!isCanonicalParsedArray(data.records)) return false;
    for (const record of data.records) {
      if (!isPlainObject(record) || !isSafeParsedJsonGraph(record)) return false;
    }
  }
  return isSafeParsedJsonGraph(data);
}

function isSafeParsedJsonGraph(value, ancestors = new WeakSet()) {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;

  if (Array.isArray(value)) {
    if (!isCanonicalParsedArray(value)) return false;
    ancestors.add(value);
    for (let index = 0; index < value.length; index += 1) {
      if (!isSafeParsedJsonGraph(value[index], ancestors)) {
        ancestors.delete(value);
        return false;
      }
    }
    ancestors.delete(value);
    return true;
  }

  if (!isPlainObject(value)) return false;
  ancestors.add(value);
  for (const key of Object.keys(value)) {
    if (!isSafeParsedJsonGraph(value[key], ancestors)) {
      ancestors.delete(value);
      return false;
    }
  }
  ancestors.delete(value);
  return true;
}

function isCanonicalParsedArray(value) {
  if (!Array.isArray(value)) return false;
  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!keys.includes(String(index))) return false;
  }
  return keys.every((key) => typeof key === "string"
    && (key === "length" || /^\d+$/u.test(key)));
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function safeOwnDescriptor(value, key) {
  try {
    return Object.getOwnPropertyDescriptor(value, key) || null;
  } catch {
    return null;
  }
}

function readSafeOwnDataOption(options, key) {
  if (options === null || (typeof options !== "object" && typeof options !== "function")) {
    return undefined;
  }
  const descriptor = safeOwnDescriptor(options, key);
  return descriptor && Object.hasOwn(descriptor, "value")
    ? descriptor.value
    : undefined;
}

function unavailableClient(message) {
  const unavailable = async () => failure("LEDGER_UNAVAILABLE", message);
  return Object.freeze({
    reserveEvent: unavailable,
    getEvent: unavailable,
    listRecentEvents: unavailable,
    acquireLease: unavailable,
    markCompleted: unavailable,
    markFailed: unavailable,
    markBlocked: unavailable,
    storeBusinessSnapshot: unavailable,
    getBusinessSnapshot: unavailable,
    getLatestBusinessSnapshot: unavailable,
    listRecentBusinessSnapshots: unavailable,
  });
}

function failure(code, error, statusCode = null) {
  return {
    ok: false,
    code,
    disposition: "ledger_error",
    statusCode,
    record: null,
    records: null,
    duplicate: false,
    leaseToken: null,
    error,
  };
}

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(numeric)));
}
