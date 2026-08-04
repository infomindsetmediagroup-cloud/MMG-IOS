const BUILD = "kairos-manuscript-deadlock-recovery-20260804-2";
const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_DEADLOCK_RECOVERY__";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_ATTEMPTS = 2;
const WATCHDOG_MS = 12_000;
const CRITICAL_GET_ROUTE = /^\/api\/production-registry\/manuscripts\/[^/]+\/(?:auto-pipeline(?:\/(?:run|shopify-draft|shopify-publish))?|setup(?:\/cover)?|editorial(?:\/(?:versions(?:\/[a-z0-9-]{8,})?|review|decision|finalize))?|source\/text|deliverables\/(?:build|zip))$/i;

if (!globalThis[GLOBAL_KEY]) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const seen = new Map();
  const state = {
    build: BUILD,
    requests: 0,
    timedOut: 0,
    recoveredEditorial: 0,
    recoveredPipeline: 0,
    lastError: "",
  };

  globalThis.fetch = async function kairosManuscriptDeadlockFetch(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const method = String(init.method || request?.method || "GET").toUpperCase();
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : request?.url || String(input),
      globalThis.location?.href || "https://kairos.invalid/",
    );

    if (method !== "GET" || !CRITICAL_GET_ROUTE.test(url.pathname)) {
      return nativeFetch(input, init);
    }

    state.requests += 1;
    return boundedFetch(input, init, url.pathname);
  };

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    snapshot() {
      return {
        ...state,
        watching: seen.size,
        installedFetch: globalThis.fetch?.name === "kairosManuscriptDeadlockFetch",
      };
    },
    recoverNow() {
      scan();
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptDeadlockRecovery = api;

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const editorial = target?.closest?.("[data-kairos-recover-editorial]");
    const pipeline = target?.closest?.("[data-kairos-recover-pipeline]");

    if (editorial) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      document.querySelector("#manuscript-editorial-workbench")?.remove();
      seen.delete("editorial");
      void globalThis.KairosEditorialWorkbenchController?.enhance?.();
      return;
    }

    if (pipeline) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      seen.delete("pipeline");
      void globalThis.KairosManuscriptPipelineOrchestrator?.refresh?.();
    }
  }, true);

  window.addEventListener("kairos:production:state-changed", resetTransientWatch);
  window.addEventListener("kairos:manuscript:restore", resetTransientWatch);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("focus", schedule);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule();
  });

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  schedule();

  async function boundedFetch(input, init, pathname) {
    let lastError = null;
    const attempts = Number(globalThis.__KAIROS_MANUSCRIPT_DEADLOCK_ATTEMPTS__ || DEFAULT_ATTEMPTS);
    const timeoutMs = Number(globalThis.__KAIROS_MANUSCRIPT_DEADLOCK_TIMEOUT_MS__ || DEFAULT_TIMEOUT_MS);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const parentSignal = init.signal;
      const relayAbort = () => controller?.abort(parentSignal?.reason);
      if (parentSignal?.aborted) relayAbort();
      else parentSignal?.addEventListener?.("abort", relayAbort, { once: true });
      const timer = setTimeout(() => controller?.abort(), timeoutMs);

      try {
        const response = await nativeFetch(input, {
          ...init,
          signal: controller?.signal || init.signal,
          headers: withHeader(init.headers, "X-Kairos-Deadlock-Recovery", BUILD),
        });
        clearTimeout(timer);
        parentSignal?.removeEventListener?.("abort", relayAbort);
        return response;
      } catch (error) {
        clearTimeout(timer);
        parentSignal?.removeEventListener?.("abort", relayAbort);
        lastError = error;
        if (attempt < attempts) await wait(250 * attempt);
      }
    }

    state.timedOut += 1;
    state.lastError = lastError?.message || `Request timed out: ${pathname}`;
    return new Response(JSON.stringify({
      status: "timeout",
      error: {
        code: "KAIROS_MANUSCRIPT_STATE_TIMEOUT",
        message: "Kairos could not load the saved manuscript state fast enough. Retry the state check.",
      },
      retryable: true,
      path: pathname,
      build: BUILD,
    }), {
      status: 504,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "2",
        "X-Kairos-Manuscript-Deadlock-Recovery": BUILD,
      },
    });
  }

  function withHeader(headers, key, value) {
    const next = new Headers(headers || {});
    next.set(key, value);
    return next;
  }

  function schedule() {
    if (schedule.pending) return;
    schedule.pending = true;
    queueMicrotask(() => {
      schedule.pending = false;
      scan();
    });
  }

  function scan() {
    watch(
      "editorial",
      "#manuscript-editorial-workbench",
      /Loading Editorial Workbench/i,
      recoverEditorial,
    );
    watch(
      "pipeline",
      "#manuscript-auto-pipeline",
      /Checking the saved production state|Loading production package|Checking production state/i,
      recoverPipeline,
    );
  }

  function watch(key, selector, busyPattern, recover) {
    const element = document.querySelector(selector);
    if (!element) {
      seen.delete(key);
      return;
    }
    const text = element.textContent || "";
    if (!busyPattern.test(text)) {
      seen.delete(key);
      return;
    }
    const firstSeen = seen.get(key) || Date.now();
    seen.set(key, firstSeen);
    if (Date.now() - firstSeen < WATCHDOG_MS) {
      setTimeout(schedule, 500);
      return;
    }
    recover();
  }

  function recoverEditorial() {
    const section = document.querySelector("#manuscript-editorial-workbench");
    if (!section || section.dataset.kairosDeadlockRecovered === BUILD) return;
    section.dataset.kairosDeadlockRecovered = BUILD;
    state.recoveredEditorial += 1;
    section.removeAttribute("aria-busy");
    section.innerHTML = `
      <p class="eyebrow">Editorial production</p>
      <h3>Editorial Workbench needs attention</h3>
      <p class="manuscript-error">Kairos stopped a stalled editorial-state load. The saved manuscript was not discarded.</p>
      <button type="button" class="secondary" data-kairos-recover-editorial>Retry Editorial Workbench</button>
    `;
  }

  function recoverPipeline() {
    const section = document.querySelector("#manuscript-auto-pipeline");
    if (!section || section.dataset.kairosDeadlockRecovered === BUILD) return;
    section.dataset.kairosDeadlockRecovered = BUILD;
    state.recoveredPipeline += 1;
    section.removeAttribute("aria-busy");
    section.innerHTML = `
      <p class="eyebrow">Production package</p>
      <h3>Production state needs attention</h3>
      <p class="manuscript-error">Kairos stopped a stalled production-state check. Retry to read the saved package or continue manufacturing.</p>
      <button type="button" class="secondary" data-kairos-recover-pipeline>Retry Production State</button>
    `;
  }

  function resetTransientWatch() {
    seen.delete("editorial");
    seen.delete("pipeline");
    schedule();
  }

  function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }
}
