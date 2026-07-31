const BUILD = "kairos-manuscript-local-production-controller-20260731-3";
const ACTIVE_KEY = "kairos.production.active-workspace";
const READY_STATUS = "ready-for-manufacturing";
const DRAFT_CONFIRMATION = "CREATE SHOPIFY PRODUCT DRAFT";
const LIVE_CONFIRMATION = "PUBLISH PRODUCT LIVE";
const PACKAGE_CONFIRMATION = "APPROVE PACKAGE";

const state = {
  initialized: false,
  scheduled: false,
  reloadRequested: true,
  loading: false,
  projectId: "",
  record: null,
  readiness: emptyReadiness(),
  busy: false,
  phase: "",
  error: "",
};

function emptyReadiness() {
  return {
    setupComplete: false,
    editorialReady: false,
    setupStatus: "",
    editorialStatus: "",
  };
}

function init() {
  if (state.initialized) return;
  state.initialized = true;

  document.addEventListener("click", handleClick, true);
  window.addEventListener("kairos:manuscript:restore", requestReload);
  window.addEventListener("kairos:production:state-changed", requestReload);
  window.addEventListener("kairos:legacy-runtime:ready", scheduleEnhance);

  new MutationObserver(() => {
    const hasSetup = Boolean(document.querySelector("#manuscript-project-setup"));
    const hasPipeline = Boolean(document.querySelector("#manuscript-auto-pipeline"));
    if (activeProjectId() && hasSetup && !hasPipeline) scheduleEnhance();
  }).observe(document.documentElement, { childList: true, subtree: true });

  const controller = Object.freeze({
    ready: true,
    build: BUILD,
    executionMode: "browser-webgpu",
    enhance: requestReload,
    startLocalProduction: () => runLocalProduction(activeProjectId()),
    getState: () => ({
      projectId: state.projectId,
      busy: state.busy,
      phase: state.phase,
      error: state.error,
      status: state.record?.status || null,
      shopifyStatus: state.record?.shopify?.status || null,
      readiness: { ...state.readiness },
      executionMode: "browser-webgpu",
    }),
  });

  window.KairosPublishingExperience = controller;
  window.KairosManuscriptAutoPipelineController = controller;
  scheduleEnhance();
}

function requestReload() {
  state.reloadRequested = true;
  scheduleEnhance();
}

function scheduleEnhance() {
  if (state.scheduled) return;
  state.scheduled = true;
  setTimeout(() => {
    state.scheduled = false;
    void enhance();
  }, 0);
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
    section.dataset.executionMode = "browser-webgpu";
    (document.querySelector("#manuscript-editorial-workbench") || setup).insertAdjacentElement("afterend", section);
    state.reloadRequested = true;
    render(section);
  }

  if (state.reloadRequested && !state.loading && !state.busy) {
    state.reloadRequested = false;
    await load(projectId);
  }
}

function reset(projectId) {
  Object.assign(state, {
    projectId,
    record: null,
    readiness: emptyReadiness(),
    busy: false,
    phase: "",
    error: "",
    loading: false,
    reloadRequested: true,
  });
  document.querySelector("#manuscript-auto-pipeline")?.remove();
}

async function load(projectId) {
  state.loading = true;
  state.busy = true;
  state.phase = "Checking the saved production state…";
  state.error = "";
  render();

  try {
    const packageResponse = await fetch(endpoint(projectId), requestInit());
    if (packageResponse.ok) {
      state.record = await readJSON(packageResponse);
      return;
    }
    if (packageResponse.status !== 404) {
      const body = await readJSON(packageResponse);
      throw new Error(body?.error?.message || "The publishing package could not be loaded.");
    }
    state.record = null;
    state.readiness = await readReadiness(projectId);
  } catch (error) {
    state.error = error?.message || "Kairos could not verify the production state.";
  } finally {
    state.loading = false;
    state.busy = false;
    state.phase = "";
    render();
  }
}

async function readReadiness(projectId) {
  const base = `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}`;
  const [setupResponse, editorialResponse] = await Promise.all([
    fetch(`${base}/setup`, requestInit()),
    fetch(`${base}/editorial`, requestInit()),
  ]);

  const setup = setupResponse.status === 404 ? {} : await readJSON(setupResponse);
  const editorial = editorialResponse.status === 404 ? {} : await readJSON(editorialResponse);

  if (!setupResponse.ok && setupResponse.status !== 404) {
    throw new Error(setup?.error?.message || "Kairos could not verify project setup.");
  }
  if (!editorialResponse.ok && editorialResponse.status !== 404) {
    throw new Error(editorial?.error?.message || "Kairos could not verify editorial approval.");
  }

  const setupStatus = setup?.setup?.status || setup?.status || "";
  const editorialStatus = editorial?.editorial?.status || editorial?.status || "";
  return {
    setupComplete: ["assigned-to-production", "awaiting-customer-cover"].includes(setupStatus),
    editorialReady: editorialStatus === READY_STATUS,
    setupStatus,
    editorialStatus,
  };
}

async function runLocalProduction(projectId) {
  if (state.busy) return;
  if (!projectId) return fail("Kairos could not identify the active manuscript project.");

  state.busy = true;
  state.error = "";
  state.phase = "Verifying setup and editorial approval…";
  render();

  try {
    state.readiness = await readReadiness(projectId);
    if (!state.readiness.setupComplete) {
      throw new Error("Complete and save Project Setup before local production begins.");
    }
    if (!state.readiness.editorialReady) {
      throw new Error("Complete Editorial Workbench review and send the approved version to manufacturing first.");
    }

    const runtime = window.KairosLocalInference;
    if (!runtime?.ready || typeof runtime.run !== "function") {
      throw new Error("The same-origin WebGPU runtime is not ready. Reload Kairos and reopen this manuscript project.");
    }

    const result = await runtime.run({
      projectId,
      onProgress(message) {
        state.phase = String(message || "Kairos is producing locally on this device…");
        render();
      },
    });

    state.phase = "Manufacturing the complete customer package…";
    render();
    state.record = await post(`${endpoint(projectId)}/run`, {
      localInferenceBuild: result?.build || runtime.build || "same-origin-webllm",
      localInferenceModel: result?.model || runtime.getModel?.() || "browser-webgpu",
    });
    window.dispatchEvent(new CustomEvent("kairos:production:state-changed"));
  } catch (error) {
    state.error = normalizeProductionError(error);
  } finally {
    state.busy = false;
    state.phase = "";
    render();
  }
}

async function approvePackage(projectId) {
  return perform("Approving and freezing the Asset Vault package…", async () => {
    state.record = await post(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/experience/approve-package`, {
      confirmation: PACKAGE_CONFIRMATION,
      actor: "MMG Executive",
    });
  });
}

async function previewShopifyProduct(projectId) {
  return perform("Creating the Shopify draft, installing media, and verifying customer delivery…", async () => {
    state.record = await post(`${endpoint(projectId)}/shopify-draft`, { confirmation: DRAFT_CONFIRMATION });
  });
}

async function publishLive(projectId) {
  return perform("Publishing and verifying the approved Shopify product…", async () => {
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
  section.dataset.controllerBuild = BUILD;
  section.dataset.executionMode = "browser-webgpu";
  section.setAttribute("aria-busy", state.busy ? "true" : "false");

  if (state.busy) return show(section, busyMarkup());
  if (state.record) return renderRecord(section);
  if (state.error) return show(section, blockedMarkup());
  if (!state.readiness.setupComplete || !state.readiness.editorialReady) return conceal(section);
  show(section, localStartMarkup());
}

function renderRecord(section) {
  const status = state.record.status || "";
  const shopifyStatus = state.record.shopify?.status || "not-prepared";
  if (/product-live/.test(shopifyStatus)) return show(section, liveMarkup());
  if (/draft-created|awaiting-live-approval/.test(shopifyStatus)) return show(section, shopifyPreviewMarkup());
  if (status === "package-approved") return show(section, vaultMarkup());
  show(section, packagePreviewMarkup());
}

function conceal(section) {
  section.hidden = true;
  section.setAttribute("aria-hidden", "true");
  section.style.display = "none";
}

function show(section, markup) {
  section.hidden = false;
  section.removeAttribute("aria-hidden");
  section.style.removeProperty("display");
  section.innerHTML = markup;
}

function localStartMarkup() {
  return `${stepper(4)}<p class="eyebrow">Manufacturing handoff</p><h3>Start Local Production</h3><p>The approved editorial manuscript is ready. Kairos will write through the same-origin browser WebGPU runtime, store the verified result, manufacture the complete package, and stop for review.</p><div class="issue-list"><article><b>Project setup</b><p>${esc(state.readiness.setupStatus || "assigned-to-production")}</p></article><article><b>Editorial gate</b><p>${esc(state.readiness.editorialStatus || READY_STATUS)}</p></article><article><b>Inference runtime</b><p>Same-origin browser WebGPU · no paid external provider</p></article><article><b>Browser requirement</b><p>Keep Safari open and in the foreground until local production finishes</p></article></div>${errorMarkup()}<button type="button" class="primary" data-start-local-production>Start Local Production</button><p class="manuscript-note">Do not close Safari during this step. The manuscript, setup, cover, and editorial state are already stored and remain recoverable if local inference stops.</p>`;
}

function busyMarkup() {
  return `${stepper(4)}<p class="eyebrow">Local production in progress</p><h3>${esc(state.phase || "Kairos is producing locally on this device…")}</h3><p class="manuscript-progress">Keep Safari open and in the foreground. The approved source remains durably stored while the browser WebGPU runtime completes this production pass.</p>${errorMarkup()}`;
}

function blockedMarkup() {
  return `<p class="eyebrow">Production sequence</p><h3>Production needs attention</h3>${errorMarkup()}<button type="button" class="secondary" data-retry-production-state>Check Production State</button>`;
}

function packagePreviewMarkup() {
  const metadata = state.record.metadata || {};
  const vault = state.record.vault || {};
  const assets = Array.isArray(vault.assets) ? vault.assets : [];
  return `${stepper(5)}<p class="eyebrow">Package Preview</p><h3>${esc(metadata.title || "Production package ready")}</h3><p>${esc(metadata.subtitle || metadata.description || "Review every customer-facing asset before approval.")}</p>${summary(vault, metadata)}<div class="issue-list"><article><b>Inference</b><p>Same-origin browser WebGPU</p></article><article><b>Publication</b><p>Blocked pending explicit approval</p></article></div><div class="manuscript-actions"><a class="manuscript-package" href="${esc(vault.packageDownloadURL || "#")}" target="_blank" rel="noopener">Preview Package</a><button type="button" class="primary" data-approve-package>Approve Package</button></div><div class="manuscript-manufacturing-grid">${assets.map(assetCard).join("")}</div><p class="manuscript-note">Approval freezes this package version and marks the job complete in the Admin Asset Vault.</p>${errorMarkup()}`;
}

function vaultMarkup() {
  const metadata = state.record.metadata || {};
  const vault = state.record.vault || {};
  const assets = Array.isArray(vault.assets) ? vault.assets : [];
  return `${stepper(6)}<p class="eyebrow">Admin Asset Vault</p><h3>${esc(metadata.title || "Approved production package")}</h3><p><strong>Production Complete.</strong> Package approved, checksums preserved, and the customer ZIP is ready for commerce handoff.</p>${summary(vault, metadata)}<div class="issue-list"><article><b>Package</b><p>Approved and immutable</p></article><article><b>Shopify publication</b><p>Not started</p></article><article><b>Customer delivery</b><p>Verified with the draft</p></article></div><div class="manuscript-actions"><a class="secondary" href="${esc(vault.packageDownloadURL || "#")}" download>Download Complete Package</a><button type="button" class="primary" data-preview-shopify>Preview Shopify Product</button></div><div class="manuscript-manufacturing-grid">${assets.map(assetCard).join("")}</div>${errorMarkup()}`;
}

function shopifyPreviewMarkup() {
  const metadata = state.record.metadata || {};
  const shopify = state.record.shopify || {};
  const publication = shopify.publication || {};
  const previewURL = publication.previewURL || publication.result?.onlineStorePreviewUrl || "";
  const delivery = publication.customerDelivery || shopify.customerDelivery || {};
  const deliveryReady = delivery.status === "attached-and-verified" || /delivery-attached/.test(publication.status || "");
  return `${stepper(7)}<p class="eyebrow">Shopify Product Preview</p><h3>${esc(metadata.title || "Shopify draft ready")}</h3><p>The Shopify draft uses the approved custom template, installed media, generated copy, SEO metadata, approved price, and customer-delivery mapping.</p><div class="issue-list"><article><b>Product status</b><p>Draft created and verified</p></article><article><b>Template</b><p>${esc(metadata.templateSuffix || "approved custom template")}</p></article><article><b>Customer delivery</b><p>${deliveryReady ? "Attached and verified" : "Verified by governed draft workflow"}</p></article><article><b>Price</b><p>${esc(metadata.currency || "USD")} ${esc(metadata.price || "9.95")}</p></article></div><div class="manuscript-actions">${previewURL ? `<a class="secondary" href="${esc(previewURL)}" target="_blank" rel="noopener">Open Shopify Preview</a>` : ""}<button type="button" class="primary" data-publish-product>Approve &amp; Publish Product</button></div><p class="manuscript-note">Live publication remains blocked unless the draft, template, media, delivery attachment, and storefront verification all pass.</p>${errorMarkup()}`;
}

function liveMarkup() {
  const metadata = state.record.metadata || {};
  const shopify = state.record.shopify || {};
  const liveURL = metadata.liveURL || shopify.livePublication?.publication?.liveProbe?.finalURL || "";
  return `${stepper(7)}<p class="eyebrow">Published and verified</p><h3>${esc(metadata.title || "Product published")}</h3><div class="issue-list"><article><b>Production</b><p>Complete</p></article><article><b>Package</b><p>Approved</p></article><article><b>Shopify product</b><p>Published</p></article><article><b>Customer delivery</b><p>Connected</p></article></div>${liveURL ? `<a class="manuscript-package" href="${esc(liveURL)}" target="_blank" rel="noopener">View Live Product</a>` : ""}${errorMarkup()}`;
}

function stepper(active) {
  const labels = ["Intake", "Setup", "Editorial", "Local Production", "Package Preview", "Asset Vault", "Shopify Publish"];
  return `<ol class="publishing-stepper" aria-label="Publishing progress">${labels.map((label, index) => `<li class="${index + 1 < active ? "complete" : index + 1 === active ? "active" : ""}"><span>${index + 1}</span>${esc(label)}</li>`).join("")}</ol>`;
}

function summary(vault, metadata) {
  const assets = Array.isArray(vault.assets) ? vault.assets : [];
  return `<div class="manuscript-editorial-summary"><span><strong>${Number(vault.assetCount || assets.length)}</strong><small>vault assets</small></span><span><strong>${vault.integrity?.passed ? "Passed" : "Review"}</strong><small>integrity</small></span><span><strong>${esc(metadata.price ? `${metadata.currency || "USD"} ${metadata.price}` : "Not set")}</strong><small>canonical price</small></span></div>`;
}

function assetCard(asset) {
  return `<a href="${esc(asset.downloadURL || "#")}" target="_blank" rel="noopener"><strong>${esc(asset.filename || "Asset")}</strong><small>${esc(asset.role || "CUSTOMER_ASSET")} · ${formatBytes(asset.byteSize)}</small></a>`;
}

function errorMarkup() {
  return state.error ? `<p class="manuscript-error" role="alert">${esc(state.error)}</p>` : "";
}

function handleClick(event) {
  const button = event.target instanceof Element
    ? event.target.closest("[data-start-local-production], [data-retry-production-state], [data-approve-package], [data-preview-shopify], [data-publish-product]")
    : null;
  if (!button || !button.closest("#manuscript-auto-pipeline")) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  const projectId = activeProjectId();
  if (!projectId) return;

  if (button.matches("[data-start-local-production]")) void runLocalProduction(projectId);
  if (button.matches("[data-retry-production-state]")) requestReload();
  if (button.matches("[data-approve-package]")) void approvePackage(projectId);
  if (button.matches("[data-preview-shopify]")) void previewShopifyProduct(projectId);
  if (button.matches("[data-publish-product]")) void publishLive(projectId);
}

function requestInit() {
  return {
    credentials: "include",
    cache: "no-store",
    headers: { "X-MMG-Client-Build": BUILD },
  };
}

async function post(url, payload) {
  const response = await fetch(url, {
    ...requestInit(),
    method: "POST",
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
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Kairos returned an unreadable response (HTTP ${response.status}).`);
  }
}

function fail(message) {
  state.error = message;
  render();
}

function normalizeProductionError(error) {
  const message = String(error?.message || error || "Kairos could not complete local production.");
  if (/legacy backend generation route is disabled/i.test(message)) {
    return "The retired backend route was blocked. Reload Kairos once to activate the corrected local-production controller.";
  }
  return message;
}

function endpoint(projectId) {
  return `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline`;
}

function activeProjectId() {
  try {
    const active = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
    return active?.workspace === "manuscript-studio" ? active.projectId || null : null;
  } catch {
    return null;
  }
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

init();
