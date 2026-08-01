(() => {
  const BUILD = "kairos-manuscript-stage-handoff-20260801-1";
  const RELEASE = "manuscript-stage-handoff-lazy-runtime-20260801-2";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_STAGE_HANDOFF__";
  const EDITORIAL_SCRIPT = "manuscript-editorial-workbench.js";
  const STATE_FETCH_SCRIPT = "kairos-state-fetch-install.js";
  const INFERENCE_SCRIPT = "kairos-local-inference.js";
  const PIPELINE_SCRIPT = "manuscript-auto-pipeline.js";
  const LOAD_TIMEOUT_MS = 20_000;
  const MOUNT_TIMEOUT_MS = 12_000;
  const INFERENCE_TIMEOUT_MS = 90_000;

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptStageHandoff = globalThis[GLOBAL_KEY];
    return;
  }

  const state = {
    scheduled: false,
    editorialLoading: false,
    productionLoading: false,
    localRuntimeLoading: false,
    lastError: "",
    editorialOpens: 0,
    productionOpens: 0,
    localStarts: 0,
  };

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    openEditorial: openEditorialWorkbench,
    openProduction: openLocalProduction,
    startLocalProduction,
    enhance: scheduleEnhance,
    snapshot() {
      return {
        build: BUILD,
        editorialLoading: state.editorialLoading,
        productionLoading: state.productionLoading,
        localRuntimeLoading: state.localRuntimeLoading,
        lastError: state.lastError,
        editorialOpens: state.editorialOpens,
        productionOpens: state.productionOpens,
        localStarts: state.localStarts,
        setupActionPresent: Boolean(document.querySelector("[data-kairos-next-editorial]")),
        editorialPresent: Boolean(document.querySelector("#manuscript-editorial-workbench")),
        productionActionPresent: Boolean(document.querySelector("[data-kairos-next-production]")),
        pipelinePresent: Boolean(document.querySelector("#manuscript-auto-pipeline")),
        localRuntimeReady: Boolean(globalThis.KairosLocalInference?.ready),
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
        Editorial approval is complete. Open the local production controls to continue.
      </p>
    `;
    editorial.append(handoff);
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const editorialButton = target?.closest("[data-kairos-next-editorial]");
    if (editorialButton) {
      stop(event);
      void openEditorialWorkbench(editorialButton);
      return;
    }

    const productionButton = target?.closest("[data-kairos-next-production]");
    if (productionButton) {
      stop(event);
      void openLocalProduction(productionButton);
      return;
    }

    const startButton = target?.closest("[data-start-local-production]");
    if (!startButton || globalThis.KairosLocalInference?.ready) return;

    stop(event);
    void startLocalProduction(startButton);
  }

  function stop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  async function openEditorialWorkbench(button = document.querySelector("[data-kairos-next-editorial]")) {
    if (state.editorialLoading) return { status: "loading", build: BUILD };
    state.editorialLoading = true;
    state.lastError = "";
    setButton(button, "Opening Editorial Review…", true);
    setStatus(button, "Loading the saved manuscript and editorial state…");

    try {
      await ensureModule(
        EDITORIAL_SCRIPT,
        () => globalThis.KairosEditorialWorkbenchController?.ready,
        LOAD_TIMEOUT_MS,
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
    setButton(button, "Opening Production Controls…", true);
    setStatus(button, "Loading the bounded production-state controls…");

    try {
      await ensureModule(
        STATE_FETCH_SCRIPT,
        () => Boolean(
          globalThis.__KAIROS_STATE_FETCH_INSTALLED__ ||
          globalThis.__kairosStateFetchInstalled
        ),
        LOAD_TIMEOUT_MS,
      );
      await ensureModule(
        PIPELINE_SCRIPT,
        () => globalThis.KairosManuscriptAutoPipelineController?.ready,
        LOAD_TIMEOUT_MS,
      );

      globalThis.KairosManuscriptAutoPipelineController?.enhance?.();
      const section = await waitForElement("#manuscript-auto-pipeline", MOUNT_TIMEOUT_MS);
      if (!section) throw new Error("Local Production loaded, but its controls did not render.");

      state.productionOpens += 1;
      button?.closest("[data-kairos-production-handoff]")?.remove();
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      section.querySelector("button")?.focus?.({ preventScroll: true });

      setPipelineMessage(
        "Production controls are ready. The local AI runtime will load only after Start Local Production is pressed.",
      );

      return { status: "production-open", projectId: activeProjectId(), build: BUILD };
    } catch (error) {
      state.lastError = error?.message || "Local Production controls could not open.";
      setButton(button, "Retry Production Controls", false);
      setStatus(button, state.lastError, true);
      return { status: "failed", error: state.lastError, build: BUILD };
    } finally {
      state.productionLoading = false;
    }
  }

  async function startLocalProduction(button = document.querySelector("[data-start-local-production]")) {
    if (state.localRuntimeLoading) return { status: "loading", build: BUILD };
    if (!globalThis.KairosManuscriptAutoPipelineController?.ready) {
      state.lastError = "The local production controller is not ready.";
      setPipelineMessage(state.lastError, true);
      return { status: "failed", error: state.lastError, build: BUILD };
    }

    state.localRuntimeLoading = true;
    state.lastError = "";
    setButton(button, "Loading Local AI Runtime…", true);
    setPipelineMessage(
      "Downloading and preparing the same-origin WebGPU runtime. Keep Safari open and in the foreground. This can take up to 90 seconds on the first load.",
    );

    try {
      await ensureModule(
        INFERENCE_SCRIPT,
        () => globalThis.KairosLocalInference?.ready,
        INFERENCE_TIMEOUT_MS,
      );

      if (!globalThis.KairosLocalInference?.ready) {
        throw new Error("The local WebGPU runtime loaded without becoming ready.");
      }

      state.localStarts += 1;
      setButton(button, "Start Local Production", false);
      setPipelineMessage("Local AI runtime ready. Starting production on this device…");
      await globalThis.KairosManuscriptAutoPipelineController.startLocalProduction();
      return { status: "production-started", projectId: activeProjectId(), build: BUILD };
    } catch (error) {
      state.lastError = error?.message || "The local AI runtime could not load.";
      setButton(button, "Retry Local AI Runtime", false);
      setPipelineMessage(state.lastError, true);
      return { status: "failed", error: state.lastError, build: BUILD };
    } finally {
      state.localRuntimeLoading = false;
    }
  }

  function ensureModule(filename, ready, timeoutMs) {
    if (ready()) return Promise.resolve();

    let script = document.querySelector(`script[data-kairos-stage-script="${filename}"]`);
    if (script?.dataset.kairosStageLoadState === "failed") {
      script.remove();
      script = null;
    }

    if (!script) {
      script = document.createElement("script");
      script.type = "module";
      script.src = new URL(
        `./scripts/${filename}?v=${RELEASE}&attempt=${Date.now()}`,
        document.baseURI,
      ).href;
      script.dataset.kairosStageScript = filename;
      script.dataset.kairosStageOwner = BUILD;
      script.dataset.kairosStageLoadState = "loading";
      document.body.append(script);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let poll = 0;
      let timer = 0;

      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        clearTimeout(timer);
        script.removeEventListener("error", onError);
        if (error) {
          script.dataset.kairosStageLoadState = "failed";
          reject(error);
          return;
        }
        script.dataset.kairosStageLoadState = "ready";
        resolve();
      };

      const inspect = () => {
        if (ready()) finish();
      };

      const onError = () => {
        finish(new Error(`${filename} could not be downloaded.`));
      };

      script.addEventListener("error", onError, { once: true });
      poll = window.setInterval(inspect, 50);
      timer = window.setTimeout(() => {
        finish(new Error(`${filename} did not become ready within ${Math.round(timeoutMs / 1000)} seconds.`));
      }, timeoutMs);
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

  function setPipelineMessage(message, error = false) {
    const section = document.querySelector("#manuscript-auto-pipeline");
    if (!section) return;

    let status = section.querySelector("[data-kairos-local-runtime-status]");
    if (!status) {
      status = document.createElement("p");
      status.dataset.kairosLocalRuntimeStatus = BUILD;
      status.className = "manuscript-progress";
      const actions = section.querySelector(".manuscript-actions");
      if (actions) actions.insertAdjacentElement("afterend", status);
      else section.append(status);
    }

    status.textContent = String(message || "");
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

  function activeProjectId() {
    try {
      const active = JSON.parse(sessionStorage.getItem("kairos.production.active-workspace") || "null");
      return active?.workspace === "manuscript-studio" ? active.projectId || null : null;
    } catch {
      return null;
    }
  }
})();
