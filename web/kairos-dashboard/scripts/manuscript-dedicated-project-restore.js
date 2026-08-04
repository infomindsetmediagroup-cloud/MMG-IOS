(() => {
  const BUILD = "kairos-manuscript-dedicated-restore-20260804-2-source-cache";
  const PATCH_BUILD = "kairos-manuscript-dedicated-restore-20260804-3-identity-reconnect";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_DEDICATED_RESTORE__";
  const ACTIVE_KEY = "kairos.production.active-workspace";
  const DRAFT_KEY = "kairos.manuscript-studio.recoverable-draft.v1";
  const REQUEST_TIMEOUT_MS = 10_000;
  const ELEMENT_TIMEOUT_MS = 12_000;

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptDedicatedRestore = globalThis[GLOBAL_KEY];
    return;
  }

  const state = {
    projectId: resolveProjectId(),
    restoring: false,
    restored: false,
    attempts: 0,
    lastError: "",
  };

  const api = Object.freeze({
    build: BUILD,
    patchBuild: PATCH_BUILD,
    ready: true,
    restore: restoreActiveProject,
    snapshot() {
      return {
        build: BUILD,
        patchBuild: PATCH_BUILD,
        projectId: state.projectId || null,
        restoring: state.restoring,
        restored: state.restored,
        attempts: state.attempts,
        lastError: state.lastError || null,
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptDedicatedRestore = api;

  const prepared = prepareProjectState();

  window.addEventListener("kairos:manuscript-studio:opened", () => {
    void restoreActiveProject(prepared);
  }, { once: true });

  queueMicrotask(() => {
    if (document.querySelector("#manuscript-studio-overlay")) {
      void restoreActiveProject(prepared);
    }
  });

  async function prepareProjectState(force = false) {
    const identity = globalThis.KairosManuscriptProjectIdentity;
    if (force) await identity?.resolve?.({ force: true, requestedId: state.projectId }).catch(() => null);
    else await identity?.readyPromise?.catch(() => null);

    state.projectId = identity?.canonicalProjectId?.(state.projectId)
      || resolveProjectId()
      || state.projectId;

    if (!state.projectId) return null;
    writeActiveProject(state.projectId);
    return loadProjectState(state.projectId);
  }

  async function restoreActiveProject(preparedState = null) {
    if (state.restored) return { status: "restored", projectId: state.projectId, build: BUILD };
    if (state.restoring) return { status: "restoring", projectId: state.projectId, build: BUILD };

    state.restoring = true;
    state.attempts += 1;
    state.lastError = "";

    try {
      const payload = await (preparedState || prepareProjectState(true));
      if (!payload || !state.projectId) {
        return { status: "no-project", build: BUILD };
      }

      await waitForElement("#manuscript-studio-overlay", ELEMENT_TIMEOUT_MS);

      const restoreDetail = {
        projectId: state.projectId,
        project: payload.project,
        source: payload.source,
        manuscript: payload.manuscript,
        identity: globalThis.KairosManuscriptProjectIdentity?.snapshot?.().identity || null,
        handoff: "dashboard-content",
        capturedAt: new Date().toISOString(),
        build: BUILD,
        patchBuild: PATCH_BUILD,
      };
      globalThis.__KAIROS_MANUSCRIPT_RESTORED_SOURCE__ = restoreDetail;
      globalThis.KairosManuscriptRegistryBridge?.captureRestoredSource?.(restoreDetail);
      window.dispatchEvent(new CustomEvent("kairos:manuscript:restore", {
        detail: restoreDetail,
      }));

      const overlay = await waitForElement("#manuscript-studio-overlay", ELEMENT_TIMEOUT_MS);
      renderConnectedReceipt(overlay, payload);
      state.restored = true;
      state.lastError = "";

      window.dispatchEvent(new CustomEvent("kairos:production:state-changed", {
        detail: {
          reason: "dedicated-project-restored",
          workspace: "manuscript-studio",
          projectId: state.projectId,
          build: BUILD,
          patchBuild: PATCH_BUILD,
        },
      }));

      return { status: "restored", projectId: state.projectId, build: BUILD, patchBuild: PATCH_BUILD };
    } catch (error) {
      state.lastError = error?.message || "The saved manuscript project could not reconnect.";
      await renderRestoreFailure(state.lastError);
      return {
        status: "failed",
        projectId: state.projectId,
        error: state.lastError,
        build: BUILD,
        patchBuild: PATCH_BUILD,
      };
    } finally {
      state.restoring = false;
    }
  }

  async function loadProjectState(projectId) {
    const identity = globalThis.KairosManuscriptProjectIdentity;
    const canonicalId = identity?.canonicalProjectId?.(projectId) || projectId;
    if (canonicalId !== state.projectId) {
      state.projectId = canonicalId;
      writeActiveProject(canonicalId);
    }

    const draft = readJSON(DRAFT_KEY);
    const cached = globalThis.KairosManuscriptRegistryBridge?.getRestoredSource?.(canonicalId)
      || cachedRestoredSource(canonicalId);
    let project = cached?.project || null;
    let sourcePayload = cached?.manuscript ? cached : null;

    if (!project) {
      try {
        const response = await requestWithDeadline("/api/production-registry/projects");
        const body = await response.json().catch(() => ({}));
        if (response.ok && Array.isArray(body.projects)) {
          project = body.projects.find(item => projectMatches(item, canonicalId)) || null;
        }
      } catch {
        // The canonical identity and retained draft remain valid fallbacks.
      }
    }

    if (!sourcePayload?.manuscript) {
      try {
        const response = await requestWithDeadline(
          `/api/production-registry/manuscripts/${encodeURIComponent(canonicalId)}/source/text`,
        );
        const body = await response.json().catch(() => ({}));
        if (response.ok) sourcePayload = body;
      } catch {
        // The browser-retained draft is used below when the registry read is unavailable.
      }
    }

    const manuscript = String(sourcePayload?.manuscript || draft?.manuscript || "");
    const source = sourcePayload?.source || draft?.source || null;

    if (!manuscript) {
      throw new Error("The saved project identity was resolved, but its manuscript source could not be restored from the canonical source shard.");
    }

    return {
      project: project || fallbackProject(canonicalId, draft),
      source,
      manuscript,
    };
  }

  function renderConnectedReceipt(overlay, payload) {
    const panel = overlay?.querySelector(".manuscript-panel");
    if (!panel) throw new Error("The dedicated Manuscript Studio opened without its production panel.");

    [...panel.children].forEach(child => {
      if (child.tagName !== "HEADER") child.remove();
    });

    const project = payload.project || fallbackProject(state.projectId, null);
    const manuscript = String(payload.manuscript || "");
    const source = payload.source || {};
    const result = document.createElement("div");
    result.className = "manuscript-result";
    result.dataset.kairosIntakeReceipt = "dedicated-project-restore";
    result.dataset.kairosCanonicalHandoff = PATCH_BUILD;
    result.innerHTML = `
      <div class="manuscript-status">
        <span>Connected manuscript project</span>
        <strong>${escapeHTML(project.status || "production_intake")}</strong>
      </div>
      <h3>${escapeHTML(project.summary || "The saved manuscript project is connected and ready to continue.")}</h3>
      <p><strong>Project:</strong> ${escapeHTML(project.registryProjectId || project.publicProjectId || project.projectId || state.projectId)} · <strong>Stage:</strong> ${escapeHTML(project.stage || "project_setup")}</p>
      <p><strong>Source identity:</strong> ${escapeHTML(state.projectId)} · <strong>Accepted source:</strong> ${manuscript.length.toLocaleString()} characters · ${countWords(manuscript).toLocaleString()} words</p>
      <details class="manuscript-source-review" data-kairos-source-review>
        <summary class="secondary">Review Intake Source</summary>
        <div data-kairos-source-review-content>
          <p class="eyebrow">Accepted intake source</p>
          <h3>Review the preserved manuscript</h3>
          <p>This is the authoritative source stored for the connected production project.</p>
          <label>Preserved manuscript text<textarea readonly data-intake-source-review>${escapeHTML(manuscript)}</textarea></label>
        </div>
      </details>
      <div class="issue-list">
        <article><b>${escapeHTML(project.nextAction || "Continue the saved production workflow.")}</b><p>The dashboard reconnected the public project record to its canonical manuscript source.</p></article>
      </div>
      <p class="manuscript-note">Source: ${escapeHTML(source.filename || source.name || "stored manuscript")} · the saved project, manuscript source, cover, editorial state, and package remain on one canonical identity.</p>
      <section id="manuscript-project-setup" class="manuscript-project-setup" data-kairos-project-setup-shell data-project-id="${escapeHTML(state.projectId)}" aria-live="polite">
        <p class="eyebrow">Saved production stage</p>
        <h3>Loading Project Setup…</h3>
        <p data-kairos-setup-load-status>Kairos is restoring the saved assignment and editorial handoff.</p>
      </section>
    `;

    panel.append(result);
    overlay.dataset.kairosManuscriptView = "intake-receipt";
    window.KairosManuscriptSetupController?.enhance?.();
    window.KairosManuscriptReceiptContinuationRecovery?.recover?.();
    result.scrollIntoView({ behavior: "auto", block: "start" });
  }

  async function renderRestoreFailure(message) {
    const overlay = await waitForElement("#manuscript-studio-overlay", ELEMENT_TIMEOUT_MS).catch(() => null);
    const panel = overlay?.querySelector(".manuscript-panel");
    if (!panel) return;

    panel.querySelector("[data-kairos-dedicated-restore-error]")?.remove();
    const card = document.createElement("article");
    card.dataset.kairosDedicatedRestoreError = PATCH_BUILD;
    card.className = "manuscript-error";
    card.innerHTML = `
      <strong>Saved manuscript needs to reconnect</strong>
      <p>${escapeHTML(message)}</p>
      <button type="button" class="secondary" data-kairos-dedicated-restore-retry>Reconnect saved project</button>
      <button type="button" class="secondary" data-kairos-dedicated-restore-command>Return to Command Center</button>
    `;
    panel.insertBefore(card, panel.children[1] || null);
    card.querySelector("[data-kairos-dedicated-restore-retry]")?.addEventListener("click", () => {
      card.remove();
      state.restored = false;
      void restoreActiveProject(prepareProjectState(true));
    });
    card.querySelector("[data-kairos-dedicated-restore-command]")?.addEventListener("click", () => {
      location.assign(new URL("./", location.href).href);
    });
  }

  async function requestWithDeadline(path) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = window.setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(path, {
        credentials: "include",
        cache: "no-store",
        signal: controller?.signal,
        headers: { "X-MMG-Client-Build": PATCH_BUILD },
      });
      const text = await response.text();
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
      });
    } catch (error) {
      if (controller?.signal.aborted) {
        throw new Error("Kairos did not finish restoring the saved manuscript response body in time.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function cachedRestoredSource(projectId) {
    const value = globalThis.__KAIROS_MANUSCRIPT_RESTORED_SOURCE__;
    const identity = globalThis.KairosManuscriptProjectIdentity;
    const cachedId = identity?.canonicalProjectId?.(value?.projectId) || value?.projectId;
    return cachedId === projectId && value?.manuscript ? value : null;
  }

  function resolveProjectId() {
    const identity = globalThis.KairosManuscriptProjectIdentity;
    const params = new URLSearchParams(location.search);
    const requested = params.get("sourceProject")
      || params.get("manuscriptProject")
      || params.get("project")
      || "";
    if (requested) return identity?.canonicalProjectId?.(requested) || requested;
    const active = readJSON(ACTIVE_KEY);
    const activeId = active?.workspace === "manuscript-studio"
      ? active.sourceProjectId || active.manuscriptProjectId || active.projectId || ""
      : "";
    return identity?.canonicalProjectId?.(activeId) || activeId || identity?.canonicalProjectId?.() || "";
  }

  function writeActiveProject(projectId) {
    const identity = globalThis.KairosManuscriptProjectIdentity?.snapshot?.().identity || {};
    const existing = readJSON(ACTIVE_KEY) || {};
    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({
      ...existing,
      ...identity,
      workspace: "manuscript-studio",
      projectId,
      sourceProjectId: projectId,
      manuscriptProjectId: projectId,
      openedAt: existing.openedAt || new Date().toISOString(),
      build: PATCH_BUILD,
      handoffReason: "dashboard-content",
    }));
  }

  function projectMatches(project, canonicalId) {
    const identity = globalThis.KairosManuscriptProjectIdentity;
    const aliases = identity?.aliasesFor?.(project) || [
      project?.sourceProjectId,
      project?.manuscriptProjectId,
      project?.internalProjectId,
      project?.projectId,
      project?.projectID,
      project?.id,
      project?.intakeId,
      project?.intakeID,
    ].filter(Boolean);
    return aliases.some(alias => (identity?.canonicalProjectId?.(alias) || alias) === canonicalId);
  }

  function fallbackProject(projectId, draft) {
    const identity = globalThis.KairosManuscriptProjectIdentity?.snapshot?.().identity || {};
    return {
      ...identity,
      projectId,
      sourceProjectId: projectId,
      projectType: "manuscript-studio",
      title: String(identity.title || draft?.title || "Saved manuscript project"),
      status: identity.status || "production_intake",
      stage: identity.stage || "project_setup",
      progress: 25,
      activeWorkspace: "manuscript-studio",
      summary: "The accepted manuscript source is connected to the dedicated production workflow.",
      nextAction: "Continue Project Setup.",
    };
  }

  function waitForElement(selector, timeoutMs) {
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (element, error = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        observer.disconnect();
        if (error) reject(error);
        else resolve(element);
      };
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) finish(element);
      });
      const timer = window.setTimeout(
        () => finish(null, new Error("The dedicated Manuscript Studio did not become available in time.")),
        timeoutMs,
      );
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    });
  }

  function countWords(value) {
    const text = String(value || "").trim();
    return text ? text.split(/\s+/).length : 0;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'\"]/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    })[character]);
  }

  function readJSON(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || "null"); }
    catch { return null; }
  }
})();
