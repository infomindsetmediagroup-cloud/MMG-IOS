(() => {
  const BUILD = "kairos-manuscript-registry-bridge-20260804-4-restored-source-cache";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_REGISTRY_BRIDGE__";
  const PENDING_KEY = "kairos.manuscript.registry-sync.pending.v1";
  const PROJECT_ROUTE = /^\/api\/production-registry\/projects\/([^/]+)$/;
  const SOURCE_TEXT_ROUTE = /^\/api\/production-registry\/manuscripts\/([^/]+)\/source\/text$/;
  const EDITORIAL_STATE_ROUTE = /^\/api\/production-registry\/manuscripts\/[^/]+\/editorial$/;
  const RETRY_DELAYS_MS = [1500, 5000, 15000, 30000];
  const scriptBase = document.currentScript?.src || new URL(
    "./scripts/manuscript-registry-bridge.js",
    document.baseURI,
  ).href;
  const stateFetchURL = new URL(
    "./kairos-state-fetch-install.js?v=kairos-state-fetch-install-20260804-3-editorial-body-deadline",
    scriptBase,
  ).href;

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptRegistryBridge = globalThis[GLOBAL_KEY];
    return;
  }

  const nativeFetch = globalThis.fetch.bind(globalThis);
  let bridgeFetch = null;
  let restoredSource = null;
  const state = {
    pending: readPending(),
    retryTimer: 0,
    attempts: 0,
    lastStatus: 0,
    lastError: "",
    syncedAt: "",
    sourceCacheHits: 0,
    restoredProjectId: "",
    restoredCharacters: 0,
    stateFetchError: "",
  };

  const stateFetchReady = Promise.resolve()
    .then(() => import(stateFetchURL))
    .then(() => {
      state.stateFetchError = "";
      return { status: "ready", build: BUILD };
    })
    .catch(error => {
      state.stateFetchError = error?.message || String(error);
      console.warn("[kairos-manuscript-registry-bridge] bounded state transport could not install", {
        build: BUILD,
        message: state.stateFetchError,
      });
      return { status: "deferred", error: state.stateFetchError, build: BUILD };
    });

  globalThis.__KAIROS_MANUSCRIPT_STATE_FETCH_READY__ = stateFetchReady;

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    flush: flushPending,
    stateFetchReady: () => stateFetchReady,
    captureRestoredSource,
    getRestoredSource(projectId = activeProjectId()) {
      if (!restoredSource?.manuscript) return null;
      if (projectId && restoredSource.projectId !== projectId) return null;
      return restoredSource;
    },
    snapshot() {
      return {
        build: BUILD,
        pending: Boolean(state.pending),
        projectId: state.pending?.projectId || null,
        attempts: state.attempts,
        lastStatus: state.lastStatus,
        lastError: state.lastError,
        syncedAt: state.syncedAt || null,
        sourceCacheHits: state.sourceCacheHits,
        restoredProjectId: state.restoredProjectId || null,
        restoredCharacters: state.restoredCharacters,
        stateFetchInstalled: Boolean(
          globalThis.__KAIROS_STATE_FETCH_INSTALLED__ ||
          globalThis.__kairosStateFetchInstalled
        ),
        stateFetchError: state.stateFetchError || null,
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptRegistryBridge = api;

  captureRestoredSource(globalThis.__KAIROS_MANUSCRIPT_RESTORED_SOURCE__);

  bridgeFetch = async function kairosRegistryFetch(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const method = String(init.method || request?.method || "GET").toUpperCase();
    const url = new URL(request?.url || String(input), location.href);

    if (
      method === "GET" &&
      EDITORIAL_STATE_ROUTE.test(url.pathname) &&
      globalThis.fetch === bridgeFetch
    ) {
      await stateFetchReady;
      if (globalThis.fetch !== bridgeFetch) {
        return globalThis.fetch(input, init);
      }
    }

    const sourceMatch = method === "GET" ? url.pathname.match(SOURCE_TEXT_ROUTE) : null;
    if (
      sourceMatch &&
      restoredSource?.projectId === decodeURIComponent(sourceMatch[1]) &&
      restoredSource.manuscript
    ) {
      state.sourceCacheHits += 1;
      return new Response(JSON.stringify({
        status: "ready",
        manuscript: restoredSource.manuscript,
        source: restoredSource.source || null,
        project: restoredSource.project || null,
        cache: "dedicated-restore",
        build: BUILD,
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Kairos-Manuscript-Source-Cache": BUILD,
          "X-Kairos-Manuscript-Project": restoredSource.projectId,
        },
      });
    }

    const match = method === "PATCH" ? url.pathname.match(PROJECT_ROUTE) : null;
    if (!match) return nativeFetch(input, init);

    const projectId = decodeURIComponent(match[1]);
    const payload = await readPayload(request, init);
    const project = normalizeProject(projectId, payload);
    const response = await upsert(project, init.headers || request?.headers);

    if (response.ok) {
      clearPending();
      announce("registry-updated", projectId);
      return response;
    }

    await rememberPending(project, response.status);
    scheduleRetry();

    return new Response(JSON.stringify({
      status: "accepted-for-retry",
      pending: true,
      projectId,
      message: "The production intake is saved. Kairos queued the registry synchronization for automatic retry.",
      build: BUILD,
    }), {
      status: 202,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Kairos-Registry-Bridge": BUILD,
        "X-Kairos-Registry-Sync": "queued",
      },
    });
  };

  globalThis.fetch = bridgeFetch;

  window.addEventListener("kairos:manuscript:restore", event => {
    captureRestoredSource(event.detail || {});
  });

  window.addEventListener("online", () => void flushPending());
  window.addEventListener("focus", () => void flushPending());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushPending();
  });

  if (state.pending) scheduleRetry(250);

  function captureRestoredSource(detail) {
    if (!detail || typeof detail !== "object") return null;
    const projectId = String(
      detail.projectId ||
      detail.project?.projectId ||
      detail.source?.projectId ||
      activeProjectId() ||
      "",
    );
    const manuscript = String(detail.manuscript || "");
    if (!projectId || !manuscript) return null;

    restoredSource = {
      projectId,
      manuscript,
      source: detail.source || null,
      project: detail.project || null,
      capturedAt: detail.capturedAt || new Date().toISOString(),
      build: BUILD,
    };
    state.restoredProjectId = projectId;
    state.restoredCharacters = manuscript.length;
    globalThis.__KAIROS_MANUSCRIPT_RESTORED_SOURCE__ = restoredSource;
    return restoredSource;
  }

  async function upsert(project, inheritedHeaders) {
    const headers = new Headers(inheritedHeaders || {});
    headers.set("Content-Type", "application/json");
    headers.set("X-MMG-Client-Build", BUILD);
    headers.set("X-Kairos-Registry-Owner", "manuscript-studio");

    try {
      return await nativeFetch("/api/production-registry/projects", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers,
        body: JSON.stringify(project),
      });
    } catch (error) {
      state.lastError = error?.message || String(error);
      return new Response(JSON.stringify({
        error: {
          code: "REGISTRY_UPSERT_NETWORK_FAILED",
          message: state.lastError,
        },
      }), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
  }

  async function flushPending() {
    if (!state.pending) return { status: "idle", build: BUILD };
    const pending = state.pending;
    state.attempts += 1;

    const response = await upsert(pending.project, null);
    state.lastStatus = response.status;

    if (response.ok) {
      const projectId = pending.projectId;
      clearPending();
      state.syncedAt = new Date().toISOString();
      state.lastError = "";
      announce("registry-retry-completed", projectId);
      return { status: "synced", projectId, build: BUILD };
    }

    const body = await response.clone().json().catch(() => ({}));
    state.lastError = body?.error?.message || `Registry synchronization returned HTTP ${response.status}.`;
    persistPending({
      ...pending,
      attempts: Number(pending.attempts || 0) + 1,
      lastStatus: response.status,
      lastError: state.lastError,
      updatedAt: new Date().toISOString(),
    });
    scheduleRetry();
    return { status: "pending", projectId: pending.projectId, build: BUILD };
  }

  async function rememberPending(project, status) {
    const message = `Registry synchronization returned HTTP ${status}.`;
    state.lastStatus = status;
    state.lastError = message;
    persistPending({
      projectId: project.projectId,
      project,
      attempts: 0,
      lastStatus: status,
      lastError: message,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  function normalizeProject(projectId, payload) {
    return {
      projectId,
      projectType: "manuscript-studio",
      title: String(payload?.title || "New Manuscript Project"),
      status: String(payload?.status || "production_intake"),
      stage: String(payload?.stage || "project_setup"),
      progress: Number(payload?.progress || 25),
      activeWorkspace: "manuscript-studio",
      sourceProjectId: payload?.sourceProjectId || null,
      summary: String(payload?.summary || "Manuscript accepted into production intake."),
      nextAction: String(payload?.nextAction || "Continue project setup."),
      checkpoints: Array.isArray(payload?.checkpoints) ? payload.checkpoints : [],
    };
  }

  async function readPayload(request, init) {
    if (typeof init.body === "string") {
      try { return JSON.parse(init.body); } catch { return {}; }
    }
    if (request) {
      try { return await request.clone().json(); } catch { return {}; }
    }
    return {};
  }

  function scheduleRetry(delayOverride) {
    if (!state.pending || state.retryTimer) return;
    const attempt = Math.min(Number(state.pending.attempts || 0), RETRY_DELAYS_MS.length - 1);
    const delay = Number.isFinite(delayOverride) ? delayOverride : RETRY_DELAYS_MS[attempt];
    state.retryTimer = window.setTimeout(() => {
      state.retryTimer = 0;
      void flushPending();
    }, delay);
  }

  function persistPending(value) {
    state.pending = value;
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(value)); } catch {}
  }

  function clearPending() {
    state.pending = null;
    state.attempts = 0;
    state.lastStatus = 0;
    if (state.retryTimer) clearTimeout(state.retryTimer);
    state.retryTimer = 0;
    try { sessionStorage.removeItem(PENDING_KEY); } catch {}
  }

  function readPending() {
    try {
      const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
      return value && value.projectId && value.project ? value : null;
    } catch {
      return null;
    }
  }

  function activeProjectId() {
    try {
      const active = JSON.parse(sessionStorage.getItem("kairos.production.active-workspace") || "null");
      return active?.workspace === "manuscript-studio" ? active.projectId || null : null;
    } catch {
      return null;
    }
  }

  function announce(reason, projectId) {
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed", {
      detail: {
        reason,
        projectId,
        workspace: "manuscript-studio",
        build: BUILD,
      },
    }));
    window.KairosProductionWorkspace?.refresh?.(reason);
  }
})();
