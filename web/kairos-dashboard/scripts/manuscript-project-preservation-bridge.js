(() => {
  const BUILD = "kairos-manuscript-project-identity-reconnect-20260804-1";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_PROJECT_PRESERVATION__";
  const IDENTITY_GLOBAL_KEY = "__KAIROS_MANUSCRIPT_PROJECT_IDENTITY__";
  const ACTIVE_KEY = "kairos.production.active-workspace";
  const IDENTITY_KEY = "kairos.manuscript.last-resolved-identity.v1";
  const PENDING_KEY = "kairos.manuscript.registry-sync.pending.v1";
  const DRAFT_KEY = "kairos.manuscript-studio.recoverable-draft.v1";
  const COLLECTION_PATH = "/api/production-registry/projects";
  const SOURCE_PREFIX = "/api/production-registry/manuscripts/";
  const RESOLUTION_TIMEOUT_MS = 10_000;
  const PROBE_TIMEOUT_MS = 8_000;
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
    globalThis.KairosManuscriptProjectIdentity = globalThis[IDENTITY_GLOBAL_KEY] || globalThis[GLOBAL_KEY];
    return;
  }

  const previousFetch = globalThis.fetch.bind(globalThis);
  const state = {
    preserved: 0,
    rewritten: 0,
    retried: 0,
    resolutionAttempts: 0,
    lastProjectId: "",
    lastStatus: "",
    lastError: "",
    identity: null,
    aliases: new Map(),
    sourcePayload: null,
    readyPromise: null,
  };

  seedSynchronousIdentity();
  state.readyPromise = resolveIdentity().catch(error => {
    state.lastError = error?.message || String(error);
    console.warn("[kairos-manuscript-project-identity] Identity resolution was deferred.", {
      build: BUILD,
      message: state.lastError,
    });
    return state.identity;
  });

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    readyPromise: state.readyPromise,
    resolve: resolveIdentity,
    canonicalProjectId,
    aliasesFor: value => aliasesFor(value),
    snapshot() {
      return {
        build: BUILD,
        preserved: state.preserved,
        rewritten: state.rewritten,
        retried: state.retried,
        resolutionAttempts: state.resolutionAttempts,
        lastProjectId: state.lastProjectId || null,
        lastStatus: state.lastStatus || null,
        lastError: state.lastError || null,
        identity: state.identity,
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis[IDENTITY_GLOBAL_KEY] = api;
  globalThis.KairosManuscriptProjectPreservation = api;
  globalThis.KairosManuscriptProjectIdentity = api;
  globalThis.__KAIROS_MANUSCRIPT_IDENTITY_READY__ = state.readyPromise;

  globalThis.fetch = async function preserveAndReconnectManuscriptProject(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const method = String(init.method || request?.method || "GET").toUpperCase();
    const originalUrl = new URL(request?.url || String(input), location.href);

    if (method === "POST" && originalUrl.pathname === COLLECTION_PATH) {
      const preserved = await preserveAdvancedProject(request, input, init);
      if (preserved) return preserved;
    }

    const manuscriptMatch = originalUrl.pathname.match(/^\/api\/production-registry\/manuscripts\/([^/]+)(\/.*)?$/);
    if (!manuscriptMatch) return previousFetch(input, init);

    await deadline(state.readyPromise, RESOLUTION_TIMEOUT_MS).catch(() => null);

    const requestedId = decodeURIComponent(manuscriptMatch[1]);
    const canonicalId = canonicalProjectId(requestedId);
    const canonicalUrl = canonicalId && canonicalId !== requestedId
      ? replaceProjectId(originalUrl, canonicalId)
      : originalUrl;

    if (canonicalUrl.href !== originalUrl.href) state.rewritten += 1;

    const primaryInput = rebuildInput(input, canonicalUrl.href);
    const retryInput = rebuildInput(input, canonicalUrl.href);
    let response = await previousFetch(primaryInput, init);

    if (response.status !== 404) return response;

    const refreshed = await resolveIdentity({ force: true, requestedId }).catch(() => state.identity);
    const retryId = canonicalProjectId(requestedId) || refreshed?.canonicalProjectId || "";
    if (!retryId || retryId === canonicalId || retryId === requestedId) return response;

    state.retried += 1;
    const retryUrl = replaceProjectId(originalUrl, retryId);
    return previousFetch(rebuildInput(retryInput, retryUrl.href), init);
  };

  async function preserveAdvancedProject(request, input, init) {
    const payload = await readPayload(request, init);
    const projectId = firstId(payload?.sourceProjectId, payload?.manuscriptProjectId, payload?.internalProjectId, payload?.projectId, payload?.projectID, payload?.id);
    const active = readJSON(sessionStorage, ACTIVE_KEY);
    const activeAliases = aliasesFor(active);

    if (
      !projectId ||
      payload?.projectType !== "manuscript-studio" ||
      String(payload?.status || "") !== "intake" ||
      active?.workspace !== "manuscript-studio" ||
      !activeAliases.includes(projectId)
    ) {
      return null;
    }

    const pending = readJSON(sessionStorage, PENDING_KEY)?.project;
    if (sameAdvancedProject(pending, projectId)) {
      captureProjectIdentity(pending, projectId, null);
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
        ? body.projects.find(project => aliasesIntersect(aliasesFor(project), [projectId]))
        : null;

      if (existingResponse.ok && sameAdvancedProject(existing, projectId)) {
        captureProjectIdentity(existing, projectId, null);
        return preservedResponse(existing, "durable-registry");
      }
    } catch (error) {
      console.warn("[kairos-manuscript-project-preservation] Registry preflight was unavailable.", {
        build: BUILD,
        projectId,
        message: error?.message || String(error),
      });
    }

    return null;
  }

  async function resolveIdentity(options = {}) {
    if (state.resolving && !options.force) return state.resolving;

    state.resolving = performResolution(options).finally(() => {
      state.resolving = null;
    });
    return state.resolving;
  }

  async function performResolution({ requestedId = "" } = {}) {
    state.resolutionAttempts += 1;
    const seeds = unique([
      requestedId,
      ...seedIds(),
      ...aliasesFor(state.identity),
    ]);

    let projects = [];
    try {
      const response = await deadline(previousFetch(COLLECTION_PATH, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "X-MMG-Client-Build": BUILD,
          "X-Kairos-Registry-Read": "resolve-manuscript-project-identity",
        },
      }), RESOLUTION_TIMEOUT_MS);
      const body = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(body?.projects)) projects = body.projects;
    } catch (error) {
      state.lastError = error?.message || String(error);
    }

    const project = selectProject(projects, seeds);
    const candidates = unique([
      ...preferredSourceIds(project),
      ...seeds,
    ]);

    let source = null;
    let canonicalProjectIdValue = "";
    for (const candidate of candidates) {
      const probed = await probeSource(candidate);
      if (!probed) continue;
      source = probed;
      canonicalProjectIdValue = firstId(probed.projectId, probed.source?.projectId, candidate);
      break;
    }

    if (!canonicalProjectIdValue) {
      canonicalProjectIdValue = firstId(
        project?.sourceProjectId,
        project?.manuscriptProjectId,
        project?.internalProjectId,
        state.identity?.canonicalProjectId,
      );
    }

    if (!canonicalProjectIdValue) return state.identity;

    captureProjectIdentity(project, canonicalProjectIdValue, source, seeds);
    state.lastError = "";
    return state.identity;
  }

  async function probeSource(projectId) {
    if (!projectId) return null;
    try {
      const response = await deadline(previousFetch(
        `${SOURCE_PREFIX}${encodeURIComponent(projectId)}/source/text`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "X-MMG-Client-Build": BUILD,
            "X-Kairos-Identity-Probe": "source-text",
          },
        },
      ), PROBE_TIMEOUT_MS);
      if (!response.ok) return null;
      const body = await deadline(response.json().catch(() => ({})), PROBE_TIMEOUT_MS);
      return typeof body?.manuscript === "string" && body.manuscript.length
        ? body
        : null;
    } catch {
      return null;
    }
  }

  function captureProjectIdentity(project, canonicalId, source, extraAliases = []) {
    const projectAliases = aliasesFor(project);
    const registryProjectId = firstId(project?.projectId, project?.projectID, project?.id);
    const publicProjectId = firstId(project?.publicProjectId, registryProjectId?.startsWith("PUB-") ? registryProjectId : "");
    const intakeId = firstId(project?.intakeId, project?.intakeID);
    const allAliases = unique([
      canonicalId,
      registryProjectId,
      publicProjectId,
      intakeId,
      ...projectAliases,
      ...extraAliases,
      ...seedIds(),
    ]);

    for (const alias of allAliases) state.aliases.set(alias, canonicalId);

    state.identity = {
      workspace: "manuscript-studio",
      projectId: canonicalId,
      canonicalProjectId: canonicalId,
      sourceProjectId: canonicalId,
      manuscriptProjectId: canonicalId,
      registryProjectId: registryProjectId || canonicalId,
      publicProjectId: publicProjectId || null,
      intakeId: intakeId || null,
      title: project?.title || project?.publicationTitle || state.identity?.title || "Saved manuscript project",
      status: project?.status || state.identity?.status || "production_intake",
      stage: project?.stage || state.identity?.stage || "project_setup",
      productionAssignment: project?.productionAssignment || project?.assignment || state.identity?.productionAssignment || null,
      aliases: allAliases,
      resolvedAt: new Date().toISOString(),
      build: BUILD,
    };
    state.sourcePayload = source || state.sourcePayload;
    state.lastProjectId = canonicalId;
    state.lastStatus = state.identity.status || state.identity.stage;

    const active = {
      ...(readJSON(sessionStorage, ACTIVE_KEY) || {}),
      ...state.identity,
      workspace: "manuscript-studio",
      openedAt: readJSON(sessionStorage, ACTIVE_KEY)?.openedAt || new Date().toISOString(),
    };
    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
    writeJSON(localStorage, IDENTITY_KEY, state.identity);

    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set("open", "manuscript");
    nextUrl.searchParams.set("project", canonicalId);
    if (registryProjectId && registryProjectId !== canonicalId) {
      nextUrl.searchParams.set("registryProject", registryProjectId);
    }
    history.replaceState(history.state, "", nextUrl.href);

    if (source?.manuscript) {
      const restored = {
        ...source,
        projectId: canonicalId,
        project: project || source.project || null,
        source: source.source || null,
        manuscript: source.manuscript,
        identity: state.identity,
        build: BUILD,
      };
      globalThis.__KAIROS_MANUSCRIPT_RESTORED_SOURCE__ = restored;
    }

    window.dispatchEvent(new CustomEvent("kairos:manuscript:identity-resolved", {
      detail: state.identity,
    }));
  }

  function seedSynchronousIdentity() {
    const persisted = readJSON(localStorage, IDENTITY_KEY);
    if (!persisted?.canonicalProjectId) return;
    state.identity = persisted;
    for (const alias of aliasesFor(persisted)) {
      state.aliases.set(alias, persisted.canonicalProjectId);
    }

    const active = readJSON(sessionStorage, ACTIVE_KEY);
    const requested = requestedIds();
    const activeIsDisposable = !active?.projectId || /^manuscript-studio-[0-9a-f-]{36}$/i.test(active.projectId);
    if (!requested.length && activeIsDisposable) {
      sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({
        ...(active || {}),
        ...persisted,
        workspace: "manuscript-studio",
      }));
    }
  }

  function seedIds() {
    const active = readJSON(sessionStorage, ACTIVE_KEY);
    const persisted = readJSON(localStorage, IDENTITY_KEY);
    const pending = readJSON(sessionStorage, PENDING_KEY);
    const draft = readJSON(sessionStorage, DRAFT_KEY);
    return unique([
      ...requestedIds(),
      ...aliasesFor(active),
      ...aliasesFor(persisted),
      ...aliasesFor(pending?.project),
      ...aliasesFor(draft),
    ]);
  }

  function requestedIds() {
    const params = new URL(location.href).searchParams;
    return unique([
      params.get("sourceProject"),
      params.get("manuscriptProject"),
      params.get("project"),
      params.get("registryProject"),
      params.get("intake"),
    ]);
  }

  function selectProject(projects, seeds) {
    const recoverable = projects.filter(isRecoverableProject);
    if (!recoverable.length) return null;

    const draft = readJSON(sessionStorage, DRAFT_KEY);
    const draftTitle = String(draft?.title || "").trim().toLowerCase();
    const scored = recoverable.map(project => {
      const aliases = aliasesFor(project);
      const aliasScore = aliasesIntersect(aliases, seeds) ? 10_000 : 0;
      const title = String(project?.title || project?.publicationTitle || "").trim().toLowerCase();
      const titleScore = draftTitle && title === draftTitle ? 2_000 : 0;
      const advancedScore = sameAdvancedProject(project, aliases[0] || "") ? 1_000 : 0;
      const timestamp = Date.parse(project?.updatedAt || project?.createdAt || project?.assignedAt || 0) || 0;
      return { project, score: aliasScore + titleScore + advancedScore + timestamp / 1e12 };
    });
    scored.sort((left, right) => right.score - left.score);
    return scored[0]?.project || null;
  }

  function isRecoverableProject(project) {
    if (!project || typeof project !== "object") return false;
    const type = String(project.projectType || project.type || "").toLowerCase();
    const status = String(project.status || "").toLowerCase();
    const stage = String(project.stage || "").toLowerCase();
    return type === "manuscript-studio" ||
      Boolean(project.sourceProjectId || project.manuscriptProjectId || project.internalProjectId) ||
      ADVANCED_STATUSES.has(status) ||
      ["intake", "project_setup", "editorial", "manufacturing"].includes(stage);
  }

  function preferredSourceIds(project) {
    return unique([
      project?.sourceProjectId,
      project?.manuscriptProjectId,
      project?.internalProjectId,
      project?.canonicalProjectId,
      project?.projectId,
      project?.projectID,
      project?.id,
    ]);
  }

  function canonicalProjectId(value = "") {
    const requested = String(value || "").trim();
    if (requested && state.aliases.has(requested)) return state.aliases.get(requested);
    if (requested && state.identity?.aliases?.includes?.(requested)) return state.identity.canonicalProjectId;
    if (!requested) return state.identity?.canonicalProjectId || "";
    return requested;
  }

  function aliasesFor(value) {
    if (!value || typeof value !== "object") return [];
    return unique([
      value.canonicalProjectId,
      value.sourceProjectId,
      value.manuscriptProjectId,
      value.internalProjectId,
      value.registryProjectId,
      value.publicProjectId,
      value.projectId,
      value.projectID,
      value.id,
      value.intakeId,
      value.intakeID,
      ...(Array.isArray(value.aliases) ? value.aliases : []),
    ]);
  }

  function preservedResponse(project, source) {
    state.preserved += 1;
    state.lastProjectId = firstId(project.sourceProjectId, project.projectId, project.projectID, project.id);
    state.lastStatus = project.status || project.stage || "production_intake";

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
    if (!project || (projectId && !aliasesFor(project).includes(projectId))) return false;
    const status = String(project.status || "").toLowerCase();
    const stage = String(project.stage || "").toLowerCase();
    return ADVANCED_STATUSES.has(status) || stage === "project_setup" || stage === "editorial" || stage === "manufacturing";
  }

  function replaceProjectId(url, projectId) {
    const match = url.pathname.match(/^\/api\/production-registry\/manuscripts\/([^/]+)(\/.*)?$/);
    if (!match) return url;
    const next = new URL(url.href);
    next.pathname = `${SOURCE_PREFIX}${encodeURIComponent(projectId)}${match[2] || ""}`;
    return next;
  }

  function rebuildInput(input, href) {
    if (input instanceof Request) {
      try { return new Request(href, input.clone()); }
      catch { return new Request(href, input); }
    }
    return href;
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

  function deadline(promise, milliseconds) {
    let timer = 0;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Manuscript identity resolution exceeded ${milliseconds} ms.`)), milliseconds);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  function aliasesIntersect(left, right) {
    const set = new Set(unique(right));
    return unique(left).some(value => set.has(value));
  }

  function firstId(...values) {
    return values.map(value => String(value || "").trim()).find(Boolean) || "";
  }

  function unique(values) {
    return [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))];
  }

  function readJSON(storage, key) {
    try { return JSON.parse(storage.getItem(key) || "null"); }
    catch { return null; }
  }

  function writeJSON(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); }
    catch (error) {
      console.warn("[kairos-manuscript-project-identity] Browser identity persistence was unavailable.", {
        build: BUILD,
        message: error?.message || String(error),
      });
    }
  }
})();
