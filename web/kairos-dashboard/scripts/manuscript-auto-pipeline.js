const BUILD = "kairos-manuscript-auto-pipeline-ui-20260722-2";
const ACTIVE_KEY = "kairos.production.active-workspace";
const DRAFT_CONFIRMATION = "CREATE SHOPIFY PRODUCT DRAFT";
const LIVE_CONFIRMATION = "PUBLISH PRODUCT LIVE";
const REPLACEMENT_CONFIRMATION = "REPLACE LIVE PRODUCT FROM VAULT";
const REPLACEMENT_ROLLBACK_CONFIRMATION = "ROLL BACK LIVE PRODUCT REPLACEMENT";

const state = {
  initialized: false,
  mountScheduled: false,
  projectId: "",
  record: null,
  busy: false,
  phase: "",
  error: "",
  autoStarted: new Set(),
};

function init() {
  if (state.initialized) return;
  state.initialized = true;
  document.addEventListener("click", handleClick, true);
  window.addEventListener("kairos:manuscript:restore", scheduleEnhance);
  window.addEventListener("kairos:production:state-changed", scheduleEnhance);
  new MutationObserver(scheduleEnhance).observe(document.documentElement, { childList: true, subtree: true });
  window.KairosManuscriptAutoPipelineController = Object.freeze({
    ready: true,
    build: BUILD,
    enhance: scheduleEnhance,
    getState: () => ({ projectId: state.projectId, busy: state.busy, phase: state.phase, error: state.error, status: state.record?.status || null, shopifyStatus: state.record?.shopify?.status || null }),
  });
  scheduleEnhance();
}

function scheduleEnhance() {
  if (state.mountScheduled) return;
  state.mountScheduled = true;
  queueMicrotask(() => {
    state.mountScheduled = false;
    void enhance();
  });
}

async function enhance() {
  const projectId = activeProjectId();
  const setup = document.querySelector("#manuscript-project-setup");
  if (!projectId || !setup) return;

  if (state.projectId && state.projectId !== projectId) reset(projectId);
  if (!state.projectId) state.projectId = projectId;

  let section = document.querySelector("#manuscript-auto-pipeline");
  if (!section) {
    section = document.createElement("section");
    section.id = "manuscript-auto-pipeline";
    section.className = "manuscript-auto-pipeline manuscript-manufacturing";
    section.dataset.projectId = projectId;
    section.dataset.controllerBuild = BUILD;
    const anchor = document.querySelector("#manuscript-editorial-workbench") || setup;
    anchor.insertAdjacentElement("afterend", section);
    render(section);
    await load(projectId);
  }
}

function reset(projectId) {
  state.projectId = projectId;
  state.record = null;
  state.busy = false;
  state.phase = "";
  state.error = "";
  document.querySelector("#manuscript-auto-pipeline")?.remove();
}

async function load(projectId) {
  state.busy = true;
  state.phase = "Checking production package…";
  state.error = "";
  render();
  try {
    const response = await fetch(endpoint(projectId), { credentials: "include", cache: "no-store" });
    if (response.status === 404) {
      state.record = null;
      state.busy = false;
      state.phase = "";
      render();
      if (!state.autoStarted.has(projectId)) {
        state.autoStarted.add(projectId);
        await runPipeline(projectId);
      }
      return;
    }
    state.record = await readJSON(response);
    if (!response.ok) throw new Error(state.record?.error?.message || "The production package could not be loaded.");
  } catch (error) {
    state.error = error?.message || "The production package could not be loaded.";
  } finally {
    state.busy = false;
    state.phase = "";
    render();
  }
}

async function runPipeline(projectId) {
  if (state.busy) return;
  state.busy = true;
  state.phase = "Extracting metadata and manufacturing production-ready assets…";
  state.error = "";
  render();
  try {
    state.record = await post(`${endpoint(projectId)}/run`, {});
  } catch (error) {
    state.error = error?.message || "Kairos could not complete the automatic production package.";
  } finally {
    state.busy = false;
    state.phase = "";
    render();
  }
}

async function createShopifyDraft(projectId) {
  if (state.busy) return;
  state.busy = true;
  state.phase = "Building the governed Shopify product draft from vault assets…";
  state.error = "";
  render();
  try {
    state.record = await post(`${endpoint(projectId)}/shopify-draft`, { confirmation: DRAFT_CONFIRMATION });
  } catch (error) {
    if (error?.code === "existing_live_product_protected") {
      state.phase = "Preparing a protected replacement for the existing live product…";
      render();
      state.record = await post(`${replacementEndpoint(projectId)}/prepare`, {});
    } else {
      state.error = error?.message || "Kairos could not prepare the Shopify product draft.";
    }
  } finally {
    state.busy = false;
    state.phase = "";
    render();
  }
}

async function publishLive(projectId) {
  if (state.busy) return;
  state.busy = true;
  state.phase = "Publishing and verifying the approved Shopify product…";
  state.error = "";
  render();
  try {
    state.record = await post(`${endpoint(projectId)}/shopify-publish`, { confirmation: LIVE_CONFIRMATION });
  } catch (error) {
    state.error = error?.message || "Kairos could not publish the Shopify product.";
  } finally {
    state.busy = false;
    state.phase = "";
    render();
  }
}

async function executeLiveReplacement(projectId) {
  if (state.busy) return;
  state.busy = true;
  state.phase = "Applying vaulted content and assets to the protected live product…";
  state.error = "";
  render();
  try {
    state.record = await post(`${replacementEndpoint(projectId)}/execute`, {
      confirmation: REPLACEMENT_CONFIRMATION,
      actor: "MMG Executive",
    });
  } catch (error) {
    state.error = error?.message || "Kairos could not replace and verify the existing live product.";
  } finally {
    state.busy = false;
    state.phase = "";
    render();
  }
}

async function rollbackLiveReplacement(projectId) {
  if (state.busy) return;
  state.busy = true;
  state.phase = "Restoring and verifying the prior live product…";
  state.error = "";
  render();
  try {
    state.record = await post(`${replacementEndpoint(projectId)}/rollback`, {
      confirmation: REPLACEMENT_ROLLBACK_CONFIRMATION,
      actor: "MMG Executive",
    });
  } catch (error) {
    state.error = error?.message || "Kairos could not roll back the live-product replacement.";
  } finally {
    state.busy = false;
    state.phase = "";
    render();
  }
}

function render(section = document.querySelector("#manuscript-auto-pipeline")) {
  if (!section) return;
  section.setAttribute("aria-busy", state.busy ? "true" : "false");

  if (state.busy) {
    section.innerHTML = `
      <p class="eyebrow">Automatic production pipeline</p>
      <h3>${esc(state.phase || "Working…")}</h3>
      <p class="manuscript-progress">Kairos is completing the next bounded operation and preserving every result in durable storage.</p>
      <p class="manuscript-note">No catalog fields or repeated uploads are required.</p>
    `;
    return;
  }

  if (!state.record) {
    section.innerHTML = `
      <p class="eyebrow">Automatic production pipeline</p>
      <h3>Build Production Package</h3>
      <p>Kairos extracts the publication metadata, manufactures the approved files, verifies every checksum, stores the assets in the Admin Asset Vault, and creates one final ZIP.</p>
      ${errorMarkup()}
      <button type="button" class="primary" data-auto-build>Build Production Package</button>
    `;
    return;
  }

  const metadata = state.record.metadata || {};
  const vault = state.record.vault || {};
  const assets = Array.isArray(vault.assets) ? vault.assets : [];
  const shopify = state.record.shopify || {};
  const liveURL = metadata.liveURL || shopify.livePublication?.publication?.liveProbe?.finalURL || shopify.replacement?.result?.liveProbe?.finalURL || "";

  section.innerHTML = `
    <p class="eyebrow">Admin Asset Vault</p>
    <h3>${esc(metadata.title || "Production package ready")}</h3>
    <p>${esc(metadata.subtitle || metadata.description || "Production-ready files have been manufactured and verified.")}</p>
    <div class="manuscript-editorial-summary">
      <span><strong>${Number(vault.assetCount || assets.length)}</strong><small>vault assets</small></span>
      <span><strong>${vault.integrity?.passed ? "Passed" : "Review"}</strong><small>integrity</small></span>
      <span><strong>${esc(metadata.price ? `${metadata.currency || "USD"} ${metadata.price}` : "Not set")}</strong><small>canonical price</small></span>
    </div>
    <div class="issue-list">
      <article><b>Author</b><p>${esc(metadata.author || "—")}</p></article>
      <article><b>Keywords</b><p>${esc((metadata.keywords || []).join(", "))}</p></article>
      <article><b>Categories</b><p>${esc((metadata.categories || []).join(", "))}</p></article>
      <article><b>Rights</b><p>${esc(metadata.rights?.territories?.join(", ") || "Worldwide")}</p></article>
    </div>
    <div class="manuscript-actions">
      <a class="manuscript-package" href="${esc(vault.packageDownloadURL || "#")}" download>Download Production-Ready ZIP</a>
      ${releaseAction(shopify)}
    </div>
    <div class="manuscript-manufacturing-grid">
      ${assets.map((asset) => `<a href="${esc(asset.downloadURL)}" download><strong>${esc(asset.filename)}</strong><small>${esc(asset.role)} · ${formatBytes(asset.byteSize)}</small></a>`).join("")}
    </div>
    ${shopifyMarkup(shopify, liveURL)}
    ${errorMarkup()}
  `;
}

function releaseAction(shopify) {
  const status = String(shopify?.status || "not-prepared");
  if (["awaiting-live-replacement-approval", "live-product-replaced-and-verified", "live-product-replacement-rolled-back-and-verified"].includes(status)) return "";
  if (/draft-created|awaiting-live-approval|product-live/.test(status)) return "";
  return `<button type="button" class="primary" data-auto-shopify-draft>${status === "not-prepared" ? "Prepare Shopify Product Draft" : "Rebuild Shopify Product Draft"}</button>`;
}

function shopifyMarkup(shopify, liveURL) {
  if (!shopify || shopify.status === "not-prepared") {
    return `<p class="manuscript-note">Shopify remains untouched until you choose to prepare the governed product draft.</p>`;
  }

  const replacement = shopify.replacement || {};
  if (shopify.status === "awaiting-live-replacement-approval") {
    return `
      <section class="manuscript-result">
        <p class="eyebrow">Protected existing live product</p>
        <h3>${esc(replacement.productBefore?.title || replacement.desired?.title || "Existing live product")}</h3>
        <p>Kairos found the active product at <strong>${esc(replacement.productBefore?.handle || "the existing handle")}</strong>. It will update that product in place so its price, handle, active status, and digital-delivery associations remain intact.</p>
        <div class="publication-catalog-proof">
          <span><strong>${esc(replacement.productBefore?.price || "—")}</strong><small>preserved price</small></span>
          <span><strong>${esc(replacement.desired?.templateSuffix || "—")}</strong><small>approved template</small></span>
          <span><strong>${Number(replacement.assets?.files?.length || 0) + 1}</strong><small>new product assets</small></span>
        </div>
        <p class="manuscript-note">The current live product remains unchanged until you approve this replacement.</p>
        <button type="button" class="primary" data-auto-live-replace>Approve Existing Live Product Replacement</button>
      </section>
    `;
  }

  if (shopify.status === "live-product-replaced-and-verified") {
    return `
      <section class="manuscript-result">
        <p class="eyebrow">Controlled live replacement</p>
        <h3>Existing product updated and verified</h3>
        <p>The same Shopify product now uses the vaulted copy, approved custom template, new cover, and supporting product assets. Its handle, price, active status, and digital-delivery associations were preserved.</p>
        <div class="manuscript-actions">
          ${liveURL ? `<a class="manuscript-package" href="${esc(liveURL)}" target="_blank" rel="noopener">Open Updated Live Product</a>` : ""}
          <button type="button" class="secondary" data-auto-live-replacement-rollback>Roll Back Live Product Replacement</button>
        </div>
      </section>
    `;
  }

  if (shopify.status === "live-product-replacement-rolled-back-and-verified") {
    return `
      <section class="manuscript-result">
        <p class="eyebrow">Replacement rollback</p>
        <h3>Prior live product restored and verified</h3>
        ${liveURL ? `<a class="manuscript-package" href="${esc(liveURL)}" target="_blank" rel="noopener">Open Restored Live Product</a>` : ""}
      </section>
    `;
  }

  const prepared = shopify.prepared || {};
  const desired = prepared.desired || {};
  if (shopify.status === "awaiting-draft-approval") {
    return `
      <section class="manuscript-result">
        <p class="eyebrow">Shopify product preview</p>
        <h3>${esc(desired.title || "Prepared product")}</h3>
        <p>${esc(desired.productType || "Digital Download")} · ${esc(desired.templateSuffix || "approved custom template")} · USD ${esc(desired.price || "9.95")}</p>
        <p class="manuscript-note">${shopify.draftWritesEnabled ? "The preview is ready for the exact draft operation." : "Shopify draft writes are disabled in the current runtime; the preview and vault package remain preserved."}</p>
      </section>
    `;
  }

  if (/draft-created|awaiting-live-approval/.test(shopify.status)) {
    const previewURL = shopify.publication?.previewURL || "";
    return `
      <section class="manuscript-result">
        <p class="eyebrow">Governed Shopify release</p>
        <h3>Draft created and media installed</h3>
        <p>The approved custom template, generated product copy, cover, and supporting assets are attached to the Shopify DRAFT.</p>
        <div class="manuscript-actions">
          ${previewURL ? `<a class="secondary" href="${esc(previewURL)}" target="_blank" rel="noopener">Open Draft Preview</a>` : ""}
          <button type="button" class="primary" data-auto-shopify-publish>Approve & Publish Product Live</button>
        </div>
      </section>
    `;
  }

  if (/product-live/.test(shopify.status)) {
    return `
      <section class="manuscript-result">
        <p class="eyebrow">Live publication</p>
        <h3>Product published and verified</h3>
        ${liveURL ? `<a class="manuscript-package" href="${esc(liveURL)}" target="_blank" rel="noopener">Open Live Product</a>` : ""}
      </section>
    `;
  }

  return `<p class="manuscript-note">${esc(shopify.status || "Shopify preparation is pending.")}</p>`;
}

function errorMarkup() {
  return state.error ? `<p class="manuscript-error" role="alert">${esc(state.error)}</p>` : "";
}

function handleClick(event) {
  const button = event.target instanceof Element
    ? event.target.closest("[data-auto-build], [data-auto-shopify-draft], [data-auto-shopify-publish], [data-auto-live-replace], [data-auto-live-replacement-rollback]")
    : null;
  if (!button || !button.closest("#manuscript-auto-pipeline")) return;
  event.preventDefault();
  const projectId = activeProjectId();
  if (!projectId) return;
  if (button.matches("[data-auto-build]")) void runPipeline(projectId);
  if (button.matches("[data-auto-shopify-draft]")) void createShopifyDraft(projectId);
  if (button.matches("[data-auto-shopify-publish]")) void publishLive(projectId);
  if (button.matches("[data-auto-live-replace]")) void executeLiveReplacement(projectId);
  if (button.matches("[data-auto-live-replacement-rollback]")) void rollbackLiveReplacement(projectId);
}

async function post(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
    body: JSON.stringify(payload),
  });
  const body = await readJSON(response);
  if (!response.ok) {
    throw Object.assign(new Error(body?.error?.message || `Kairos returned HTTP ${response.status}.`), {
      code: body?.error?.code || "kairos_request_failed",
      status: response.status,
      body,
    });
  }
  return body;
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw new Error(`Kairos returned an unreadable response (HTTP ${response.status}).`); }
}

function endpoint(projectId) {
  return `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline`;
}

function replacementEndpoint(projectId) {
  return `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/live-product-replacement`;
}

function activeProjectId() {
  try {
    const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
    return active?.workspace === "manuscript-studio" ? active.projectId || null : null;
  } catch { return null; }
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
