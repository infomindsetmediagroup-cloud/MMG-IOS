import { routeObjective } from "./kairos-objective-router-v1.js";
import {
  deleteThemeFiles,
  hashText,
  httpError,
  inspectStagingSource,
  semanticHash,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_EXPERIENCE_CONTROLLER_BUILD = "kairos-experience-controller-20260717-1";

const OBJECTIVE_PATH = "/api/objectives/execute";
const BUILDER_STATUS_PATH = "/api/website-builder/status";
const BUILDER_BUILD_PATH = "/api/website-builder/staging/build";
const BUILDER_CONFIRMATION = "BUILD_KAIROS_WEBSITE_STUDIO_STAGING";
const TEMPLATE_FILE = "templates/index.json";
const SECTION_FILE = "sections/mmg-kairos-builder-homepage.liquid";
const CSS_FILE = "assets/mmg-kairos-builder-homepage.css";
const JS_FILE = "assets/mmg-kairos-builder-homepage.js";
const MANAGED_FILES = [TEMPLATE_FILE, SECTION_FILE, CSS_FILE, JS_FILE];
const READ_BACK_ATTEMPTS = 10;
const READ_BACK_DELAY_MS = 450;
const MAX_IMAGE_BYTES = 450_000;
const MAX_AUDIO_BYTES = 900_000;
const MAX_TOTAL_EMBEDDED_BYTES = 2_400_000;
const STYLE_PRESETS = new Set(["cinematic-obsidian", "editorial-light", "kinetic-blue"]);
const REQUIRED_SECTION_IDS = ["hero", "pathways", "kairos"];

export async function handleKairosExperienceRequest(request, env, ctx, delegate) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === BUILDER_STATUS_PATH) {
    return json({
      status: "operational",
      build: KAIROS_EXPERIENCE_CONTROLLER_BUILD,
      objectiveController: "single-entry-execution-v2",
      websiteBuilder: "premium-governed-staging-v1",
      supportedStylePresets: [...STYLE_PRESETS],
      mediaSlots: "image-upload-and-url",
      kairosMoments: "audio-upload-url-and-transcript",
      previewModes: ["desktop", "mobile"],
      safeguards: safeguards(),
    });
  }

  if (request.method === "POST" && url.pathname === OBJECTIVE_PATH) {
    return executeObjective(request, env, ctx, delegate);
  }

  if (request.method === "POST" && url.pathname === BUILDER_BUILD_PATH) {
    return buildWebsiteStaging(request, env);
  }

  return null;
}

async function executeObjective(request, env, ctx, delegate) {
  const payload = await safeRequestJSON(request.clone());
  const objective = clean(payload?.objective, 12_000);
  if (objective.length < 3) return failure(400, "objective_required", "Tell Kairos what you want finished.");

  const route = routeObjective({ objective });
  if (route.entryPoint === "website") {
    const manifest = defaultManifest(objective);
    return json({
      status: "ready-for-studio",
      build: KAIROS_EXPERIENCE_CONTROLLER_BUILD,
      mode: "website-builder-studio",
      route,
      summary: "Kairos routed the objective directly into Website Builder Studio with the MMG experience doctrine and homepage journey already loaded.",
      builder: {
        manifest,
        requiredConfirmation: BUILDER_CONFIRMATION,
        buildEndpoint: BUILDER_BUILD_PATH,
        previewModes: ["desktop", "mobile"],
      },
      nextAction: "Review the visual composition, place approved images and Kairos Moments, then build the governed Shopify staging preview.",
      safeguards: safeguards(),
    });
  }

  if (typeof delegate !== "function") return failure(503, "execution_delegate_unavailable", "Kairos execution is not connected.");
  const delegatedURL = new URL("/api/hub/run", request.url);
  const delegatedRequest = new Request(delegatedURL, {
    method: "POST",
    headers: jsonHeaders(request.headers),
    body: JSON.stringify({
      action: route.entryPoint,
      objective,
      routedBy: KAIROS_EXPERIENCE_CONTROLLER_BUILD,
      route,
    }),
  });
  const response = await delegate(delegatedRequest, env, ctx);
  const execution = await safeResponseJSON(response.clone());
  return json({
    status: response.ok ? (execution?.status || "completed") : (execution?.status || "failed"),
    build: KAIROS_EXPERIENCE_CONTROLLER_BUILD,
    mode: "direct-objective-execution",
    route,
    summary: execution?.summary || (response.ok ? `${route.label} completed the objective.` : `${route.label} could not complete the objective.`),
    execution,
    nextAction: execution?.nextAction || "Review the result and continue from the same objective record.",
    safeguards: {
      ...safeguards(),
      objectiveRepeated: false,
      separateRoutingStepRequired: false,
    },
  }, response.status);
}

async function buildWebsiteStaging(request, env) {
  const payload = await safeRequestJSON(request.clone());
  if (payload?.confirmation !== BUILDER_CONFIRMATION) {
    return failure(403, "staging_confirmation_required", `Confirm the exact staging build with ${BUILDER_CONFIRMATION}.`);
  }

  const manifest = normalizeManifest(payload?.manifest);
  const generated = buildManagedFiles(manifest);
  const source = await inspectStagingSource(null, request, env, KAIROS_EXPERIENCE_CONTROLLER_BUILD, MANAGED_FILES);
  const stagingTheme = source?.evidence?.stagingTheme;
  const mainTheme = source?.evidence?.mainTheme;
  validateThemeBoundary(stagingTheme, mainTheme);

  const previous = new Map((source?.evidence?.files || []).map(file => [file.filename, file.content]));
  const missingBefore = MANAGED_FILES.filter(filename => !previous.has(filename));

  try {
    await writeThemeFiles(env, stagingTheme.gid, generated.files);
    const verified = await waitForReadBack(request, env, generated);
    const previewURL = stagingPreviewURL(env, stagingTheme.gid);
    return json({
      status: "completed",
      build: KAIROS_EXPERIENCE_CONTROLLER_BUILD,
      action: "website-builder.staging.build",
      summary: "Kairos built and verified the premium website composition in Shopify staging.",
      objective: manifest.objective,
      stylePreset: manifest.stylePreset,
      sectionsBuilt: manifest.sections.filter(section => section.enabled).map(section => section.id),
      mediaSlotsUsed: manifest.sections.filter(section => section.enabled && section.media?.src).length,
      kairosMomentsEnabled: manifest.sections.filter(section => section.enabled && section.audio?.enabled && section.audio?.src).length,
      previewURL,
      targetTheme: stagingTheme,
      publishedTheme: mainTheme,
      files: verified.files,
      manifestHash: await hashText(JSON.stringify(manifest)),
      safeguards: safeguards(),
    });
  } catch (error) {
    await rollbackManagedFiles(env, stagingTheme.gid, previous, missingBefore).catch(() => null);
    return failure(Number(error?.status || error?.statusCode || 500), error?.code || "website_builder_staging_failed", safeMessage(error), {
      rollbackAttempted: true,
    });
  }
}

function defaultManifest(objective) {
  return {
    version: "kairos-website-builder-manifest-v1",
    objective,
    stylePreset: "cinematic-obsidian",
    siteName: "Mindset Media Group™",
    motion: { reveal: true, mediaParallax: true },
    sections: [
      section("hero", "Hero", "Knowledge becomes momentum.", "Turn what you know, what you have lived, and what you are building into professional work that moves forward.", "Explore the ecosystem", "#pathways", "split", true),
      section("pathways", "Guided pathways", "Choose what you want to build.", "Kairos connects each objective to the right knowledge, product, service, and next action.", "Start with an objective", "#kairos", "cards", true, [
        item("Publish your knowledge", "Books, guides, and publishing assets."),
        item("Build your brand", "Clear positioning, design, and creator systems."),
        item("Grow with practical AI", "Useful tools and education for real work."),
      ]),
      section("resources", "Products and resources", "Practical knowledge for the next step.", "Curated tools and educational resources designed to create visible progress.", "Explore resources", "/collections/all", "editorial", true),
      section("services", "Professional services", "Move from draft to deliverable.", "Publishing, editorial, design, production, creator, and business support around the work that matters now.", "Explore services", "/collections/all", "split", true),
      section("subscriptions", "Personalized learning", "Learning that continues with you.", "Choose a cadence and receive curated digital resources aligned to your role, interests, and current objectives.", "Explore subscriptions", "/pages/contact", "editorial", true),
      section("kairos", "Kairos", "One objective. Coordinated execution.", "Describe what you want finished. Kairos organizes the context, selects the governed path, preserves progress, and moves the work toward a verified result.", "Start with Kairos", "#final-next-step", "spotlight", true, [], {
        enabled: true,
        label: "Hear the Kairos welcome",
        transcript: "Hi, I’m Kairos. Welcome to Mindset Media Group. Tell me what you want to build, and I’ll help organize the path forward.",
        src: "",
      }),
      section("mission", "Mission and trust", "We’re not gatekeepers. We’re door openers.", "Knowledge grows when it is shared. Opportunity grows when doors are opened.", "Our mission", "/pages/about-us", "quote", true),
      section("final-next-step", "Final next step", "Start with the objective in front of you.", "Choose a pathway, explore a resource, request professional support, or let Kairos coordinate the work.", "Begin", "#pathways", "final", true),
    ],
  };
}

function section(id, label, heading, body, ctaLabel, ctaHref, layout, enabled, items = [], audio = null) {
  return {
    id,
    label,
    enabled,
    eyebrow: label,
    heading,
    body,
    ctaLabel,
    ctaHref,
    layout,
    theme: "auto",
    media: { src: "", alt: "", fit: "cover" },
    audio: audio || { enabled: false, label: "Hear the Kairos Moment", transcript: "", src: "" },
    items,
  };
}

function item(title, body) {
  return { title, body };
}

function normalizeManifest(input) {
  const source = input && typeof input === "object" ? input : {};
  const stylePreset = STYLE_PRESETS.has(source.stylePreset) ? source.stylePreset : "cinematic-obsidian";
  const objective = clean(source.objective, 12_000);
  if (objective.length < 3) throw httpError(400, "builder_objective_required", "Website Builder Studio requires the objective it is designing around.");
  const rawSections = Array.isArray(source.sections) ? source.sections.slice(0, 10) : [];
  if (!rawSections.length) throw httpError(400, "builder_sections_required", "Website Builder Studio requires at least one section.");
  const used = new Set();
  let embeddedBytes = 0;
  const sections = rawSections.map((raw, index) => {
    const id = slug(raw?.id || `section-${index + 1}`);
    if (!id || used.has(id)) throw httpError(400, "builder_section_id_invalid", "Every website section requires a unique ID.");
    used.add(id);
    const media = normalizeMedia(raw?.media, "image", MAX_IMAGE_BYTES);
    const audio = normalizeAudio(raw?.audio);
    embeddedBytes += media.embeddedBytes + audio.embeddedBytes;
    return {
      id,
      label: clean(raw?.label, 120) || titleCase(id),
      enabled: raw?.enabled !== false,
      eyebrow: clean(raw?.eyebrow, 180),
      heading: clean(raw?.heading, 320) || titleCase(id),
      body: clean(raw?.body, 2_800),
      ctaLabel: clean(raw?.ctaLabel, 120),
      ctaHref: safeHref(raw?.ctaHref),
      layout: ["split", "cards", "editorial", "spotlight", "quote", "final", "full-bleed"].includes(raw?.layout) ? raw.layout : "split",
      theme: ["auto", "dark", "light", "accent"].includes(raw?.theme) ? raw.theme : "auto",
      media: { src: media.src, alt: clean(raw?.media?.alt, 280), fit: raw?.media?.fit === "contain" ? "contain" : "cover" },
      audio: { enabled: Boolean(raw?.audio?.enabled), label: clean(raw?.audio?.label, 160), transcript: clean(raw?.audio?.transcript, 2_000), src: audio.src },
      items: normalizeItems(raw?.items),
    };
  });
  if (embeddedBytes > MAX_TOTAL_EMBEDDED_BYTES) throw httpError(413, "builder_embedded_media_too_large", "The combined uploaded image and audio clips are too large for the governed staging package.");
  for (const id of REQUIRED_SECTION_IDS) if (!sections.some(section => section.id === id && section.enabled)) throw httpError(400, "builder_required_section_missing", `The ${id} section is required by the MMG homepage journey doctrine.`);
  return {
    version: "kairos-website-builder-manifest-v1",
    objective,
    stylePreset,
    siteName: clean(source.siteName, 180) || "Mindset Media Group™",
    motion: { reveal: source?.motion?.reveal !== false, mediaParallax: source?.motion?.mediaParallax !== false },
    sections,
  };
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 8).map(item => ({
    title: clean(item?.title, 180),
    body: clean(item?.body, 700),
  })).filter(item => item.title || item.body);
}

function normalizeMedia(media, kind, maxBytes) {
  const src = clean(media?.src, 2_000_000);
  if (!src) return { src: "", embeddedBytes: 0 };
  if (/^https:\/\//i.test(src)) return { src, embeddedBytes: 0 };
  const pattern = kind === "image"
    ? /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=\s]+)$/i
    : /^data:audio\/(mpeg|mp4|wav|x-m4a);base64,([a-z0-9+/=\s]+)$/i;
  const match = src.match(pattern);
  if (!match) throw httpError(400, `${kind}_source_invalid`, `${titleCase(kind)} uploads must be approved HTTPS URLs or supported base64 data.`);
  const bytes = base64Bytes(match[2]);
  if (bytes > maxBytes) throw httpError(413, `${kind}_source_too_large`, `${titleCase(kind)} uploads must be smaller than ${Math.round(maxBytes / 1000)} KB after compression.`);
  return { src: src.replace(/\s+/g, ""), embeddedBytes: bytes };
}

function normalizeAudio(audio) {
  if (!audio?.enabled || !audio?.src) return { src: "", embeddedBytes: 0 };
  return normalizeMedia({ src: audio.src }, "audio", MAX_AUDIO_BYTES);
}

function buildManagedFiles(manifest) {
  const template = JSON.stringify({
    sections: { mmg_kairos_builder_homepage: { type: "mmg-kairos-builder-homepage", settings: {} } },
    order: ["mmg_kairos_builder_homepage"],
  }, null, 2);
  const sectionSource = renderSectionSource(manifest);
  const cssSource = renderCSS(manifest.stylePreset);
  const jsSource = renderJS(manifest.motion);
  return {
    files: [
      { filename: TEMPLATE_FILE, content: template },
      { filename: SECTION_FILE, content: sectionSource },
      { filename: CSS_FILE, content: cssSource },
      { filename: JS_FILE, content: jsSource },
    ],
    template,
    sectionSource,
    cssSource,
    jsSource,
  };
}

function renderSectionSource(manifest) {
  const enabled = manifest.sections.filter(section => section.enabled);
  const nav = enabled.map(section => `<a href="#${escapeAttr(section.id)}">${escapeHTML(section.label)}</a>`).join("");
  const sections = enabled.map((section, index) => renderSection(section, index)).join("\n");
  return `{{ 'mmg-kairos-builder-homepage.css' | asset_url | stylesheet_tag }}\n<section class="kws kws--${escapeAttr(manifest.stylePreset)}" data-kairos-website-studio data-build="${KAIROS_EXPERIENCE_CONTROLLER_BUILD}">\n  <nav class="kws__rail" aria-label="Homepage sections"><div>${nav}</div></nav>\n  <main>${sections}</main>\n</section>\n<script src="{{ 'mmg-kairos-builder-homepage.js' | asset_url }}" defer="defer"></script>\n{% schema %}\n{"name":"Kairos Website Builder","settings":[],"presets":[{"name":"Kairos Website Builder"}]}\n{% endschema %}`;
}

function renderSection(section, index) {
  const media = section.media?.src ? `<figure class="kws__media"><img src="${escapeAttr(section.media.src)}" alt="${escapeAttr(section.media.alt || section.heading)}" loading="${index === 0 ? "eager" : "lazy"}" style="object-fit:${section.media.fit === "contain" ? "contain" : "cover"}"></figure>` : `<div class="kws__media kws__media--placeholder" aria-hidden="true"><span>${String(index + 1).padStart(2, "0")}</span></div>`;
  const items = section.items?.length ? `<div class="kws__cards">${section.items.map((itemValue, itemIndex) => `<article><span>${String(itemIndex + 1).padStart(2, "0")}</span><h3>${escapeHTML(itemValue.title)}</h3><p>${escapeHTML(itemValue.body)}</p></article>`).join("")}</div>` : "";
  const cta = section.ctaLabel && section.ctaHref ? `<a class="kws__button" href="${escapeAttr(section.ctaHref)}">${escapeHTML(section.ctaLabel)}<span aria-hidden="true">↗</span></a>` : "";
  const audio = renderAudio(section);
  const theme = section.theme === "auto" ? (index % 2 ? "dark" : "light") : section.theme;
  return `<section id="${escapeAttr(section.id)}" class="kws__section kws__section--${escapeAttr(section.layout)} kws__section--${escapeAttr(theme)}" data-kws-reveal>\n  <div class="kws__shell">\n    <div class="kws__copy"><p class="kws__eyebrow">${escapeHTML(section.eyebrow || section.label)}</p><h${index === 0 ? "1" : "2"}>${escapeHTML(section.heading)}</h${index === 0 ? "1" : "2"}><p class="kws__body">${escapeHTML(section.body)}</p>${cta}${audio}</div>\n    ${media}\n    ${items}\n  </div>\n</section>`;
}

function renderAudio(section) {
  if (!section.audio?.enabled) return "";
  const transcript = section.audio.transcript ? `<details class="kws__transcript"><summary>Read transcript</summary><p>${escapeHTML(section.audio.transcript)}</p></details>` : "";
  if (!section.audio.src) return `<div class="kws__moment kws__moment--pending"><strong>${escapeHTML(section.audio.label || "Kairos Moment")}</strong><span>Audio clip ready to be added in Website Builder Studio.</span>${transcript}</div>`;
  const audioID = `kws-audio-${section.id}`;
  return `<div class="kws__moment"><button type="button" data-kws-audio data-audio-id="${escapeAttr(audioID)}"><span class="kws__play" aria-hidden="true">▶</span><span>${escapeHTML(section.audio.label || "Hear the Kairos Moment")}</span></button><audio id="${escapeAttr(audioID)}" preload="none" src="${escapeAttr(section.audio.src)}"></audio>${transcript}</div>`;
}

function renderCSS(stylePreset) {
  return `:root{--kws-blue:#126bff;--kws-ink:#07090d;--kws-paper:#f5f5f2;--kws-line:rgba(255,255,255,.14);--kws-radius:28px}*{box-sizing:border-box}.kws{font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;background:var(--kws-ink);color:#fff;overflow:hidden}.kws--editorial-light{--kws-ink:#f6f4ef;--kws-paper:#111318;color:#111318}.kws--kinetic-blue{--kws-ink:#031329;--kws-blue:#6bb8ff}.kws a{color:inherit}.kws__rail{position:sticky;top:0;z-index:20;padding:12px 18px;background:color-mix(in srgb,var(--kws-ink) 82%,transparent);backdrop-filter:blur(24px);border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent)}.kws__rail>div{max-width:1440px;margin:auto;display:flex;gap:20px;overflow:auto;scrollbar-width:none}.kws__rail a{white-space:nowrap;text-decoration:none;font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.72;padding:10px 0}.kws__section{position:relative;padding:clamp(72px,9vw,150px) 22px}.kws__section--light{background:var(--kws-paper);color:#111318}.kws__section--dark{background:var(--kws-ink);color:#fff}.kws__section--accent{background:linear-gradient(135deg,var(--kws-blue),#09111f);color:#fff}.kws__shell{max-width:1440px;margin:auto;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr);gap:clamp(40px,7vw,110px);align-items:center}.kws__section--full-bleed .kws__shell,.kws__section--quote .kws__shell,.kws__section--final .kws__shell{grid-template-columns:1fr}.kws__section--cards .kws__shell{grid-template-columns:1fr}.kws__copy{max-width:820px}.kws__eyebrow{margin:0 0 18px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;color:var(--kws-blue)}.kws h1,.kws h2{margin:0;max-width:12ch;font-size:clamp(48px,8vw,124px);line-height:.93;letter-spacing:-.065em;font-weight:720}.kws h2{font-size:clamp(42px,6.2vw,92px)}.kws__body{max-width:66ch;margin:28px 0 0;font-size:clamp(18px,2vw,27px);line-height:1.45;opacity:.76}.kws__button{display:inline-flex;align-items:center;gap:18px;margin-top:34px;padding:15px 22px;border-radius:999px;background:var(--kws-blue);color:#fff;text-decoration:none;font-weight:700}.kws__media{position:relative;margin:0;min-height:clamp(380px,58vw,760px);border-radius:var(--kws-radius);overflow:hidden;background:#111}.kws__media img{width:100%;height:100%;position:absolute;inset:0}.kws__media--placeholder{display:grid;place-items:center;background:radial-gradient(circle at 30% 20%,color-mix(in srgb,var(--kws-blue) 42%,transparent),transparent 52%),linear-gradient(135deg,#0d1119,#171d2a)}.kws__media--placeholder span{font-size:clamp(90px,16vw,220px);font-weight:800;letter-spacing:-.08em;opacity:.18}.kws__cards{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:20px}.kws__cards article{padding:30px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:22px;background:color-mix(in srgb,currentColor 5%,transparent)}.kws__cards article span{font-size:12px;opacity:.5}.kws__cards h3{font-size:24px;margin:42px 0 12px}.kws__cards p{line-height:1.55;opacity:.7}.kws__moment{margin-top:30px;padding:16px 18px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:18px;background:color-mix(in srgb,currentColor 5%,transparent)}.kws__moment button{all:unset;cursor:pointer;display:flex;align-items:center;gap:12px;font-weight:700}.kws__moment--pending{display:grid;gap:6px}.kws__moment--pending span{font-size:13px;opacity:.65}.kws__play{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--kws-blue);color:#fff;font-size:12px}.kws__transcript{margin-top:12px;font-size:14px;opacity:.72}.kws__transcript p{line-height:1.6}.kws [data-kws-reveal]{opacity:0;transform:translateY(42px);transition:opacity .85s cubic-bezier(.2,.7,.2,1),transform .85s cubic-bezier(.2,.7,.2,1)}.kws [data-kws-reveal].is-visible{opacity:1;transform:none}@media(max-width:900px){.kws__shell{grid-template-columns:1fr}.kws__media{min-height:66vw}.kws__cards{grid-template-columns:1fr}.kws h1,.kws h2{max-width:14ch}.kws__section{padding-inline:18px}}@media(prefers-reduced-motion:reduce){.kws [data-kws-reveal]{opacity:1;transform:none;transition:none}}/* preset:${stylePreset} */`;
}

function renderJS(motion) {
  return `(()=>{const root=document.querySelector('[data-kairos-website-studio]');if(!root)return;const reveal=${motion.reveal ? "true" : "false"};const parallax=${motion.mediaParallax ? "true" : "false"};const items=[...root.querySelectorAll('[data-kws-reveal]')];if(reveal&&'IntersectionObserver'in window){const io=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');io.unobserve(entry.target)}}),{threshold:.12});items.forEach(item=>io.observe(item))}else items.forEach(item=>item.classList.add('is-visible'));root.addEventListener('click',event=>{const button=event.target.closest('[data-kws-audio]');if(!button)return;const audio=document.getElementById(button.dataset.audioId);if(!audio)return;root.querySelectorAll('audio').forEach(item=>{if(item!==audio){item.pause();item.currentTime=0}});if(audio.paused){audio.play().catch(()=>{});button.querySelector('.kws__play').textContent='Ⅱ'}else{audio.pause();button.querySelector('.kws__play').textContent='▶'}});if(parallax&&matchMedia('(prefers-reduced-motion:no-preference)').matches){let ticking=false;addEventListener('scroll',()=>{if(ticking)return;ticking=true;requestAnimationFrame(()=>{root.querySelectorAll('.kws__media img').forEach(img=>{const r=img.parentElement.getBoundingClientRect();const p=(innerHeight-r.top)/(innerHeight+r.height);img.style.transform='scale(1.06) translateY('+((p-.5)*18)+'px)'});ticking=false})},{passive:true})}})();`;
}

async function waitForReadBack(request, env, generated) {
  const expected = new Map(generated.files.map(file => [file.filename, file.content]));
  const expectedTemplate = JSON.parse(generated.template);
  let latest = null;
  for (let attempt = 0; attempt < READ_BACK_ATTEMPTS; attempt += 1) {
    latest = await inspectStagingSource(null, request, env, KAIROS_EXPERIENCE_CONTROLLER_BUILD, MANAGED_FILES);
    const files = new Map((latest?.evidence?.files || []).map(file => [file.filename, file]));
    let matched = files.size >= MANAGED_FILES.length;
    for (const filename of MANAGED_FILES) {
      const file = files.get(filename);
      if (!file) { matched = false; break; }
      if (filename === TEMPLATE_FILE) {
        try {
          const actual = JSON.parse(String(file.content || "").replace(/^\/\*[\s\S]*?\*\//, "").trim());
          if (await semanticHash(actual) !== await semanticHash(expectedTemplate)) matched = false;
        } catch { matched = false; }
      } else if (await hashText(file.content) !== await hashText(expected.get(filename))) matched = false;
    }
    if (matched) return latest.evidence;
    await delay(READ_BACK_DELAY_MS);
  }
  throw httpError(502, "website_builder_readback_mismatch", `Shopify did not confirm the complete Website Builder Studio package after ${READ_BACK_ATTEMPTS} attempts.`);
}

async function rollbackManagedFiles(env, themeGid, previous, missingBefore) {
  const restore = [...previous.entries()].map(([filename, content]) => ({ filename, content }));
  if (restore.length) await writeThemeFiles(env, themeGid, restore);
  if (missingBefore.length) await deleteThemeFiles(env, themeGid, missingBefore);
}

function validateThemeBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme?.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_staging_required", "Website Builder Studio requires the verified non-live Kairos Staging theme.");
  if (!mainTheme?.gid || String(mainTheme?.role || "").toUpperCase() !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The published Shopify MAIN theme could not be verified.");
  if (stagingTheme.gid === mainTheme.gid) throw httpError(409, "staging_main_collision", "Kairos will not build the Website Studio package into Shopify MAIN.");
}

function stagingPreviewURL(env, gid) {
  const origin = String(env.MMG_STOREFRONT_ORIGIN || "https://themindsetmediagroup.com").replace(/\/+$/, "");
  const themeID = String(gid || "").split("/").pop();
  return themeID ? `${origin}/?preview_theme_id=${encodeURIComponent(themeID)}` : origin;
}

function safeguards(extra = {}) {
  return {
    liveThemeChanged: false,
    stagingOnly: true,
    exactShopifyReadBackRequired: true,
    rollbackBytesPreserved: true,
    objectiveDoctrineInherited: true,
    requiredJourneySectionsEnforced: true,
    reducedMotionSupported: true,
    externalInferenceAPIUsed: false,
    ...extra,
  };
}

function safeHref(value) {
  const href = clean(value, 2_000);
  if (!href) return "";
  if (/^(#|\/|https:\/\/)/i.test(href) && !/^javascript:/i.test(href)) return href;
  throw httpError(400, "builder_cta_href_invalid", "Website Builder Studio links must be approved HTTPS URLs, Shopify-relative paths, or section anchors.");
}

function jsonHeaders(input) {
  const headers = new Headers(input || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-MMG-Client-Build", KAIROS_EXPERIENCE_CONTROLLER_BUILD);
  return headers;
}

async function safeRequestJSON(request) { try { return await request.json(); } catch { return {}; } }
async function safeResponseJSON(response) { try { return await response.json(); } catch { return {}; } }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function clean(value, max) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function slug(value) { return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function titleCase(value) { return String(value || "").replace(/[-_]+/g, " ").replace(/\b\w/g, character => character.toUpperCase()); }
function base64Bytes(value) { const normalized = String(value || "").replace(/\s+/g, ""); return Math.max(0, Math.floor(normalized.length * 3 / 4) - (normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0)); }
function safeMessage(error) { return error instanceof Error && error.message ? error.message : "Kairos could not complete this operation."; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function escapeAttr(value) { return escapeHTML(value).replace(/`/g, "&#96;"); }

function failure(status, code, message, extraSafeguards = {}) {
  return json({
    status: status >= 500 ? "failed" : "needs-attention",
    build: KAIROS_EXPERIENCE_CONTROLLER_BUILD,
    error: { code, message },
    safeguards: safeguards(extraSafeguards),
  }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Experience-Controller": KAIROS_EXPERIENCE_CONTROLLER_BUILD,
      "X-Kairos-Website-Builder": "premium-governed-staging-v1",
      "X-Kairos-Live-Theme-Changed": "false",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
