(() => {
  const BUILD = "kairos-manuscript-stage-handoff-20260801-1";
  const RELEASE = "five-center-dashboard-post-intake-stability-20260731-1";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_STAGE_HANDOFF__";
  const EDITORIAL_SCRIPT = "manuscript-editorial-workbench.js";
  const STATE_FETCH_SCRIPT = "kairos-state-fetch-install.js";
  const INFERENCE_SCRIPT = "kairos-local-inference.js";
  const PIPELINE_SCRIPT = "manuscript-auto-pipeline.js";
  const LOAD_TIMEOUT_MS = 15_000;
  const MOUNT_TIMEOUT_MS = 10_000;

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptStageHandoff = globalThis[GLOBAL_KEY];
    return;
  }

  const state = {
    scheduled: false,
    editorialLoading: false,
    productionLoading: false,
    lastError: "",
    editorialOpens: 0,
    productionOpens: 0,
  };

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    openEditorial: openEditorialWorkbench,
    openProduction: openLocalProduction,
    enhance: scheduleEnhance,
    snapshot() {
      return {
        build: BUILD,
        editorialLoading: state.editorialLoading,
        productionLoading: state.productionLoading,
        lastError: state.lastError,
        editorialOpens: state.editorialOpens,
        productionOpens: state.productionOpens,
        setupActionPresent: Boolean(document.querySelector("[data-kairos-next-editorial]")),
        editorialPresent: Boolean(document.querySelector("#manuscript-editorial-workbench")),
        productionActionPresent: Boolean(document.querySelector("[data-kairos-next-production]")),
        pipelinePresent: Boolean(document.querySelector("#manuscript-auto-pipeline")),
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptStageHandoff = api;

  document.addEventListener("click", handleClick, true);
  window.addEventListener("kairos:production:state-changed", scheduleEnhance);
  window.addEventListener("kairos:manuscript-studio:opened", scheduleEnhance);

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  scheduleEnhance();

  function scheduleEnhance() {
    if (state.scheduled) return;
    state.scheduled = true;
    queueMicrotask(() => {
      state.scheduled = false;
      enhance();
    });
  }

  function enhance() {
    installEditorialAction();
    installProductionAction();
  }

  function installEditorialAction() {
    const setup = document.querySelector("#manuscript-project-setup");
    if (!setup || !setupComplete(setup)) return;

    if (document.querySelector("#manuscript-editorial-workbench")) {
      setup.querySelector("[data-kairos-editorial-handoff]")?.remove();
      return;
    }

    if (setup.querySelector("[data-kairos-editorial-handoff]")) return;

    const handoff = document.createElement("div");
    handoff.className = "manuscript-actions";
    handoff.dataset.kairosEditorialHandoff = BUILD;
    handoff.innerHTML = `
      <button type="button" class="primary" data-kairos-next-editorial>
        Continue to Editorial Review
      </button>
      <p class="manuscript-note" data-kairos-handoff-status>
        Project setup is saved. Open the governed editorial workspace to continue.
      </p>
    `;
    setup.append(handoff);
  }

  function installProductionAction() {
    const editorial = document.querySelector("#manuscript-editorial-workbench");
    if (!editorial || !editorialReady(editorial)) return;

    if (document.querySelector("#manuscript-auto-pipeline")) {
      editorial.querySelector("[data-kairos-production-handoff]")?.remove();
      return;
    }

    if (editorial.querySelector("[data-kairos-production-handoff]")) return;

    const handoff = document.createElement("div");
    handoff.className = "manuscript-actions";
    handoff.dataset.kairosProductionHandoff = BUILD;
    handoff.innerHTML = `
      <button type="button" class="primary" data-kairos-next-production>
        Continue to Local Production
      </button>
      <p class="manuscript-note" data-kairos-handoff-status>
        Editorial approval is complete. Continue to the local WebGPU production stage.
      </p>
    `;
    editorial.append(handoff);
  }

  function handleClick(event) {
    const editorialButton = event.target instanceof Element
      ? event.target.closest("[data-kairos-next-editorial]")
      : null;
    if (editorialButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void openEditorialWorkbench(editorialButton);
      return;
    }

    const productionButton = event.target instanceof Element
      ? event.target.closest("[data-kairos-next-production]")
      : null;
    if (!productionButton) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void openLocalProduction(productionButton);
  }

  async function openEditorialWorkbench(button = document.querySelector("[data-kairos-next-editorial]")) {
    if (state.editorialLoading) return { status: "loading", build: BUILD };
    state.editorialLoading = true;
    state.lastError = "";
    setButton(button, "Opening Editorial Review…", true);
    setStatus(button, "Loading the saved manuscript and editorial state…");

    try {
      await withDeadline(
        ensureModule(EDITORIAL_SCRIPT, () => globalThis.KairosEditorialWorkbenchController?.ready),
        LOAD_TIMEOUT_MS,
        "The Editorial Workbench did not load in time.",
      );

      await globalThis.KairosEditorialWorkbenchController?.enhance?.();
      const section = await waitForElement("#manuscript-editorial-workbench", MOUNT_TIMEOUT_MS);
      if (!section) throw new Error("Editorial Review loaded, but its workspace did not render.");

      state.editorialOpens += 1;
      button?.closest("[data-kairos-editorial-handoff]")?.remove();
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      section.querySelector("input,select,textarea,button")?.focus?.({ preventScroll: true });

      window.dispatchEvent(new CustomEvent("kairos:production:state-changed", {
        detail: {
          reason: "editorial-workbench-opened",
          projectId: activeProjectId(),
          workspace: "manuscript-studio",
          build: BUILD,
        },
      }));

      return { status: "editorial-open", projectId: activeProjectId(), build: BUILD };
    } catch (error) {
      state.lastError = error?.message || "Editorial Review could not open.";
      setButton(button, "Retry Editorial Review", false);
      setStatus(button, state.lastError, true);
      return { status: "failed", error: state.lastError, build: BUILD };
    } finally {
      state.editorialLoading = false;
    }
  }

  async function openLocalProduction(button = document.querySelector("[data-kairos-next-production]")) {
    if (state.productionLoading) return { status: "loading", build: BUILD };
    state.productionLoading = true;
    state.lastError = "";
    setButton(button, "Opening Local Production…", true);
    setStatus(button, "Loading the bounded state transport and same-origin WebGPU runtime…");

    try {
      await withDeadline(
        ensureModule(STATE_FETCH_SCRIPT, () => Boolean(globalThis.__KAIROS_STATE_FETCH_INSTALLED__)),
        LOAD_TIMEOUT_MS,
        "The bounded production-state transport did not load in time.",
      );
      await withDeadline(
        ensureModule(INFERENCE_SCRIPT, () => globalThis.KairosLocalInference?.ready),
        LOAD_TIMEOUT_MS,
        "The local WebGPU runtime did not load in time.",
      );
      await withDeadline(
        ensureModule(PIPELINE_SCRIPT, () => globalThis.KairosManuscriptAutoPipelineController?.ready),
        LOAD_TIMEOUT_MS,
        "The local production controller did not load in time.",
      );

      globalThis.KairosManuscriptAutoPipelineController?.enhance?.();
      const section = await waitForElement("#manuscript-auto-pipeline", MOUNT_TIMEOUT_MS);
      if (!section) throw new Error("Local Production loaded, but its workspace did not render.");

      state.productionOpens += 1;
      button?.closest("[data-kairos-production-handoff]")?.remove();
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      section.querySelector("button")?.focus?.({ preventScroll: true });

      return { status: "production-open", projectId: activeProjectId(), build: BUILD };
    } catch (error) {
      state.lastError = error?.message || "Local Production could not open.";
      setButton(button, "Retry Local Production", false);
      setStatus(button, state.lastError, true);
      return { status: "failed", error: state.lastError, build: BUILD };
    } finally {
      state.productionLoading = false;
    }
  }

  function ensureModule(filename, ready) {
    if (ready()) return Promise.resolve();

    let script = document.querySelector(`script[data-kairos-stage-script="${filename}"]`);
    if (!script) {
      script = document.createElement("script");
      script.type = "module";
      script.src = new URL(`./scripts/${filename}?v=${RELEASE}`, document.baseURI).href;
      script.dataset.kairosStageScript = filename;
      script.dataset.kairosStageOwner = BUILD;
      document.body.append(script);
    }

    return new Promise((resolve, reject) => {
      let poll = 0;
      const cleanup = () => {
        clearInterval(poll);
        script.removeEventListener("error", onError);
      };
      const inspect = () => {
        if (!ready()) return;
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`${filename} could not be downloaded.`));
      };

      script.addEventListener("error", onError, { once: true });
      poll = window.setInterval(inspect, 25);
      inspect();
    });
  }

  function setupComplete(section) {
    const text = section.textContent || "";
    return text.includes("Production assignment") ||
      text.includes("assigned-to-production") ||
      text.includes("awaiting-customer-cover");
  }

  function editorialReady(section) {
    const text = (section.textContent || "").toLowerCase();
    return text.includes("ready for manufacturing") ||
      text.includes("ready-for-manufacturing");
  }

  function setButton(button, label, disabled) {
    if (!button) return;
    button.textContent = label;
    button.disabled = Boolean(disabled);
    button.setAttribute("aria-busy", disabled ? "true" : "false");
  }

  function setStatus(button, message, error = false) {
    const handoff = button?.closest("[data-kairos-editorial-handoff], [data-kairos-production-handoff]");
    const status = handoff?.querySelector("[data-kairos-handoff-status]");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("manuscript-error", error);
    if (error) status.setAttribute("role", "alert");
    else status.removeAttribute("role");
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
