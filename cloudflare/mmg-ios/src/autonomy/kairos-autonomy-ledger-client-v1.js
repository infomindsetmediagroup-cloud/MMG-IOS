export const KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD = "kairos-autonomy-ledger-client-20260802-1";

const LEDGER_OBJECT_NAME = "kairos-autonomy-ledger-v1";
const INTERNAL_LEDGER_ORIGIN = "https://kairos-autonomy-ledger.internal";
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 128 * 1024;
const MIN_MAX_RESPONSE_BYTES = 1_024;
const MAX_MAX_RESPONSE_BYTES = 512 * 1024;

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
