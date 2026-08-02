(() => {
  const BUILD = "kairos-manuscript-pipeline-orchestrator-20260801-1";
  const ACTIVE_KEY = "kairos.production.active-workspace";
  const SETUP_TIMEOUT_MS = 120_000;
  const READ_TIMEOUT_MS = 15_000;
  const MANUFACTURE_TIMEOUT_MS = 180_000;
  const MUTATION_TIMEOUT_MS = 90_000;
  const PACKAGE_CONFIRMATION = "APPROVE PACKAGE";
  const DRAFT_CONFIRMATION = "CREATE SHOPIFY PRODUCT DRAFT";
  const LIVE_CONFIRMATION = "PUBLISH PRODUCT LIVE";

  const state = {
    busy: false,
    operationId: "",
    phase: "",
    lastError: "",
    lastRecord: null,
  };

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    submitSetup: () => submitSetup(currentSetupSection()),
    manufacture: () => manufacture(activeProjectId()),
    refresh: () => refreshPipeline(activeProjectId()),
    snapshot: () => ({
      build: BUILD,
      busy: state.busy,
      operationId: state.operationId,
      phase: state.phase,
      lastError: state.lastError,
      status: state.lastRecord?.status || null,
      projectId: activeProjectId(),
    }),
  });

  globalThis.KairosManuscriptPipelineOrchestrator = api;

  document.addEventListener("click", handleClick, true);
  window.addEventListener("pageshow", () => void reconcile());
  window.addEventListener("online", () => void reconcile());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void reconcile();
  });

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const setupSubmit = target.closest("[data-setup-submit]");
    if (setupSubmit?.closest("#manuscript-project-setup")) {
      stop(event);
      void submitSetup(setupSubmit.closest("#manuscript-project-setup"));
      return;
    }

    const setupStatus = target.closest("[data-setup-status]");
    if (setupStatus?.closest("#manuscript-project-setup")) {
      stop(event);
      void recoverSetup(activeProjectId(), true);
      return;
    }

    const start = target.closest("[data-start-local-production]");
    if (start?.closest("#manuscript-auto-pipeline")) {
      stop(event);
      void manufacture(activeProjectId());
      return;
    }

    const retry = target.closest("[data-retry-production-state]");
    if (retry?.closest("#manuscript-auto-pipeline")) {
      stop(event);
      void refreshPipeline(activeProjectId());
      return;
    }

    const approve = target.closest("[data-approve-package]");
    if (approve?.closest("#manuscript-auto-pipeline")) {
      stop(event);
      void mutatePackage("Approving the delivery package…", "/experience/approve-package", {
        confirmation: PACKAGE_CONFIRMATION,
        actor: "MMG Executive",
      });
      return;
    }

    const draft = target.closest("[data-preview-shopify]");
    if (draft?.closest("#manuscript-auto-pipeline")) {
      stop(event);
      void mutatePackage("Creating the governed Shopify draft…", "/auto-pipeline/shopify-draft", {
        confirmation: DRAFT_CONFIRMATION,
      });
      return;
    }

    const publish = target.closest("[data-publish-live]");
    if (publish?.closest("#manuscript-auto-pipeline")) {
      stop(event);
      void mutatePackage("Publishing the approved Shopify product…", "/auto-pipeline/shopify-publish", {
        confirmation: LIVE_CONFIRMATION,
      });
    }
  }

  function stop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  async function submitSetup(section) {
    if (state.busy || !section) return;
    const projectId = section.dataset.projectId || activeProjectId();
    if (!projectId) return showSetupError(section, "Kairos could not identify the active manuscript project.");

    const draft = setupDraft(section);
    const validation = validateSetup(draft);
    if (validation) return showSetupError(section, validation);

    state.busy = true;
    state.operationId = createId();
    state.phase = "Saving manuscript, cover, metadata, and production assignment…";
    state.lastError = "";
    renderSetupBusy(section);

    try {
      const form = new FormData();
      form.set("authorName", draft.authorName);
      form.set("publicationTitle", draft.publicationTitle);
      form.set("service", draft.service);
      form.set("edition", draft.edition);
      form.set("trimSize", draft.trimSize);
      form.set("isbnStatus", draft.isbnStatus);
      form.set("notes", draft.notes);
      if (draft.cover) form.set("cover", draft.cover, draft.cover.name || "customer-cover.png");

      const record = await requestJSON(
        `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/setup`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "X-MMG-Client-Build": BUILD,
            "X-Kairos-Operation-Id": state.operationId,
            "X-Kairos-Idempotency-Key": state.operationId,
          },
          body: form,
        },
        SETUP_TIMEOUT_MS,
      );

      renderSetupRecord(section, record);
      emit("setup-saved", projectId, record);
    } catch (error) {
      const recovered = await recoverSetup(projectId, false, section);
      if (!recovered) {
        state.lastError = message(error, "Project setup could not be saved.");
        showSetupError(section, `${state.lastError} The same operation can be retried safely.`);
      }
    } finally {
      state.busy = false;
      state.phase = "";
    }
  }

  async function recoverSetup(projectId, showFailure = true, section = currentSetupSection()) {
    if (!projectId || !section) return false;
    try {
      setSetupStatus(section, "Checking the durable project record…");
      const response = await request(
        `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/setup`,
        { method: "GET", credentials: "include", cache: "no-store" },
        READ_TIMEOUT_MS,
      );
      const body = await parseJSON(response);
      if (response.ok && body?.setup) {
        renderSetupRecord(section, body);
        emit("setup-saved", projectId, body);
        return true;
      }
      if (response.status === 202 || body?.operation?.status === "working") {
        setSetupStatus(section, "The operation is still running. Kairos will check again automatically.");
        window.setTimeout(() => void recoverSetup(projectId, true, section), 2_000);
        return false;
      }
      if (showFailure) showSetupError(section, body?.error?.message || "No saved production assignment was found.");
    } catch (error) {
      if (showFailure) showSetupError(section, message(error, "Kairos could not check the saved setup."));
    }
    return false;
  }

  async function manufacture(projectId) {
    if (state.busy || !projectId) return;
    state.busy = true;
    state.operationId = createId();
    state.phase = "Verifying the production gates…";
    state.lastError = "";
    renderPipelineBusy(state.phase);

    try {
      const readiness = await readReadiness(projectId);
      if (!readiness.setupComplete) throw new Error("Complete Project Setup before manufacturing begins.");
      if (!readiness.editorialReady) throw new Error("Complete Editorial Review and send the approved version to manufacturing first.");

      state.phase = "Manufacturing the complete publishing package…";
      renderPipelineBusy(state.phase);
      let record;
      try {
        record = await requestJSON(
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
          MANUFACTURE_TIMEOUT_MS,
        );
      } catch (error) {
        record = await waitForPackage(projectId, error);
      }

      state.lastRecord = record;
      renderPackage(record);
      emit("package-updated", projectId, record);
    } catch (error) {
      state.lastError = message(error, "Kairos could not manufacture the delivery package.");
      renderPipelineError(state.lastError);
    } finally {
      state.busy = false;
      state.phase = "";
    }
  }

  async function mutatePackage(phase, suffix, payload) {
    const projectId = activeProjectId();
    if (state.busy || !projectId) return;
    state.busy = true;
    state.phase = phase;
    state.lastError = "";
    renderPipelineBusy(phase);

    try {
      const base = `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}`;
      const record = await requestJSON(
        `${base}${suffix}`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-MMG-Client-Build": BUILD,
            "X-Kairos-Operation-Id": createId(),
          },
          body: JSON.stringify(payload),
        },
        MUTATION_TIMEOUT_MS,
      );
      state.lastRecord = record;
      renderPackage(record);
      emit("package-updated", projectId, record);
    } catch (error) {
      state.lastError = message(error, "Kairos could not complete the package operation.");
      renderPipelineError(state.lastError);
    } finally {
      state.busy = false;
      state.phase = "";
    }
  }

  async function refreshPipeline(projectId) {
    if (!projectId) return null;
    try {
      const response = await request(
        `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline`,
        { method: "GET", credentials: "include", cache: "no-store" },
        READ_TIMEOUT_MS,
      );
      const body = await parseJSON(response);
      if (response.ok) {
        state.lastRecord = body;
        renderPackage(body);
        return body;
      }
      if (response.status === 404) {
        const readiness = await readReadiness(projectId);
        renderProductionReady(readiness);
        return null;
      }
      throw new Error(body?.error?.message || `Kairos returned HTTP ${response.status}.`);
    } catch (error) {
      renderPipelineError(message(error, "Kairos could not refresh the production state."));
      return null;
    }
  }

  async function reconcile() {
    const projectId = activeProjectId();
    if (!projectId || state.busy) return;
    const setup = currentSetupSection();
    if (setup && !setup.querySelector("[data-kairos-next-editorial]") && /Uploading customer cover|Saving production assignment|Check saved status/i.test(setup.textContent || "")) {
      await recoverSetup(projectId, false, setup);
    }
    if (document.querySelector("#manuscript-auto-pipeline")) await refreshPipeline(projectId);
  }

  async function readReadiness(projectId) {
    const base = `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}`;
    const [setupResponse, editorialResponse] = await Promise.all([
      request(`${base}/setup`, { method: "GET", credentials: "include", cache: "no-store" }, READ_TIMEOUT_MS),
      request(`${base}/editorial`, { method: "GET", credentials: "include", cache: "no-store" }, READ_TIMEOUT_MS),
    ]);
    const setup = await parseJSON(setupResponse);
    const editorial = await parseJSON(editorialResponse);
    if (!setupResponse.ok && setupResponse.status !== 404) throw new Error(setup?.error?.message || "Project Setup could not be verified.");
    if (!editorialResponse.ok && editorialResponse.status !== 404) throw new Error(editorial?.error?.message || "Editorial approval could not be verified.");
    const setupStatus = setup?.setup?.status || setup?.status || "";
    const editorialStatus = editorial?.editorial?.status || editorial?.status || "";
    return {
      setupComplete: ["assigned-to-production", "awaiting-customer-cover"].includes(setupStatus),
      editorialReady: editorialStatus === "ready-for-manufacturing",
      setupStatus,
      editorialStatus,
    };
  }

  async function waitForPackage(projectId, originalError) {
    for (let attempt = 1; attempt <= 24; attempt += 1) {
      state.phase = `Checking the saved delivery package… ${attempt} of 24`;
      renderPipelineBusy(state.phase);
      await wait(Math.min(2_000 + attempt * 250, 5_000));
      try {
        const response = await request(
          `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline`,
          { method: "GET", credentials: "include", cache: "no-store" },
          READ_TIMEOUT_MS,
        );
        if (response.ok) return parseJSON(response);
        if (response.status !== 404 && response.status !== 503) {
          const body = await parseJSON(response);
          throw new Error(body?.error?.message || `Kairos returned HTTP ${response.status}.`);
        }
      } catch {
        // Continue bounded reconciliation; the original mutation may have completed.
      }
    }
    throw originalError;
  }

  function renderSetupBusy(section) {
    section.setAttribute("aria-busy", "true");
    section.innerHTML = `
      <p class="eyebrow">Project setup</p>
      <h3>${escapeHTML(state.phase)}</h3>
      <p class="manuscript-progress">Kairos is storing the cover and production assignment in one idempotent transaction.</p>
      <p class="manuscript-note">Operation: ${escapeHTML(state.operationId)}</p>
      <button type="button" class="secondary" data-setup-status>Check saved status</button>
    `;
  }

  function renderSetupRecord(section, record) {
    const setup = record?.setup || record || {};
    section.removeAttribute("aria-busy");
    section.dataset.projectId = setup.projectId || activeProjectId() || "";
    section.innerHTML = `
      <p class="eyebrow">Production assignment</p>
      <h3>${escapeHTML(setup.status || record?.status || "assigned-to-production")}</h3>
      <p>${escapeHTML(record?.nextAction || "Project setup completed. Continue to Editorial Review.")}</p>
      <div class="issue-list">${(setup.assignments || []).map(item => `<article><b>${escapeHTML(item.department)}</b><p>${escapeHTML(item.role)}</p><small>${escapeHTML(item.status)}</small></article>`).join("")}</div>
      <div class="issue-list">${(setup.milestones || []).map(item => `<article><b>${escapeHTML(item.label)}</b><p>${escapeHTML(item.status)}</p></article>`).join("")}</div>
      <div class="manuscript-actions" data-kairos-editorial-handoff="${BUILD}">
        <button type="button" class="primary" data-kairos-next-editorial>Continue to Editorial Review</button>
      </div>
      <p class="manuscript-note">The manuscript, cover, metadata, and production assignment are stored and resumable.</p>
    `;
  }

  function renderProductionReady(readiness) {
    const section = pipelineSection();
    if (!section) return;
    section.hidden = false;
    section.style.removeProperty("display");
    section.innerHTML = `
      <p class="eyebrow">Manufacturing handoff</p>
      <h3>Build the Complete Delivery Package</h3>
      <p>The approved manuscript, cover, metadata, and editorial version are ready for deterministic manufacturing.</p>
      <div class="issue-list">
        <article><b>Project setup</b><p>${escapeHTML(readiness.setupStatus || "not ready")}</p></article>
        <article><b>Editorial gate</b><p>${escapeHTML(readiness.editorialStatus || "not ready")}</p></article>
        <article><b>Output</b><p>DOCX, PDF, EPUB, KDP interior, metadata, README, and ZIP package</p></article>
      </div>
      ${readiness.setupComplete && readiness.editorialReady
        ? '<button type="button" class="primary" data-start-local-production>Manufacture Delivery Package</button>'
        : '<p class="manuscript-error" role="alert">Complete the remaining setup and editorial gates first.</p>'}
    `;
  }

  function renderPipelineBusy(phase) {
    const section = pipelineSection();
    if (!section) return;
    section.hidden = false;
    section.style.removeProperty("display");
    section.setAttribute("aria-busy", "true");
    section.innerHTML = `
      <p class="eyebrow">Publishing engine</p>
      <h3>${escapeHTML(phase || "Working…")}</h3>
      <p class="manuscript-progress">This operation is idempotent and recoverable. Keep this page open when possible; Kairos will reconcile saved state after interruption.</p>
      <p class="manuscript-note">Operation: ${escapeHTML(state.operationId || "checking")}</p>
      <button type="button" class="secondary" data-retry-production-state>Check Production State</button>
    `;
  }

  function renderPipelineError(error) {
    const section = pipelineSection();
    if (!section) return;
    section.hidden = false;
    section.style.removeProperty("display");
    section.removeAttribute("aria-busy");
    section.innerHTML = `
      <p class="eyebrow">Publishing engine</p>
      <h3>Production needs attention</h3>
      <p class="manuscript-error" role="alert">${escapeHTML(error)}</p>
      <div class="manuscript-actions">
        <button type="button" class="secondary" data-retry-production-state>Check Production State</button>
        <button type="button" class="primary" data-start-local-production>Retry Manufacturing</button>
      </div>
    `;
  }

  function renderPackage(record) {
    const section = pipelineSection();
    if (!section) return;
    const metadata = record?.metadata || {};
    const vault = record?.vault || {};
    const shopify = record?.shopify || {};
    const assets = Array.isArray(vault.assets) ? vault.assets : [];
    const packageURL = vault.packageDownloadURL || record?.packageDownloadURL || "";
    const approved = record?.status === "package-approved";
    const draftReady = /draft-created|awaiting-live-approval/.test(shopify.status || "");
    const live = /product-live/.test(shopify.status || "");

    section.hidden = false;
    section.style.removeProperty("display");
    section.removeAttribute("aria-busy");
    section.innerHTML = `
      <p class="eyebrow">${live ? "Published product" : approved ? "Approved delivery package" : "Package preview"}</p>
      <h3>${escapeHTML(metadata.title || vault.title || "Complete publishing package ready")}</h3>
      <p>${escapeHTML(record?.nextAction || "Review the generated deliverables and continue through the governed release gates.")}</p>
      <div class="issue-list">
        <article><b>Package status</b><p>${escapeHTML(record?.status || "production-ready")}</p></article>
        <article><b>Assets</b><p>${assets.length} verified deliverables</p></article>
        <article><b>Integrity</b><p>${vault.integrity?.passed === false ? "Attention required" : "Checksums preserved"}</p></article>
        <article><b>Shopify</b><p>${escapeHTML(shopify.status || "not prepared")}</p></article>
      </div>
      <div class="manuscript-actions">
        ${packageURL ? `<a class="secondary" href="${escapeHTML(packageURL)}" target="_blank" rel="noopener">${approved ? "Download Complete Package" : "Preview Package"}</a>` : ""}
        ${!approved ? '<button type="button" class="primary" data-approve-package>Approve Package</button>' : ""}
        ${approved && !draftReady && !live ? '<button type="button" class="primary" data-preview-shopify>Preview Shopify Product</button>' : ""}
        ${draftReady && !live ? '<button type="button" class="primary" data-publish-live>Publish Product Live</button>' : ""}
      </div>
      <div class="manuscript-manufacturing-grid">${assets.map(asset => `<article><b>${escapeHTML(asset.filename || asset.name || "Deliverable")}</b><p>${escapeHTML(asset.role || asset.contentType || "Publishing asset")}</p><small>${Number(asset.byteSize || 0).toLocaleString()} bytes</small>${asset.downloadURL ? `<a href="${escapeHTML(asset.downloadURL)}" target="_blank" rel="noopener">Open asset</a>` : ""}</article>`).join("")}</div>
      ${live ? '<p class="manuscript-note"><strong>Pipeline complete.</strong> The deliverable package is preserved and the approved product is live.</p>' : ""}
    `;
  }

  function showSetupError(section, error) {
    state.lastError = error;
    const existing = section.querySelector(".manuscript-error");
    if (existing) existing.textContent = error;
    else section.insertAdjacentHTML("beforeend", `<p class="manuscript-error" role="alert">${escapeHTML(error)}</p>`);
  }

  function setSetupStatus(section, text) {
    const note = section.querySelector(".manuscript-note, .manuscript-progress");
    if (note) note.textContent = text;
    else section.insertAdjacentHTML("beforeend", `<p class="manuscript-note">${escapeHTML(text)}</p>`);
  }

  function setupDraft(section) {
    return {
      authorName: section.querySelector("[data-setup-author]")?.value.trim() || "",
      publicationTitle: section.querySelector("[data-setup-title]")?.value.trim() || "",
      service: section.querySelector("[data-setup-service]")?.value || "",
      edition: section.querySelector("[data-setup-edition]")?.value || "multi-format",
      trimSize: section.querySelector("[data-setup-trim]")?.value || "6x9",
      isbnStatus: section.querySelector("[data-setup-isbn]")?.value || "not-decided",
      notes: section.querySelector("[data-setup-notes]")?.value || "",
      cover: section.querySelector("[data-setup-cover]")?.files?.[0] || null,
    };
  }

  function validateSetup(draft) {
    if (!draft.authorName) return "Enter the author name.";
    if (!draft.publicationTitle) return "Enter the publication title.";
    if (!draft.service) return "Select the approved publishing service.";
    if (!draft.cover) return "Upload the customer cover as PNG or JPEG.";
    if (!["image/png", "image/jpeg"].includes(draft.cover.type)) return "Upload the customer cover as PNG or JPEG.";
    if (draft.cover.size > 8 * 1024 * 1024) return "Customer cover files must be 8 MB or smaller.";
    return "";
  }

  function pipelineSection() {
    return document.querySelector("#manuscript-auto-pipeline");
  }

  function currentSetupSection() {
    return document.querySelector("#manuscript-project-setup");
  }

  function activeProjectId() {
    try {
      const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
      return active?.workspace === "manuscript-studio" ? active.projectId || null : null;
    } catch {
      return null;
    }
  }

  async function requestJSON(url, init, timeoutMs) {
    const response = await request(url, init, timeoutMs);
    const body = await parseJSON(response);
    if (!response.ok) throw new Error(body?.error?.message || `Kairos returned HTTP ${response.status}.`);
    return body;
  }

  async function request(url, init, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const text = await withDeadline(response.text(), timeoutMs, "Kairos response body timed out.");
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      if (timedOut || controller.signal.aborted) throw new Error("Kairos did not respond in time. Saved state will be reconciled automatically.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function parseJSON(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Kairos returned an unreadable response (HTTP ${response.status}).`);
    }
  }

  function withDeadline(promise, milliseconds, errorMessage) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(errorMessage)), milliseconds);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  function emit(reason, projectId, record) {
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed", {
      detail: { reason, projectId, build: BUILD, status: record?.status || null },
    }));
  }

  function createId() {
    return globalThis.crypto?.randomUUID?.() || `operation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function wait(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
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
