const nativeFetch = window.fetch.bind(window);
const APPROVAL_TIMEOUT_MS = 30000;

window.fetch = async function guardedKairosFetch(input, init = {}) {
  const requestURL = typeof input === "string" ? input : input?.url || "";
  const isKairosExecution = /\/api\/(actions|kairos|theme-plan)(?:\?|$)/.test(requestURL);
  if (!isKairosExecution) return nativeFetch(input, init);

  const nextInit = { ...init };

  // Shopify approval packages can contain full theme files. The router used to
  // send the complete proposal and the mutation plan, duplicating a potentially
  // large payload and blocking mobile Safari during JSON serialization/upload.
  if (/\/api\/actions(?:\?|$)/.test(requestURL) && typeof nextInit.body === "string") {
    try {
      const payload = JSON.parse(nextInit.body);
      if (payload?.actionType === "shopify.theme.files.upsert" && payload.mutation) {
        delete payload.proposal;
        nextInit.body = JSON.stringify(payload);
      }
    } catch {
      // Leave non-JSON request bodies untouched; the API will return a bounded error.
    }
  }

  const controller = new AbortController();
  const upstreamSignal = nextInit.signal;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal) {
    if (upstreamSignal.aborted) abortFromUpstream();
    else upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
  }
  nextInit.signal = controller.signal;

  const timeout = setTimeout(() => {
    controller.abort(new DOMException("Kairos execution exceeded 30 seconds.", "TimeoutError"));
  }, APPROVAL_TIMEOUT_MS);

  try {
    return await nativeFetch(input, nextInit);
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener?.("abort", abortFromUpstream);
  }
};
