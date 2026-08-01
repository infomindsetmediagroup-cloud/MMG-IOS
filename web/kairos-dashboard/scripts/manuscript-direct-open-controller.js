const BUILD = "kairos-manuscript-direct-open-20260801-1";
const ACTIVE_KEY = "kairos.production.active-workspace";
const FAILURE_ID = "kairos-manuscript-open-failure";
const DEFAULT_OPEN_TIMEOUT_MS = 20_000;
const OVERLAY_TIMEOUT_MS = 5_000;

let openPromise = null;
let openAttempts = 0;
let lastError = "";
let lastReason = "";

const api = Object.freeze({
  build: BUILD,
  ready: true,
  open: requestOpen,
  snapshot,
});

globalThis.KairosManuscriptDirectOpen = api;

window.addEventListener("kairos:manuscript-studio:open", event => {
  event.stopImmediatePropagation();
  void requestOpen({ reason: "manuscript-open-event" });
});

window.addEventListener("kairos:production:open", event => {
  if (event.detail?.workspace !== "manuscript-studio") return;
  if (!document.querySelector("#manuscript-studio-overlay")) return;
  event.stopImmediatePropagation();
  ensureActiveProject();
  emitVisibility("already-open");
});

const requestedTarget = new URLSearchParams(location.search).get("open");
if (requestedTarget === "manuscript") {
  queueMicrotask(() => {
    void requestOpen({ reason: "direct-route" });
  });
}

async function requestOpen({ reason = "manual-open" } = {}) {
  lastReason = reason;
  if (document.querySelector("#manuscript-studio-overlay")) {
    clearFailure();
    ensureActiveProject();
    emitVisibility("already-open");
    return { status: "open", build: BUILD, reason };
  }
  if (openPromise) return openPromise;

  openPromise = performOpen(reason)
    .catch(error => {
      lastError = error?.message || "Manuscript Studio could not open.";
      renderFailure(lastError);
      console.error("[kairos-manuscript-direct-open] open failed", {
        build: BUILD,
        reason,
        message: lastError,
        href: location.href,
      });
      return { status: "failed", build: BUILD, reason, error: lastError };
    })
    .finally(() => {
      openPromise = null;
    });

  return openPromise;
}

async function performOpen(reason) {
  openAttempts += 1;
  clearFailure();
  const projectId = ensureActiveProject();
  void ensureRegistryProject(projectId);

  const launcher = await waitForElement(
    ".manuscript-launch",
    configuredTimeout(),
  );
  if (!launcher) {
    throw new Error("The Manuscript Studio launcher did not become available.");
  }

  launcher.click();

  const overlay = await waitForElement(
    "#manuscript-studio-overlay",
    OVERLAY_TIMEOUT_MS,
  );
  if (!overlay) {
    throw new Error("Manuscript Studio loaded, but its workspace did not render.");
  }

  clearFailure();
  lastError = "";
  emitVisibility(reason);
  window.dispatchEvent(new CustomEvent("kairos:manuscript-studio:opened", {
    detail: { build: BUILD, reason, projectId },
  }));
  return { status: "open", build: BUILD, reason, projectId };
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
    openReason: lastReason || "direct-open",
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
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function emitVisibility(reason) {
  const active = readJSON(ACTIVE_KEY);
  window.dispatchEvent(new CustomEvent("kairos:production:workspace-visibility", {
    detail: {
      workspace: "manuscript-studio",
      projectId: active?.projectId || null,
      open: Boolean(document.querySelector("#manuscript-studio-overlay")),
      reason,
      build: BUILD,
    },
  }));
}

function renderFailure(message) {
  let panel = document.querySelector(`#${FAILURE_ID}`);
  if (!panel) {
    panel = document.createElement("section");
    panel.id = FAILURE_ID;
    panel.setAttribute("role", "alert");
    panel.innerHTML = `
      <div>
        <p class="eyebrow">Kairos recovery</p>
        <h1>Manuscript Studio did not open</h1>
        <p data-kairos-manuscript-open-error></p>
        <div>
          <button type="button" data-kairos-manuscript-retry>Retry Manuscript Studio</button>
          <button type="button" data-kairos-command-return>Return to Command Center</button>
        </div>
      </div>
    `;
    Object.assign(panel.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      display: "grid",
      placeItems: "center",
      padding: "24px",
      background: "#05070a",
      color: "#f7f9fc",
      fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    });
    Object.assign(panel.firstElementChild.style, {
      width: "min(560px,100%)",
      padding: "28px",
      border: "1px solid #263547",
      borderRadius: "22px",
      background: "#0b1017",
    });
    panel.querySelector("[data-kairos-manuscript-retry]")?.addEventListener("click", () => {
      clearFailure();
      void requestOpen({ reason: "visible-retry" });
    });
    panel.querySelector("[data-kairos-command-return]")?.addEventListener("click", () => {
      const url = new URL(location.href);
      url.search = "";
      url.hash = "";
      location.assign(url.href);
    });
    document.body.append(panel);
  }
  const error = panel.querySelector("[data-kairos-manuscript-open-error]");
  if (error) error.textContent = String(message || "The workspace could not be rendered.");
}

function clearFailure() {
  document.querySelector(`#${FAILURE_ID}`)?.remove();
}

function configuredTimeout() {
  const value = Number(globalThis.__KAIROS_MANUSCRIPT_OPEN_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_OPEN_TIMEOUT_MS;
}

function snapshot() {
  const active = readJSON(ACTIVE_KEY);
  return {
    build: BUILD,
    ready: true,
    openAttempts,
    opening: Boolean(openPromise),
    lastError,
    lastReason,
    overlayPresent: Boolean(document.querySelector("#manuscript-studio-overlay")),
    launcherPresent: Boolean(document.querySelector(".manuscript-launch")),
    activeProjectId: active?.workspace === "manuscript-studio" ? active.projectId || null : null,
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
  try { return JSON.parse(sessionStorage.getItem(key) || "null"); }
  catch { return null; }
}
