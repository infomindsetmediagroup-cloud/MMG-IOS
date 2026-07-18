const BUILD = "kairos-website-builder-studio-ui-20260717-2";
const STORAGE_KEY = "kairos.website-builder-studio.v2";
const BUILD_CONFIRMATION = "BUILD_KAIROS_WEBSITE_STUDIO_STAGING";
const ASSET_CONFIRMATION = "STORE_KAIROS_WEBSITE_ASSET";
const state = {
  open: false,
  manifest: null,
  selectedSectionID: "hero",
  viewport: "desktop",
  working: false,
  composing: false,
  assetWorking: false,
  assets: [],
  assetUsage: null,
  styleDirection: "Premium, cinematic, editorial, image-led, and unmistakably Mindset Media Group.",
  assetTags: "",
  status: "",
  error: "",
  previewURL: "",
  composition: null,
};

window.KairosWebsiteBuilder = {
  open(objective = "", seedManifest = null) { openStudio(objective, seedManifest); },
  close() { closeStudio(); },
  getManifest() { return structuredClone(state.manifest || defaultManifest("")); },
  compose() { return composeObjective(); },
};

document.addEventListener("click", event => {
  const websiteButton = event.target.closest?.('[data-child="website"]');
  if (!websiteButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openStudio("", null);
}, true);

async function openStudio(objective, seedManifest) {
  const saved = readSavedState();
  state.manifest = normalizeManifest(seedManifest || saved?.manifest || defaultManifest(objective));
  if (objective) state.manifest.objective = objective;
  state.styleDirection = saved?.styleDirection || state.styleDirection;
  state.selectedSectionID = state.manifest.sections.find(section => section.enabled)?.id || "hero";
  state.viewport = "desktop";
  state.working = false;
  state.composing = false;
  state.assetWorking = false;
  state.status = "Kairos loaded the MMG doctrine, premium composition controls, and persistent Asset Library.";
  state.error = "";
  state.previewURL = "";
  state.open = true;
  render();
  document.body.classList.add("kws-studio-open");
  await loadAssets();
  if (objective && state.manifest.version !== "kairos-website-builder-manifest-v2") await composeObjective();
}

function closeStudio() {
  state.open = false;
  document.querySelector("#kairos-website-builder-studio")?.remove();
  document.body.classList.remove("kws-studio-open");
}

function render() {
  if (!state.open) return;
  let root = document.querySelector("#kairos-website-builder-studio");
  if (!root) {
    root = document.createElement("section");
    root.id = "kairos-website-builder-studio";
    root.className = "kws-studio";
    root.setAttribute("aria-label", "Kairos Website Builder Studio");
    document.body.appendChild(root);
  }
  const selected = selectedSection();
  root.innerHTML = `
    <header class="kws-studio__topbar">
      <div><p>Kairos Website Builder Studio</p><strong>Intelligent Composer · Asset Library · governed Shopify staging</strong></div>
      <div class="kws-studio__top-actions">
        <button type="button" data-kws-save>Save draft</button>
        <button type="button" data-kws-build ${state.working ? "disabled" : ""}>${state.working ? "Building…" : "Build staging preview"}</button>
        <button type="button" data-kws-close aria-label="Close Website Builder Studio">×</button>
      </div>
    </header>
    <div class="kws-studio__body">
      <aside class="kws-studio__left">
        <div class="kws-studio__doctrine"><span>Doctrine loaded</span><strong>Experience-first · guided pathways · visible progress · Kairos guidance</strong></div>
        <section class="kws-composer">
          <div class="kws-panel-title"><span>Intelligent Composer</span><small>Objective → complete composition</small></div>
          <label class="kws-field"><span>Website objective</span><textarea data-kws-objective rows="5">${escapeHTML(state.manifest.objective)}</textarea></label>
          <label class="kws-field"><span>Style direction</span><textarea data-kws-style-direction rows="3" placeholder="Cinematic, editorial, image-led…">${escapeHTML(state.styleDirection)}</textarea></label>
          <button class="kws-compose-button" type="button" data-kws-compose ${state.composing ? "disabled" : ""}>${state.composing ? "Kairos is composing…" : "Compose complete website"}</button>
          ${state.composition ? `<p class="kws-composition-receipt"><strong>${escapeHTML(title(state.composition.engine || "composition"))}</strong><span>${Number(state.composition.assetsMatched?.length || 0)} assets matched · ${Number(state.composition.sectionCount || 0)} sections</span></p>` : ""}
        </section>
        <label class="kws-field"><span>Visual system</span><select data-kws-style>
          ${option("cinematic-obsidian", "Cinematic Obsidian", state.manifest.stylePreset)}
          ${option("editorial-light", "Editorial Light", state.manifest.stylePreset)}
          ${option("kinetic-blue", "Kinetic Blue", state.manifest.stylePreset)}
        </select></label>
        <div class="kws-studio__section-head"><span>Homepage journey</span><small>Dragless governed ordering</small></div>
        <div class="kws-studio__sections">${state.manifest.sections.map(sectionButton).join("")}</div>
        <section class="kws-asset-library">
          <div class="kws-panel-title"><span>Asset Library</span><small>${state.assets.length} reusable assets${state.assetUsage ? ` · ${formatBytes(state.assetUsage.bytes || 0)}` : ""}</small></div>
          <label class="kws-field"><span>Asset tags</span><input data-kws-asset-tags value="${escapeAttr(state.assetTags)}" placeholder="hero, publishing, kairos"></label>
          <label class="kws-asset-upload ${state.assetWorking ? "is-working" : ""}"><input type="file" data-kws-library-upload accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/mp4,audio/wav,audio/x-m4a"><span>${state.assetWorking ? "Storing asset…" : "Upload image or audio"}</span></label>
          <div class="kws-assets">${renderAssetLibrary()}</div>
        </section>
      </aside>
      <main class="kws-studio__canvas-wrap">
        <div class="kws-studio__canvas-toolbar">
          <div><button type="button" data-kws-viewport="desktop" class="${state.viewport === "desktop" ? "is-active" : ""}">Desktop</button><button type="button" data-kws-viewport="mobile" class="${state.viewport === "mobile" ? "is-active" : ""}">Mobile</button></div>
          <span>${escapeHTML(state.status || "Ready")}</span>
        </div>
        <div class="kws-studio__device kws-studio__device--${state.viewport}">
          <div class="kws-preview kws-preview--${state.manifest.stylePreset}">${renderPreview()}</div>
        </div>
        ${state.error ? `<p class="kws-studio__error">${escapeHTML(state.error)}</p>` : ""}
        ${state.previewURL ? `<a class="kws-studio__preview-link" href="${escapeAttr(state.previewURL)}" target="_blank" rel="noopener">Open verified Shopify staging preview ↗</a>` : ""}
      </main>
      <aside class="kws-studio__inspector">${renderInspector(selected)}</aside>
    </div>`;
  bind(root);
}

function sectionButton(section, index) {
  const locked = ["hero", "pathways", "kairos"].includes(section.id);
  const mediaState = section.media?.src ? "image" : "no image";
  const audioState = section.audio?.enabled ? (section.audio.src ? "audio" : "audio pending") : "";
  return `<button type="button" data-kws-section="${escapeAttr(section.id)}" class="${state.selectedSectionID === section.id ? "is-active" : ""}">
    <span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHTML(section.label)}</strong><small>${mediaState}${audioState ? ` · ${audioState}` : ""}</small></div><i>${locked ? "◆" : section.enabled ? "●" : "○"}</i>
  </button>`;
}

function renderAssetLibrary() {
  if (!state.assets.length) return `<p class="kws-assets__empty">Upload approved imagery and Kairos Moment audio once, then reuse it across sections and future pages.</p>`;
  return state.assets.slice(0, 40).map(asset => `<article class="kws-asset-card" data-kind="${escapeAttr(asset.kind)}">
    <div class="kws-asset-card__preview">${asset.kind === "image" ? `<img src="${escapeAttr(asset.src)}" alt="${escapeAttr(asset.alt || asset.name)}">` : `<span>♫</span>`}</div>
    <div><strong>${escapeHTML(asset.name)}</strong><small>${escapeHTML((asset.tags || []).join(" · ") || asset.kind)} · ${formatBytes(asset.bytes || 0)}</small></div>
    <button type="button" data-kws-assign-asset="${escapeAttr(asset.id)}">Use</button>
    <button type="button" data-kws-delete-asset="${escapeAttr(asset.id)}" aria-label="Delete ${escapeAttr(asset.name)}">×</button>
  </article>`).join("");
}

function renderPreview() {
  return state.manifest.sections.filter(section => section.enabled).map((section, index) => {
    const media = section.media?.src
      ? `<figure><img src="${escapeAttr(section.media.src)}" alt="${escapeAttr(section.media.alt || section.heading)}"></figure>`
      : `<figure class="is-placeholder"><span>${String(index + 1).padStart(2, "0")}</span><small>Media zone</small></figure>`;
    const items = section.items?.length ? `<div class="kws-preview__cards">${section.items.map((item, itemIndex) => `<article><span>${String(itemIndex + 1).padStart(2, "0")}</span><h4>${escapeHTML(item.title)}</h4><p>${escapeHTML(item.body)}</p></article>`).join("")}</div>` : "";
    const audio = section.audio?.enabled ? (section.audio.src
      ? `<audio class="kws-preview__audio" controls preload="none" src="${escapeAttr(section.audio.src)}"></audio>`
      : `<button type="button" class="kws-preview__moment" disabled><b>▶</b>${escapeHTML(section.audio.label || "Kairos Moment")}</button>`) : "";
    return `<section id="preview-${escapeAttr(section.id)}" class="kws-preview__section kws-preview__section--${escapeAttr(section.layout)} ${state.selectedSectionID === section.id ? "is-selected" : ""}" data-preview-section="${escapeAttr(section.id)}">
      <div class="kws-preview__copy"><p>${escapeHTML(section.eyebrow || section.label)}</p><h${index === 0 ? "1" : "2"}>${escapeHTML(section.heading)}</h${index === 0 ? "1" : "2"}><div>${escapeHTML(section.body)}</div>${section.ctaLabel ? `<a>${escapeHTML(section.ctaLabel)} ↗</a>` : ""}${audio}</div>${media}${items}
    </section>`;
  }).join("");
}

function renderInspector(section) {
  if (!section) return "";
  const index = state.manifest.sections.findIndex(item => item.id === section.id);
  const locked = ["hero", "pathways", "kairos"].includes(section.id);
  const imageAssets = state.assets.filter(asset => asset.kind === "image");
  const audioAssets = state.assets.filter(asset => asset.kind === "audio");
  return `<div class="kws-studio__inspector-head"><p>Section inspector</p><strong>${escapeHTML(section.label)}</strong><small>${locked ? "Required by doctrine" : "Optional journey zone"}</small></div>
    <div class="kws-order-controls"><button type="button" data-kws-move="up" ${index <= 0 ? "disabled" : ""}>Move up</button><button type="button" data-kws-move="down" ${index >= state.manifest.sections.length - 1 ? "disabled" : ""}>Move down</button></div>
    <label class="kws-toggle"><input type="checkbox" data-kws-enabled ${section.enabled ? "checked" : ""} ${locked ? "disabled" : ""}><span>Include section</span></label>
    <label class="kws-field"><span>Eyebrow</span><input data-kws-field="eyebrow" value="${escapeAttr(section.eyebrow)}"></label>
    <label class="kws-field"><span>Heading</span><textarea data-kws-field="heading" rows="3">${escapeHTML(section.heading)}</textarea></label>
    <label class="kws-field"><span>Body</span><textarea data-kws-field="body" rows="6">${escapeHTML(section.body)}</textarea></label>
    <div class="kws-field-row"><label class="kws-field"><span>CTA label</span><input data-kws-field="ctaLabel" value="${escapeAttr(section.ctaLabel)}"></label><label class="kws-field"><span>CTA destination</span><input data-kws-field="ctaHref" value="${escapeAttr(section.ctaHref)}"></label></div>
    <label class="kws-field"><span>Layout</span><select data-kws-field="layout">${["split", "cards", "editorial", "spotlight", "quote", "final", "full-bleed"].map(value => option(value, title(value), section.layout)).join("")}</select></label>
    <div class="kws-studio__asset-block"><div><span>Visual media</span><small>Choose a persistent asset or upload a new one.</small></div>
      ${section.media?.src ? `<img src="${escapeAttr(section.media.src)}" alt="">` : `<div class="kws-studio__asset-empty">No image placed</div>`}
      <label class="kws-field"><span>Asset Library image</span><select data-kws-select-image><option value="">Choose image…</option>${imageAssets.map(asset => option(asset.id, asset.name, section.media?.assetID || "")).join("")}</select></label>
      <input type="file" data-kws-section-upload accept="image/png,image/jpeg,image/webp">
      <label class="kws-field"><span>Image URL</span><input data-kws-media-url value="${/^https:\/\//i.test(section.media?.src || "") && !section.media?.assetID ? escapeAttr(section.media.src) : ""}" placeholder="https://…"></label>
      <label class="kws-field"><span>Alt text</span><input data-kws-media-alt value="${escapeAttr(section.media?.alt || "")}"></label>
      ${section.media?.src ? `<button type="button" data-kws-remove-media>Remove image</button>` : ""}
    </div>
    <div class="kws-studio__asset-block"><label class="kws-toggle"><input type="checkbox" data-kws-audio-enabled ${section.audio?.enabled ? "checked" : ""}><span>Kairos Moment audio</span></label>
      <label class="kws-field"><span>Audio label</span><input data-kws-audio-label value="${escapeAttr(section.audio?.label || "")}"></label>
      <label class="kws-field"><span>Spoken transcript</span><textarea data-kws-audio-transcript rows="4">${escapeHTML(section.audio?.transcript || "")}</textarea></label>
      <label class="kws-field"><span>Asset Library audio</span><select data-kws-select-audio><option value="">Choose audio…</option>${audioAssets.map(asset => option(asset.id, asset.name, section.audio?.assetID || "")).join("")}</select></label>
      <input type="file" data-kws-section-audio accept="audio/mpeg,audio/mp4,audio/wav,audio/x-m4a">
      <label class="kws-field"><span>Audio URL</span><input data-kws-audio-url value="${/^https:\/\//i.test(section.audio?.src || "") && !section.audio?.assetID ? escapeAttr(section.audio.src) : ""}" placeholder="https://…"></label>
      ${section.audio?.src ? `<audio controls src="${escapeAttr(section.audio.src)}"></audio><button type="button" data-kws-remove-audio>Remove audio</button>` : ""}
    </div>`;
}

function bind(root) {
  root.querySelector("[data-kws-close]")?.addEventListener("click", closeStudio);
  root.querySelector("[data-kws-save]")?.addEventListener("click", saveDraft);
  root.querySelector("[data-kws-build]")?.addEventListener("click", buildStaging);
  root.querySelector("[data-kws-compose]")?.addEventListener("click", composeObjective);
  root.querySelectorAll("[data-kws-section]").forEach(button => button.addEventListener("click", () => { state.selectedSectionID = button.dataset.kwsSection; render(); }));
  root.querySelectorAll("[data-preview-section]").forEach(section => section.addEventListener("click", () => { state.selectedSectionID = section.dataset.previewSection; render(); }));
  root.querySelectorAll("[data-kws-viewport]").forEach(button => button.addEventListener("click", () => { state.viewport = button.dataset.kwsViewport; render(); }));
  root.querySelector("[data-kws-objective]")?.addEventListener("input", event => { state.manifest.objective = event.target.value; });
  root.querySelector("[data-kws-style-direction]")?.addEventListener("input", event => { state.styleDirection = event.target.value; });
  root.querySelector("[data-kws-style]")?.addEventListener("change", event => { state.manifest.stylePreset = event.target.value; render(); });
  root.querySelector("[data-kws-asset-tags]")?.addEventListener("input", event => { state.assetTags = event.target.value; });
  root.querySelector("[data-kws-library-upload]")?.addEventListener("change", event => uploadAsset(event.target.files?.[0], false));
  root.querySelectorAll("[data-kws-assign-asset]").forEach(button => button.addEventListener("click", () => assignAsset(button.dataset.kwsAssignAsset)));
  root.querySelectorAll("[data-kws-delete-asset]").forEach(button => button.addEventListener("click", () => deleteAsset(button.dataset.kwsDeleteAsset)));

  const section = selectedSection();
  if (!section) return;
  root.querySelector("[data-kws-enabled]")?.addEventListener("change", event => { section.enabled = event.target.checked; render(); });
  root.querySelectorAll("[data-kws-field]").forEach(input => input.addEventListener("input", event => { section[event.target.dataset.kwsField] = event.target.value; updatePreviewOnly(root); }));
  root.querySelectorAll("[data-kws-move]").forEach(button => button.addEventListener("click", () => moveSection(button.dataset.kwsMove)));
  root.querySelector("[data-kws-select-image]")?.addEventListener("change", event => assignAsset(event.target.value, "image"));
  root.querySelector("[data-kws-select-audio]")?.addEventListener("change", event => assignAsset(event.target.value, "audio"));
  root.querySelector("[data-kws-section-upload]")?.addEventListener("change", event => uploadAsset(event.target.files?.[0], true));
  root.querySelector("[data-kws-section-audio]")?.addEventListener("change", event => uploadAsset(event.target.files?.[0], true));
  root.querySelector("[data-kws-media-url]")?.addEventListener("change", event => { section.media = { ...section.media, src: event.target.value.trim(), assetID: "" }; render(); });
  root.querySelector("[data-kws-media-alt]")?.addEventListener("input", event => { section.media.alt = event.target.value; });
  root.querySelector("[data-kws-remove-media]")?.addEventListener("click", () => { section.media = { src: "", alt: "", fit: "cover", assetID: "" }; render(); });
  root.querySelector("[data-kws-audio-enabled]")?.addEventListener("change", event => { section.audio.enabled = event.target.checked; render(); });
  root.querySelector("[data-kws-audio-label]")?.addEventListener("input", event => { section.audio.label = event.target.value; updatePreviewOnly(root); });
  root.querySelector("[data-kws-audio-transcript]")?.addEventListener("input", event => { section.audio.transcript = event.target.value; });
  root.querySelector("[data-kws-audio-url]")?.addEventListener("change", event => { section.audio = { ...section.audio, src: event.target.value.trim(), assetID: "", enabled: true }; render(); });
  root.querySelector("[data-kws-remove-audio]")?.addEventListener("click", () => { section.audio = { ...section.audio, src: "", assetID: "" }; render(); });
}

async function composeObjective() {
  const objective = String(state.manifest?.objective || "").trim();
  if (objective.length < 3) { state.error = "Tell Kairos what the website should accomplish."; render(); return; }
  state.composing = true; state.error = ""; state.status = "Kairos is composing the complete page and matching Asset Library media."; render();
  try {
    const response = await fetch("/api/website-builder/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
      body: JSON.stringify({ objective, styleDirection: state.styleDirection, currentManifest: state.manifest }),
    });
    const body = await readJSON(response);
    if (!response.ok || !body?.manifest) throw new Error(body?.error?.message || "Kairos could not compose the website.");
    state.manifest = normalizeManifest(body.manifest);
    state.composition = body.composition || null;
    state.selectedSectionID = state.manifest.sections.find(section => section.enabled)?.id || "hero";
    state.status = body.summary || "Kairos composed the website.";
    saveDraft(false);
  } catch (error) { state.error = error.message || "Kairos could not compose the website."; }
  finally { state.composing = false; render(); }
}

async function loadAssets() {
  try {
    const response = await fetch("/api/website-builder/assets", { cache: "no-store", credentials: "include" });
    const body = await readJSON(response);
    if (!response.ok) throw new Error(body?.error?.message || "Asset Library unavailable.");
    state.assets = Array.isArray(body.assets) ? body.assets : [];
    state.assetUsage = body.usage || null;
    state.error = "";
  } catch (error) { state.error = error.message || "Asset Library unavailable."; }
  render();
}

async function uploadAsset(file, assignAfter) {
  if (!file) return;
  state.assetWorking = true; state.error = ""; state.status = `Preparing ${file.name} for the persistent Asset Library.`; render();
  try {
    const kind = file.type.startsWith("audio/") ? "audio" : "image";
    if (file.size > 8 * 1024 * 1024) throw new Error("Keep each Website Builder asset under 8 MB.");
    const dataURL = kind === "image" ? await compressImage(file) : await readDataURL(file);
    const response = await fetch("/api/website-builder/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
      body: JSON.stringify({
        confirmation: ASSET_CONFIRMATION,
        name: file.name,
        kind,
        mimeType: kind === "image" ? mimeFromDataURL(dataURL) : file.type,
        dataBase64: dataURL,
        alt: kind === "image" ? selectedSection()?.heading || file.name : "",
        tags: state.assetTags,
      }),
    });
    const body = await readJSON(response);
    if (!response.ok || !body?.asset) throw new Error(body?.error?.message || "The asset could not be stored.");
    state.assets = [body.asset, ...state.assets.filter(asset => asset.id !== body.asset.id)];
    state.status = `${file.name} is now reusable across Website Builder projects.`;
    if (assignAfter) assignAsset(body.asset.id, kind, false);
  } catch (error) { state.error = error.message || "The asset could not be stored."; }
  finally { state.assetWorking = false; render(); }
}

function assignAsset(assetID, forcedKind = "", shouldRender = true) {
  if (!assetID) return;
  const asset = state.assets.find(item => item.id === assetID);
  const section = selectedSection();
  if (!asset || !section) return;
  const kind = forcedKind || asset.kind;
  if (kind === "audio") {
    section.audio = { ...section.audio, enabled: true, src: asset.src, assetID: asset.id, label: section.audio.label || asset.name };
  } else {
    section.media = { ...section.media, src: asset.src, assetID: asset.id, alt: asset.alt || section.heading, fit: "cover" };
  }
  state.status = `${asset.name} assigned to ${section.label}.`;
  if (shouldRender) render();
}

async function deleteAsset(assetID) {
  const asset = state.assets.find(item => item.id === assetID);
  if (!asset || !confirm(`Delete ${asset.name} from the persistent Asset Library?`)) return;
  try {
    const response = await fetch(`/api/website-builder/assets/${encodeURIComponent(assetID)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
      body: JSON.stringify({ confirmation: "DELETE_KAIROS_WEBSITE_ASSET" }),
    });
    const body = await readJSON(response);
    if (!response.ok) throw new Error(body?.error?.message || "The asset could not be deleted.");
    state.assets = state.assets.filter(item => item.id !== assetID);
    for (const section of state.manifest.sections) {
      if (section.media?.assetID === assetID) section.media = { src: "", alt: "", fit: "cover", assetID: "" };
      if (section.audio?.assetID === assetID) section.audio = { ...section.audio, src: "", assetID: "" };
    }
    state.status = `${asset.name} deleted from the Asset Library.`;
  } catch (error) { state.error = error.message || "The asset could not be deleted."; }
  render();
}

function moveSection(direction) {
  const index = state.manifest.sections.findIndex(section => section.id === state.selectedSectionID);
  const next = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || next < 0 || next >= state.manifest.sections.length) return;
  const [section] = state.manifest.sections.splice(index, 1);
  state.manifest.sections.splice(next, 0, section);
  state.status = `${section.label} moved ${direction}.`;
  render();
}

async function buildStaging() {
  state.working = true; state.error = ""; state.previewURL = ""; state.status = "Kairos is generating, writing, and verifying the governed Shopify staging package."; render();
  try {
    const response = await fetch("/api/website-builder/staging/build", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
      body: JSON.stringify({ confirmation: BUILD_CONFIRMATION, manifest: state.manifest }),
    });
    const body = await readJSON(response);
    if (!response.ok) throw new Error(body?.error?.message || "The staging build did not complete.");
    state.previewURL = body.previewURL || "";
    state.status = body.summary || "Shopify staging preview built and verified.";
    saveDraft(false);
  } catch (error) { state.error = error.message || "The staging build did not complete."; }
  finally { state.working = false; render(); }
}

function saveDraft(showStatus = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ manifest: state.manifest, styleDirection: state.styleDirection, savedAt: new Date().toISOString() }));
  if (showStatus) { state.status = "Draft saved on this device."; state.error = ""; render(); }
}

function readSavedState() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } }
function selectedSection() { return state.manifest?.sections?.find(section => section.id === state.selectedSectionID) || null; }
function updatePreviewOnly(root) { const canvas = root.querySelector(".kws-preview"); if (canvas) canvas.innerHTML = renderPreview(); }

function normalizeManifest(input) {
  const fallback = defaultManifest(String(input?.objective || ""));
  const sections = Array.isArray(input?.sections) && input.sections.length ? input.sections : fallback.sections;
  return {
    ...fallback,
    ...structuredClone(input || {}),
    version: input?.version || fallback.version,
    objective: String(input?.objective || fallback.objective),
    stylePreset: ["cinematic-obsidian", "editorial-light", "kinetic-blue"].includes(input?.stylePreset) ? input.stylePreset : fallback.stylePreset,
    motion: { reveal: input?.motion?.reveal !== false, mediaParallax: input?.motion?.mediaParallax !== false },
    sections: sections.map((section, index) => ({
      ...fallback.sections.find(item => item.id === section.id),
      ...section,
      id: String(section.id || `section-${index + 1}`),
      enabled: section.enabled !== false,
      media: { src: "", alt: "", fit: "cover", assetID: "", ...(section.media || {}) },
      audio: { enabled: false, label: "Hear the Kairos Moment", transcript: "", src: "", assetID: "", ...(section.audio || {}) },
      items: Array.isArray(section.items) ? section.items : [],
    })),
  };
}

function defaultManifest(objective) {
  return {
    version: "kairos-website-builder-manifest-v2",
    objective,
    stylePreset: "cinematic-obsidian",
    siteName: "Mindset Media Group™",
    motion: { reveal: true, mediaParallax: true },
    sections: [
      section("hero", "Opening experience", "Your knowledge has value. Build what comes next.", "Turn what you know, what you have lived, and what you are building into professional work that moves forward.", "Explore the ecosystem", "#pathways", "full-bleed", true),
      section("pathways", "Guided pathways", "Choose what you want to build.", "Start with the objective. Kairos connects it to the right knowledge, product, service, and next action.", "Start with Kairos", "#kairos", "cards", true, [item("Publish knowledge", "Books, guides, and publishing assets."), item("Build the brand", "Strategy, design, content, and creator systems."), item("Move into execution", "Professional support and guided workflows.")]),
      section("resources", "Knowledge and resources", "Practical knowledge for the next step.", "Curated tools and educational resources designed to create visible progress.", "Explore resources", "/collections/all", "editorial", true),
      section("services", "Professional production", "Move from idea or draft to a professional deliverable.", "Publishing, editorial, design, creator, and business support coordinated around the outcome.", "Explore services", "/collections/all", "split", true),
      section("subscriptions", "Continued development", "Keep building after the first result.", "Choose a recurring learning cadence aligned to your role, interests, and current objectives.", "Explore subscriptions", "/pages/contact", "editorial", true),
      section("kairos", "Kairos guidance", "One objective. Coordinated execution.", "Describe what you want finished. Kairos retrieves the governing knowledge, selects the correct path, preserves visible progress, and coordinates the work toward a verified result.", "Start with Kairos", "#final-next-step", "spotlight", true, [], { enabled: true, label: "Hear the Kairos welcome", transcript: "Hi, I’m Kairos. Welcome to Mindset Media Group. Tell me what you want to build, and I’ll help organize the path forward.", src: "", assetID: "" }),
      section("mission", "Mission and trust", "We’re not gatekeepers. We’re door openers.", "Knowledge grows when it is shared. Opportunity grows when doors are opened.", "Our mission", "/pages/about-us", "quote", true),
      section("final-next-step", "Continue the journey", "Start with the objective in front of you.", "Choose a pathway, explore a resource, request professional support, or let Kairos coordinate the next step.", "Begin", "#pathways", "final", true),
    ],
  };
}

function section(id, label, heading, body, ctaLabel, ctaHref, layout, enabled, items = [], audio = null) { return { id, label, enabled, eyebrow: label, heading, body, ctaLabel, ctaHref, layout, theme: "auto", media: { src: "", alt: "", fit: "cover", assetID: "" }, audio: audio || { enabled: false, label: "Hear the Kairos Moment", transcript: "", src: "", assetID: "" }, items }; }
function item(title, body) { return { title, body }; }
function option(value, label, selected) { return `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHTML(label)}</option>`; }
function title(value) { return String(value || "").replace(/[-_]+/g, " ").replace(/\b\w/g, character => character.toUpperCase()); }
function formatBytes(value) { const bytes = Number(value || 0); if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function mimeFromDataURL(value) { return /^data:([^;]+);base64,/i.exec(value)?.[1] || "image/webp"; }
async function compressImage(file) {
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error("Use PNG, JPEG, or WebP images.");
  const image = await loadImage(await readDataURL(file));
  const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = canvas.toDataURL("image/webp", 0.84);
  if (result.length > 8_500_000) throw new Error("The compressed image is still too large. Use a smaller source image.");
  return result;
}
function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("The image could not be decoded.")); image.src = src; }); }
function readDataURL(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("The file could not be read.")); reader.readAsDataURL(file); }); }
async function readJSON(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { summary: text }; } }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function escapeAttr(value) { return escapeHTML(value).replace(/`/g, "&#96;"); }
