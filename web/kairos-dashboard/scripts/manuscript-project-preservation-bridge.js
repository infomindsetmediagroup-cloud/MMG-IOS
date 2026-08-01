(() => {
  const BUILD = "kairos-manuscript-project-preservation-20260801-1";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_PROJECT_PRESERVATION__";
  const ACTIVE_KEY = "kairos.production.active-workspace";
  const PENDING_KEY = "kairos.manuscript.registry-sync.pending.v1";
  const COLLECTION_PATH = "/api/production-registry/projects";
  const ADVANCED_STATUSES = new Set([
    "production_intake",
    "assigned-to-production",
    "ready-for-editorial",
    "ready-for-manufacturing",
    "manufacturing",
    "quality-review",
    "packaged",
    "delivered",
  ]);

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptProjectPreservation = globalThis[GLOBAL_KEY];
    return;
  }

  const previousFetch = globalThis.fetch.bind(globalThis);
  const state = {
    preserved: 0,
    lastProjectId: "",
    lastStatus: "",
  };

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    snapshot() {
      return {
        build: BUILD,
        preserved: state.preserved,
        lastProjectId: state.lastProjectId || null,
        lastStatus: state.lastStatus || null,
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptProjectPreservation = api;

  globalThis.fetch = async function preserveAdvancedManuscriptProject(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const method = String(init.method || request?.method || "GET").toUpperCase();
    const url = new URL(request?.url || String(input), location.href);

    if (method !== "POST" || url.pathname !== COLLECTION_PATH) {
      return previousFetch(input, init);
    }

    const payload = await readPayload(request, init);
    const projectId = String(payload?.projectId || "");
    const active = readJSON(ACTIVE_KEY);

    if (
      !projectId ||
      payload?.projectType !== "manuscript-studio" ||
      String(payload?.status || "") !== "intake" ||
      active?.workspace !== "manuscript-studio" ||
      active?.projectId !== projectId
    ) {
      return previousFetch(input, init);
    }

    const pending = readJSON(PENDING_KEY)?.project;
    if (sameAdvancedProject(pending, projectId)) {
      return preservedResponse(pending, "pending-registry-sync");
    }

    try {
      const existingResponse = await previousFetch(COLLECTION_PATH, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "X-MMG-Client-Build": BUILD,
          "X-Kairos-Registry-Read": "preserve-advanced-project",
        },
      });
      const body = await existingResponse.clone().json().catch(() => ({}));
      const existing = Array.isArray(body?.projects)
        ? body.projects.find(project => project?.projectId === projectId)
        : null;

      if (existingResponse.ok && sameAdvancedProject(existing, projectId)) {
        return preservedResponse(existing, "durable-registry");
      }
    } catch (error) {
      console.warn("[kairos-manuscript-project-preservation] Registry preflight was unavailable.", {
        build: BUILD,
        projectId,
        message: error?.message || String(error),
      });
    }

    return previousFetch(input, init);
  };

  function preservedResponse(project, source) {
    state.preserved += 1;
    state.lastProjectId = project.projectId;
    state.lastStatus = project.status || project.stage || "production_intake";

    console.info("[kairos-manuscript-project-preservation] Preserved advanced manuscript state.", {
      build: BUILD,
      projectId: project.projectId,
      status: state.lastStatus,
      source,
    });

    return new Response(JSON.stringify({
      status: "preserved",
      project,
      source,
      build: BUILD,
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Kairos-Project-Preservation": BUILD,
        "X-Kairos-Project-State": state.lastStatus,
      },
    });
  }

  function sameAdvancedProject(project, projectId) {
    if (!project || project.projectId !== projectId) return false;
    const status = String(project.status || "").toLowerCase();
    const stage = String(project.stage || "").toLowerCase();
    return ADVANCED_STATUSES.has(status) || stage === "project_setup" || stage === "editorial" || stage === "manufacturing";
  }

  async function readPayload(request, init) {
    if (typeof init.body === "string") {
      try { return JSON.parse(init.body); } catch { return {}; }
    }
    if (request) {
      try { return await request.clone().json(); } catch { return {}; }
    }
    return {};
  }

  function readJSON(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || "null"); }
    catch { return null; }
  }
})();
