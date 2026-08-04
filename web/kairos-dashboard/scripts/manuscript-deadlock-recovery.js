const BUILD = "kairos-manuscript-deadlock-recovery-20260804-3-editorial-source-recovery";
const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_DEADLOCK_RECOVERY__";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_ATTEMPTS = 2;
const WATCHDOG_MS = 12_000;
const SOURCE_RECOVERY_TIMEOUT_MS = 8_000;
const DRAFT_KEY = "kairos.manuscript-studio.recoverable-draft.v1";
const ACTIVE_KEY = "kairos.production.active-workspace";
const CRITICAL_GET_ROUTE = /^\/api\/production-registry\/manuscripts\/[^/]+\/(?:auto-pipeline(?:\/(?:run|shopify-draft|shopify-publish))?|setup(?:\/cover)?|editorial(?:\/(?:versions(?:\/[a-z0-9-]{8,})?|review|decision|finalize))?|source\/text|deliverables\/(?:build|zip))$/i;
const SOURCE_TEXT_ROUTE = /^\/api\/production-registry\/manuscripts\/([^/]+)\/source\/text$/i;

if (!globalThis[GLOBAL_KEY]) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const seen = new Map();
  const state = {
    build: BUILD,
    requests: 0,
    timedOut: 0,
    recoveredEditorial: 0,
    recoveredPipeline: 0,
    recoveredSourceFromBrowser: 0,
    recoveredSourceFromEditorial: 0,
    lastSourceRecovery: "",
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

        if (SOURCE_TEXT_ROUTE.test(pathname)) {
          const recovered = await recoverMissingSource(response, pathname);
          if (recovered) return recovered;
        }
        return response;
      } catch (error) {
        clearTimeout(timer);
        parentSignal?.removeEventListener?.("abort", relayAbort);
        lastError = error;
        if (SOURCE_TEXT_ROUTE.test(pathname)) {
          const recovered = await recoverMissingSource(null, pathname);
          if (recovered) return recovered;
        }
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

  async function recoverMissingSource(response, pathname) {
    const match = pathname.match(SOURCE_TEXT_ROUTE);
    if (!match) return null;

    if (response?.ok) {
      const body = await response.clone().json().catch(() => ({}));
      if (usableManuscript(body?.manuscript)) return null;
    }

    const requestedId = decodeURIComponent(match[1]);
    const browser = browserRetainedSource(requestedId);
    if (browser) {
      state.recoveredSourceFromBrowser += 1;
      state.lastSourceRecovery = "browser-retained-source";
      return sourceResponse(requestedId, browser.manuscript, browser.source, {
        authority: "browser-retained-source",
        recoveredFrom: browser.recoveredFrom,
      });
    }

    const editorial = await editorialRetainedSource(requestedId);
    if (editorial) {
      state.recoveredSourceFromEditorial += 1;
      state.lastSourceRecovery = "checksum-verified-editorial-version";
      return sourceResponse(editorial.projectId || requestedId, editorial.manuscript, editorial.source, {
        authority: "checksum-verified-editorial-version",
        recoveredFrom: "durable-editorial-version",
        versionId: editorial.versionId,
        checksum: editorial.checksum || null,
      });
    }

    return null;
  }

  function browserRetainedSource(requestedId) {
    const identity = identitySnapshot();
    const aliases = new Set(candidateProjectIds(requestedId));
    const globalSource = globalThis.__KAIROS_MANUSCRIPT_RESTORED_SOURCE__;
    const candidates = [
      { value: globalSource, recoveredFrom: "global-restored-source" },
      { value: readJSON(sessionStorage, DRAFT_KEY), recoveredFrom: "session-draft" },
      { value: readJSON(localStorage, DRAFT_KEY), recoveredFrom: "local-draft" },
    ];

    for (const candidate of candidates) {
      const value = candidate.value;
      if (!usableManuscript(value?.manuscript)) continue;
      const ids = unique([
        value?.projectId,
        value?.sourceProjectId,
        value?.manuscriptProjectId,
        value?.identity?.canonicalProjectId,
        ...(Array.isArray(value?.identity?.aliases) ? value.identity.aliases : []),
      ]);
      if (ids.length && !ids.some(id => aliases.has(id))) continue;
      if (!ids.length && identity?.canonicalProjectId && !aliases.has(identity.canonicalProjectId)) continue;
      return {
        manuscript: String(value.manuscript),
        source: value.source || null,
        recoveredFrom: candidate.recoveredFrom,
      };
    }
    return null;
  }

  async function editorialRetainedSource(requestedId) {
    for (const projectId of candidateProjectIds(requestedId)) {
      const base = `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}`;
      const editorialBody = await nativeJSON(`${base}/editorial`).catch(() => null);
      const editorial = editorialBody?.editorial || editorialBody;
      if (!editorial || typeof editorial !== "object") continue;

      const versionId = firstId(
        editorial.finalVersionId,
        editorial.review?.versionId,
        editorial.currentVersionId,
        latestVersionId(editorial.versions),
      );
      if (!versionId) continue;

      const versionBody = await nativeJSON(
        `${base}/editorial/versions/${encodeURIComponent(versionId)}`,
      ).catch(() => null);
      const manuscript = String(versionBody?.manuscript || versionBody?.version?.manuscript || "");
      if (!usableManuscript(manuscript)) continue;

      const sourceBody = await nativeJSON(`${base}/source`).catch(() => null);
      return {
        projectId,
        versionId,
        checksum: versionBody?.checksum
          || versionBody?.version?.checksum
          || (Array.isArray(editorial.versions)
            ? editorial.versions.find(item => item?.versionId === versionId)?.checksum
            : null),
        manuscript,
        source: sourceBody?.source || {
          filename: `restored-editorial-${versionId}.txt`,
          name: `restored-editorial-${versionId}.txt`,
          authority: "checksum-verified-editorial-version",
        },
      };
    }
    return null;
  }

  async function nativeJSON(path) {
    const response = await withDeadline(nativeFetch(path, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "X-MMG-Client-Build": BUILD,
        "X-Kairos-Source-Recovery": "editorial-version-fallback",
      },
    }), SOURCE_RECOVERY_TIMEOUT_MS);
    if (!response?.ok) return null;
    return withDeadline(response.clone().json().catch(() => ({})), SOURCE_RECOVERY_TIMEOUT_MS);
  }

  function sourceResponse(projectId, manuscript, source, recovery) {
    return new Response(JSON.stringify({
      status: "ready",
      build: BUILD,
      projectId,
      manuscript: String(manuscript),
      source: source || null,
      manuscriptAuthority: recovery.authority,
      recovery: {
        ...recovery,
        build: BUILD,
        recoveredAt: new Date().toISOString(),
      },
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Kairos-Manuscript-Source-Recovery": BUILD,
        "X-Kairos-Manuscript-Authority": recovery.authority,
      },
    });
  }

  function candidateProjectIds(requestedId) {
    const identity = identitySnapshot();
    const active = readJSON(sessionStorage, ACTIVE_KEY);
    return unique([
      requestedId,
      identity?.canonicalProjectId,
      identity?.sourceProjectId,
      identity?.manuscriptProjectId,
      identity?.registryProjectId,
      identity?.publicProjectId,
      identity?.intakeId,
      ...(Array.isArray(identity?.aliases) ? identity.aliases : []),
      active?.projectId,
      active?.sourceProjectId,
      active?.manuscriptProjectId,
      active?.registryProjectId,
      active?.publicProjectId,
      active?.intakeId,
    ]);
  }

  function identitySnapshot() {
    return globalThis.KairosManuscriptProjectIdentity?.snapshot?.().identity
      || globalThis.KairosManuscriptProjectIdentity?.snapshot?.()
      || null;
  }

  function latestVersionId(versions) {
    if (!Array.isArray(versions) || !versions.length) return "";
    return [...versions]
      .sort((left, right) => {
        const rightTime = Date.parse(right?.createdAt || right?.updatedAt || 0) || 0;
        const leftTime = Date.parse(left?.createdAt || left?.updatedAt || 0) || 0;
        return rightTime - leftTime;
      })
      .map(item => firstId(item?.versionId, item?.id))
      .find(Boolean) || "";
  }

  function usableManuscript(value) {
    return typeof value === "string" && value.trim().length >= 50;
  }

  function withDeadline(promise, milliseconds) {
    let timer = 0;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Source recovery exceeded ${milliseconds} ms.`)),
          milliseconds,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  }

  function readJSON(storage, key) {
    try { return JSON.parse(storage?.getItem?.(key) || "null"); }
    catch { return null; }
  }

  function firstId(...values) {
    return values.map(value => String(value || "").trim()).find(Boolean) || "";
  }

  function unique(values) {
    return [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))];
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
