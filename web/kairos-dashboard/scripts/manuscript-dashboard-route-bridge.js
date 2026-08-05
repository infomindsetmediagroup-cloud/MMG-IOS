(() => {
  const BUILD = "kairos-manuscript-dashboard-route-20260805-3-command-center-root";
  const RELEASE = "manuscript-command-center-root-20260805-1";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_DASHBOARD_ROUTE__";
  const ACTIVE_KEY = "kairos.production.active-workspace";
  const MANUSCRIPT_TRIGGER_SELECTOR = [
    '[data-child="manuscript-studio"]',
    '[data-workspace="manuscript-studio"]',
    "[data-kairos-manuscript-open]",
    'a[href*="open=manuscript"]',
    'a[href$="/manuscript"]',
  ].join(",");
  const EMBEDDED_RUNTIME_SELECTOR = [
    "#manuscript-studio-overlay",
    "#manuscript-editorial-workbench",
    ".manuscript-overlay",
    "#kairos-final-delivery-control",
    "#kairos-manuscript-direct-open-shell",
    "[data-kairos-source-review]",
    "[data-kairos-intake-receipt]",
  ].join(",");

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptDashboardRoute = globalThis[GLOBAL_KEY];
    return;
  }

  let navigating = false;
  let observer = null;

  const api = Object.freeze({
    build: BUILD,
    release: RELEASE,
    ready: true,
    open(project = null, reason = "explicit-api-open") {
      return routeToDedicatedStudio(project, reason);
    },
    inspect(reason = "manual-inspection") {
      return enforceCommandCenterRoot(reason);
    },
    snapshot() {
      return {
        build: BUILD,
        release: RELEASE,
        navigating,
        rootRoute: isRootDashboardRoute(),
        embeddedRuntimePresent: Boolean(document.querySelector(EMBEDDED_RUNTIME_SELECTOR)),
        activeWorkspacePresent: Boolean(readJSON(ACTIVE_KEY)),
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptDashboardRoute = api;

  if (!isRootDashboardRoute()) return;

  resetTransientRootState();

  document.addEventListener("click", event => {
    const trigger = event.target instanceof Element
      ? event.target.closest(MANUSCRIPT_TRIGGER_SELECTOR)
      : null;
    if (!trigger) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    routeToDedicatedStudio(projectFromElement(trigger), "content-card-user-action");
  }, true);

  for (const eventName of [
    "kairos:manuscript-studio:open",
    "kairos:production:open",
    "kairos:production:resume",
    "kairos:manuscript:restore",
  ]) {
    window.addEventListener(eventName, event => {
      if (!isRootDashboardRoute()) return;
      event.stopImmediatePropagation();
      enforceCommandCenterRoot(`${eventName}-suppressed`);
    }, true);
  }

  window.addEventListener("pageshow", () => enforceCommandCenterRoot("pageshow"));

  observer = new MutationObserver(() => enforceCommandCenterRoot("runtime-mutation"));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  queueMicrotask(() => enforceCommandCenterRoot("root-bootstrap"));

  function resetTransientRootState() {
    try { sessionStorage.removeItem(ACTIVE_KEY); } catch {}
    const current = new URL(location.href);
    let changed = false;
    for (const key of ["open", "project", "handoff", "reason", "release", "editorialHardStop", "cacheBust"]) {
      if (!current.searchParams.has(key)) continue;
      current.searchParams.delete(key);
      changed = true;
    }
    if (changed) history.replaceState(null, "", `${current.pathname}${current.search}${current.hash}`);
    document.documentElement.dataset.kairosRoute = "command-center";
    document.body?.removeAttribute("data-kairos-dedicated-manuscript");
  }

  function enforceCommandCenterRoot(reason) {
    if (navigating || !isRootDashboardRoute()) {
      return { status: navigating ? "routing" : "not-root", build: BUILD, reason };
    }
    resetTransientRootState();
    const removed = [];
    document.querySelectorAll(EMBEDDED_RUNTIME_SELECTOR).forEach(element => {
      removed.push(element.id || element.getAttribute("data-kairos-final-delivery-control") || element.className || element.tagName);
      element.remove();
    });
    return { status: "command-center", build: BUILD, reason, removed };
  }

  function routeToDedicatedStudio(project = null, reason = "dashboard-route") {
    if (navigating) return { status: "already-routing", build: BUILD };
    if (!isRootDashboardRoute()) return { status: "already-dedicated", build: BUILD };

    const selected = normalizeProject(project);
    const projectId = selected?.projectId || null;
    if (projectId) {
      sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({
        workspace: "manuscript-studio",
        projectId,
        openedAt: new Date().toISOString(),
        build: BUILD,
        release: RELEASE,
        handoffReason: reason,
      }));
    }

    navigating = true;
    observer?.disconnect();
    const target = new URL("./manuscript", location.href);
    target.search = "";
    target.hash = "";
    target.searchParams.set("open", "manuscript");
    target.searchParams.set("handoff", "dashboard-content");
    target.searchParams.set("release", RELEASE);
    if (projectId) target.searchParams.set("project", projectId);
    location.assign(target.href);
    return { status: "routing", projectId, target: target.href, build: BUILD, release: RELEASE };
  }

  function isRootDashboardRoute() {
    if (document.documentElement.dataset.kairosRoute === "manuscript-studio") return false;
    if (document.body?.dataset.kairosDedicatedManuscript === "true") return false;
    return !/\/manuscript\/?$/i.test(location.pathname);
  }

  function projectFromElement(element) {
    if (!(element instanceof Element)) return null;
    const owner = element.closest("[data-project-id],[data-manuscript-project-id],[data-restored-project-id]") || element;
    const projectId = owner.getAttribute("data-project-id")
      || owner.getAttribute("data-manuscript-project-id")
      || owner.getAttribute("data-restored-project-id")
      || owner.dataset?.projectId
      || owner.dataset?.manuscriptProjectId
      || owner.dataset?.restoredProjectId
      || null;
    return projectId ? { projectId: String(projectId) } : null;
  }

  function normalizeProject(project) {
    const projectId = project?.projectId || project?.id || null;
    return projectId ? { projectId: String(projectId) } : null;
  }

  function readJSON(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || "null"); }
    catch { return null; }
  }
})();
