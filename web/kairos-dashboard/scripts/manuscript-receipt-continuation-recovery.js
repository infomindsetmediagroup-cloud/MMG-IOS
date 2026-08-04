(() => {
  const BUILD = "kairos-manuscript-receipt-continuation-recovery-20260804-1";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_RECEIPT_CONTINUATION_RECOVERY__";
  const RECEIPT_SELECTOR = "#manuscript-studio-overlay .manuscript-result";
  const SETUP_SELECTOR = "#manuscript-project-setup";
  const PLACEHOLDER_SELECTOR = `${SETUP_SELECTOR}[data-kairos-project-setup-shell]`;
  const BUTTON_SELECTOR = `${RECEIPT_SELECTOR} [data-finish]`;
  const MAX_ATTEMPTS = 40;
  const RETRY_MS = 250;

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptReceiptContinuationRecovery = globalThis[GLOBAL_KEY];
    return;
  }

  const state = {
    scheduled: false,
    running: false,
    attempts: 0,
    successfulContinuations: 0,
    lastError: "",
  };

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    recover: schedule,
    snapshot() {
      return {
        build: BUILD,
        attempts: state.attempts,
        running: state.running,
        successfulContinuations: state.successfulContinuations,
        receiptPresent: Boolean(document.querySelector(RECEIPT_SELECTOR)),
        setupPresent: Boolean(document.querySelector(SETUP_SELECTOR)),
        placeholderPresent: Boolean(document.querySelector(PLACEHOLDER_SELECTOR)),
        lastError: state.lastError || null,
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptReceiptContinuationRecovery = api;

  document.addEventListener("click", event => {
    const button = event.target instanceof Element
      ? event.target.closest(BUTTON_SELECTOR)
      : null;
    if (!button) return;

    event.preventDefault();
    void continueReceipt(button, true);
  }, true);

  window.addEventListener("kairos:manuscript-studio:opened", schedule);
  window.addEventListener("kairos:production:state-changed", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("focus", schedule);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule();
  });

  new MutationObserver(schedule).observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-kairos-project-setup-shell", "data-kairos-manuscript-view"],
  });

  schedule();

  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    queueMicrotask(() => {
      state.scheduled = false;
      void recoverReceipt();
    });
  }

  async function recoverReceipt() {
    if (state.running) return;

    const receipt = document.querySelector(RECEIPT_SELECTOR);
    if (!receipt) {
      state.attempts = 0;
      return;
    }

    const setup = receipt.querySelector(SETUP_SELECTOR);
    const placeholder = receipt.querySelector(PLACEHOLDER_SELECTOR);
    const button = receipt.querySelector("[data-finish]");

    if (setup && !placeholder) {
      state.attempts = 0;
      state.lastError = "";
      return;
    }

    state.attempts += 1;

    try {
      if (button && globalThis.KairosManuscriptContinuation?.continue) {
        await continueReceipt(button, false);
        return;
      }

      if (globalThis.KairosManuscriptSetupController?.ready) {
        globalThis.KairosManuscriptSetupController.enhance?.();
        const hydrated = await waitForHydration();
        if (hydrated) {
          state.successfulContinuations += 1;
          state.attempts = 0;
          state.lastError = "";
          button?.remove();
          hydrated.scrollIntoView({ behavior: "auto", block: "start" });
          return;
        }
      }
    } catch (error) {
      state.lastError = error?.message || String(error);
    }

    if (state.attempts < MAX_ATTEMPTS) {
      window.setTimeout(schedule, RETRY_MS);
      return;
    }

    showFailure(receipt, button);
  }

  async function continueReceipt(button, userInitiated) {
    if (state.running) return;
    state.running = true;
    state.lastError = "";

    try {
      const result = await globalThis.KairosManuscriptContinuation?.continue?.(button);
      if (result?.status === "failed") {
        throw new Error(result.error || "Project Setup could not open.");
      }

      const hydrated = await waitForHydration();
      if (!hydrated) throw new Error("Project Setup did not render after the intake receipt.");

      state.successfulContinuations += 1;
      state.attempts = 0;
      button?.remove();
      hydrated.scrollIntoView({ behavior: "auto", block: "start" });
      hydrated.querySelector("input,select,textarea,button")?.focus?.({ preventScroll: true });
    } catch (error) {
      state.lastError = error?.message || String(error);
      if (userInitiated) showFailure(document.querySelector(RECEIPT_SELECTOR), button);
      else if (state.attempts < MAX_ATTEMPTS) window.setTimeout(schedule, RETRY_MS);
    } finally {
      state.running = false;
    }
  }

  function waitForHydration() {
    const existing = document.querySelector(SETUP_SELECTOR);
    if (existing && !existing.hasAttribute("data-kairos-project-setup-shell")) {
      return Promise.resolve(existing);
    }

    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        observer.disconnect();
        resolve(value);
      };
      const inspect = () => {
        const section = document.querySelector(SETUP_SELECTOR);
        if (section && !section.hasAttribute("data-kairos-project-setup-shell")) finish(section);
      };
      const observer = new MutationObserver(inspect);
      const timer = window.setTimeout(() => finish(null), 8_000);
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
      });
      inspect();
    });
  }

  function showFailure(receipt, button) {
    if (!receipt) return;

    button?.setAttribute("aria-disabled", "false");
    if (button) button.textContent = "Retry Project Setup";

    let error = receipt.querySelector(`[data-kairos-receipt-continuation-error="${BUILD}"]`);
    if (!error) {
      error = document.createElement("p");
      error.className = "manuscript-error";
      error.dataset.kairosReceiptContinuationError = BUILD;
      error.setAttribute("role", "alert");
      const actions = receipt.querySelector(".manuscript-intake-actions");
      if (actions) actions.insertAdjacentElement("afterend", error);
      else receipt.append(error);
    }
    error.textContent = state.lastError || "Project Setup did not open. Tap Retry Project Setup.";
  }
})();
