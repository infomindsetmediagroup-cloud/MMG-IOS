const BUILD = "kairos-publishing-experience-ui-20260723-1";
const ACTIVE_KEY = "kairos.production.active-workspace";
const DRAFT_CONFIRMATION = "CREATE SHOPIFY PRODUCT DRAFT";
const LIVE_CONFIRMATION = "PUBLISH PRODUCT LIVE";
const PACKAGE_CONFIRMATION = "APPROVE PACKAGE";

const state = {
  initialized: false,
  mountScheduled: false,
  projectId: "",
  record: null,
  busy: false,
  phase: "",
  error: "",
};

function init() {
  if (state.initialized) return;
  state.initialized = true;
  document.addEventListener("click", handleClick, true);
  window.addEventListener("kairos:manuscript:restore", scheduleEnhance);
  window.addEventListener("kairos:production:state-changed", scheduleEnhance);
  new MutationObserver(scheduleEnhance).observe(document.documentElement, { childList: true, subtree: true });
  window.KairosPublishingExperience = Object.freeze({
    ready: true,
    build: BUILD,
    enhance: scheduleEnhance,
    getState: () => ({
      projectId: state.projectId,
      busy: state.busy,
      phase: state.phase,
      error: state.error,
      status: state.record?.status || null,
      shopifyStatus: state.record?.shopify?.status || null,
    }),
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
    section.className = "manuscript-auto-pipeline manuscript-manufacturing publishing-experience";
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
  state.phase = "Loading publishing job…";
  state.error = "";
  render();
  try {
    const response = await fetch(endpoint(projectId), { credentials: "include", cache: "no-store" });
    if (response.status === 404) {
      state.record = null;
      return;
    }
    state.record = await readJSON(response);
    if (!response.ok) throw new Error(state.record?.error?.message || "The publishing job could not be loaded.");
  } catch (error) {
    state.error = error?.message || "The publishing job could not be loaded.";
  } finally {
    state.busy = false;
    state.phase = "";
    render();
  }
}

async function runPipeline(projectId) {
  await perform("Manufacturing the complete customer package…", async () => {
    state.record = await post(`${endpoint(projectId)}/run`, {});
  });
}

async function approvePackage(projectId) {
  await perform("Approving and freezing the Asset Vault package…", async () => {
    state.record = await post(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/experience/approve-package`, {
      confirmation: PACKAGE_CONFIRMATION,
      actor: "MMG Executive",
    });
  });
}

async function previewShopifyProduct(projectId) {
  await perform("Creating the actual Shopify draft, installing media, and verifying customer delivery…", async () => {
    state.record = await post(`${endpoint(projectId)}/shopify-draft`, { confirmation: DRAFT_CONFIRMATION });
  });
}

async function publishLive(projectId) {
  await perform("Publishing and verifying the approved Shopify product…", async () => {
    state.record = await post(`${endpoint(projectId)}/shopify-publish`, { confirmation: LIVE_CONFIRMATION });
  });
}

async function perform(phase, operation) {
  if (state.busy) return;
  state.busy = true;
  state.phase = phase;
  state.error = "";
  render();
  try {
    await operation();
  } catch (error) {
    state.error = error?.message || "Kairos could not complete this operation.";
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
    section.innerHTML = busyMarkup();
    return;
  }
  if (!state.record) {
    section.innerHTML = intakeMarkup();
    return;
  }

  const status = state.record.status || "";
  const shopifyStatus = state.record.shopify?.status || "not-prepared";
  if (/product-live/.test(shopifyStatus)) {
    section.innerHTML = liveMarkup();
  } else if (/draft-created|awaiting-live-approval/.test(shopifyStatus)) {
    section.innerHTML = shopifyPreviewMarkup();
  } else if (status === "package-approved") {
    section.innerHTML = vaultMarkup();
  } else {
    section.innerHTML = packagePreviewMarkup();
  }
}

function intakeMarkup() {
  return `
    ${stepper(1)}
    <p class="eyebrow">Manuscript Studio</p>
    <h3>Start a New Production Job</h3>
    <p>Your manuscript and approved cover are the authoritative inputs. Kairos will derive the metadata, manufacture the complete package, run quality assurance, and stop for review.</p>
    <div class="issue-list">
      <article><b>Required input</b><p>Uploaded manuscript</p></article>
      <article><b>Required input</b><p>Approved portrait cover</p></article>
      <article><b>Automatic</b><p>Metadata, files, graphics, ZIP, QA</p></article>
    </div>
    ${errorMarkup()}
    <button type="button" class="primary" data-start-production>Start Production Job</button>
  `;
}

function busyMarkup() {
  return `
    ${stepper(2)}
    <p class="eyebrow">Production in progress</p>
    <h3>${esc(state.phase || "Kairos is working…")}</h3>
    <p class="manuscript-progress">The job is moving through source validation, manuscript production, interior generation, cover normalization, customer files, package assembly, and quality assurance.</p>
    <div class="manuscript-editorial-summary">
      <span><strong>1</strong><small>authoritative manuscript</small></span>
      <span><strong>1</strong><small>approved cover</small></span>
      <span><strong>6</strong><small>customer deliverables</small></span>
    </div>
  `;
}

function packagePreviewMarkup() {
  const metadata = state.record.metadata || {};
  const vault = state.record.vault || {};
  const assets = Array.isArray(vault.assets) ? vault.assets : [];
  return `
    ${stepper(3)}
    <p class="eyebrow">Package Preview</p>
    <h3>${esc(metadata.title || "Production package ready")}</h3>
    <p>${esc(metadata.subtitle || metadata.description || "Review every customer-facing asset before approval.")}</p>
    ${summary(vault, metadata)}
    <div class="manuscript-actions">
      <a class="manuscript-package" href="${esc(vault.packageDownloadURL || "#")}" target="_blank" rel="noopener">Preview Package</a>
      <button type="button" class="primary" data-approve-package>Approve Package</button>
    </div>
    <div class="manuscript-manufacturing-grid">
      ${assets.map(assetCard).join("")}
    </div>
    <p class="manuscript-note">Approval freezes this package version and marks the job complete in the Admin Asset Vault.</p>
    ${errorMarkup()}
  `;
}

function vaultMarkup() {
  const metadata = state.record.metadata || {};
  const vault = state.record.vault || {};
  const assets = Array.isArray(vault.assets) ? vault.assets : [];
  return `
    ${stepper(4)}
    <p class="eyebrow">Admin Asset Vault</p>
    <h3>${esc(metadata.title || "Approved production job")}</h3>
    <p><strong>Production Complete.</strong> Package approved, checksums preserved, and the customer ZIP is ready for commerce handoff.</p>
    ${summary(vault, metadata)}
    <div class="issue-list">
      <article><b>Package</b><p>Approved and immutable</p></article>
      <article><b>Shopify publication</b><p>Not started</p></article>
      <article><b>Customer delivery</b><p>Will be verified with the draft</p></article>
    </div>
    <div class="manuscript-actions">
      <a class="secondary" href="${esc(vault.packageDownloadURL || "#")}" download>Download Complete Package</a>
      <button type="button" class="primary" data-preview-shopify>Preview Shopify Product</button>
    </div>
    <div class="manuscript-manufacturing-grid">${assets.map(assetCard).join("")}</div>
    ${errorMarkup()}
  `;
}

function shopifyPreviewMarkup() {
  const metadata = state.record.metadata || {};
  const shopify = state.record.shopify || {};
  const publication = shopify.publication || {};
  const previewURL = publication.previewURL || publication.result?.onlineStorePreviewUrl || "";
  const delivery = publication.customerDelivery || shopify.customerDelivery || {};
  return `
    ${stepper(5)}
    <p class="eyebrow">Shopify Product Preview</p>
    <h3>${esc(metadata.title || "Shopify draft ready")}</h3>
    <p>The actual Shopify draft uses the approved custom template, installed product media, generated copy, SEO metadata, approved price, and customer-delivery mapping.</p>
    <div class="issue-list">
      <article><b>Product status</b><p>Draft created and verified</p></article>
      <article><b>Template</b><p>${esc(metadata.templateSuffix || "approved custom template")}</p></article>
      <article><b>Customer delivery</b><p>${delivery.status === "attached-and-verified" || /delivery-attached/.test(publication.status || "") ? "Attached and verified" : "Verified by governed draft workflow"}</p></article>
      <article><b>Price</b><p>${esc(metadata.currency || "USD")} ${esc(metadata.price || "9.95")}</p></article>
    </div>
    <div class="manuscript-actions">
      ${previewURL ? `<a class="secondary" href="${esc(previewURL)}" target="_blank" rel="noopener">Open Shopify Preview</a>` : ""}
      <button type="button" class="primary" data-publish-product>Approve &amp; Publish Product</button>
    </div>
    <p class="manuscript-note">Live publication remains blocked unless the draft, template, media, delivery attachment, and storefront verification all pass.</p>
    ${errorMarkup()}
  `;
}

function liveMarkup() {
  const metadata = state.record.metadata || {};
  const shopify = state.record.shopify || {};
  const liveURL = metadata.liveURL || shopify.livePublication?.publication?.liveProbe?.finalURL || "";
  return `
    ${stepper(5)}
    <p class="eyebrow">Published and verified</p>
    <h3>${esc(metadata.title || "Product published")}</h3>
    <div class="issue-list">
      <article><b>Production</b><p>Complete</p></article>
      <article><b>Package</b><p>Approved</p></article>
      <article><b>Shopify product</b><p>Published</p></article>
      <article><b>Customer delivery</b><p>Connected</p></article>
    </div>
    ${liveURL ? `<a class="manuscript-package" href="${esc(liveURL)}" target="_blank" rel="noopener">View Live Product</a>` : ""}
    ${errorMarkup()}
  `;
}

function stepper(active) {
  const labels = ["Intake", "Producing", "Package Preview", "Asset Vault", "Shopify Publish"];
  return `<ol class="publishing-stepper" aria-label="Publishing progress">${labels.map((label, index) => `<li class="${index + 1 < active ? "complete" : index + 1 === active ? "active" : ""}"><span>${index + 1}</span>${esc(label)}</li>`).join("")}</ol>`;
}

function summary(vault, metadata) {
  const assets = Array.isArray(vault.assets) ? vault.assets : [];
  return `<div class="manuscript-editorial-summary">
    <span><strong>${Number(vault.assetCount || assets.length)}</strong><small>vault assets</small></span>
    <span><strong>${vault.integrity?.passed ? "Passed" : "Review"}</strong><small>integrity</small></span>
    <span><strong>${esc(metadata.price ? `${metadata.currency || "USD"} ${metadata.price}` : "Not set")}</strong><small>canonical price</small></span>
  </div>`;
}

function assetCard(asset) {
  return `<a href="${esc(asset.downloadURL || "#")}" target="_blank" rel="noopener"><strong>${esc(asset.filename || "Asset")}</strong><small>${esc(asset.role || "CUSTOMER_ASSET")} · ${formatBytes(asset.byteSize)}</small></a>`;
}

function errorMarkup() {
  return state.error ? `<p class="manuscript-error" role="alert">${esc(state.error)}</p>` : "";
}

function handleClick(event) {
  const button = event.target instanceof Element
    ? event.target.closest("[data-start-production], [data-approve-package], [data-preview-shopify], [data-publish-product]")
    : null;
  if (!button || !button.closest("#manuscript-auto-pipeline")) return;
  event.preventDefault();
  const projectId = activeProjectId();
  if (!projectId) return;
  if (button.matches("[data-start-production]")) void runPipeline(projectId);
  if (button.matches("[data-approve-package]")) void approvePackage(projectId);
  if (button.matches("[data-preview-shopify]")) void previewShopifyProduct(projectId);
  if (button.matches("[data-publish-product]")) void publishLive(projectId);
}

async function post(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
    body: JSON.stringify(payload),
  });
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body?.error?.message || `Kairos returned HTTP ${response.status}.`);
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
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
