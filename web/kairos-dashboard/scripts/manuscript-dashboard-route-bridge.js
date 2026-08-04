(() => {
  const BUILD = "kairos-manuscript-dashboard-route-20260804-2-root-canonical-guard";
  const RELEASE = "manuscript-root-canonical-20260804-1";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_DASHBOARD_ROUTE__";
  const ACTIVE_KEY = "kairos.production.active-workspace";
  const REGISTRY_CACHE_KEY = "kairos.production.registry-cache";
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
    "[data-kairos-source-review]",
    '[data-kairos-intake-receipt]:not([data-kairos-intake-receipt="dedicated-project-restore"])',
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
    open(project = null, reason = "api-open") {
      return routeToDedicatedStudio(project, reason);
    },
    inspect(reason = "manual-inspection") {
      return inspectForEmbeddedRuntime(reason);
    },
    snapshot() {
      const active = readJSON(ACTIVE_KEY);
      return {
        build: BUILD,
        release: RELEASE,
        navigating,
        rootRoute: isRootDashboardRoute(),
        embeddedRuntimePresent: Boolean(document.querySelector(EMBEDDED_RUNTIME_SELECTOR)),
        activeProjectId: active?.workspace === "manuscript-studio" ? active.projectId || null : null,
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptDashboardRoute = api;

  if (!isRootDashboardRoute()) return;

  document.addEventListener("click", event => {
    const trigger = event.target instanceof Element
      ? event.target.closest(MANUSCRIPT_TRIGGER_SELECTOR)
      : null;
    if (!trigger) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    routeToDedicatedStudio(projectFromElement(trigger), "content-card");
  }, true);

  window.addEventListener("kairos:manuscript-studio:open", event => {
    event.stopImmediatePropagation();
    routeToDedicatedStudio(event.detail?.project || null, "manuscript-open-event");
  }, true);

  window.addEventListener("kairos:production:open", event => {
    if (event.detail?.workspace !== "manuscript-studio") return;
    event.stopImmediatePropagation();
    routeToDedicatedStudio(event.detail?.project || null, "production-open-event");
  }, true);

  window.addEventListener("kairos:production:resume", event => {
    const project = event.detail?.project;
    if (project?.projectType !== "manuscript-studio") return;
    event.stopImmediatePropagation();
    routeToDedicatedStudio(project, "production-resume-event");
  }, true);

  window.addEventListener("kairos:manuscript:restore", event => {
    const project = event.detail?.project || event.detail?.source || null;
    routeToDedicatedStudio(project, "root-restore-event");
  }, true);

  window.addEventListener("pageshow", event => {
    inspectForEmbeddedRuntime(event.persisted ? "bfcache-restore" : "pageshow");
  });

  observer = new MutationObserver(() => {
    inspectForEmbeddedRuntime("embedded-runtime-mutation");
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  queueMicrotask(() => inspectForEmbeddedRuntime("root-bootstrap"));

  function inspectForEmbeddedRuntime(reason) {
    if (navigating || !isRootDashboardRoute()) {
      return { status: navigating ? "already-routing" : "not-root", build: BUILD };
    }

    const embedded = document.querySelector(EMBEDDED_RUNTIME_SELECTOR);
    if (!embedded) return { status: "clear", build: BUILD };

    return routeToDedicatedStudio(projectFromElement(embedded), reason);
  }

  function routeToDedicatedStudio(project = null, reason = "dashboard-route") {
    if (navigating) return { status: "already-routing", build: BUILD };
    if (!isRootDashboardRoute()) return { status: "already-dedicated", build: BUILD };

    const selected = normalizeProject(project) || selectExistingProject() || projectFromEmbeddedRuntime();
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
    target.searchParams.set("reason", String(reason || "dashboard-route").slice(0, 120));
    if (projectId) target.searchParams.set("project", projectId);

    location.replace(target.href);

    return {
      status: "routing",
      projectId,
      target: target.href,
      build: BUILD,
      release: RELEASE,
    };
  }

  function isRootDashboardRoute() {
    if (document.documentElement.dataset.kairosRoute === "manuscript-studio") return false;
    if (document.body?.dataset.kairosDedicatedManuscript === "true") return false;
    return !/\/manuscript\/?$/i.test(location.pathname);
  }

  function selectExistingProject() {
    const queryProject = new URL(location.href).searchParams.get("project");
    if (queryProject) return { projectId: queryProject };

    const active = readJSON(ACTIVE_KEY);
    if (active?.workspace === "manuscript-studio" && active.projectId) {
      return { projectId: active.projectId };
    }

    const cached = readJSON(REGISTRY_CACHE_KEY);
    if (!Array.isArray(cached)) return null;

    return cached
      .filter(item => item?.projectType === "manuscript-studio" && item.status !== "archived" && item.projectId)
      .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0))[0] || null;
  }

  function projectFromEmbeddedRuntime() {
    const embedded = document.querySelector(EMBEDDED_RUNTIME_SELECTOR);
    return projectFromElement(embedded);
  }

  function projectFromElement(element) {
    if (!(element instanceof Element)) return null;
    const owner = element.closest("[data-project-id],[data-manuscript-project-id],[data-restored-project-id]") || element;
    const projectId =
      owner.getAttribute("data-project-id") ||
      owner.getAttribute("data-manuscript-project-id") ||
      owner.getAttribute("data-restored-project-id") ||
      owner.dataset?.projectId ||
      owner.dataset?.manuscriptProjectId ||
      owner.dataset?.restoredProjectId ||
      null;
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
