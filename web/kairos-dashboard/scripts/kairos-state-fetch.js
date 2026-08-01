export const KAIROS_STATE_FETCH_BUILD =
  "kairos-state-fetch-20260731-2-buffered";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 600;
const RETRYABLE_STATUSES = new Set([
  408, 425, 429, 500, 502, 503, 504,
]);

export class KairosStateTimeoutError extends Error {
  constructor(url, timeoutMs, attempts) {
    super(
      `Kairos could not complete ${url} within ` +
      `${timeoutMs} ms after ${attempts} attempt(s).`,
    );
    this.name = "KairosStateTimeoutError";
    this.code = "KAIROS_STATE_TIMEOUT";
    this.url = String(url);
    this.timeoutMs = timeoutMs;
    this.attempts = attempts;
  }
}

export async function requestJSONWithRetry(
  input,
  init = {},
  {
    signal: parentSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    attempts = DEFAULT_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    onAttempt = () => {},
    fetchImpl = globalThis.fetch.bind(globalThis),
  } = {},
) {
  const url = String(input);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (parentSignal?.aborted) throw abortReason(parentSignal);
    onAttempt({ attempt, attempts, url });

    const attemptState = createAttemptState(parentSignal, timeoutMs);

    try {
      const sourceResponse = await fetchImpl(input, {
        ...init,
        signal: attemptState.signal,
      });

      // Keep the same deadline active through body consumption. Fetch can
      // resolve after headers while response.text() remains pending.
      const text = await sourceResponse.text();
      const body = parseJSON(text, sourceResponse.status);
      const response = cloneBufferedResponse(sourceResponse, text);

      if (
        RETRYABLE_STATUSES.has(response.status) &&
        attempt < attempts
      ) {
        await wait(
          retryDelay(response, attempt, baseDelayMs),
          parentSignal,
        );
        continue;
      }

      return { response, body, attempt, attempts };
    } catch (error) {
      if (parentSignal?.aborted) throw abortReason(parentSignal);

      lastError = attemptState.timedOut
        ? new KairosStateTimeoutError(url, timeoutMs, attempt)
        : error;

      if (attempt >= attempts || !isRetryableError(lastError)) {
        throw lastError;
      }

      await wait(
        exponentialDelay(attempt, baseDelayMs),
        parentSignal,
      );
    } finally {
      attemptState.cleanup();
    }
  }

  throw lastError || new Error(`Kairos could not request ${url}.`);
}

function cloneBufferedResponse(response, text) {
  return new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

function createAttemptState(parentSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;

  const relayAbort = () => controller.abort();
  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener("abort", relayAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut;
    },
    cleanup() {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", relayAbort);
    },
  };
}

function parseJSON(text, status) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error(
      `Kairos returned an unreadable response (HTTP ${status}).`,
    );
    error.code = "KAIROS_RESPONSE_INVALID";
    throw error;
  }
}

function isRetryableError(error) {
  return (
    error?.code === "KAIROS_STATE_TIMEOUT" ||
    error?.name === "AbortError" ||
    error instanceof TypeError
  );
}

function retryDelay(response, attempt, baseDelayMs) {
  const value = response.headers.get("Retry-After");
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, 10_000);
  }
  return exponentialDelay(attempt, baseDelayMs);
}

function exponentialDelay(attempt, baseDelayMs) {
  const exponential = Math.min(
    baseDelayMs * (2 ** Math.max(0, attempt - 1)),
    4_000,
  );
  return exponential + Math.floor(Math.random() * 200);
}

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortReason(signal));

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);

    function onAbort() {
      clearTimeout(timer);
      reject(abortReason(signal));
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortReason(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The Kairos request was cancelled.", "AbortError");
}
