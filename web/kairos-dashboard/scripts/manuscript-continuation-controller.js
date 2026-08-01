(() => {
  const BUILD = "kairos-manuscript-continuation-20260801-1";
  const RELEASE = "five-center-dashboard-post-intake-stability-20260731-1";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_CONTINUATION_CONTROLLER__";
  const SETUP_SCRIPT = "manuscript-project-setup.js";
  const SETUP_SELECTOR = "#manuscript-project-setup";
  const LOAD_TIMEOUT_MS = 15_000;
  const MOUNT_TIMEOUT_MS = 8_000;

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptContinuation = globalThis[GLOBAL_KEY];
    return;
  }

  const state = {
    loading: false,
    opened: false,
    lastError: "",
    attempts: 0,
  };

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    continue: continueToSetup,
    snapshot() {
      return {
        build: BUILD,
        loading: state.loading,
        opened: state.opened,
        attempts: state.attempts,
        lastError: state.lastError,
        setupPresent: Boolean(document.querySelector(SETUP_SELECTOR)),
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptContinuation = api;

  document.addEventListener("click", handleClick, true);

  const observer = new MutationObserver(normalizeReceiptActions);
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
  normalizeReceiptActions();

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

    const result = document.querySelector("#manuscript-studio-overlay .manuscript-result");
    if (!result) {
      return fail(button, "The production-intake receipt is not available. Reopen Manuscript Studio and try again.");
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
      section.scrollIntoView({ behavior: "smooth", block: "start" });
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
    try {
      const active = JSON.parse(sessionStorage.getItem("kairos.production.active-workspace") || "null");
      return active?.workspace === "manuscript-studio" ? active.projectId || null : null;
    } catch {
      return null;
    }
  }
})();
