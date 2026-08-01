const BUILD = "kairos-manuscript-post-intake-guard-20260731-1";
const ACTIVE_KEY = "kairos.production.active-workspace";
const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_POST_INTAKE_GUARD__";
const RESTORE_DELAY_MS = 34;
const INTENTIONAL_REMOVAL_WINDOW_MS = 2_000;

if (globalThis[GLOBAL_KEY]) {
  console.warn("[kairos-post-intake] duplicate guard suppressed", {
    build: BUILD,
    existing: globalThis[GLOBAL_KEY]?.build || null,
    moduleUrl: import.meta.url,
  });
} else {
  const state = {
    build: BUILD,
    moduleUrl: import.meta.url,
    installedAt: new Date().toISOString(),
    acceptedStudioModuleURL: "",
    duplicateStudioModules: [],
    stableOverlay: null,
    stableOverlayProjectId: "",
    stableOverlayIntakeId: "",
    intentionalRemovalUntil: 0,
    overlayRemovals: 0,
    overlayRestores: 0,
    stateEvents: 0,
    visibilityEvents: 0,
    stateAttempts: 0,
    errors: [],
  };

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    snapshot() {
      return {
        build: state.build,
        moduleUrl: state.moduleUrl,
        installedAt: state.installedAt,
        acceptedStudioModuleURL: state.acceptedStudioModuleURL,
        duplicateStudioModules: [...state.duplicateStudioModules],
        stableOverlayProjectId: state.stableOverlayProjectId,
        stableOverlayIntakeId: state.stableOverlayIntakeId,
        overlayPresent: Boolean(document.querySelector("#manuscript-studio-overlay")),
        resultPresent: Boolean(document.querySelector("#manuscript-studio-overlay .manuscript-result")),
        overlayRemovals: state.overlayRemovals,
        overlayRestores: state.overlayRestores,
        stateEvents: state.stateEvents,
        visibilityEvents: state.visibilityEvents,
        stateAttempts: state.stateAttempts,
        errors: [...state.errors],
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptPostIntakeGuard = api;

  document.addEventListener("click", event => {
    const target = event.target instanceof Element
      ? event.target.closest("[data-close],[data-finish]")
      : null;
    if (!target || !target.closest("#manuscript-studio-overlay")) return;
    state.intentionalRemovalUntil = Date.now() + INTENTIONAL_REMOVAL_WINDOW_MS;
    log("intentional-overlay-action", {
      action: target.hasAttribute("data-finish") ? "finish" : "close",
      trusted: event.isTrusted,
    });
  }, true);

  window.addEventListener("kairos:production:state-changed", event => {
    state.stateEvents += 1;
    log("state-changed", normalizeDetail(event.detail));
  });

  window.addEventListener("kairos:production:workspace-visibility", event => {
    state.visibilityEvents += 1;
    log("workspace-visibility", normalizeDetail(event.detail));
  });

  window.addEventListener("kairos:production:state-attempt", event => {
    state.stateAttempts += 1;
    log("state-attempt", normalizeDetail(event.detail));
  });

  window.addEventListener("error", event => {
    rememberError("error", event.message, event.error?.stack || "");
  });

  window.addEventListener("unhandledrejection", event => {
    rememberError(
      "unhandledrejection",
      String(event.reason?.message || event.reason || ""),
      event.reason?.stack || "",
    );
  });

  const observer = new MutationObserver(records => {
    for (const mutation of records) {
      for (const node of mutation.addedNodes) inspectAddedNode(node);
      for (const node of mutation.removedNodes) inspectRemovedNode(node);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  inspectExistingStudioScripts();
  inspectExistingOverlay();
  log("guard-installed");

  function inspectExistingStudioScripts() {
    document.querySelectorAll('script[type="module"][src*="manuscript-studio.js"]')
      .forEach(script => registerStudioScript(script));
  }

  function inspectExistingOverlay() {
    const overlay = document.querySelector("#manuscript-studio-overlay");
    if (overlay) registerOverlay(overlay);
  }

  function inspectAddedNode(node) {
    if (!(node instanceof Element)) return;

    if (node.matches?.('script[type="module"][src*="manuscript-studio.js"]')) {
      registerStudioScript(node);
    }
    node.querySelectorAll?.('script[type="module"][src*="manuscript-studio.js"]')
      .forEach(script => registerStudioScript(script));

    if (node.id === "manuscript-studio-overlay") registerOverlay(node);
    node.querySelectorAll?.("#manuscript-studio-overlay")
      .forEach(overlay => registerOverlay(overlay));
  }

  function inspectRemovedNode(node) {
    if (!(node instanceof Element)) return;
    const overlay = node.id === "manuscript-studio-overlay"
      ? node
      : node.querySelector?.("#manuscript-studio-overlay");
    if (!overlay || overlay !== state.stableOverlay) return;

    state.overlayRemovals += 1;
    const intentional = Date.now() <= state.intentionalRemovalUntil;
    log("stable-overlay-removed", {
      intentional,
      projectId: state.stableOverlayProjectId || null,
      intakeId: state.stableOverlayIntakeId || null,
    });
    if (intentional) {
      state.stableOverlay = null;
      return;
    }

    setTimeout(() => restoreStableOverlay(overlay), RESTORE_DELAY_MS);
  }

  function registerStudioScript(script) {
    const url = absoluteURL(script.src);
    if (!url) return;
    if (!state.acceptedStudioModuleURL) {
      state.acceptedStudioModuleURL = url;
      script.dataset.kairosStudioOwner = BUILD;
      log("studio-module-accepted", { url });
      return;
    }
    if (url === state.acceptedStudioModuleURL) return;

    state.duplicateStudioModules.push(url);
    script.type = "application/x-kairos-duplicate-module";
    script.remove();
    console.error("[kairos-post-intake] duplicate Manuscript Studio module blocked", {
      build: BUILD,
      accepted: state.acceptedStudioModuleURL,
      blocked: url,
    });
  }

  function registerOverlay(overlay) {
    overlay.dataset.kairosRuntimeOwner = BUILD;
    overlay.dataset.kairosGuardModule = import.meta.url;

    const result = overlay.querySelector(".manuscript-result");
    if (!result) return;

    state.stableOverlay = overlay;
    state.stableOverlayProjectId = String(
      result.dataset.projectId || extractIdentifier(result.textContent, "PUB-") || "",
    );
    state.stableOverlayIntakeId = String(
      result.dataset.intakeId || extractIdentifier(result.textContent, "INT-") || "",
    );
    log("success-overlay-stabilized", {
      projectId: state.stableOverlayProjectId || null,
      intakeId: state.stableOverlayIntakeId || null,
    });
  }

  function restoreStableOverlay(overlay) {
    if (Date.now() <= state.intentionalRemovalUntil) return;
    if (document.querySelector("#manuscript-studio-overlay")) return;

    const active = readJSON(ACTIVE_KEY);
    if (active?.workspace && active.workspace !== "manuscript-studio") return;
    if (!overlay.querySelector(".manuscript-result")) return;

    document.body.appendChild(overlay);
    state.overlayRestores += 1;
    log("success-overlay-restored", {
      projectId: state.stableOverlayProjectId || null,
      intakeId: state.stableOverlayIntakeId || null,
    });
    window.dispatchEvent(new CustomEvent("kairos:production:workspace-visibility", {
      detail: {
        workspace: "manuscript-studio",
        projectId: active?.projectId || null,
        open: true,
        reason: "post-intake-overlay-recovery",
        build: BUILD,
      },
    }));
  }

  function rememberError(type, message, stack) {
    state.errors.push({
      type,
      message: String(message || ""),
      stack: String(stack || ""),
      at: new Date().toISOString(),
    });
    if (state.errors.length > 20) state.errors.shift();
    log("runtime-error", { type, message: String(message || "") });
  }

  function log(phase, detail = {}) {
    console.info("[kairos-post-intake]", JSON.stringify({
      phase,
      at: new Date().toISOString(),
      build: BUILD,
      moduleUrl: import.meta.url,
      href: location.href,
      overlayPresent: Boolean(document.querySelector("#manuscript-studio-overlay")),
      resultPresent: Boolean(document.querySelector("#manuscript-studio-overlay .manuscript-result")),
      ...detail,
    }));
  }
}

function normalizeDetail(value) {
  if (!value || typeof value !== "object") return {};
  return {
    reason: value.reason || null,
    projectId: value.projectId || value.activeProjectId || null,
    workspace: value.workspace || value.activeWorkspace || null,
    open: typeof value.open === "boolean" ? value.open : null,
    attempt: value.attempt || null,
    attempts: value.attempts || null,
    build: value.build || null,
  };
}

function extractIdentifier(text, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(text || "").match(new RegExp(`${escaped}[A-Za-z0-9-]+`))?.[0] || "";
}

function absoluteURL(value) {
  try { return new URL(value, location.href).href; }
  catch { return String(value || ""); }
}

function readJSON(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || "null"); }
  catch { return null; }
}
