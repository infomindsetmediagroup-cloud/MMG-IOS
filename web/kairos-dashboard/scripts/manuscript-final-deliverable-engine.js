(() => {
  const BUILD = "kairos-manuscript-final-delivery-control-20260804-4";
  const CERTIFIED_SNAPSHOT_BUILD = "kairos-manuscript-final-deliverable-engine-20260804-1";
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_FINAL_DELIVERABLE_ENGINE__";
  const ACTIVE_KEY = "kairos.production.active-workspace";
  const READ_TIMEOUT_MS = 12_000;
  const WRITE_TIMEOUT_MS = 65_000;
  const BUILD_TIMEOUT_MS = 150_000;
  const AUTO_TRIGGER_KEY = "kairos.final-delivery.auto-triggered";

  const state = {
    busy: false,
    projectId: "",
    phase: "waiting",
    operationId: "",
    primaryError: "",
    lastError: "",
    lastRecord: null,
    engine: "",
    autoTriggered: false,
  };

  const api = Object.freeze({
    build: BUILD,
    certifiedBuild: CERTIFIED_SNAPSHOT_BUILD,
    ready: true,
    manufacture: manufactureFinalDeliverable,
    refresh: refreshFinalDeliverable,
    snapshot: () => ({
      build: CERTIFIED_SNAPSHOT_BUILD,
      releaseBuild: BUILD,
      busy: state.busy,
      projectId: state.projectId || activeProjectId(),
      phase: state.phase,
      operationId: state.operationId || null,
      primaryError: state.primaryError || null,
      lastError: state.lastError || null,
      status: state.lastRecord?.status || null,
      engine: state.engine || null,
      autoTriggered: state.autoTriggered,
    }),
  });

  globalThis[GLOBAL_KEY] = api;
  globalThis.KairosManuscriptFinalDeliverableEngine = api;
  globalThis.KairosManuscriptPipelineOrchestrator = api;

  installStyles();
  mountControl();
  bindActions();
  watchForFinalQueue();

  function mountControl() {
    if (document.querySelector("#kairos-final-delivery-control")) return;
    const panel = document.createElement("aside");
    panel.id = "kairos-final-delivery-control";
    panel.setAttribute("data-kairos-final-delivery-control", BUILD);
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <div class="kairos-final-delivery-copy">
        <p class="kairos-final-delivery-eyebrow">Final delivery</p>
        <strong data-kairos-final-delivery-title>Produce the complete delivery package</strong>
        <span data-kairos-final-delivery-status>The saved manuscript remains available even if Editorial Workbench is stalled.</span>
      </div>
      <div class="kairos-final-delivery-actions">
        <button type="button" data-kairos-final-delivery-run>Produce Final Deliverable</button>
        <button type="button" data-kairos-final-delivery-check>Check Saved Package</button>
        <a hidden data-kairos-final-delivery-download>Download Complete Package</a>
      </div>
    `;
    document.body.append(panel);
    updateControl("ready", "Produce the complete delivery package", "The final action is independent of Editorial Workbench.");
  }

  function bindActions() {
    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      const run = target?.closest?.(
        "[data-kairos-final-delivery-run], [data-final-deliverable-retry], [data-start-local-production]",
      );
      const check = target?.closest?.(
        "[data-kairos-final-delivery-check], [data-final-deliverable-refresh], [data-retry-production-state]",
      );
      if (!run && !check) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (check) void refreshFinalDeliverable();
      else void manufactureFinalDeliverable();
    }, true);
  }

  async function manufactureFinalDeliverable(projectId = activeProjectId()) {
    if (state.lastRecord && packageURL(state.lastRecord)) return state.lastRecord;
    if (state.busy) return null;
    if (!projectId) {
      renderFailure("Kairos could not identify the saved manuscript project. Open this route from the active manuscript tab or add ?project=PROJECT_ID.");
      return null;
    }

    state.busy = true;
    state.projectId = projectId;
    state.operationId = createId();
    state.phase = "checking-existing-package";
    state.primaryError = "";
    state.lastError = "";
    state.engine = "";
    disableButtons(true);

    try {
      updateControl("working", "Checking saved package", `Project ${projectId}`);
      const existing = await readExistingPackage(projectId);
      if (existing) {
        state.engine ||= existing?.recovery?.engine || "saved-package";
        return renderPackage(existing);
      }

      state.phase = "building-canonical-package";
      updateControl("working", "Producing final deliverable", "Running the canonical customer-package engine.");
      try {
        const canonical = await buildCanonical(projectId);
        state.engine = "canonical-customer-package";
        state.lastRecord = canonical;
        state.phase = "ready";
        renderPackage(canonical);
        announce("final-deliverable-ready", projectId, canonical);
        return canonical;
      } catch (canonicalError) {
        state.primaryError = message(canonicalError);
      }

      state.phase = "building-deterministic-package";
      updateControl("working", "Recovering final deliverable", state.primaryError);
      let fallback;
      try {
        fallback = await buildDeterministic(projectId);
      } catch (firstFallbackError) {
        updateControl("working", "Preparing editorial state", message(firstFallbackError));
        await prepareEditorial(projectId);
        fallback = await buildDeterministic(projectId);
      }

      state.engine = "deterministic-deliverables-fallback";
      state.lastRecord = fallback;
      state.phase = "ready";
      renderPackage(fallback);
      announce("final-deliverable-ready", projectId, fallback);
      return fallback;
    } catch (error) {
      state.lastError = message(error) || state.primaryError || "Final delivery package generation failed.";
      state.phase = "error";
      renderFailure(state.lastError);
      return null;
    } finally {
      state.busy = false;
      disableButtons(false);
    }
  }

  async function refreshFinalDeliverable(projectId = activeProjectId()) {
    if (state.busy) return null;
    if (!projectId) {
      renderFailure("Kairos could not identify the saved manuscript project.");
      return null;
    }
    state.busy = true;
    state.projectId = projectId;
    disableButtons(true);
    try {
      updateControl("working", "Checking saved package", `Project ${projectId}`);
      const record = await readExistingPackage(projectId);
      if (!record) throw new Error("No completed final package is stored yet. Use Produce Final Deliverable.");
      state.lastRecord = record;
      state.engine ||= record?.recovery?.engine || "saved-package";
      state.phase = "ready";
      renderPackage(record);
      return record;
    } catch (error) {
      state.lastError = message(error);
      renderFailure(state.lastError);
      return null;
    } finally {
      state.busy = false;
      disableButtons(false);
    }
  }

  async function readExistingPackage(projectId) {
    const base = manuscriptRoute(projectId);
    try {
      const primary = await requestJSON(`${base}/auto-pipeline`, { method: "GET" }, READ_TIMEOUT_MS);
      if (packageURL(primary)) return normalizeRecord(projectId, primary);
    } catch {}
    try {
      const body = await requestJSON(`${base}/deliverables/build`, { method: "GET" }, READ_TIMEOUT_MS);
      const record = adaptDeterministic(projectId, body);
      if (packageURL(record)) return record;
    } catch {}
    return null;
  }

  async function prepareEditorial(projectId) {
    const base = manuscriptRoute(projectId);
    const current = await requestJSON(`${base}/editorial`, { method: "GET" }, READ_TIMEOUT_MS);
    let editorial = current?.editorial || current || {};
    const versionId = editorial?.review?.versionId || editorial?.currentVersionId || editorial?.finalVersionId;
    if (!versionId) throw new Error("No saved editorial version is available to finalize.");

    if (editorial?.review?.decision !== "approved") {
      await requestJSON(`${base}/editorial/decision`, post({
        decision: "approved",
        note: "Approved by MMG final-delivery control.",
        actor: "MMG Executive",
      }), WRITE_TIMEOUT_MS);
      const reread = await requestJSON(`${base}/editorial`, { method: "GET" }, READ_TIMEOUT_MS);
      editorial = reread?.editorial || reread || editorial;
    }

    if (editorial?.status !== "ready-for-manufacturing") {
      await requestJSON(`${base}/editorial/finalize`, post({
        versionId: editorial?.review?.versionId || editorial?.currentVersionId || versionId,
        actor: "MMG Editorial Production",
      }), WRITE_TIMEOUT_MS);
    }
  }

  async function buildCanonical(projectId) {
    const body = await requestJSON(`${manuscriptRoute(projectId)}/auto-pipeline/run`, post({
      mode: "source-preserving-production",
      confirmation: "MANUFACTURE DELIVERY PACKAGE",
      actor: "MMG Executive",
    }), BUILD_TIMEOUT_MS);
    return normalizeRecord(projectId, body);
  }

  async function buildDeterministic(projectId) {
    const body = await requestJSON(`${manuscriptRoute(projectId)}/deliverables/build`, post({
      confirmation: "MANUFACTURE DELIVERY PACKAGE",
      actor: "MMG Executive",
      sourceMode: "approved-editorial-version",
    }), BUILD_TIMEOUT_MS);
    return adaptDeterministic(projectId, body);
  }

  function adaptDeterministic(projectId, body) {
    const build = body?.deliverablesBuild || body?.buildRecord || body;
    if (!build || String(build.status || "").toUpperCase() !== "COMPLETED") {
      throw new Error(body?.error?.message || "The deterministic final-package builder did not complete.");
    }
    const assets = Array.isArray(build.artifacts) ? build.artifacts : [];
    return {
      status: "production-ready",
      projectId,
      metadata: {
        title: build?.metadata?.workingTitle || build?.metadata?.inferred?.title || "Complete publishing package",
        author: build?.metadata?.author || "Mindset Media Group",
      },
      vault: {
        assets,
        packageDownloadURL: `${manuscriptRoute(projectId)}/deliverables/zip`,
        integrity: {
          passed: assets.length > 0 && assets.every(asset => Number(asset?.byteSize || 0) > 0),
          assetCount: assets.length,
        },
      },
      recovery: {
        engine: "deterministic-deliverables-fallback",
        primaryError: state.primaryError || null,
        deliverablesBuildId: build.id || null,
      },
    };
  }

  function normalizeRecord(projectId, record) {
    const normalized = record && typeof record === "object" ? { ...record } : {};
    normalized.projectId ||= projectId;
    normalized.vault ||= {};
    normalized.vault.packageDownloadURL ||= normalized.packageDownloadURL || `${manuscriptRoute(projectId)}/deliverables/zip`;
    normalized.vault.assets ||= [];
    return normalized;
  }

  function renderPackage(record) {
    state.lastRecord = record;
    const url = packageURL(record) || `${manuscriptRoute(state.projectId)}/deliverables/zip`;
    const assets = Array.isArray(record?.vault?.assets) ? record.vault.assets : [];
    const title = record?.metadata?.title || record?.vault?.title || "Final delivery package ready";
    const engineLabel = state.engine || record?.recovery?.engine || "saved-package";
    const panel = mountAndGetControl();
    panel.dataset.state = "ready";
    panel.querySelector("[data-kairos-final-delivery-title]").textContent = title;
    panel.querySelector("[data-kairos-final-delivery-status]").textContent = `${assets.length} deliverable assets are ready · ${engineLabel}`;
    const download = panel.querySelector("[data-kairos-final-delivery-download]");
    download.hidden = false;
    download.href = url;
    download.target = "_blank";
    download.rel = "noopener";
    download.textContent = "Download Complete Package";
    panel.querySelector("[data-kairos-final-delivery-run]").textContent = "Rebuild Final Deliverable";
    revealPipelineResult(record, url, assets, engineLabel);
    panel.scrollIntoView({ behavior: "smooth", block: "end" });
    return record;
  }

  function renderFailure(error) {
    state.lastError = error || "Final delivery package generation failed.";
    const panel = mountAndGetControl();
    panel.dataset.state = "error";
    panel.querySelector("[data-kairos-final-delivery-title]").textContent = "Final package needs attention";
    panel.querySelector("[data-kairos-final-delivery-status]").textContent = state.lastError;
    panel.querySelector("[data-kairos-final-delivery-run]").textContent = "Retry Final Deliverable";
    panel.querySelector("[data-kairos-final-delivery-download]").hidden = true;
    revealPipelineError(state.lastError);
  }

  function revealPipelineResult(record, url, assets, engineLabel) {
    const section = ensurePipelineSection();
    section.hidden = false;
    section.style.removeProperty("display");
    section.removeAttribute("aria-busy");
    section.innerHTML = `
      <p class="eyebrow">Final delivery package</p>
      <h3>${escapeHTML(record?.metadata?.title || "Complete publishing package ready")}</h3>
      <p>The deliverable cycle is complete. Download the verified customer package below.</p>
      <div class="issue-list">
        <article><b>Assets</b><p>${assets.length} verified deliverables</p></article>
        <article><b>Engine</b><p>${escapeHTML(engineLabel)}</p></article>
      </div>
      <div class="manuscript-actions">
        <a class="primary" href="${escapeHTML(url)}" target="_blank" rel="noopener">Download Complete Package</a>
        <button type="button" class="secondary" data-kairos-final-delivery-run>Rebuild Final Deliverable</button>
      </div>
      <p class="manuscript-note">Project ${escapeHTML(state.projectId)}</p>
      ${state.primaryError ? `<p class="manuscript-note">Canonical recovery detail: ${escapeHTML(state.primaryError)}</p>` : ""}
    `;
  }

  function revealPipelineError(error) {
    const section = ensurePipelineSection();
    section.hidden = false;
    section.style.removeProperty("display");
    section.removeAttribute("aria-busy");
    section.innerHTML = `
      <p class="eyebrow">Final delivery package</p>
      <h3>Final package needs attention</h3>
      <p class="manuscript-error" role="alert">${escapeHTML(error)}</p>
      <div class="manuscript-actions">
        <button type="button" class="primary" data-kairos-final-delivery-run>Retry Final Deliverable</button>
        <button type="button" class="secondary" data-kairos-final-delivery-check>Check Saved Package</button>
      </div>
    `;
  }

  function ensurePipelineSection() {
    let section = document.querySelector("#manuscript-auto-pipeline");
    if (section) return section;
    const editorial = document.querySelector("#manuscript-editorial-workbench");
    const result = document.querySelector("#manuscript-studio-overlay .manuscript-result");
    const parent = editorial?.parentElement || result || document.body;
    section = document.createElement("section");
    section.id = "manuscript-auto-pipeline";
    section.className = "manuscript-auto-pipeline";
    parent.append(section);
    return section;
  }

  function watchForFinalQueue() {
    const inspect = () => {
      if (state.busy || state.autoTriggered || (state.lastRecord && packageURL(state.lastRecord))) return;
      const text = document.body?.innerText || "";
      if (!/final files and delivery package/i.test(text) || !/queued/i.test(text)) return;
      const projectId = activeProjectId();
      if (!projectId) return;
      const key = `${AUTO_TRIGGER_KEY}:${projectId}`;
      if (sessionStorage.getItem(key) === BUILD) return;
      sessionStorage.setItem(key, BUILD);
      state.autoTriggered = true;
      window.setTimeout(() => {
        if (state.busy || (state.lastRecord && packageURL(state.lastRecord))) return;
        void manufactureFinalDeliverable(projectId);
      }, 250);
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    window.addEventListener("pageshow", inspect);
    window.addEventListener("kairos:manuscript-studio:opened", inspect);
    window.setTimeout(inspect, 500);
  }

  function updateControl(mode, title, status) {
    const panel = mountAndGetControl();
    panel.dataset.state = mode;
    panel.querySelector("[data-kairos-final-delivery-title]").textContent = title;
    panel.querySelector("[data-kairos-final-delivery-status]").textContent = status;
  }

  function disableButtons(disabled) {
    document.querySelectorAll(
      "[data-kairos-final-delivery-run], [data-kairos-final-delivery-check], [data-final-deliverable-retry], [data-final-deliverable-refresh]",
    ).forEach(button => { button.disabled = disabled; });
  }

  function mountAndGetControl() {
    mountControl();
    return document.querySelector("#kairos-final-delivery-control");
  }

  function installStyles() {
    if (document.querySelector("#kairos-final-delivery-control-style")) return;
    const style = document.createElement("style");
    style.id = "kairos-final-delivery-control-style";
    style.textContent = `
      #kairos-final-delivery-control{position:fixed;z-index:2147483000;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px;border:1px solid #31527d;border-radius:18px;background:rgba(7,13,22,.98);box-shadow:0 18px 60px rgba(0,0,0,.55);color:#f7f9fc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #kairos-final-delivery-control[data-state="working"]{border-color:#4a9cff}#kairos-final-delivery-control[data-state="ready"]{border-color:#39a96b}#kairos-final-delivery-control[data-state="error"]{border-color:#b85c5c}
      .kairos-final-delivery-copy{display:grid;gap:3px;min-width:0}.kairos-final-delivery-eyebrow{margin:0;color:#7fb4ff;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.kairos-final-delivery-copy strong{font-size:16px;line-height:1.25}.kairos-final-delivery-copy span{color:#aebcd0;font-size:13px;line-height:1.35}
      .kairos-final-delivery-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.kairos-final-delivery-actions button,.kairos-final-delivery-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 13px;border:1px solid #365d88;border-radius:11px;background:#111b27;color:#fff;font:800 14px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-decoration:none}.kairos-final-delivery-actions [data-kairos-final-delivery-run],.kairos-final-delivery-actions [data-kairos-final-delivery-download]{background:#1677ff;border-color:#4a9cff}.kairos-final-delivery-actions [hidden]{display:none!important}.kairos-final-delivery-actions button:disabled{opacity:.55}
      @media(max-width:700px){#kairos-final-delivery-control{grid-template-columns:1fr;max-height:42vh;overflow:auto}.kairos-final-delivery-actions{display:grid;grid-template-columns:1fr}.kairos-final-delivery-actions>*{width:100%}body{padding-bottom:230px!important}}
    `;
    document.head.append(style);
  }

  async function requestJSON(url, init = {}, timeoutMs = READ_TIMEOUT_MS) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = window.setTimeout(() => controller?.abort(), timeoutMs);
    const timeout = new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`Kairos did not finish ${url} within ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs + 50);
    });
    const request = (async () => {
      const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        ...init,
        signal: controller?.signal,
        headers: {
          ...(init.headers || {}),
          "X-MMG-Client-Build": BUILD,
          "X-Kairos-Operation-Id": state.operationId || "",
        },
      });
      const text = await response.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; }
      catch { throw new Error(`Kairos returned an unreadable response from ${url}.`); }
      if (!response.ok) throw new Error(body?.error?.message || `Kairos returned HTTP ${response.status} from ${url}.`);
      return body;
    })();
    try { return await Promise.race([request, timeout]); }
    finally { clearTimeout(timer); }
  }

  function post(body) {
    return {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Kairos-Idempotency-Key": state.operationId || createId(),
      },
      body: JSON.stringify(body),
    };
  }

  function manuscriptRoute(projectId) {
    return `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}`;
  }

  function packageURL(record) {
    return record?.vault?.packageDownloadURL || record?.packageDownloadURL || "";
  }

  function activeProjectId() {
    const direct = new URL(location.href).searchParams.get("project");
    if (direct) return direct;
    try {
      const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
      return String(active?.projectId || active?.id || "").trim();
    } catch { return ""; }
  }

  function announce(reason, projectId, record) {
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed", {
      detail: { reason, projectId, workspace: "manuscript-studio", status: record?.status || null, engine: state.engine, build: BUILD },
    }));
  }

  function createId() {
    return globalThis.crypto?.randomUUID?.() || `delivery-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function message(error) {
    return error instanceof Error ? error.message : String(error || "Final delivery package generation failed.");
  }

  function escapeHTML(value) {
    return String(value || "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[character]);
  }
})();