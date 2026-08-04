(() => {
  const BUILD = "kairos-manuscript-editorial-watchdog-20260804-1";
  const RELEASE = "manuscript-editorial-recovery-20260804-1";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_EDITORIAL_WATCHDOG__";
  const RECOVERY_KEY_PREFIX = "kairos.manuscript.editorial-watchdog.recovery.";
  const DEFAULT_DEADLINE_MS = 12_000;
  const DEFAULT_REQUEST_TIMEOUT_MS = 6_000;

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptEditorialWatchdog = globalThis[GLOBAL_KEY];
    return;
  }

  globalThis.__KAIROS_EDITORIAL_REQUEST_TIMEOUT_MS__ = Number(
    globalThis.__KAIROS_EDITORIAL_REQUEST_TIMEOUT_MS__ || DEFAULT_REQUEST_TIMEOUT_MS,
  );

  const state = {
    armedAt: 0,
    deadlineTimer: 0,
    projectId: "",
    recoveries: 0,
    lastReason: "",
    recoveryVisible: false,
  };

  const api = Object.freeze({
    build: BUILD,
    release: RELEASE,
    ready: true,
    inspect(reason = "manual-inspection") {
      return inspect(reason);
    },
    recover(reason = "manual-recovery") {
      return recover(activeProjectId(), reason, true);
    },
    snapshot() {
      return {
        build: BUILD,
        release: RELEASE,
        armed: Boolean(state.deadlineTimer),
        armedAt: state.armedAt || null,
        projectId: state.projectId || null,
        recoveries: state.recoveries,
        lastReason: state.lastReason || null,
        recoveryVisible: state.recoveryVisible,
        requestTimeoutMs: Number(globalThis.__KAIROS_EDITORIAL_REQUEST_TIMEOUT_MS__),
        deadlineMs: deadlineMs(),
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptEditorialWatchdog = api;

  document.addEventListener("click", event => {
    const button = event.target instanceof Element
      ? event.target.closest("[data-editorial-watchdog-retry],[data-editorial-watchdog-return]")
      : null;
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (button.hasAttribute("data-editorial-watchdog-return")) {
      location.assign(new URL("./", location.href).href);
      return;
    }

    recover(activeProjectId(), "recovery-button", true);
  }, true);

  window.addEventListener("pageshow", event => {
    inspect(event.persisted ? "bfcache-pageshow" : "pageshow");
  });

  window.addEventListener("kairos:production:state-changed", () => {
    inspect("production-state-changed");
  });

  const observer = new MutationObserver(() => inspect("dom-mutation"));
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  queueMicrotask(() => inspect("bootstrap"));

  function inspect(reason) {
    const workbench = document.querySelector("#manuscript-editorial-workbench");
    if (!workbench || !isLoading(workbench)) {
      disarm();
      state.recoveryVisible = Boolean(workbench?.querySelector("[data-editorial-watchdog-recovery]"));
      if (workbench && !state.recoveryVisible) clearRecoveryMarker(activeProjectId());
      return { status: workbench ? "settled" : "waiting-for-workbench", build: BUILD };
    }

    const projectId = activeProjectId();
    if (state.deadlineTimer && state.projectId === projectId) {
      return { status: "already-armed", projectId, build: BUILD };
    }

    disarm();
    state.projectId = projectId;
    state.armedAt = Date.now();
    state.lastReason = reason;
    state.deadlineTimer = window.setTimeout(() => {
      state.deadlineTimer = 0;
      const current = document.querySelector("#manuscript-editorial-workbench");
      if (!current || !isLoading(current)) return;
      recover(projectId, "loading-deadline", false);
    }, deadlineMs());

    return { status: "armed", projectId, build: BUILD };
  }

  function recover(projectId, reason, forceReload) {
    state.lastReason = reason;
    state.recoveries += 1;
    disarm();

    const markerKey = recoveryKey(projectId);
    const alreadyReloaded = readSession(markerKey) === RELEASE;
    const autoReloadEnabled = globalThis.__KAIROS_EDITORIAL_WATCHDOG_AUTO_RELOAD__ !== false;

    if (forceReload || (autoReloadEnabled && !alreadyReloaded)) {
      writeSession(markerKey, RELEASE);
      const target = new URL(location.href);
      target.searchParams.set("open", "manuscript");
      target.searchParams.set("editorialRecovery", RELEASE);
      target.searchParams.set("editorialRecoveryReason", String(reason || "watchdog").slice(0, 80));
      target.searchParams.set("cacheBust", String(Date.now()));
      if (projectId) target.searchParams.set("project", projectId);
      location.replace(target.href);
      return { status: "reloading", projectId, build: BUILD };
    }

    renderRecovery(projectId, reason);
    return { status: "recovery-visible", projectId, build: BUILD };
  }

  function renderRecovery(projectId, reason) {
    const section = document.querySelector("#manuscript-editorial-workbench");
    if (!section) return;

    state.recoveryVisible = true;
    section.dataset.editorialWatchdogRecovery = RELEASE;
    section.innerHTML = `
      <p class="eyebrow">Editorial recovery</p>
      <h3>The saved Editorial Workbench did not finish loading</h3>
      <p>Kairos stopped the stalled request instead of leaving this project on a permanent loading screen. The manuscript, cover, metadata, and assignment remain stored.</p>
      <p class="manuscript-note">Recovery reason: ${escapeHTML(reason || "editorial loading deadline")}${projectId ? ` · Project ${escapeHTML(projectId)}` : ""}</p>
      <div class="manuscript-actions" data-editorial-watchdog-recovery>
        <button type="button" class="primary" data-editorial-watchdog-retry>Retry Editorial State</button>
        <button type="button" class="secondary" data-editorial-watchdog-return>Return to Command Center</button>
      </div>
    `;
    section.setAttribute("role", "alert");
    section.scrollIntoView({ block: "center" });
  }

  function isLoading(section) {
    if (section.querySelector("[data-editorial-watchdog-recovery]")) return false;
    const heading = section.querySelector("h3");
    return /loading editorial workbench/i.test(heading?.textContent || section.textContent || "");
  }

  function deadlineMs() {
    const configured = Number(globalThis.__KAIROS_EDITORIAL_WATCHDOG_DEADLINE_MS__ || DEFAULT_DEADLINE_MS);
    return Number.isFinite(configured) && configured >= 500 ? configured : DEFAULT_DEADLINE_MS;
  }

  function activeProjectId() {
    const queryProject = new URL(location.href).searchParams.get("project");
    if (queryProject) return queryProject;
    try {
      const active = JSON.parse(sessionStorage.getItem("kairos.production.active-workspace") || "null");
      return active?.workspace === "manuscript-studio" ? String(active.projectId || "") : "";
    } catch {
      return "";
    }
  }

  function recoveryKey(projectId) {
    return `${RECOVERY_KEY_PREFIX}${projectId || "unknown"}`;
  }

  function clearRecoveryMarker(projectId) {
    try { sessionStorage.removeItem(recoveryKey(projectId)); } catch {}
  }

  function readSession(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }

  function writeSession(key, value) {
    try { sessionStorage.setItem(key, value); } catch {}
  }

  function disarm() {
    if (state.deadlineTimer) clearTimeout(state.deadlineTimer);
    state.deadlineTimer = 0;
    state.armedAt = 0;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    })[character]);
  }
})();
