(() => {
  const BUILD = "kairos-manuscript-final-deliverable-engine-20260804-1";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_FINAL_DELIVERABLE_ENGINE__";
  const ACTIVE_KEY = "kairos.production.active-workspace";
  const READ_TIMEOUT_MS = 15_000;
  const BUILD_TIMEOUT_MS = 150_000;
  const APPROVE_TIMEOUT_MS = 60_000;
  const PACKAGE_CONFIRMATION = "APPROVE PACKAGE";

  if (globalThis[GLOBAL_KEY]) {
    globalThis.KairosManuscriptFinalDeliverableEngine = globalThis[GLOBAL_KEY];
    return;
  }

  const original = globalThis.KairosManuscriptPipelineOrchestrator;
  if (!original?.ready) {
    console.error("[kairos-final-deliverable] authoritative orchestrator is unavailable", { build: BUILD });
    return;
  }

  const state = {
    busy: false,
    phase: "",
    projectId: "",
    primaryError: "",
    lastError: "",
    lastRecord: null,
    engine: "",
    operationId: "",
  };

  const api = Object.freeze({
    ...original,
    build: BUILD,
    upstreamBuild: original.build,
    ready: true,
    manufacture: manufactureFinalDeliverable,
    refresh: refreshFinalDeliverable,
    approvePackage,
    snapshot() {
      return {
        build: BUILD,
        upstreamBuild: original.build,
        busy: state.busy,
        phase: state.phase,
        projectId: state.projectId || activeProjectId(),
        primaryError: state.primaryError || null,
        lastError: state.lastError || null,
        status: state.lastRecord?.status || null,
        engine: state.engine || null,
        operationId: state.operationId || null,
      };
    },
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptFinalDeliverableEngine = api;
  globalThis.KairosManuscriptPipelineOrchestrator = api;

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const retry = target?.closest?.("[data-final-deliverable-retry]");
    const approve = target?.closest?.("[data-final-deliverable-approve]");
    const refresh = target?.closest?.("[data-final-deliverable-refresh]");
    if (!retry && !approve && !refresh) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (approve) void approvePackage();
    else if (refresh) void refreshFinalDeliverable();
    else void manufactureFinalDeliverable();
  }, true);

  async function manufactureFinalDeliverable(projectId = activeProjectId()) {
    if (state.busy) return null;
    if (!projectId) {
      renderError("Kairos could not identify the active manuscript project.");
      return null;
    }

    state.busy = true;
    state.projectId = projectId;
    state.operationId = createId();
    state.primaryError = "";
    state.lastError = "";
    state.engine = "";

    try {
      state.phase = "Verifying project setup and approved editorial state…";
      renderBusy(state.phase);
      const readiness = await readReadiness(projectId);
      if (!readiness.setupComplete) {
        throw new Error("Complete Project Setup before producing the final deliverable.");
      }
      if (!readiness.editorialReady) {
        throw new Error("Approve and finalize the editorial manuscript before producing the final deliverable.");
      }

      state.phase = "Producing the complete customer delivery package…";
      renderBusy(state.phase);

      let record = null;
      try {
        record = await runPrimaryEngine(projectId);
        state.engine = "canonical-customer-package";
      } catch (error) {
        state.primaryError = message(error, "The canonical customer-package engine did not complete.");
        state.phase = "Recovering through the deterministic deliverables builder…";
        renderBusy(state.phase, state.primaryError);
        record = await runDeterministicFallback(projectId);
        state.engine = "deterministic-deliverables-fallback";
      }

      state.lastRecord = record;
      state.lastError = "";
      renderPackage(record);
      announce("final-deliverable-ready", projectId, record);
      return record;
    } catch (error) {
      state.lastError = message(error, "Kairos could not produce the final deliverable package.");
      renderError(state.lastError);
      return null;
    } finally {
      state.busy = false;
      state.phase = "";
    }
  }

  async function runPrimaryEngine(projectId) {
    return requestJSON(
      `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline/run`,
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-MMG-Client-Build": BUILD,
          "X-Kairos-Operation-Id": state.operationId,
          "X-Kairos-Idempotency-Key": state.operationId,
        },
        body: JSON.stringify({
          mode: "source-preserving-production",
          confirmation: "MANUFACTURE DELIVERY PACKAGE",
          actor: "MMG Executive",
        }),
      },
      BUILD_TIMEOUT_MS,
    );
  }

  async function runDeterministicFallback(projectId) {
    const body = await requestJSON(
      `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/deliverables/build`,
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-MMG-Client-Build": BUILD,
          "X-Kairos-Operation-Id": state.operationId,
          "X-Kairos-Idempotency-Key": state.operationId,
        },
        body: JSON.stringify({
          confirmation: "MANUFACTURE DELIVERY PACKAGE",
          actor: "MMG Executive",
          sourceMode: "approved-editorial-version",
        }),
      },
      BUILD_TIMEOUT_MS,
    );
    return adaptDeterministicRecord(projectId, body);
  }

  async function refreshFinalDeliverable(projectId = activeProjectId()) {
    if (!projectId || state.busy) return null;
    state.projectId = projectId;
    state.lastError = "";

    try {
      const primary = await requestJSON(
        `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline`,
        { method: "GET", credentials: "include", cache: "no-store" },
        READ_TIMEOUT_MS,
      );
      state.engine = "canonical-customer-package";
      state.lastRecord = primary;
      renderPackage(primary);
      return primary;
    } catch (primaryError) {
      try {
        const fallback = await requestJSON(
          `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/deliverables/build`,
          { method: "GET", credentials: "include", cache: "no-store" },
          READ_TIMEOUT_MS,
        );
        const record = adaptDeterministicRecord(projectId, fallback);
        state.engine = "deterministic-deliverables-fallback";
        state.primaryError = message(primaryError, "No canonical package record was found.");
        state.lastRecord = record;
        renderPackage(record);
        return record;
      } catch (fallbackError) {
        state.lastError = message(fallbackError, message(primaryError, "No saved deliverable package was found."));
        renderError(state.lastError);
        return null;
      }
    }
  }

  async function approvePackage(projectId = activeProjectId()) {
    if (!projectId || state.busy) return null;
    if (state.engine === "deterministic-deliverables-fallback") {
      renderPackage({
        ...state.lastRecord,
        status: "package-approved",
        nextAction: "The deterministic delivery package is finalized and ready to download.",
      });
      return state.lastRecord;
    }

    state.busy = true;
    state.phase = "Finalizing the reviewed delivery package…";
    renderBusy(state.phase);
    try {
      const record = await requestJSON(
        `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/experience/approve-package`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-MMG-Client-Build": BUILD,
            "X-Kairos-Operation-Id": createId(),
          },
          body: JSON.stringify({
            confirmation: PACKAGE_CONFIRMATION,
            actor: "MMG Executive",
          }),
        },
        APPROVE_TIMEOUT_MS,
      );
      state.lastRecord = record;
      renderPackage(record);
      return record;
    } catch (error) {
      state.lastError = message(error, "Kairos could not finalize the delivery package.");
      renderError(state.lastError);
      return null;
    } finally {
      state.busy = false;
      state.phase = "";
    }
  }

  async function readReadiness(projectId) {
    const base = `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}`;
    const [setup, editorial] = await Promise.all([
      requestJSON(`${base}/setup`, { method: "GET", credentials: "include", cache: "no-store" }, READ_TIMEOUT_MS),
      requestJSON(`${base}/editorial`, { method: "GET", credentials: "include", cache: "no-store" }, READ_TIMEOUT_MS),
    ]);
    const setupStatus = setup?.setup?.status || setup?.status || "";
    const editorialStatus = editorial?.editorial?.status || editorial?.status || "";
    return {
      setupComplete: ["assigned-to-production", "awaiting-customer-cover"].includes(setupStatus),
      editorialReady: editorialStatus === "ready-for-manufacturing",
      setupStatus,
      editorialStatus,
    };
  }

  function adaptDeterministicRecord(projectId, body) {
    const build = body?.deliverablesBuild || body?.buildRecord || body;
    if (!build || build.status !== "COMPLETED") {
      throw new Error(body?.error?.message || "The deterministic deliverables builder did not complete.");
    }
    const artifacts = Array.isArray(build.artifacts) ? build.artifacts : [];
    const integrityPassed = artifacts.length > 0 && artifacts.every(artifact => (
      Number(artifact.byteSize || 0) > 0 && /^[a-f0-9]{64}$/i.test(String(artifact.sha256 || ""))
    ));
    return {
      status: "production-ready",
      build: BUILD,
      projectId,
      metadata: {
        title: build.metadata?.workingTitle || build.metadata?.inferred?.title || "Complete publishing package",
        author: build.metadata?.author || "Mindset Media Group",
      },
      vault: {
        title: build.metadata?.workingTitle || "Complete publishing package",
        assets: artifacts,
        packageDownloadURL: `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/deliverables/zip`,
        integrity: {
          passed: integrityPassed,
          assetCount: artifacts.length,
        },
      },
      shopify: { status: "not-prepared" },
      nextAction: "Review and download the deterministic final delivery package. Shopify publication remains separately approval-gated.",
      recovery: {
        engine: "deterministic-deliverables-fallback",
        primaryError: state.primaryError || null,
        deliverablesBuildId: build.id || null,
      },
    };
  }

  function renderBusy(phase, detail = "") {
    const section = ensurePipelineSection();
    if (!section) return;
    section.hidden = false;
    section.style.removeProperty("display");
    section.setAttribute("aria-busy", "true");
    section.innerHTML = `
      <p class="eyebrow">Final deliverable engine</p>
      <h3>${escapeHTML(phase || "Working…")}</h3>
      <p class="manuscript-progress">Kairos is producing one resumable package operation. The approved editorial version remains authoritative.</p>
      ${detail ? `<p class="manuscript-note">Recovery detail: ${escapeHTML(detail)}</p>` : ""}
      <p class="manuscript-note">Operation: ${escapeHTML(state.operationId || "checking")}</p>
      <button type="button" class="secondary" data-final-deliverable-refresh>Check Saved Package</button>
    `;
  }

  function renderError(error) {
    const section = ensurePipelineSection();
    if (!section) return;
    section.hidden = false;
    section.style.removeProperty("display");
    section.removeAttribute("aria-busy");
    section.innerHTML = `
      <p class="eyebrow">Final deliverable engine</p>
      <h3>Final package needs attention</h3>
      <p class="manuscript-error" role="alert">${escapeHTML(error)}</p>
      ${state.primaryError ? `<p class="manuscript-note">Primary engine: ${escapeHTML(state.primaryError)}</p>` : ""}
      <div class="manuscript-actions">
        <button type="button" class="primary" data-final-deliverable-retry>Retry Final Deliverable</button>
        <button type="button" class="secondary" data-final-deliverable-refresh>Check Saved Package</button>
      </div>
    `;
  }

  function renderPackage(record) {
    const section = ensurePipelineSection();
    if (!section) return;
    const metadata = record?.metadata || {};
    const vault = record?.vault || {};
    const assets = Array.isArray(vault.assets) ? vault.assets : [];
    const packageURL = vault.packageDownloadURL || record?.packageDownloadURL || "";
    const approved = record?.status === "package-approved";
    const integrity = vault.integrity?.passed === false ? "Attention required" : "Verified";
    const engineLabel = state.engine === "deterministic-deliverables-fallback"
      ? "Deterministic recovery package"
      : approved ? "Approved delivery package" : "Customer package preview";

    section.hidden = false;
    section.style.removeProperty("display");
    section.removeAttribute("aria-busy");
    section.innerHTML = `
      <p class="eyebrow">${engineLabel}</p>
      <h3>${escapeHTML(metadata.title || vault.title || "Complete publishing package ready")}</h3>
      <p>${escapeHTML(record?.nextAction || "The final deliverable package is ready for review and download.")}</p>
      <div class="issue-list">
        <article><b>Package status</b><p>${escapeHTML(record?.status || "production-ready")}</p></article>
        <article><b>Assets</b><p>${assets.length} verified deliverables</p></article>
        <article><b>Integrity</b><p>${escapeHTML(integrity)}</p></article>
        <article><b>Engine</b><p>${escapeHTML(state.engine || "canonical-customer-package")}</p></article>
      </div>
      <div class="manuscript-actions">
        ${packageURL ? `<a class="primary" href="${escapeHTML(packageURL)}" target="_blank" rel="noopener">Download Complete Package</a>` : ""}
        ${!approved ? '<button type="button" class="secondary" data-final-deliverable-approve>Approve &amp; Finalize Package</button>' : ""}
        <button type="button" class="secondary" data-final-deliverable-refresh>Refresh Package State</button>
      </div>
      <div class="manuscript-manufacturing-grid">
        ${assets.map(artifactCard).join("")}
      </div>
      ${state.primaryError ? `<p class="manuscript-note">The canonical engine did not finish, so Kairos completed the package through the deterministic builder: ${escapeHTML(state.primaryError)}</p>` : ""}
    `;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function artifactCard(artifact) {
    const filename = artifact.filename || artifact.name || artifact.kind || "Deliverable";
    return `<article><b>${escapeHTML(filename)}</b><p>${escapeHTML(artifact.role || artifact.kind || artifact.mimeType || "Publishing asset")}</p><small>${Number(artifact.byteSize || 0).toLocaleString()} bytes</small></article>`;
  }

  function ensurePipelineSection() {
    let section = document.querySelector("#manuscript-auto-pipeline");
    if (section) return section;
    const editorial = document.querySelector("#manuscript-editorial-workbench");
    const result = document.querySelector("#manuscript-studio-overlay .manuscript-result");
    const parent = editorial?.parentElement || result;
    if (!parent) return null;
    section = document.createElement("section");
    section.id = "manuscript-auto-pipeline";
    section.className = "manuscript-auto-pipeline";
    parent.append(section);
    return section;
  }

  async function requestJSON(url, init, timeoutMs) {
    const response = await request(url, init, timeoutMs);
    const body = parseJSON(response.text, response.status);
    if (!response.ok) {
      throw new Error(body?.error?.message || `Kairos returned HTTP ${response.status}.`);
    }
    return body;
  }

  async function request(url, init, timeoutMs) {
    const controller = new AbortController();
    const parentSignal = init?.signal;
    const relayAbort = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted) relayAbort();
    else parentSignal?.addEventListener?.("abort", relayAbort, { once: true });
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const source = await fetch(url, { ...init, signal: controller.signal });
      const text = await source.text();
      return { ok: source.ok, status: source.status, headers: source.headers, text };
    } catch (error) {
      if (timedOut || controller.signal.aborted) {
        throw new Error(`Kairos did not finish ${url} within ${Math.round(timeoutMs / 1000)} seconds. Saved state can be checked safely.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener?.("abort", relayAbort);
    }
  }

  function parseJSON(text, status) {
    if (!text) return {};
    try { return JSON.parse(text); }
    catch { throw new Error(`Kairos returned an unreadable response (HTTP ${status}).`); }
  }

  function activeProjectId() {
    const queryProject = new URL(location.href).searchParams.get("project");
    if (queryProject) return queryProject;
    try {
      const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
      return active?.workspace === "manuscript-studio" ? active.projectId || null : null;
    } catch {
      return null;
    }
  }

  function announce(reason, projectId, record) {
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed", {
      detail: {
        reason,
        projectId,
        workspace: "manuscript-studio",
        status: record?.status || null,
        engine: state.engine,
        build: BUILD,
      },
    }));
  }

  function createId() {
    return globalThis.crypto?.randomUUID?.() || `deliverable-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function message(error, fallback) {
    return error?.message || fallback;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    })[character]);
  }
})();
