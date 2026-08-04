(() => {
  const BUILD = "kairos-manuscript-dashboard-route-20260804-1";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_DASHBOARD_ROUTE__";
  const ACTIVE_KEY = "kairos.production.active-workspace";
  const REGISTRY_CACHE_KEY = "kairos.production.registry-cache";

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptDashboardRoute = globalThis[GLOBAL_KEY];
    return;
  }

  let navigating = false;

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    open(project = null, reason = "api-open") {
      return routeToDedicatedStudio(project, reason);
    },
    snapshot() {
      const active = readJSON(ACTIVE_KEY);
      return {
        build: BUILD,
        navigating,
        activeProjectId: active?.workspace === "manuscript-studio" ? active.projectId || null : null,
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptDashboardRoute = api;

  document.addEventListener("click", event => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-child="manuscript-studio"]')
      : null;
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    routeToDedicatedStudio(null, "content-card");
  }, true);

  window.addEventListener("kairos:production:open", event => {
    if (event.detail?.workspace !== "manuscript-studio") return;
    event.stopImmediatePropagation();
    routeToDedicatedStudio(null, "production-open-event");
  }, true);

  window.addEventListener("kairos:production:resume", event => {
    const project = event.detail?.project;
    if (project?.projectType !== "manuscript-studio") return;
    event.stopImmediatePropagation();
    routeToDedicatedStudio(project, "production-resume-event");
  }, true);

  function routeToDedicatedStudio(project = null, reason = "dashboard-route") {
    if (navigating) return { status: "already-routing", build: BUILD };

    const selected = normalizeProject(project) || selectExistingProject();
    const projectId = selected?.projectId || null;

    if (projectId) {
      sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({
        workspace: "manuscript-studio",
        projectId,
        openedAt: new Date().toISOString(),
        build: BUILD,
        handoffReason: reason,
      }));
    }

    navigating = true;
    const target = new URL("./manuscript", location.href);
    target.searchParams.set("open", "manuscript");
    target.searchParams.set("handoff", "dashboard-content");
    if (projectId) target.searchParams.set("project", projectId);
    location.assign(target.href);

    return {
      status: "routing",
      projectId,
      target: target.href,
      build: BUILD,
    };
  }

  function selectExistingProject() {
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

  function normalizeProject(project) {
    if (!project?.projectId) return null;
    return {
      projectId: String(project.projectId),
    };
  }

  function readJSON(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || "null"); }
    catch { return null; }
  }
})();
