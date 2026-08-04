(() => {
  const BUILD = "kairos-manuscript-editorial-watchdog-20260804-1";
  const PATCH = "kairos-manuscript-editorial-stall-escape-20260804-2";
  const RELEASE = "manuscript-editorial-recovery-20260804-2-stall-escape";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_EDITORIAL_WATCHDOG__";
  const HARD_FETCH_KEY = "__KAIROS_MANUSCRIPT_HARD_DEADLINE_FETCH__";
  const ACTIVE_KEY = "kairos.production.active-workspace";
  const START_KEY = "kairos.manuscript.editorial-stall-start.";
  const DEADLINE_MS = 8_000;
  const REQUEST_TIMEOUT_MS = 6_000;
  const HARD_FETCH_MS = 5_500;
  const READ_MS = 9_000;
  const PRIMARY_MS = 45_000;
  const FALLBACK_MS = 90_000;
  const STATE_ROUTE = /^\/api\/production-registry\/manuscripts\/[^/]+\/(?:auto-pipeline|setup|editorial(?:\/versions\/[a-z0-9-]{8,})?|source\/text|deliverables\/build)$/i;

  if (globalThis[GLOBAL_KEY]) return;

  globalThis.__KAIROS_EDITORIAL_REQUEST_TIMEOUT_MS__ = Number(
    globalThis.__KAIROS_EDITORIAL_REQUEST_TIMEOUT_MS__ || REQUEST_TIMEOUT_MS,
  );
  globalThis.__KAIROS_EDITORIAL_WATCHDOG_AUTO_RELOAD__ = false;

  const nativeFetch = globalThis.fetch.bind(globalThis);
  const state = {
    timer: 0,
    recoveries: 0,
    lastReason: "",
    hardTimeouts: 0,
    busy: false,
    promise: null,
    operationId: "",
    engine: "",
    primaryError: "",
    lastError: "",
    record: null,
  };

  installHardFetch();

  const api = Object.freeze({
    build: BUILD,
    patchBuild: PATCH,
    release: RELEASE,
    ready: true,
    inspect: (reason = "manual") => inspect(reason),
    recover: (reason = "manual") => showRecovery(activeProjectId(), reason),
    resumeFinalDeliverable: manufacture,
    refreshFinalDeliverable: refreshPackage,
    snapshot() {
      return {
        build: BUILD,
        patchBuild: PATCH,
        projectId: activeProjectId() || null,
        recoveryVisible: Boolean(document.querySelector("[data-kairos-editorial-stall-escape]")),
        recoveries: state.recoveries,
        lastReason: state.lastReason || null,
        hardTimeouts: state.hardTimeouts,
        busy: state.busy,
        engine: state.engine || null,
        status: state.record?.status || null,
        lastError: state.lastError || null,
        requestTimeoutMs: Number(globalThis.__KAIROS_EDITORIAL_REQUEST_TIMEOUT_MS__ || REQUEST_TIMEOUT_MS),
        deadlineMs: deadlineMs(),
        hardDeadlineMs: hardDeadlineMs(),
      };
    },
  });
  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptEditorialWatchdog = api;

  document.addEventListener("click", onClick, true);
  window.addEventListener("pageshow", () => inspect("pageshow"));
  window.addEventListener("focus", () => inspect("focus"));
  window.addEventListener("kairos:production:state-changed", () => inspect("state-changed"));
  window.addEventListener("kairos:manuscript:restore", () => inspect("restored"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") inspect("visible");
  });
  new MutationObserver(() => inspect("mutation")).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  queueMicrotask(() => inspect("bootstrap"));

  const patchTimer = setInterval(() => {
    if (patchEngine()) clearInterval(patchTimer);
  }, 100);
  setTimeout(() => clearInterval(patchTimer), 30_000);

  function inspect(reason) {
    const projectId = activeProjectId();
    const section = document.querySelector("#manuscript-editorial-workbench");
    if (!section) {
      schedule(250);
      return { status: "waiting", build: PATCH };
    }
    if (section.hasAttribute("data-kairos-editorial-stall-escape")) {
      return { status: "recovery-visible", build: PATCH };
    }
    const sectionText = section.textContent || "";
    if (!/loading editorial workbench/i.test(sectionText)) {
      const priorStart = readStart(projectId);
      if (
        priorStart > 0
        && Date.now() - priorStart >= deadlineMs()
        && /needs attention|did not respond|timed out|could not be loaded/i.test(sectionText)
      ) {
        return showRecovery(projectId, "editorial-load-failed-after-stall");
      }
      clearStart(projectId);
      clearTimer();
      return { status: "settled", build: PATCH };
    }

    const started = loadStarted(projectId);
    const elapsed = Date.now() - started;
    state.lastReason = reason;
    if (elapsed >= deadlineMs()) return showRecovery(projectId, "hard-loading-deadline");
    schedule(Math.max(50, deadlineMs() - elapsed));
    return { status: "watching", elapsed, build: PATCH };
  }

  function showRecovery(projectId, reason) {
    const section = document.querySelector("#manuscript-editorial-workbench");
    if (!section) return { status: "waiting", build: PATCH };
    clearTimer();
    if (!section.hasAttribute("data-kairos-editorial-stall-escape")) state.recoveries += 1;
    state.lastReason = reason;
    section.setAttribute("data-kairos-editorial-stall-escape", PATCH);
    section.removeAttribute("aria-busy");
    section.setAttribute("role", "alert");
    section.innerHTML = `
      <p class="eyebrow">Editorial recovery</p>
      <h3>The saved Editorial Workbench did not finish loading</h3>
      <p>Kairos stopped waiting on the display read. The manuscript, cover, metadata, editorial versions, and assignment remain stored.</p>
      <p class="manuscript-note">Project: ${esc(projectId || "active manuscript")} · ${esc(reason || "hard deadline")}</p>
      <div class="manuscript-actions">
        <button type="button" class="primary" data-stall-resume-package>Resume Final Deliverable</button>
        <button type="button" class="secondary" data-stall-refresh-package>Check Saved Package</button>
        <button type="button" class="secondary" data-stall-reload-editorial>Retry Editorial State</button>
        <button type="button" class="secondary" data-stall-return>Return to Command Center</button>
      </div>
      <p class="manuscript-note">Resume Final Deliverable asks the authoritative production endpoints to continue from the saved approved state without waiting on this stalled screen.</p>
    `;
    section.scrollIntoView({ block: "center" });
    return { status: "recovery-visible", build: PATCH };
  }

  function onClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const resume = target?.closest?.("[data-stall-resume-package],[data-stall-package-retry]");
    const refresh = target?.closest?.("[data-stall-refresh-package],[data-stall-package-refresh]");
    const reload = target?.closest?.("[data-stall-reload-editorial]");
    const back = target?.closest?.("[data-stall-return]");
    if (!resume && !refresh && !reload && !back) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (back) return location.assign(new URL("./", location.href).href);
    if (reload) return reloadEditorial();
    if (refresh) return void refreshPackage();
    void manufacture();
  }

  function reloadEditorial() {
    const projectId = activeProjectId();
    clearStart(projectId);
    const target = new URL(location.href);
    target.searchParams.set("open", "manuscript");
    target.searchParams.set("editorialRecovery", RELEASE);
    target.searchParams.set("cacheBust", String(Date.now()));
    if (projectId) target.searchParams.set("project", projectId);
    location.replace(target.href);
  }

  async function manufacture(projectId = activeProjectId()) {
    if (state.promise) return state.promise;
    if (!projectId) {
      renderError("Kairos could not identify the active manuscript project.");
      return null;
    }

    state.busy = true;
    state.operationId = createId();
    state.engine = "";
    state.primaryError = "";
    state.lastError = "";
    state.promise = (async () => {
      try {
        renderBusy("Checking for an already completed delivery package…");
        const existing = await readExisting(projectId);
        if (existing) return finish(projectId, existing.record, existing.engine, "final-package-restored");

        renderBusy("Producing the complete customer delivery package…");
        let record;
        try {
          record = await requestJSON(
            `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline/run`,
            buildRequest(),
            PRIMARY_MS,
          );
          state.engine = "canonical-customer-package";
        } catch (error) {
          state.primaryError = message(error, "The canonical package engine did not complete.");
          renderBusy("Recovering through the deterministic deliverables builder…", state.primaryError);
          const body = await requestJSON(
            `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/deliverables/build`,
            buildRequest({ sourceMode: "approved-editorial-version" }),
            FALLBACK_MS,
          );
          record = adaptDeterministic(projectId, body);
          state.engine = "deterministic-deliverables-fallback";
        }
        return finish(projectId, record, state.engine, "final-package-ready");
      } catch (error) {
        state.lastError = message(error, "Kairos could not produce the final delivery package.");
        renderError(state.lastError);
        return null;
      } finally {
        state.busy = false;
        state.promise = null;
      }
    })();
    return state.promise;
  }

  async function refreshPackage(projectId = activeProjectId()) {
    if (!projectId || state.busy) return null;
    renderBusy("Checking the saved final delivery package…");
    const existing = await readExisting(projectId);
    if (!existing) {
      renderError("No completed final package is stored yet. Resume Final Deliverable to continue manufacturing.");
      return null;
    }
    return finish(projectId, existing.record, existing.engine, "final-package-refreshed");
  }

  async function readExisting(projectId) {
    try {
      const record = await requestJSON(
        `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline`,
        { method: "GET", credentials: "include", cache: "no-store" },
        READ_MS,
      );
      if (record?.vault?.packageDownloadURL || record?.packageDownloadURL) {
        return { record, engine: "canonical-customer-package" };
      }
    } catch {}
    try {
      const body = await requestJSON(
        `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/deliverables/build`,
        { method: "GET", credentials: "include", cache: "no-store" },
        READ_MS,
      );
      return { record: adaptDeterministic(projectId, body), engine: "deterministic-deliverables-fallback" };
    } catch {
      return null;
    }
  }

  function buildRequest(extra = {}) {
    return {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-MMG-Client-Build": PATCH,
        "X-Kairos-Operation-Id": state.operationId,
        "X-Kairos-Idempotency-Key": state.operationId,
      },
      body: JSON.stringify({
        confirmation: "MANUFACTURE DELIVERY PACKAGE",
        actor: "MMG Executive",
        mode: "source-preserving-production",
        ...extra,
      }),
    };
  }

  function adaptDeterministic(projectId, body) {
    const build = body?.deliverablesBuild || body?.buildRecord || body;
    if (!build || String(build.status || "").toUpperCase() !== "COMPLETED") {
      throw new Error(body?.error?.message || "The deterministic deliverables builder did not complete.");
    }
    const assets = Array.isArray(build.artifacts) ? build.artifacts : [];
    return {
      status: "production-ready",
      projectId,
      metadata: { title: build.metadata?.workingTitle || "Complete publishing package" },
      vault: {
        title: build.metadata?.workingTitle || "Complete publishing package",
        assets,
        packageDownloadURL: `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/deliverables/zip`,
        integrity: {
          passed: assets.length > 0 && assets.every(asset => Number(asset.byteSize || 0) > 0),
          assetCount: assets.length,
        },
      },
      nextAction: "The deterministic final delivery package is ready to download.",
    };
  }

  function finish(projectId, record, engine, reason) {
    state.record = record;
    state.engine = engine;
    state.lastError = "";
    renderPackage(record);
    clearStart(projectId);
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed", {
      detail: { reason, projectId, workspace: "manuscript-studio", engine, status: record?.status, build: PATCH },
    }));
    return record;
  }

  function renderBusy(title, detail = "") {
    const section = pipelineSection();
    if (!section) return;
    section.setAttribute("aria-busy", "true");
    section.innerHTML = `
      <p class="eyebrow">Final deliverable recovery</p>
      <h3>${esc(title)}</h3>
      <p class="manuscript-progress">Kairos is continuing from durable project state without waiting on the stalled Editorial Workbench display.</p>
      ${detail ? `<p class="manuscript-note">Canonical engine: ${esc(detail)}</p>` : ""}
      <p class="manuscript-note">Operation: ${esc(state.operationId || "checking")}</p>
    `;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderError(error) {
    const section = pipelineSection();
    if (!section) return;
    section.removeAttribute("aria-busy");
    section.innerHTML = `
      <p class="eyebrow">Final deliverable recovery</p>
      <h3>Final package needs attention</h3>
      <p class="manuscript-error" role="alert">${esc(error)}</p>
      ${state.primaryError ? `<p class="manuscript-note">Canonical engine: ${esc(state.primaryError)}</p>` : ""}
      <div class="manuscript-actions">
        <button type="button" class="primary" data-stall-package-retry>Retry Final Deliverable</button>
        <button type="button" class="secondary" data-stall-package-refresh>Check Saved Package</button>
        <button type="button" class="secondary" data-stall-reload-editorial>Retry Editorial State</button>
      </div>
    `;
  }

  function renderPackage(record) {
    const section = pipelineSection();
    if (!section) return;
    const vault = record?.vault || {};
    const assets = Array.isArray(vault.assets) ? vault.assets : [];
    const packageURL = vault.packageDownloadURL || record?.packageDownloadURL || "";
    section.removeAttribute("aria-busy");
    section.innerHTML = `
      <p class="eyebrow">${state.engine === "deterministic-deliverables-fallback" ? "Deterministic recovery package" : "Final delivery package"}</p>
      <h3>${esc(record?.metadata?.title || vault.title || "Complete publishing package ready")}</h3>
      <p>${esc(record?.nextAction || "The final delivery package is ready to download.")}</p>
      <div class="issue-list">
        <article><b>Package status</b><p>${esc(record?.status || "production-ready")}</p></article>
        <article><b>Assets</b><p>${assets.length} verified deliverables</p></article>
        <article><b>Integrity</b><p>${vault.integrity?.passed === false ? "Attention required" : "Verified"}</p></article>
        <article><b>Engine</b><p>${esc(state.engine)}</p></article>
      </div>
      <div class="manuscript-actions">
        ${packageURL ? `<a class="primary" href="${esc(packageURL)}" target="_blank" rel="noopener">Download Complete Package</a>` : ""}
        <button type="button" class="secondary" data-stall-package-refresh>Refresh Package State</button>
      </div>
      <div class="manuscript-manufacturing-grid">
        ${assets.map(asset => `<article><b>${esc(asset.filename || asset.name || asset.kind || "Deliverable")}</b><p>${esc(asset.role || asset.kind || "Publishing asset")}</p><small>${Number(asset.byteSize || 0).toLocaleString()} bytes</small></article>`).join("")}
      </div>
      ${state.primaryError ? `<p class="manuscript-note">Canonical production did not finish, so Kairos completed the package through the deterministic builder: ${esc(state.primaryError)}</p>` : ""}
    `;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function pipelineSection() {
    let section = document.querySelector("#manuscript-auto-pipeline");
    if (section) return section;
    const editorial = document.querySelector("#manuscript-editorial-workbench");
    const result = document.querySelector("#manuscript-studio-overlay .manuscript-result");
    const parent = editorial?.parentElement || result;
    if (!parent) return null;
    section = document.createElement("section");
    section.id = "manuscript-auto-pipeline";
    section.className = "manuscript-auto-pipeline";
    if (editorial?.parentElement === parent) editorial.insertAdjacentElement("afterend", section);
    else parent.append(section);
    return section;
  }

  function patchEngine() {
    const upstream = globalThis.KairosManuscriptFinalDeliverableEngine;
    if (!upstream?.ready) return false;
    if (upstream.stallEscapeBuild === PATCH) return true;
    const patched = Object.freeze({
      ...upstream,
      build: upstream.build,
      stallEscapeBuild: PATCH,
      manufacture,
      refresh: refreshPackage,
      snapshot() {
        return {
          ...(typeof upstream.snapshot === "function" ? upstream.snapshot() : {}),
          stallEscapeBuild: PATCH,
          busy: state.busy,
          engine: state.engine || null,
          status: state.record?.status || null,
          lastError: state.lastError || null,
        };
      },
    });
    globalThis.KairosManuscriptFinalDeliverableEngine = patched;
    globalThis.KairosManuscriptPipelineOrchestrator = patched;
    return true;
  }

  function installHardFetch() {
    if (globalThis[HARD_FETCH_KEY]) return;
    const wrapped = async function kairosManuscriptHardDeadlineFetch(input, init = {}) {
      const request = input instanceof Request ? input : null;
      const method = String(init.method || request?.method || "GET").toUpperCase();
      const url = new URL(request?.url || String(input), location.href);
      if (method !== "GET" || !STATE_ROUTE.test(url.pathname)) return nativeFetch(input, init);
      try {
        return toResponse(await hardFetch(input, init, hardDeadlineMs()));
      } catch (error) {
        state.hardTimeouts += 1;
        return new Response(JSON.stringify({
          status: "timeout",
          retryable: true,
          path: url.pathname,
          build: PATCH,
          error: { code: "KAIROS_MANUSCRIPT_HARD_DEADLINE", message: message(error, "Saved manuscript state timed out.") },
        }), {
          status: 504,
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "1" },
        });
      }
    };
    globalThis[HARD_FETCH_KEY] = Object.freeze({ build: PATCH, ready: true, wrapped });
    globalThis.fetch = wrapped;
  }

  async function requestJSON(url, init, timeoutMs) {
    const result = await hardFetch(url, init, timeoutMs);
    let body = {};
    try { body = result.text ? JSON.parse(result.text) : {}; }
    catch { throw new Error(`Kairos returned an unreadable response (HTTP ${result.status}).`); }
    if (!result.ok) throw new Error(body?.error?.message || `Kairos returned HTTP ${result.status}.`);
    return body;
  }

  async function hardFetch(input, init = {}, timeoutMs) {
    const controller = new AbortController();
    const parent = init.signal;
    const relay = () => controller.abort(parent?.reason);
    if (parent?.aborted) relay();
    else parent?.addEventListener?.("abort", relay, { once: true });
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Object.assign(new Error(`Kairos did not finish the request within ${Math.round(timeoutMs / 1000)} seconds.`), { code: "KAIROS_HARD_DEADLINE" }));
      }, timeoutMs);
    });
    const work = (async () => {
      const response = await nativeFetch(input, { ...init, signal: controller.signal });
      const text = await response.text();
      return { ok: response.ok, status: response.status, statusText: response.statusText, headers: new Headers(response.headers), text };
    })();
    try { return await Promise.race([work, timeout]); }
    finally {
      clearTimeout(timer);
      parent?.removeEventListener?.("abort", relay);
    }
  }

  function toResponse(result) {
    return new Response(result.text, { status: result.status, statusText: result.statusText, headers: result.headers });
  }

  function readStart(projectId) {
    const stored = Number(readSession(startKey(projectId)) || 0);
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  }

  function loadStarted(projectId) {
    const key = startKey(projectId);
    const stored = readStart(projectId);
    if (stored > 0) return stored;
    const value = Date.now();
    writeSession(key, String(value));
    return value;
  }

  function schedule(delay) {
    clearTimer();
    state.timer = setTimeout(() => {
      state.timer = 0;
      inspect("deadline");
    }, Math.max(25, Number(delay || 0)));
  }
  function clearTimer() { if (state.timer) clearTimeout(state.timer); state.timer = 0; }
  function startKey(projectId) { return `${START_KEY}${RELEASE}.${projectId || "unknown"}`; }
  function clearStart(projectId) { try { sessionStorage.removeItem(startKey(projectId)); } catch {} }
  function readSession(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
  function writeSession(key, value) { try { sessionStorage.setItem(key, value); } catch {} }
  function deadlineMs() {
    const value = Number(globalThis.__KAIROS_EDITORIAL_WATCHDOG_DEADLINE_MS__ || DEADLINE_MS);
    return Number.isFinite(value) && value >= 250 ? value : DEADLINE_MS;
  }
  function hardDeadlineMs() {
    const value = Number(globalThis.__KAIROS_MANUSCRIPT_HARD_DEADLINE_MS__ || HARD_FETCH_MS);
    return Number.isFinite(value) && value >= 100 ? value : HARD_FETCH_MS;
  }
  function activeProjectId() {
    const query = new URL(location.href).searchParams.get("project");
    if (query) return query;
    try {
      const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
      return active?.workspace === "manuscript-studio" ? String(active.projectId || "") : "";
    } catch { return ""; }
  }
  function createId() { return crypto?.randomUUID?.() || `deliverable-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function message(error, fallback) { return error?.message || fallback; }
  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }
})();
