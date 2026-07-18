const BUILD = "kairos-website-builder-studio-ui-20260717-1";
const STORAGE_KEY = "kairos.website-builder-studio.v1";
const CONFIRMATION = "BUILD_KAIROS_WEBSITE_STUDIO_STAGING";
const state = {
  open: false,
  manifest: null,
  selectedSectionID: "hero",
  viewport: "desktop",
  working: false,
  status: "",
  error: "",
  previewURL: "",
};

window.KairosWebsiteBuilder = {
  open(objective = "", seedManifest = null) {
    openStudio(objective, seedManifest);
  },
  close() {
    closeStudio();
  },
  getManifest() {
    return structuredClone(state.manifest || defaultManifest(""));
  },
};

document.addEventListener("click", event => {
  const websiteButton = event.target.closest?.('[data-child="website"]');
  if (!websiteButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openStudio("", null);
}, true);

function openStudio(objective, seedManifest) {
  const saved = readSavedManifest();
  state.manifest = normalizeManifest(seedManifest || saved || defaultManifest(objective));
  if (objective) state.manifest.objective = objective;
  state.selectedSectionID = state.manifest.sections.find(section => section.enabled)?.id || "hero";
  state.viewport = "desktop";
  state.working = false;
  state.status = "Kairos loaded the MMG experience doctrine, homepage journey, media zones, and audio guidance controls.";
  state.error = "";
  state.previewURL = "";
  state.open = true;
  render();
  document.body.classList.add("kws-studio-open");
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
      <div><p>Kairos Website Builder Studio</p><strong>Premium composition · governed Shopify staging</strong></div>
      <div class="kws-studio__top-actions">
        <button type="button" data-kws-save>Save draft</button>
        <button type="button" data-kws-build ${state.working ? "disabled" : ""}>${state.working ? "Building…" : "Build staging preview"}</button>
        <button type="button" data-kws-close aria-label="Close Website Builder Studio">×</button>
      </div>
    </header>
    <div class="kws-studio__body">
      <aside class="kws-studio__left">
        <div class="kws-studio__doctrine"><span>Doctrine loaded</span><strong>Experience-first · guided pathways · visible progress</strong></div>
        <label class="kws-field"><span>Website objective</span><textarea data-kws-objective rows="5">${escapeHTML(state.manifest.objective)}</textarea></label>
        <label class="kws-field"><span>Visual system</span><select data-kws-style>
          ${option("cinematic-obsidian", "Cinematic Obsidian", state.manifest.stylePreset)}
          ${option("editorial-light", "Editorial Light", state.manifest.stylePreset)}
          ${option("kinetic-blue", "Kinetic Blue", state.manifest.stylePreset)}
        </select></label>
        <div class="kws-studio__section-head"><span>Homepage journey</span><small>Required zones stay governed</small></div>
        <div class="kws-studio__sections">${state.manifest.sections.map(sectionButton).join("")}</div>
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
      <aside class="kws-studio__inspector">
        ${renderInspector(selected)}
      </aside>
    </div>`;
  bind(root);
}

function sectionButton(section, index) {
  const locked = ["hero", "pathways", "kairos"].includes(section.id);
  const mediaState = section.media?.src ? "media" : "empty";
  const audioState = section.audio?.enabled ? (section.audio.src ? "audio" : "audio-pending") : "none";
  return `<button type="button" data-kws-section="${escapeAttr(section.id)}" class="${state.selectedSectionID === section.id ? "is-active" : ""}">
    <span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHTML(section.label)}</strong><small>${mediaState}${audioState !== "none" ? ` · ${audioState}` : ""}</small></div><i>${locked ? "◆" : section.enabled ? "●" : "○"}</i>
  </button>`;
}

function renderPreview() {
  return state.manifest.sections.filter(section => section.enabled).map((section, index) => {
    const media = section.media?.src
      ? `<figure><img src="${escapeAttr(section.media.src)}" alt="${escapeAttr(section.media.alt || section.heading)}"></figure>`
      : `<figure class="is-placeholder"><span>${String(index + 1).padStart(2, "0")}</span></figure>`;
    const items = section.items?.length ? `<div class="kws-preview__cards">${section.items.map((item, itemIndex) => `<article><span>${String(itemIndex + 1).padStart(2, "0")}</span><h4>${escapeHTML(item.title)}</h4><p>${escapeHTML(item.body)}</p></article>`).join("")}</div>` : "";
    const audio = section.audio?.enabled ? `<button type="button" class="kws-preview__moment" disabled><b>▶</b>${escapeHTML(section.audio.label || "Kairos Moment")}</button>` : "";
    return `<section id="preview-${escapeAttr(section.id)}" class="kws-preview__section kws-preview__section--${escapeAttr(section.layout)} ${state.selectedSectionID === section.id ? "is-selected" : ""}" data-preview-section="${escapeAttr(section.id)}">
      <div class="kws-preview__copy"><p>${escapeHTML(section.eyebrow || section.label)}</p><h${index === 0 ? "1" : "2"}>${escapeHTML(section.heading)}</h${index === 0 ? "1" : "2"}><div>${escapeHTML(section.body)}</div>${section.ctaLabel ? `<a>${escapeHTML(section.ctaLabel)} ↗</a>` : ""}${audio}</div>${media}${items}
    </section>`;
  }).join("");
}

function renderInspector(section) {
  if (!section) return "";
  const locked = ["hero", "pathways", "kairos"].includes(section.id);
  return `<div class="kws-studio__inspector-head"><p>Section inspector</p><strong>${escapeHTML(section.label)}</strong><small>${locked ? "Required by doctrine" : "Optional journey zone"}</small></div>
    <label class="kws-toggle"><input type="checkbox" data-kws-enabled ${section.enabled ? "checked" : ""} ${locked ? "disabled" : ""}><span>Include section</span></label>
    <label class="kws-field"><span>Eyebrow</span><input data-kws-field="eyebrow" value="${escapeAttr(section.eyebrow)}"></label>
    <label class="kws-field"><span>Heading</span><textarea data-kws-field="heading" rows="3">${escapeHTML(section.heading)}</textarea></label>
    <label class="kws-field"><span>Body</span><textarea data-kws-field="body" rows="6">${escapeHTML(section.body)}</textarea></label>
    <div class="kws-field-row"><label class="kws-field"><span>CTA label</span><input data-kws-field="ctaLabel" value="${escapeAttr(section.ctaLabel)}"></label><label class="kws-field"><span>CTA destination</span><input data-kws-field="ctaHref" value="${escapeAttr(section.ctaHref)}"></label></div>
    <label class="kws-field"><span>Layout</span><select data-kws-field="layout">${["split", "cards", "editorial", "spotlight", "quote", "final", "full-bleed"].map(value => option(value, title(value), section.layout)).join("")}</select></label>
    <div class="kws-studio__asset-block"><div><span>Visual media</span><small>Upload an approved image for this exact section.</small></div>
      ${section.media?.src ? `<img src="${escapeAttr(section.media.src)}" alt="">` : `<div class="kws-studio__asset-empty">No image placed</div>`}
      <input type="file" data-kws-image accept="image/png,image/jpeg,image/webp">
      <label class="kws-field"><span>Image URL</span><input data-kws-media-url value="${/^https:\/\//i.test(section.media?.src || "") ? escapeAttr(section.media.src) : ""}" placeholder="https://…"></label>
      <label class="kws-field"><span>Alt text</span><input data-kws-media-alt value="${escapeAttr(section.media?.alt || "")}"></label>
      ${section.media?.src ? `<button type="button" data-kws-remove-media>Remove image</button>` : ""}
    </div>
    <div class="kws-studio__asset-block"><label class="kws-toggle"><input type="checkbox" data-kws-audio-enabled ${section.audio?.enabled ? "checked" : ""}><span>Kairos Moment audio</span></label>
      <label class="kws-field"><span>Audio label</span><input data-kws-audio-label value="${escapeAttr(section.audio?.label || "")}"></label>
      <label class="kws-field"><span>Spoken transcript</span><textarea data-kws-audio-transcript rows="4">${escapeHTML(section.audio?.transcript || "")}</textarea></label>
      <input type="file" data-kws-audio accept="audio/mpeg,audio/mp4,audio/wav,audio/x-m4a">
      <label class="kws-field"><span>Audio URL</span><input data-kws-audio-url value="${/^https:\/\//i.test(section.audio?.src || "") ? escapeAttr(section.audio.src) : ""}" placeholder="https://…"></label>
      ${section.audio?.src ? `<audio controls src="${escapeAttr(section.audio.src)}"></audio><button type="button" data-kws-remove-audio>Remove audio</button>` : ""}
    </div>`;
}

function bind(root) {
  root.querySelector("[data-kws-close]")?.addEventListener("click", closeStudio);
  root.querySelector("[data-kws-save]")?.addEventListener("click", saveDraft);
  root.querySelector("[data-kws-build]")?.addEventListener("click", buildStaging);
  root.querySelectorAll("[data-kws-section]").forEach(button => button.addEventListener("click", () => { state.selectedSectionID = button.dataset.kwsSection; render(); }));
  root.querySelectorAll("[data-preview-section]").forEach(section => section.addEventListener("click", () => { state.selectedSectionID = section.dataset.previewSection; render(); }));
  root.querySelectorAll("[data-kws-viewport]").forEach(button => button.addEventListener("click", () => { state.viewport = button.dataset.kwsViewport; render(); }));
  root.querySelector("[data-kws-objective]")?.addEventListener("input", event => { state.manifest.objective = event.target.value; });
  root.querySelector("[data-kws-style]")?.addEventListener("change", event => { state.manifest.stylePreset = event.target.value; render(); });
  const section = selectedSection();
  if (!section) return;
  root.querySelector("[data-kws-enabled]")?.addEventListener("change", event => { section.enabled = event.target.checked; render(); });
  root.querySelectorAll("[data-kws-field]").forEach(input => input.addEventListener("input", event => { section[event.target.dataset.kwsField] = event.target.value; updatePreviewOnly(root); }));
  root.querySelector("[data-kws-image]")?.addEventListener("change", async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try { section.media.src = await compressImage(file); section.media.alt ||= section.heading; state.status = `${section.label} image placed and compressed for staging.`; state.error = ""; render(); }
    catch (error) { state.error = error.message || "The image could not be prepared."; render(); }
  });
  root.querySelector("[data-kws-media-url]")?.addEventListener("change", event => { section.media.src = event.target.value.trim(); render(); });
  root.querySelector("[data-kws-media-alt]")?.addEventListener("input", event => { section.media.alt = event.target.value; });
  root.querySelector("[data-kws-remove-media]")?.addEventListener("click", () => { section.media.src = ""; render(); });
  root.querySelector("[data-kws-audio-enabled]")?.addEventListener("change", event => { section.audio.enabled = event.target.checked; render(); });
  root.querySelector("[data-kws-audio-label]")?.addEventListener("input", event => { section.audio.label = event.target.value; updatePreviewOnly(root); });
  root.querySelector("[data-kws-audio-transcript]")?.addEventListener("input", event => { section.audio.transcript = event.target.value; });
  root.querySelector("[data-kws-audio]")?.addEventListener("change", async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 900_000) throw new Error("Keep each Kairos Moment under 900 KB.");
      section.audio.src = await readDataURL(file); section.audio.enabled = true; state.status = `${section.label} Kairos Moment added.`; state.error = ""; render();
    } catch (error) { state.error = error.message || "The audio clip could not be prepared."; render(); }
  });
  root.querySelector("[data-kws-audio-url]")?.addEventListener("change", event => { section.audio.src = event.target.value.trim(); section.audio.enabled = Boolean(section.audio.src) || section.audio.enabled; render(); });
  root.querySelector("[data-kws-remove-audio]")?.addEventListener("click", () => { section.audio.src = ""; render(); });
}

function updatePreviewOnly(root) {
  const canvas = root.querySelector(".kws-preview");
  if (canvas) canvas.innerHTML = renderPreview();
  canvas?.querySelectorAll("[data-preview-section]").forEach(section => section.addEventListener("click", () => { state.selectedSectionID = section.dataset.previewSection; render(); }));
}

async function buildStaging() {
  state.working = true; state.error = ""; state.previewURL = ""; state.status = "Kairos is validating the visual package and building Shopify staging…"; render();
  try {
    const response = await fetch("/api/website-builder/staging/build", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      body: JSON.stringify({ confirmation: CONFIRMATION, manifest: state.manifest }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || `Kairos returned ${response.status}.`);
    state.previewURL = body.previewURL || "";
    state.status = body.summary || "Shopify staging built and verified.";
    saveDraft(false);
  } catch (error) {
    state.error = error.message || "Kairos could not build the staging preview.";
    state.status = "The staging package was not completed.";
  } finally {
    state.working = false;
    render();
  }
}

function saveDraft(announce = true) {
  try {
    const serialized = JSON.stringify(state.manifest);
    if (serialized.length > 4_500_000) throw new Error("This draft is too large for browser storage. Build staging to preserve the current media package.");
    localStorage.setItem(STORAGE_KEY, serialized);
    if (announce) { state.status = "Website Builder Studio draft saved on this device."; state.error = ""; render(); }
  } catch (error) {
    state.error = error.message || "The draft could not be saved.";
    if (announce) render();
  }
}

function readSavedManifest() {
  try { const value = localStorage.getItem(STORAGE_KEY); return value ? JSON.parse(value) : null; }
  catch { return null; }
}

function selectedSection() { return state.manifest?.sections?.find(section => section.id === state.selectedSectionID) || null; }

async function compressImage(file) {
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error("Upload a PNG, JPEG, or WebP image.");
  const bitmap = await createImageBitmap(file);
  const max = 1800;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  let quality = .84;
  let dataURL = canvas.toDataURL("image/webp", quality);
  while (dataURLBytes(dataURL) > 440_000 && quality > .45) { quality -= .08; dataURL = canvas.toDataURL("image/webp", quality); }
  if (dataURLBytes(dataURL) > 450_000) throw new Error("This image is still too large after compression. Use a smaller source image.");
  return dataURL;
}

function dataURLBytes(value) { const base64 = String(value || "").split(",")[1] || ""; return Math.floor(base64.length * 3 / 4); }
function readDataURL(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("The file could not be read.")); reader.readAsDataURL(file); }); }

function normalizeManifest(input) {
  const fallback = defaultManifest(input?.objective || "");
  const manifest = input && typeof input === "object" ? structuredClone(input) : fallback;
  manifest.stylePreset ||= "cinematic-obsidian";
  manifest.objective ||= "Build a premium MMG homepage guided by Kairos.";
  manifest.sections = Array.isArray(manifest.sections) && manifest.sections.length ? manifest.sections : fallback.sections;
  manifest.sections.forEach(section => {
    section.media ||= { src: "", alt: "", fit: "cover" };
    section.audio ||= { enabled: false, label: "Hear the Kairos Moment", transcript: "", src: "" };
    section.items ||= [];
  });
  return manifest;
}

function defaultManifest(objective) {
  return {
    version: "kairos-website-builder-manifest-v1",
    objective: objective || "Build a premium MMG homepage guided by Kairos.",
    stylePreset: "cinematic-obsidian",
    siteName: "Mindset Media Group™",
    motion: { reveal: true, mediaParallax: true },
    sections: [
      section("hero", "Hero", "Knowledge becomes momentum.", "Turn what you know, what you have lived, and what you are building into professional work that moves forward.", "Explore the ecosystem", "#pathways", "split", true),
      section("pathways", "Guided pathways", "Choose what you want to build.", "Kairos connects each objective to the right knowledge, product, service, and next action.", "Start with an objective", "#kairos", "cards", true, [item("Publish your knowledge", "Books, guides, and publishing assets."), item("Build your brand", "Clear positioning, design, and creator systems."), item("Grow with practical AI", "Useful tools and education for real work.")]),
      section("resources", "Products and resources", "Practical knowledge for the next step.", "Curated tools and educational resources designed to create visible progress.", "Explore resources", "/collections/all", "editorial", true),
      section("services", "Professional services", "Move from draft to deliverable.", "Publishing, editorial, design, production, creator, and business support around the work that matters now.", "Explore services", "/collections/all", "split", true),
      section("subscriptions", "Personalized learning", "Learning that continues with you.", "Choose a cadence and receive curated digital resources aligned to your role, interests, and current objectives.", "Explore subscriptions", "/pages/contact", "editorial", true),
      section("kairos", "Kairos", "One objective. Coordinated execution.", "Describe what you want finished. Kairos organizes the context, selects the governed path, preserves progress, and moves the work toward a verified result.", "Start with Kairos", "#final-next-step", "spotlight", true, [], { enabled: true, label: "Hear the Kairos welcome", transcript: "Hi, I’m Kairos. Welcome to Mindset Media Group. Tell me what you want to build, and I’ll help organize the path forward.", src: "" }),
      section("mission", "Mission and trust", "We’re not gatekeepers. We’re door openers.", "Knowledge grows when it is shared. Opportunity grows when doors are opened.", "Our mission", "/pages/about-us", "quote", true),
      section("final-next-step", "Final next step", "Start with the objective in front of you.", "Choose a pathway, explore a resource, request professional support, or let Kairos coordinate the work.", "Begin", "#pathways", "final", true),
    ],
  };
}

function section(id, label, heading, body, ctaLabel, ctaHref, layout, enabled, items = [], audio = null) { return { id, label, enabled, eyebrow: label, heading, body, ctaLabel, ctaHref, layout, theme: "auto", media: { src: "", alt: "", fit: "cover" }, audio: audio || { enabled: false, label: "Hear the Kairos Moment", transcript: "", src: "" }, items }; }
function item(title, body) { return { title, body }; }
function option(value, label, selected) { return `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHTML(label)}</option>`; }
function title(value) { return String(value || "").replace(/[-_]/g, " ").replace(/\b\w/g, character => character.toUpperCase()); }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function escapeAttr(value) { return escapeHTML(value).replace(/`/g, "&#96;"); }
