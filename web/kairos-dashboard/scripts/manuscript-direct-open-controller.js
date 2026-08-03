const BUILD = "kairos-manuscript-direct-open-20260801-2-standalone";
const ASSET_RELEASE = "manuscript-deliverable-review-20260803-1";
const ACTIVE_KEY = "kairos.production.active-workspace";
const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_DIRECT_OPEN_CONTROLLER__";
const SHELL_ID = "kairos-manuscript-direct-open-shell";
const DEFAULT_OPEN_TIMEOUT_MS = 30_000;
const MODULE_TIMEOUT_MS = 12_000;
const OVERLAY_TIMEOUT_MS = 6_000;
const REOPEN_DELAY_MS = 80;
const INTENTIONAL_CLOSE_WINDOW_MS = 4_000;

const routeTarget = new URLSearchParams(location.search).get("open");

if (globalThis[GLOBAL_KEY]) {
  globalThis.KairosManuscriptDirectOpen = globalThis[GLOBAL_KEY];
  if (routeTarget === "manuscript") {
    queueMicrotask(() => {
      void globalThis[GLOBAL_KEY].open({ reason: "duplicate-direct-route" });
    });
  }
} else {
  const state = {
    openPromise: null,
    openAttempts: 0,
    lastError: "",
    lastReason: "",
    openedOnce: false,
    intentionalCloseUntil: 0,
    reopenTimer: 0,
  };

  const api = Object.freeze({
    build: BUILD,
    release: ASSET_RELEASE,
    ready: true,
    open: requestOpen,
    snapshot,
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptDirectOpen = api;

  installEventOwnership();
  installOverlayWatchdog();

  if (routeTarget === "manuscript") {
    renderShell({
      title: "Opening Manuscript Studio",
      message: "Loading the dedicated manuscript workspace…",
      failure: false,
    });
    queueMicrotask(() => {
      void requestOpen({ reason: "direct-route" });
    });
  }

  function installEventOwnership() {
    window.addEventListener("kairos:manuscript-studio:open", event => {
      event.stopImmediatePropagation();
      void requestOpen({ reason: "manuscript-open-event" });
    }, true);

    window.addEventListener("kairos:production:open", event => {
      if (event.detail?.workspace !== "manuscript-studio") return;
      event.stopImmediatePropagation();
      void requestOpen({ reason: "production-open-event" });
    }, true);

    window.addEventListener("kairos:production:close", () => {
      state.intentionalCloseUntil = Date.now() + INTENTIONAL_CLOSE_WINDOW_MS;
    });

    document.addEventListener("click", event => {
      const target = event.target instanceof Element
        ? event.target.closest("#manuscript-studio-overlay [data-close], #manuscript-studio-overlay [data-finish]")
        : null;
      if (!target) return;
      state.intentionalCloseUntil = Date.now() + INTENTIONAL_CLOSE_WINDOW_MS;
    }, true);
  }

  function installOverlayWatchdog() {
    const observer = new MutationObserver(() => {
      if (routeTarget !== "manuscript" || !state.openedOnce) return;
      if (Date.now() <= state.intentionalCloseUntil) return;
      if (overlayVisible()) return;
      if (state.openPromise || state.reopenTimer) return;

      state.reopenTimer = window.setTimeout(() => {
        state.reopenTimer = 0;
        if (Date.now() <= state.intentionalCloseUntil || overlayVisible()) return;
        void requestOpen({ reason: "overlay-watchdog" });
      }, REOPEN_DELAY_MS);
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  async function requestOpen({ reason = "manual-open" } = {}) {
    state.lastReason = reason;

    if (overlayVisible()) {
      removeShell();
      ensureActiveProject();
      emitVisibility("already-open");
      return { status: "open", build: BUILD, reason };
    }

    if (state.openPromise) return state.openPromise;

    state.openPromise = performOpen(reason)
      .catch(error => {
        state.lastError = error?.message || "Manuscript Studio could not open.";
        renderShell({
          title: "Manuscript Studio did not open",
          message: state.lastError,
          failure: true,
        });
        console.error("[kairos-manuscript-direct-open] open failed", {
          build: BUILD,
          release: ASSET_RELEASE,
          reason,
          message: state.lastError,
          href: location.href,
        });
        return {
          status: "failed",
          build: BUILD,
          reason,
          error: state.lastError,
        };
      })
      .finally(() => {
        state.openPromise = null;
      });

    return state.openPromise;
  }

  async function performOpen(reason) {
    state.openAttempts += 1;
    state.lastError = "";

    renderShell({
      title: "Opening Manuscript Studio",
      message: "Loading the dedicated manuscript interface…",
      failure: false,
    });

    const projectId = ensureActiveProject();
    void ensureRegistryProject(projectId);

    updateShell("Loading Manuscript Studio styles…");
    await withDeadline(
      ensureStyle("manuscript-studio.css"),
      MODULE_TIMEOUT_MS,
      "The Manuscript Studio styles did not load in time.",
    );

    updateShell("Starting the protected manuscript runtime…");
    await withDeadline(
      ensureModule("manuscript-post-intake-guard.js"),
      MODULE_TIMEOUT_MS,
      "The manuscript protection runtime did not load in time.",
    );

    updateShell("Starting Manuscript Studio…");
    await withDeadline(
      ensureModule("manuscript-studio.js"),
      MODULE_TIMEOUT_MS,
      "The Manuscript Studio module did not load in time.",
    );

    const launcher = await waitForElement(
      ".manuscript-launch",
      configuredTimeout(),
    );
    if (!launcher) {
      throw new Error("The Manuscript Studio launcher did not become available.");
    }

    launcher.click();

    const overlay = await waitForVisibleElement(
      "#manuscript-studio-overlay",
      OVERLAY_TIMEOUT_MS,
    );
    if (!overlay) {
      throw new Error("Manuscript Studio loaded, but its workspace did not render.");
    }

    await nextPaint();
    if (!overlayVisible()) {
      throw new Error("Manuscript Studio rendered and then disappeared before it became usable.");
    }

    state.openedOnce = true;
    state.lastError = "";
    removeShell();
    emitVisibility(reason);
    window.dispatchEvent(new CustomEvent("kairos:manuscript-studio:opened", {
      detail: {
        build: BUILD,
        release: ASSET_RELEASE,
        reason,
        projectId,
      },
    }));

    return {
      status: "open",
      build: BUILD,
      release: ASSET_RELEASE,
      reason,
      projectId,
    };
  }

  function ensureStyle(filename) {
    const selector = `link[data-kairos-command-style="${cssEscape(filename)}"]`;
    const existing = document.querySelector(selector);
    if (existing) return waitForStylesheet(existing);

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL(`./styles/${filename}?v=${ASSET_RELEASE}`, document.baseURI).href;
    link.dataset.kairosCommandStyle = filename;
    link.dataset.kairosDirectOwner = BUILD;
    document.head.append(link);
    return waitForStylesheet(link);
  }

  function waitForStylesheet(link) {
    if (link.sheet) return Promise.resolve(link);
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        link.removeEventListener("load", onLoad);
        link.removeEventListener("error", onError);
      };
      const onLoad = () => {
        cleanup();
        resolve(link);
      };
      const onError = () => {
        cleanup();
        reject(new Error("Could not load Manuscript Studio styles."));
      };
      link.addEventListener("load", onLoad, { once: true });
      link.addEventListener("error", onError, { once: true });
    });
  }

  function ensureModule(filename) {
    if (moduleReady(filename)) return Promise.resolve();

    const selector = `script[data-kairos-command-script="${cssEscape(filename)}"]`;
    let script = document.querySelector(selector);

    if (!script) {
      script = document.createElement("script");
      script.type = "module";
      script.src = new URL(`./scripts/${filename}?v=${ASSET_RELEASE}`, document.baseURI).href;
      script.dataset.kairosCommandScript = filename;
      script.dataset.kairosDirectOwner = BUILD;
      document.body.append(script);
    }

    return new Promise((resolve, reject) => {
      let poll;
      const cleanup = () => {
        clearInterval(poll);
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
      };
      const finishIfReady = () => {
        if (!moduleReady(filename)) return false;
        cleanup();
        resolve();
        return true;
      };
      const onLoad = () => {
        if (!finishIfReady()) {
          cleanup();
          reject(new Error(`${filename} loaded without registering its runtime.`));
        }
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Could not load ${filename}.`));
      };

      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      poll = window.setInterval(finishIfReady, 25);
      finishIfReady();
    });
  }

  function moduleReady(filename) {
    if (filename === "manuscript-studio.js") {
      return Boolean(globalThis.KairosManuscriptStudio?.ready);
    }
    if (filename === "manuscript-post-intake-guard.js") {
      return Boolean(globalThis.KairosManuscriptPostIntakeGuard?.ready);
    }
    return false;
  }

  function renderShell({ title, message, failure }) {
    let shell = document.querySelector(`#${SHELL_ID}`);
    if (!shell) {
      shell = document.createElement("section");
      shell.id = SHELL_ID;
      shell.setAttribute("role", failure ? "alert" : "status");
      shell.dataset.kairosDirectOpenOwner = BUILD;
      shell.innerHTML = `
        <div data-kairos-manuscript-open-card>
          <p data-kairos-manuscript-open-eyebrow>Mindset Media Group · Kairos</p>
          <h1 data-kairos-manuscript-open-title></h1>
          <p data-kairos-manuscript-open-status></p>
          <div data-kairos-manuscript-open-actions hidden>
            <button type="button" data-kairos-manuscript-retry>Retry Manuscript Studio</button>
            <button type="button" data-kairos-command-return>Return to Command Center</button>
          </div>
        </div>
      `;

      Object.assign(shell.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483645",
        display: "grid",
        placeItems: "center",
        minHeight: "100dvh",
        padding: "max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom))",
        boxSizing: "border-box",
        background: "#05070a",
        color: "#f7f9fc",
        fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      });

      const card = shell.querySelector("[data-kairos-manuscript-open-card]");
      Object.assign(card.style, {
        width: "min(560px, 100%)",
        padding: "28px",
        boxSizing: "border-box",
        border: "1px solid #263547",
        borderRadius: "22px",
        background: "#0b1017",
        boxShadow: "0 28px 90px rgba(0,0,0,.55)",
      });

      const eyebrow = shell.querySelector("[data-kairos-manuscript-open-eyebrow]");
      Object.assign(eyebrow.style, {
        margin: "0 0 10px",
        color: "#7fb4ff",
        fontSize: "12px",
        fontWeight: "800",
        letterSpacing: ".08em",
        textTransform: "uppercase",
      });

      const heading = shell.querySelector("[data-kairos-manuscript-open-title]");
      Object.assign(heading.style, {
        margin: "0 0 12px",
        fontSize: "clamp(26px, 7vw, 38px)",
        lineHeight: "1.08",
      });

      const status = shell.querySelector("[data-kairos-manuscript-open-status]");
      Object.assign(status.style, {
        margin: "0",
        color: "#b8c5d6",
        fontSize: "16px",
        lineHeight: "1.55",
      });

      const actions = shell.querySelector("[data-kairos-manuscript-open-actions]");
      Object.assign(actions.style, {
        marginTop: "22px",
        display: "flex",
        flexWrap: "wrap",
        gap: "10px",
      });

      shell.querySelectorAll("button").forEach(button => {
        Object.assign(button.style, {
          minHeight: "48px",
          padding: "12px 16px",
          border: "1px solid #31527d",
          borderRadius: "12px",
          background: "#111923",
          color: "#fff",
          font: "800 15px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
        });
      });

      shell.querySelector("[data-kairos-manuscript-retry]")?.addEventListener("click", () => {
        void requestOpen({ reason: "visible-retry" });
      });

      shell.querySelector("[data-kairos-command-return]")?.addEventListener("click", () => {
        const url = new URL(location.href);
        url.search = "";
        url.hash = "";
        location.assign(url.href);
      });

      document.body.append(shell);
    }

    shell.setAttribute("role", failure ? "alert" : "status");
    const heading = shell.querySelector("[data-kairos-manuscript-open-title]");
    const status = shell.querySelector("[data-kairos-manuscript-open-status]");
    const actions = shell.querySelector("[data-kairos-manuscript-open-actions]");
    if (heading) heading.textContent = String(title || "Opening Manuscript Studio");
    if (status) status.textContent = String(message || "Preparing the manuscript workspace…");
    if (actions) actions.hidden = !failure;

    if (!shell.isConnected) document.body.append(shell);
    return shell;
  }

  function updateShell(message) {
    const status = document.querySelector(`#${SHELL_ID} [data-kairos-manuscript-open-status]`);
    if (status) status.textContent = String(message || "Preparing the manuscript workspace…");
  }

  function removeShell() {
    document.querySelector(`#${SHELL_ID}`)?.remove();
  }

  function ensureActiveProject() {
    const active = readJSON(ACTIVE_KEY);
    if (active?.workspace === "manuscript-studio" && active.projectId) {
      return active.projectId;
    }

    const projectId = `manuscript-studio-${createUUID()}`;
    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
      openedAt: new Date().toISOString(),
      build: BUILD,
      openReason: state.lastReason || "direct-open",
    }));
    return projectId;
  }

  async function ensureRegistryProject(projectId) {
    try {
      const response = await fetch("/api/production-registry/projects", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-MMG-Client-Build": BUILD,
        },
        body: JSON.stringify({
          projectId,
          projectType: "manuscript-studio",
          title: "New Manuscript Project",
          status: "intake",
          stage: "intake",
          progress: 0,
          activeWorkspace: "manuscript-studio",
          summary: "Manuscript Studio opened.",
          nextAction: "Complete the manuscript intake.",
        }),
      });

      if (!response.ok && ![401, 403, 409].includes(response.status)) {
        console.warn("[kairos-manuscript-direct-open] registry initialization was deferred", {
          build: BUILD,
          projectId,
          status: response.status,
        });
      }
    } catch (error) {
      console.warn("[kairos-manuscript-direct-open] registry initialization was deferred", {
        build: BUILD,
        projectId,
        message: error?.message || String(error),
      });
    }
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
      const timer = setTimeout(() => finish(null), timeoutMs);
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
    });
  }

  function waitForVisibleElement(selector, timeoutMs) {
    const existing = document.querySelector(selector);
    if (existing && elementVisible(existing)) return Promise.resolve(existing);

    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(poll);
        observer.disconnect();
        resolve(value);
      };
      const inspect = () => {
        const element = document.querySelector(selector);
        if (element && elementVisible(element)) finish(element);
      };
      const observer = new MutationObserver(inspect);
      const poll = window.setInterval(inspect, 50);
      const timer = window.setTimeout(() => finish(null), timeoutMs);
      observer.observe(document.body || document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      inspect();
    });
  }

  function overlayVisible() {
    const overlay = document.querySelector("#manuscript-studio-overlay");
    return Boolean(overlay && elementVisible(overlay));
  }

  function elementVisible(element) {
    const style = getComputedStyle(element);
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) !== 0 &&
      element.getClientRects().length > 0;
  }

  function nextPaint() {
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function withDeadline(promise, milliseconds, message) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  function emitVisibility(reason) {
    const active = readJSON(ACTIVE_KEY);
    window.dispatchEvent(new CustomEvent("kairos:production:workspace-visibility", {
      detail: {
        workspace: "manuscript-studio",
        projectId: active?.projectId || null,
        open: overlayVisible(),
        reason,
        build: BUILD,
      },
    }));
  }

  function configuredTimeout() {
    const value = Number(globalThis.__KAIROS_MANUSCRIPT_OPEN_TIMEOUT_MS);
    return Number.isFinite(value) && value > 0
      ? value
      : DEFAULT_OPEN_TIMEOUT_MS;
  }

  function snapshot() {
    const active = readJSON(ACTIVE_KEY);
    return {
      build: BUILD,
      release: ASSET_RELEASE,
      ready: true,
      openAttempts: state.openAttempts,
      opening: Boolean(state.openPromise),
      lastError: state.lastError,
      lastReason: state.lastReason,
      openedOnce: state.openedOnce,
      overlayPresent: overlayVisible(),
      launcherPresent: Boolean(document.querySelector(".manuscript-launch")),
      shellPresent: Boolean(document.querySelector(`#${SHELL_ID}`)),
      activeProjectId: active?.workspace === "manuscript-studio"
        ? active.projectId || null
        : null,
    };
  }

  function createUUID() {
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  function readJSON(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  function cssEscape(value) {
    if (globalThis.CSS?.escape) return CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }
}
