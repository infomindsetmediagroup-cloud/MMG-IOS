import {
  requestJSONWithRetry,
} from "./kairos-state-fetch.js?v=kairos-state-fetch-20260731-2-buffered";

export const KAIROS_STATE_FETCH_INSTALL_BUILD =
  "kairos-state-fetch-install-20260804-4-deadlock-recovery";

const nativeFetch = globalThis.fetch.bind(globalThis);
const STATE_ROUTE = /^\/api\/production-registry\/manuscripts\/[^/]+\/(?:auto-pipeline(?:\/(?:run|shopify-draft|shopify-publish))?|setup(?:\/cover)?|editorial(?:\/(?:versions(?:\/[a-z0-9-]{8,})?|review|decision|finalize))?|source\/text|deliverables\/(?:build|zip))$/i;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_ATTEMPTS = 3;

if (!globalThis.__kairosStateFetchInstalled) {
  globalThis.__kairosStateFetchInstalled = true;
  globalThis.__KAIROS_STATE_FETCH_INSTALLED__ = true;
  globalThis.fetch = async function kairosBoundedFetch(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const method = String(init.method || request?.method || "GET").toUpperCase();
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
      globalThis.location?.href || "https://kairos.invalid/",
    );

    if (method !== "GET" || !STATE_ROUTE.test(url.pathname)) {
      return nativeFetch(input, init);
    }

    const result = await requestJSONWithRetry(input, init, {
      signal: init.signal,
      timeoutMs: Number(globalThis.__KAIROS_STATE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
      attempts: Number(globalThis.__KAIROS_STATE_ATTEMPTS || DEFAULT_ATTEMPTS),
      fetchImpl: nativeFetch,
      onAttempt({ attempt, attempts }) {
        globalThis.dispatchEvent?.(new CustomEvent("kairos:production:state-attempt", {
          detail: { attempt, attempts, url: url.pathname },
        }));
      },
    });

    return result.response;
  };
} else {
  globalThis.__KAIROS_STATE_FETCH_INSTALLED__ = true;
}

function rewriteStateCheckingCopy() {
  const section = document.querySelector("#manuscript-auto-pipeline");
  if (!section) return;
  const heading = section.querySelector("h3");
  if (!heading || !/checking the saved production state/i.test(heading.textContent || "")) return;

  const eyebrow = section.querySelector(".eyebrow");
  if (eyebrow) eyebrow.textContent = "Checking production state";

  const progress = section.querySelector(".manuscript-progress");
  if (progress) {
    progress.textContent =
      "Kairos is checking the saved package, project setup, editorial approval, and preserved source. This request is bounded and will expose a retry if the registry does not answer.";
  }
}

window.addEventListener("kairos:production:state-attempt", event => {
  const detail = event.detail || {};
  const section = document.querySelector("#manuscript-auto-pipeline");
  const heading = section?.querySelector("h3");
  if (heading && /checking the saved production state/i.test(heading.textContent || "")) {
    heading.textContent = `Checking the saved production state… attempt ${detail.attempt} of ${detail.attempts}`;
  }
  rewriteStateCheckingCopy();
});

new MutationObserver(rewriteStateCheckingCopy).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

rewriteStateCheckingCopy();
