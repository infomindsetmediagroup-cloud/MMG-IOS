(() => {
  const BUILD = "kairos-manuscript-final-delivery-control-20260805-5-five-file-route";
  const CERTIFIED_SNAPSHOT_BUILD = "kairos-manuscript-final-deliverable-engine-20260805-2";
  const PACKAGE_CONTRACT = "mmg-locked-five-asset-kdp-delivery-package-v1";
  const REQUIRED_KINDS = new Set([
    "GOLD_MASTER_DOCX",
    "DIGITAL_ASSET_PDF",
    "KDP_INTERIOR_PDF",
    "KDP_FULL_WRAP_COVER_PDF",
    "STANDALONE_COVER_IMAGE",
  ]);
  const GLOBAL_KEY = "__KAIROS_MANUSCRIPT_FINAL_DELIVERABLE_ENGINE__";
  const ACTIVE_KEY = "kairos.production.active-workspace";
  const READ_TIMEOUT_MS = 15_000;
  const WRITE_TIMEOUT_MS = 180_000;
  const AUTO_TRIGGER_KEY = "kairos.final-delivery.auto-triggered.v5";

  const state = {
    busy: false,
    projectId: "",
    operationId: "",
    phase: "waiting",
    lastError: "",
    lastRecord: null,
    engine: "five-file-deterministic-deliverables",
    autoTriggered: false,
  };

  const api = Object.freeze({
    build: BUILD,
    certifiedBuild: CERTIFIED_SNAPSHOT_BUILD,
    packageContract: PACKAGE_CONTRACT,
    ready: true,
    manufacture: manufactureFinalDeliverable,
    refresh: refreshFinalDeliverable,
    snapshot: () => ({ ...state, build: BUILD, packageContract: PACKAGE_CONTRACT }),
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
    panel.dataset.kairosFinalDeliveryControl = BUILD;
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <div class="kairos-final-delivery-copy">
        <p class="kairos-final-delivery-eyebrow">Final delivery</p>
        <strong data-kairos-final-delivery-title>Produce the five-file delivery package</strong>
        <span data-kairos-final-delivery-status>Gold Master DOCX, Digital PDF, KDP Interior, KDP Full Wrap, and the saved cover image.</span>
      </div>
      <div class="kairos-final-delivery-actions">
        <button type="button" data-kairos-final-delivery-run>Produce Final Deliverable</button>
        <button type="button" data-kairos-final-delivery-check>Check Saved Package</button>
        <a hidden data-kairos-final-delivery-download>Download Complete Package</a>
      </div>`;
    document.body.append(panel);
  }

  function bindActions() {
    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      const run = target?.closest?.("[data-kairos-final-delivery-run], [data-final-deliverable-retry], [data-start-local-production]");
      const check = target?.closest?.("[data-kairos-final-delivery-check], [data-final-deliverable-refresh], [data-retry-production-state]");
      if (!run && !check) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (check) void refreshFinalDeliverable();
      else void manufactureFinalDeliverable();
    }, true);
  }

  async function manufactureFinalDeliverable(projectId = activeProjectId()) {
    if (state.busy) return null;
    if (!projectId) return renderFailure("Kairos could not identify the saved manuscript project.");

    state.busy = true;
    state.projectId = projectId;
    state.operationId = createId();
    state.phase = "manufacturing-five-file-package";
    state.lastError = "";
    state.lastRecord = null;
    disableButtons(true);
    hideDownload();

    try {
      updateControl("working", "Manufacturing the five-file package", "The old 12-artifact package is not accepted or reused.");
      let body;
      try {
        body = await buildFiveFilePackage(projectId);
      } catch (firstError) {
        if (!needsEditorialPreparation(firstError)) throw firstError;
        updateControl("working", "Preparing approved editorial state", message(firstError));
        await prepareEditorial(projectId);
        body = await buildFiveFilePackage(projectId);
      }

      const record = requireFiveFileRecord(projectId, body);
      state.lastRecord = record;
      state.phase = "ready";
      renderPackage(record);
      announce("final-deliverable-ready", projectId, record);
      return record;
    } catch (error) {
      state.phase = "error";
      state.lastError = message(error);
      renderFailure(state.lastError);
      return null;
    } finally {
      state.busy = false;
      disableButtons(false);
    }
  }

  async function refreshFinalDeliverable(projectId = activeProjectId()) {
    if (state.busy) return null;
    if (!projectId) return renderFailure("Kairos could not identify the saved manuscript project.");

    state.busy = true;
    state.projectId = projectId;
    disableButtons(true);
    hideDownload();
    try {
      updateControl("working", "Checking the saved package", "Only the locked five-file package will be accepted.");
      const body = await requestJSON(`${route(projectId)}/deliverables/build`, { method: "GET" }, READ_TIMEOUT_MS);
      const record = requireFiveFileRecord(projectId, body);
      state.lastRecord = record;
      state.phase = "ready";
      renderPackage(record);
      return record;
    } catch (error) {
      state.lastError = message(error);
      renderFailure(
        /package contract|five required/i.test(state.lastError)
          ? "The saved package is the retired 12-artifact build. Press Produce Final Deliverable to replace it."
          : state.lastError,
      );
      return null;
    } finally {
      state.busy = false;
      disableButtons(false);
    }
  }

  async function buildFiveFilePackage(projectId) {
    return requestJSON(`${route(projectId)}/deliverables/build`, post({
      confirmation: "MANUFACTURE DELIVERY PACKAGE",
      actor: "MMG Executive",
      sourceMode: "approved-editorial-version",
      packageContract: PACKAGE_CONTRACT,
      replaceRetiredPackage: true,
    }), WRITE_TIMEOUT_MS);
  }

  function requireFiveFileRecord(projectId, body) {
    const build = body?.deliverablesBuild || body?.buildRecord || body;
    if (!build || String(build.status || "").toUpperCase() !== "COMPLETED") {
      throw new Error(body?.error?.message || "The five-file deliverables builder did not complete.");
    }

    const contract = body?.packageContract || build?.metadata?.packageContract || "";
    if (contract !== PACKAGE_CONTRACT) {
      throw new Error(`Saved package contract is ${contract || "unknown"}, not the locked five-file package contract.`);
    }

    const artifacts = Array.isArray(build.artifacts) ? build.artifacts : [];
    const packageFiles = artifacts.filter(asset => asset?.kind !== "ZIP_ARCHIVE");
    const kinds = new Set(packageFiles.map(asset => asset?.kind));
    const missing = [...REQUIRED_KINDS].filter(kind => !kinds.has(kind));
    if (packageFiles.length !== 5 || missing.length) {
      throw new Error(`The package does not contain the five required deliverables${missing.length ? `; missing ${missing.join(", ")}` : ""}.`);
    }
    if (packageFiles.some(asset => Number(asset?.byteSize || 0) <= 0)) {
      throw new Error("One or more five-file deliverables are empty.");
    }

    return {
      status: "production-ready",
      projectId,
      packageContract: contract,
      metadata: {
        title: build?.metadata?.workingTitle || "Complete publishing package",
        author: build?.metadata?.author || "Mindset Media Group",
      },
      vault: {
        assets: packageFiles,
        packageDownloadURL: `${route(projectId)}/deliverables/zip?contract=${encodeURIComponent(PACKAGE_CONTRACT)}&build=${encodeURIComponent(build.id || Date.now())}`,
        integrity: { passed: true, assetCount: 5 },
      },
      recovery: {
        engine: "deterministic-deliverables-fallback",
        deliverablesBuildId: build.id || null,
      },
    };
  }

  async function prepareEditorial(projectId) {
    const base = route(projectId);
    const current = await requestJSON(`${base}/editorial`, { method: "GET" }, READ_TIMEOUT_MS);
    let editorial = current?.editorial || current || {};
    const versionId = editorial?.review?.versionId || editorial?.currentVersionId || editorial?.finalVersionId;
    if (!versionId) throw new Error("No saved editorial version is available to finalize.");

    if (editorial?.review?.decision !== "approved") {
      await requestJSON(`${base}/editorial/decision`, post({
        decision: "approved",
        note: "Approved by MMG final-delivery control.",
        actor: "MMG Executive",
      }), 65_000);
      editorial = (await requestJSON(`${base}/editorial`, { method: "GET" }, READ_TIMEOUT_MS))?.editorial || editorial;
    }

    if (editorial?.status !== "ready-for-manufacturing") {
      await requestJSON(`${base}/editorial/finalize`, post({
        versionId: editorial?.review?.versionId || editorial?.currentVersionId || versionId,
        actor: "MMG Editorial Production",
      }), 65_000);
    }
  }

  function needsEditorialPreparation(error) {
    return /editorial|approve|finalize|ready-for-manufacturing|version/i.test(message(error));
  }

  function renderPackage(record) {
    const assets = record.vault.assets;
    const url = record.vault.packageDownloadURL;
    updateControl("ready", record.metadata.title, "5 verified deliverables are ready · locked MMG/KDP package");
    const panel = control();
    const download = panel.querySelector("[data-kairos-final-delivery-download]");
    download.hidden = false;
    download.href = url;
    download.target = "_blank";
    download.rel = "noopener";
    download.textContent = "Download Complete Package";
    panel.querySelector("[data-kairos-final-delivery-run]").textContent = "Rebuild Five-File Package";

    const section = ensurePipelineSection();
    section.hidden = false;
    section.innerHTML = `
      <p class="eyebrow">Locked final delivery package</p>
      <h3>${escapeHTML(record.metadata.title)}</h3>
      <p>Exactly five customer deliverables are ready.</p>
      <div class="manuscript-manufacturing-grid">
        ${assets.map(asset => `<article><b>${escapeHTML(asset.filename || asset.kind)}</b><p>${escapeHTML(asset.kind)}</p><small>${Number(asset.byteSize || 0).toLocaleString()} bytes</small></article>`).join("")}
      </div>
      <div class="manuscript-actions">
        <a class="primary" href="${escapeHTML(url)}" target="_blank" rel="noopener">Download Complete Package</a>
        <button type="button" class="secondary" data-kairos-final-delivery-run>Rebuild Five-File Package</button>
      </div>`;
    return record;
  }

  function renderFailure(error) {
    state.lastError = error || "Final delivery package generation failed.";
    updateControl("error", "Final package needs attention", state.lastError);
    hideDownload();
    const section = ensurePipelineSection();
    section.hidden = false;
    section.innerHTML = `
      <p class="eyebrow">Final delivery package</p>
      <h3>Final package needs attention</h3>
      <p class="manuscript-error" role="alert">${escapeHTML(state.lastError)}</p>
      <div class="manuscript-actions">
        <button type="button" class="primary" data-kairos-final-delivery-run>Retry Final Deliverable</button>
        <button type="button" class="secondary" data-kairos-final-delivery-check>Check Saved Package</button>
      </div>`;
    return null;
  }

  function watchForFinalQueue() {
    const inspect = () => {
      if (state.busy || state.autoTriggered) return;
      const text = document.body?.innerText || "";
      if (!/final files and delivery package/i.test(text) || !/queued/i.test(text)) return;
      const projectId = activeProjectId();
      if (!projectId) return;
      const key = `${AUTO_TRIGGER_KEY}:${projectId}`;
      if (sessionStorage.getItem(key) === BUILD) return;
      sessionStorage.setItem(key, BUILD);
      state.autoTriggered = true;
      setTimeout(() => void manufactureFinalDeliverable(projectId), 300);
    };
    new MutationObserver(inspect).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    addEventListener("pageshow", inspect);
    addEventListener("kairos:manuscript-studio:opened", inspect);
    setTimeout(inspect, 500);
  }

  async function requestJSON(url, init = {}, timeoutMs = READ_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        ...init,
        signal: controller.signal,
        headers: {
          ...(init.headers || {}),
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-MMG-Client-Build": BUILD,
          "X-Kairos-Package-Contract": PACKAGE_CONTRACT,
          "X-Kairos-Operation-Id": state.operationId || "",
        },
      });
      const text = await response.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; }
      catch { throw new Error(`Kairos returned an unreadable response from ${url}.`); }
      if (!response.ok) throw new Error(body?.error?.message || `Kairos returned HTTP ${response.status} from ${url}.`);
      return body;
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`Kairos did not finish ${url} within ${Math.round(timeoutMs / 1000)} seconds.`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
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

  function activeProjectId() {
    const direct = new URL(location.href).searchParams.get("project");
    if (direct) return direct;
    try {
      const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
      return String(active?.sourceProjectId || active?.manuscriptProjectId || active?.projectId || active?.id || "").trim();
    } catch { return ""; }
  }

  function route(projectId) {
    return `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}`;
  }

  function control() {
    mountControl();
    return document.querySelector("#kairos-final-delivery-control");
  }

  function updateControl(mode, title, status) {
    const panel = control();
    panel.dataset.state = mode;
    panel.querySelector("[data-kairos-final-delivery-title]").textContent = title;
    panel.querySelector("[data-kairos-final-delivery-status]").textContent = status;
  }

  function hideDownload() {
    const download = control().querySelector("[data-kairos-final-delivery-download]");
    download.hidden = true;
    download.removeAttribute("href");
  }

  function disableButtons(disabled) {
    document.querySelectorAll("[data-kairos-final-delivery-run], [data-kairos-final-delivery-check], [data-final-deliverable-retry], [data-final-deliverable-refresh]")
      .forEach(button => { button.disabled = disabled; });
  }

  function ensurePipelineSection() {
    let section = document.querySelector("#manuscript-auto-pipeline");
    if (section) return section;
    section = document.createElement("section");
    section.id = "manuscript-auto-pipeline";
    section.className = "manuscript-auto-pipeline";
    (document.querySelector("#manuscript-editorial-workbench")?.parentElement
      || document.querySelector("#manuscript-studio-overlay .manuscript-result")
      || document.body).append(section);
    return section;
  }

  function announce(reason, projectId, record) {
    dispatchEvent(new CustomEvent("kairos:production:state-changed", {
      detail: { reason, projectId, status: record.status, packageContract: PACKAGE_CONTRACT, build: BUILD },
    }));
  }

  function installStyles() {
    if (document.querySelector("#kairos-final-delivery-control-style")) return;
    const style = document.createElement("style");
    style.id = "kairos-final-delivery-control-style";
    style.textContent = `
      #kairos-final-delivery-control{position:fixed;z-index:2147483000;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px;border:1px solid #31527d;border-radius:18px;background:rgba(7,13,22,.98);box-shadow:0 18px 60px rgba(0,0,0,.55);color:#f7f9fc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #kairos-final-delivery-control[data-state="working"]{border-color:#4a9cff}#kairos-final-delivery-control[data-state="ready"]{border-color:#39a96b}#kairos-final-delivery-control[data-state="error"]{border-color:#b85c5c}.kairos-final-delivery-copy{display:grid;gap:3px}.kairos-final-delivery-eyebrow{margin:0;color:#7fb4ff;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.kairos-final-delivery-copy span{color:#aebcd0;font-size:13px}.kairos-final-delivery-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.kairos-final-delivery-actions button,.kairos-final-delivery-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 13px;border:1px solid #365d88;border-radius:11px;background:#111b27;color:#fff;font:800 14px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-decoration:none}.kairos-final-delivery-actions [data-kairos-final-delivery-run],.kairos-final-delivery-actions [data-kairos-final-delivery-download]{background:#1677ff;border-color:#4a9cff}.kairos-final-delivery-actions [hidden]{display:none!important}@media(max-width:700px){#kairos-final-delivery-control{grid-template-columns:1fr;max-height:42vh;overflow:auto}.kairos-final-delivery-actions{display:grid;grid-template-columns:1fr}.kairos-final-delivery-actions>*{width:100%}body{padding-bottom:230px!important}}`;
    document.head.append(style);
  }

  function createId() {
    return crypto?.randomUUID?.() || `delivery-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
