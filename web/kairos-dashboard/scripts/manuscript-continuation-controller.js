(() => {
  const BUILD = "kairos-manuscript-continuation-20260802-3-auto-setup";
  const RELEASE = "manuscript-mobile-continuation-20260802-1";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_CONTINUATION_CONTROLLER__";
  const SETUP_SCRIPT = "manuscript-project-setup.js";
  const SETUP_SELECTOR = "#manuscript-project-setup";
  const ACTIVE_KEY = "kairos.production.active-workspace";
  const PENDING_KEY = "kairos.manuscript.registry-sync.pending.v1";
  const COLLECTION_PATH = "/api/production-registry/projects";
  const LOAD_TIMEOUT_MS = 15_000;
  const MOUNT_TIMEOUT_MS = 8_000;
  const RECOVERY_TIMEOUT_MS = 8_000;
  const RECOVERY_THROTTLE_MS = 2_000;

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptContinuation = globalThis[GLOBAL_KEY];
    return;
  }

  const state = {
    loading: false,
    opened: false,
    lastError: "",
    attempts: 0,
    recoveryChecks: 0,
    recoveredReceipt: false,
    lastRecoveryAt: 0,
    recoveryPromise: null,
    autoOpenScheduled: false,
    automaticContinuations: 0,
  };

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    continue: continueToSetup,
    recover: recoverExistingIntake,
    snapshot() {
      return {
        build: BUILD,
        loading: state.loading,
        opened: state.opened,
        attempts: state.attempts,
        lastError: state.lastError,
        setupPresent: Boolean(document.querySelector(SETUP_SELECTOR)),
        recoveredReceipt: state.recoveredReceipt,
        recoveryChecks: state.recoveryChecks,
        automaticContinuations: state.automaticContinuations,
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptContinuation = api;

  document.addEventListener("click", handleClick, true);
  window.addEventListener("kairos:manuscript-studio:opened", () => scheduleRecovery("studio-opened"));
  window.addEventListener("focus", () => scheduleRecovery("window-focus"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleRecovery("visibility-restored");
  });

  const observer = new MutationObserver(() => {
    normalizeReceiptActions();
    scheduleAutomaticContinuation();
    scheduleRecovery("dom-change");
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  normalizeReceiptActions();
  scheduleAutomaticContinuation();
  scheduleRecovery("controller-ready");

  function handleClick(event) {
    const button = event.target instanceof Element
      ? event.target.closest("#manuscript-studio-overlay [data-finish]")
      : null;
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void continueToSetup(button);
  }

  async function continueToSetup(button = document.querySelector("#manuscript-studio-overlay [data-finish]")) {
    if (state.loading) return { status: "loading", build: BUILD };

    let result = document.querySelector("#manuscript-studio-overlay .manuscript-result");
    if (!result) {
      await recoverExistingIntake("continue-requested");
      result = document.querySelector("#manuscript-studio-overlay .manuscript-result");
    }
    if (!result) {
      return fail(button, "The saved production-intake receipt could not be recovered. Reload Manuscript Studio and try again.");
    }

    state.loading = true;
    state.lastError = "";
    state.attempts += 1;
    setButton(button, "Opening Project Setup…", true);
    removeInlineError(result);

    try {
      await withDeadline(
        ensureSetupController(),
        LOAD_TIMEOUT_MS,
        "The Project Setup controller did not load in time.",
      );

      globalThis.KairosManuscriptSetupController?.enhance?.();

      const section = await waitForElement(SETUP_SELECTOR, MOUNT_TIMEOUT_MS);
      if (!section) {
        throw new Error("Project Setup loaded, but its form did not render.");
      }

      state.opened = true;
      state.lastError = "";
      button?.remove();
      section.scrollIntoView({ behavior: "auto", block: "start" });
      section.querySelector("input,select,textarea,button")?.focus?.({ preventScroll: true });

      window.dispatchEvent(new CustomEvent("kairos:production:state-changed", {
        detail: {
          reason: "project-setup-opened",
          projectId: activeProjectId(),
          workspace: "manuscript-studio",
          build: BUILD,
        },
      }));

      return {
        status: "project-setup-open",
        build: BUILD,
        projectId: activeProjectId(),
      };
    } catch (error) {
      return fail(button, error?.message || "Project Setup could not open.", result);
    } finally {
      state.loading = false;
    }
  }

  function scheduleRecovery(reason) {
    if (state.recoveryPromise) return;
    if (Date.now() - state.lastRecoveryAt < RECOVERY_THROTTLE_MS) return;
    queueMicrotask(() => void recoverExistingIntake(reason));
  }

  async function recoverExistingIntake(reason = "manual-recovery") {
    if (state.recoveryPromise) return state.recoveryPromise;

    const projectId = activeProjectId();
    if (!projectId) return { status: "no-active-project", build: BUILD };
    if (document.querySelector("#manuscript-studio-overlay .manuscript-result")) {
      normalizeReceiptActions();
      return { status: "receipt-present", projectId, build: BUILD };
    }

    state.lastRecoveryAt = Date.now();
    state.recoveryChecks += 1;
    state.recoveryPromise = performRecovery(projectId, reason)
      .catch(error => {
        console.warn("[kairos-manuscript-continuation] Intake recovery was deferred.", {
          build: BUILD,
          projectId,
          reason,
          message: error?.message || String(error),
        });
        return { status: "deferred", projectId, build: BUILD };
      })
      .finally(() => {
        state.recoveryPromise = null;
      });

    return state.recoveryPromise;
  }

  async function performRecovery(projectId, reason) {
    const overlay = await waitForElement("#manuscript-studio-overlay", RECOVERY_TIMEOUT_MS);
    if (!overlay) return { status: "overlay-unavailable", projectId, build: BUILD };
    if (overlay.querySelector(".manuscript-result")) {
      normalizeReceiptActions();
      return { status: "receipt-present", projectId, build: BUILD };
    }

    const project = pendingProject(projectId) || await readRegistryProject(projectId);
    if (!isRecoverableProject(project, projectId)) {
      return { status: "no-saved-intake", projectId, build: BUILD };
    }

    const result = renderRecoveredReceipt(overlay, project);
    if (!result) return { status: "receipt-render-failed", projectId, build: BUILD };

    state.recoveredReceipt = true;
    normalizeReceiptActions();

    console.info("[kairos-manuscript-continuation] Recovered saved production-intake receipt.", {
      build: BUILD,
      projectId,
      status: project.status || null,
      stage: project.stage || null,
      reason,
    });

    return {
      status: "receipt-recovered",
      projectId,
      build: BUILD,
    };
  }

  async function readRegistryProject(projectId) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), RECOVERY_TIMEOUT_MS);
    try {
      const response = await fetch(COLLECTION_PATH, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "X-MMG-Client-Build": BUILD,
          "X-Kairos-Registry-Read": "recover-intake-receipt",
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return null;
      return Array.isArray(body?.projects)
        ? body.projects.find(project => project?.projectId === projectId) || null
        : null;
    } finally {
      clearTimeout(timer);
    }
  }

  function pendingProject(projectId) {
    const pending = readJSON(PENDING_KEY);
    return pending?.projectId === projectId ? pending.project || null : null;
  }

  function isRecoverableProject(project, projectId) {
    if (!project || project.projectId !== projectId) return false;
    const status = String(project.status || "").toLowerCase();
    const stage = String(project.stage || "").toLowerCase();
    return status === "production_intake" ||
      status === "assigned-to-production" ||
      status === "ready-for-editorial" ||
      status === "ready-for-manufacturing" ||
      stage === "project_setup" ||
      stage === "editorial" ||
      stage === "manufacturing";
  }

  function renderRecoveredReceipt(overlay, project) {
    const panel = overlay.querySelector(".manuscript-panel");
    if (!panel) return null;

    const header = panel.querySelector("header");
    for (const child of [...panel.children]) {
      if (child !== header) child.remove();
    }

    const result = document.createElement("div");
    result.className = "manuscript-result";
    result.dataset.kairosRecoveredIntake = BUILD;
    result.innerHTML = `
      <div class="manuscript-status">
        <span>Production intake recovered</span>
        <strong>${esc(project.status || "production_intake")}</strong>
      </div>
      <h3>${esc(project.summary || "Your manuscript is stored and ready for project setup.")}</h3>
      <p><strong>Project:</strong> ${esc(project.sourceProjectId || project.projectId)}</p>
      <div class="issue-list">
        <article>
          <b>1. Complete Project Setup</b>
          <p>${esc(project.nextAction || "Confirm publication metadata and assign the approved publishing service.")}</p>
        </article>
      </div>
      <p class="manuscript-note">Kairos recovered the saved production state. No second intake was created.</p>
      <div class="manuscript-actions">
        <button type="button" class="primary" data-finish>Continue to Project Setup</button>
      </div>
    `;
    panel.append(result);
    return result;
  }

  function ensureSetupController() {
    if (globalThis.KairosManuscriptSetupController?.ready) return Promise.resolve();

    let script = document.querySelector(`script[data-kairos-continuation-script="${SETUP_SCRIPT}"]`);
    if (!script) {
      script = document.createElement("script");
      script.type = "module";
      script.src = new URL(`./scripts/${SETUP_SCRIPT}?v=${RELEASE}`, document.baseURI).href;
      script.dataset.kairosContinuationScript = SETUP_SCRIPT;
      script.dataset.kairosContinuationOwner = BUILD;
      document.body.append(script);
    }

    return new Promise((resolve, reject) => {
      let poll = 0;
      const cleanup = () => {
        clearInterval(poll);
        script.removeEventListener("error", onError);
      };
      const inspect = () => {
        if (!globalThis.KairosManuscriptSetupController?.ready) return;
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("The Project Setup controller could not be downloaded."));
      };

      script.addEventListener("error", onError, { once: true });
      poll = window.setInterval(inspect, 25);
      inspect();
    });
  }

  function normalizeReceiptActions() {
    const button = document.querySelector("#manuscript-studio-overlay .manuscript-result [data-finish]");
    if (!button || button.dataset.kairosContinuationReady === BUILD) return;
    button.dataset.kairosContinuationReady = BUILD;
    button.textContent = "Continue to Project Setup";
    button.setAttribute("aria-label", "Continue to manuscript project setup");
  }

  function scheduleAutomaticContinuation() {
    if (state.loading || state.opened || state.autoOpenScheduled) return;
    if (document.querySelector(SETUP_SELECTOR)) return;

    const button = document.querySelector("#manuscript-studio-overlay .manuscript-result [data-finish]");
    if (!button || button.dataset.kairosAutomaticContinuation === BUILD) return;

    button.dataset.kairosAutomaticContinuation = BUILD;
    state.autoOpenScheduled = true;
    queueMicrotask(() => {
      state.autoOpenScheduled = false;
      if (!button.isConnected || document.querySelector(SETUP_SELECTOR)) return;
      state.automaticContinuations += 1;
      void continueToSetup(button);
    });
  }

  function fail(button, message, result = document.querySelector("#manuscript-studio-overlay .manuscript-result")) {
    state.lastError = String(message || "Project Setup could not open.");
    setButton(button, "Retry Project Setup", false);

    if (result) {
      removeInlineError(result);
      const error = document.createElement("p");
      error.className = "manuscript-error";
      error.dataset.kairosContinuationError = BUILD;
      error.setAttribute("role", "alert");
      error.textContent = state.lastError;
      const actions = result.querySelector(".manuscript-actions");
      (actions || result).before?.(error);
      if (!error.isConnected) result.append(error);
      error.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    console.error("[kairos-manuscript-continuation] Project Setup failed", {
      build: BUILD,
      message: state.lastError,
      projectId: activeProjectId(),
      href: location.href,
    });

    return {
      status: "failed",
      build: BUILD,
      error: state.lastError,
    };
  }

  function removeInlineError(result) {
    result?.querySelector(`[data-kairos-continuation-error="${BUILD}"]`)?.remove();
  }

  function setButton(button, label, disabled) {
    if (!button) return;
    button.textContent = label;
    button.disabled = Boolean(disabled);
    button.setAttribute("aria-busy", disabled ? "true" : "false");
  }

  function waitForElement(selector, timeoutMs) {
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);

    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        observer.disconnect();
        resolve(value);
      };
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) finish(element);
      });
      const timer = window.setTimeout(() => finish(null), timeoutMs);
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
    });
  }

  function withDeadline(promise, milliseconds, message) {
    let timer = 0;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  function activeProjectId() {
    const active = readJSON(ACTIVE_KEY);
    return active?.workspace === "manuscript-studio" ? active.projectId || null : null;
  }

  function readJSON(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || "null"); }
    catch { return null; }
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    })[character]);
  }
})();
