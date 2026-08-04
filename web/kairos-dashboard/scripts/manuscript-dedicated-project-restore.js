(() => {
  const BUILD = "kairos-manuscript-dedicated-restore-20260804-2-source-cache";
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
    ready: true,
    restore: restoreActiveProject,
    snapshot() {
      return {
        build: BUILD,
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

  if (!state.projectId) return;

  writeActiveProject(state.projectId);
  const prepared = loadProjectState(state.projectId);

  window.addEventListener("kairos:manuscript-studio:opened", () => {
    void restoreActiveProject(prepared);
  }, { once: true });

  queueMicrotask(() => {
    if (document.querySelector("#manuscript-studio-overlay")) {
      void restoreActiveProject(prepared);
    }
  });

  async function restoreActiveProject(preparedState = null) {
    if (!state.projectId) return { status: "no-project", build: BUILD };
    if (state.restored) return { status: "restored", projectId: state.projectId, build: BUILD };
    if (state.restoring) return { status: "restoring", projectId: state.projectId, build: BUILD };

    state.restoring = true;
    state.attempts += 1;
    state.lastError = "";

    try {
      const payload = await (preparedState || loadProjectState(state.projectId));
      await waitForElement("#manuscript-studio-overlay", ELEMENT_TIMEOUT_MS);

      const restoreDetail = {
        projectId: state.projectId,
        project: payload.project,
        source: payload.source,
        manuscript: payload.manuscript,
        handoff: "dashboard-content",
        capturedAt: new Date().toISOString(),
        build: BUILD,
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
        },
      }));

      return { status: "restored", projectId: state.projectId, build: BUILD };
    } catch (error) {
      state.lastError = error?.message || "The saved manuscript project could not reconnect.";
      await renderRestoreFailure(state.lastError);
      return {
        status: "failed",
        projectId: state.projectId,
        error: state.lastError,
        build: BUILD,
      };
    } finally {
      state.restoring = false;
    }
  }

  async function loadProjectState(projectId) {
    const draft = readJSON(DRAFT_KEY);
    const cached = globalThis.KairosManuscriptRegistryBridge?.getRestoredSource?.(projectId)
      || cachedRestoredSource(projectId);
    let project = cached?.project || null;
    let sourcePayload = cached?.manuscript ? cached : null;

    if (!project) {
      try {
        const response = await requestWithDeadline("/api/production-registry/projects");
        const body = await response.json().catch(() => ({}));
        if (response.ok && Array.isArray(body.projects)) {
          project = body.projects.find(item => item?.projectId === projectId) || null;
        }
      } catch {
        // The active project and retained draft remain valid fallbacks.
      }
    }

    if (!sourcePayload?.manuscript) {
      try {
        const response = await requestWithDeadline(
          `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source/text`,
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
      throw new Error("The saved project was found, but its manuscript source could not be restored. Retry this page once.");
    }

    return {
      project: project || fallbackProject(projectId, draft),
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
    result.dataset.kairosCanonicalHandoff = BUILD;
    result.innerHTML = `
      <div class="manuscript-status">
        <span>Connected manuscript project</span>
        <strong>${escapeHTML(project.status || "production_intake")}</strong>
      </div>
      <h3>${escapeHTML(project.summary || "The saved manuscript project is connected and ready to continue.")}</h3>
      <p><strong>Project:</strong> ${escapeHTML(project.projectId || state.projectId)} · <strong>Stage:</strong> ${escapeHTML(project.stage || "project_setup")}</p>
      <p><strong>Accepted source:</strong> ${manuscript.length.toLocaleString()} characters · ${countWords(manuscript).toLocaleString()} words</p>
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
        <article><b>${escapeHTML(project.nextAction || "Continue the saved production workflow.")}</b><p>The dashboard handed this exact project to the dedicated Manuscript Studio.</p></article>
      </div>
      <p class="manuscript-note">Source: ${escapeHTML(source.filename || source.name || "stored manuscript")} · no second intake or disconnected dashboard workspace was created.</p>
      <section id="manuscript-project-setup" class="manuscript-project-setup" data-kairos-project-setup-shell data-project-id="${escapeHTML(project.projectId || state.projectId)}" aria-live="polite">
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
    card.dataset.kairosDedicatedRestoreError = BUILD;
    card.className = "manuscript-error";
    card.innerHTML = `
      <strong>Saved manuscript needs to reconnect</strong>
      <p>${escapeHTML(message)}</p>
      <button type="button" class="secondary" data-kairos-dedicated-restore-retry>Retry saved project</button>
    `;
    panel.insertBefore(card, panel.children[1] || null);
    card.querySelector("[data-kairos-dedicated-restore-retry]")?.addEventListener("click", () => {
      card.remove();
      state.restored = false;
      void restoreActiveProject(loadProjectState(state.projectId));
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
        headers: { "X-MMG-Client-Build": BUILD },
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
    return value?.projectId === projectId && value?.manuscript ? value : null;
  }

  function resolveProjectId() {
    const requested = new URLSearchParams(location.search).get("project");
    if (requested) return requested;
    const active = readJSON(ACTIVE_KEY);
    return active?.workspace === "manuscript-studio" ? active.projectId || "" : "";
  }

  function writeActiveProject(projectId) {
    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
      openedAt: new Date().toISOString(),
      build: BUILD,
      handoffReason: "dashboard-content",
    }));
  }

  function fallbackProject(projectId, draft) {
    return {
      projectId,
      projectType: "manuscript-studio",
      title: String(draft?.title || "Saved manuscript project"),
      status: "production_intake",
      stage: "project_setup",
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
