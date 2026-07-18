import { intelligenceConfigured, parseStrictJSON, runKairosIntelligence } from "./kairos-intelligence-v1.js";

export const KAIROS_WEBSITE_BUILDER_V2_BUILD = "kairos-website-builder-v2-20260717-1";

const STATUS_PATH = "/api/website-builder/v2/status";
const COMPOSE_PATH = "/api/website-builder/compose";
const ASSET_ROOT = "/api/website-builder/assets";
const ASSET_CONFIRMATION = "STORE_KAIROS_WEBSITE_ASSET";
const MAX_OBJECTIVE = 12_000;
const STYLE_PRESETS = ["cinematic-obsidian", "editorial-light", "kinetic-blue"];

export async function handleWebsiteBuilderV2Request(request, env) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === STATUS_PATH) {
    const assetSnapshot = await readAssetLibrary(request, env).catch(() => ({ assets: [], usage: null }));
    return json({
      status: "operational",
      build: KAIROS_WEBSITE_BUILDER_V2_BUILD,
      composer: "objective-to-premium-composition-v2",
      compositionModes: intelligenceConfigured(env) ? ["kairos-private-runtime", "doctrine-compiler-fallback"] : ["doctrine-compiler-fallback"],
      privateIntelligenceConfigured: intelligenceConfigured(env),
      assetLibrary: "durable-object-central-library-v1",
      assetCount: assetSnapshot.assets.length,
      assetUsage: assetSnapshot.usage,
      supportedAssets: ["image", "audio"],
      supportedStylePresets: STYLE_PRESETS,
      sectionReordering: true,
      automaticAssetMatching: true,
      stagingBuildEndpoint: "/api/website-builder/staging/build",
      safeguards: {
        externalInferenceAPI: false,
        mainThemeMutationAutomatic: false,
        stagingOnly: true,
        objectivePreserved: true,
        doctrineRequiredSections: ["hero", "pathways", "kairos"],
      },
    });
  }

  if (request.method === "POST" && url.pathname === COMPOSE_PATH) return composeWebsite(request, env);
  if (url.pathname === ASSET_ROOT || url.pathname.startsWith(`${ASSET_ROOT}/`)) return handleAssetAPI(request, env);
  return null;
}

async function composeWebsite(request, env) {
  const payload = await safeJSON(request.clone());
  const objective = clean(payload?.objective, MAX_OBJECTIVE);
  if (objective.length < 3) return failure(400, "composer_objective_required", "Tell Kairos what the website should accomplish.");

  const styleDirection = clean(payload?.styleDirection, 2_000);
  const assetsResult = await readAssetLibrary(request, env).catch(() => ({ assets: [], usage: null }));
  const base = deterministicManifest(objective, styleDirection);
  let manifest = base;
  let engine = "doctrine-compiler-fallback";
  let privateInference = null;

  if (intelligenceConfigured(env)) {
    try {
      const generated = await runKairosIntelligence(env, {
        purpose: "website-builder-intelligent-composer-v2",
        temperature: 0.18,
        maxTokens: 8000,
        system: [
          "You are Kairos, the private MMG website composition engine.",
          "Return strict JSON only.",
          "Design a premium homepage composition influenced by top-tier editorial, product, and cultural websites without copying any brand.",
          "Follow the MMG experience-first doctrine: objective-led guidance, visible progress, connected pathways, Kairos guidance, and the Door Opener mission.",
          "Keep exactly these section IDs: hero, pathways, resources, services, subscriptions, kairos, mission, final-next-step.",
          "Required sections hero, pathways, and kairos must remain enabled.",
          "Allowed stylePreset values: cinematic-obsidian, editorial-light, kinetic-blue.",
          "Allowed layout values: split, cards, editorial, spotlight, quote, final, full-bleed.",
          "CTA destinations must be an HTTPS URL, Shopify-relative path beginning with /, or section anchor beginning with #.",
          "Do not invent products, prices, metrics, testimonials, customers, or completed external actions.",
          "Schema: {\"stylePreset\":\"...\",\"siteName\":\"Mindset Media Group™\",\"sections\":[{\"id\":\"hero\",\"label\":\"...\",\"enabled\":true,\"eyebrow\":\"...\",\"heading\":\"...\",\"body\":\"...\",\"ctaLabel\":\"...\",\"ctaHref\":\"...\",\"layout\":\"...\",\"theme\":\"auto|dark|light|accent\",\"items\":[{\"title\":\"...\",\"body\":\"...\"}],\"audio\":{\"enabled\":false,\"label\":\"...\",\"transcript\":\"...\"}}]}"
        ].join("\n"),
        user: JSON.stringify({
          objective,
          styleDirection,
          currentManifest: compactManifest(payload?.currentManifest),
          availableAssets: assetsResult.assets.map(asset => ({ id: asset.id, name: asset.name, kind: asset.kind, alt: asset.alt, tags: asset.tags })),
        }),
      });
      manifest = normalizeGeneratedManifest(parseStrictJSON(generated.text), base, objective);
      engine = "kairos-private-runtime";
      privateInference = { model: generated.model, usage: generated.usage || null };
    } catch (error) {
      privateInference = { failed: true, code: error?.code || "private_composition_failed", message: safeMessage(error) };
      manifest = base;
    }
  }

  const assignment = assignAssets(manifest, assetsResult.assets, request.url);
  manifest = assignment.manifest;

  return json({
    status: "completed",
    build: KAIROS_WEBSITE_BUILDER_V2_BUILD,
    summary: engine === "kairos-private-runtime"
      ? "Kairos composed a complete premium homepage from the objective and matched reusable Asset Library media."
      : "Kairos compiled a complete doctrine-governed premium homepage and matched reusable Asset Library media.",
    objective,
    manifest,
    composition: {
      engine,
      privateInference,
      styleDirection,
      stylePreset: manifest.stylePreset,
      sectionCount: manifest.sections.filter(section => section.enabled).length,
      assetsAvailable: assetsResult.assets.length,
      assetsMatched: assignment.matches,
      doctrinesApplied: ["experience-first", "homepage-journey", "door-opener", "visible-progress", "kairos-guided-execution"],
    },
    nextAction: "Review the composition, adjust any section or asset, then build the governed Shopify staging preview.",
    safeguards: {
      externalInferenceAPI: false,
      privateRuntimeUsed: engine === "kairos-private-runtime",
      deterministicFallbackUsed: engine !== "kairos-private-runtime",
      liveThemeChanged: false,
      objectiveRepeated: false,
    },
  });
}

async function handleAssetAPI(request, env) {
  if (!env?.KAIROS_PROJECTS) return failure(503, "asset_library_storage_unavailable", "The persistent Website Builder Asset Library is not configured.");
  const url = new URL(request.url);
  if (request.method === "POST") {
    const payload = await safeJSON(request.clone());
    if (payload?.confirmation !== ASSET_CONFIRMATION) return failure(403, "asset_store_confirmation_required", `Confirm asset storage with ${ASSET_CONFIRMATION}.`);
  }
  const id = env.KAIROS_PROJECTS.idFromName("kairos-website-builder-asset-library-v1");
  const stub = env.KAIROS_PROJECTS.get(id);
  const internalPath = url.pathname.replace(/^\/api\/website-builder\/assets/, "/website-builder-assets");
  const internalURL = new URL(`${internalPath}${url.search}`, "https://kairos.internal");
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.clone().arrayBuffer();
  const response = await stub.fetch(new Request(internalURL, { method: request.method, headers: request.headers, body }));
  return enrichAssetResponse(response, request.url);
}

async function readAssetLibrary(request, env) {
  if (!env?.KAIROS_PROJECTS) return { assets: [], usage: null };
  const id = env.KAIROS_PROJECTS.idFromName("kairos-website-builder-asset-library-v1");
  const response = await env.KAIROS_PROJECTS.get(id).fetch("https://kairos.internal/website-builder-assets");
  const body = await safeResponseJSON(response);
  const origin = new URL(request.url).origin;
  return {
    assets: (Array.isArray(body?.assets) ? body.assets : []).map(asset => ({
      ...asset,
      src: asset.remoteURL || `${origin}${ASSET_ROOT}/${encodeURIComponent(asset.id)}/content`,
    })),
    usage: body?.usage || null,
  };
}

async function enrichAssetResponse(response, requestURL) {
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  const body = await safeResponseJSON(response.clone());
  const origin = new URL(requestURL).origin;
  if (body?.asset) body.asset.src = body.asset.remoteURL || `${origin}${ASSET_ROOT}/${encodeURIComponent(body.asset.id)}/content`;
  if (Array.isArray(body?.assets)) body.assets = body.assets.map(asset => ({ ...asset, src: asset.remoteURL || `${origin}${ASSET_ROOT}/${encodeURIComponent(asset.id)}/content` }));
  return json(body, response.status, { "X-MMG-Asset-Library": response.headers.get("X-MMG-Asset-Library") || "" });
}

function deterministicManifest(objective, styleDirection) {
  const combined = `${objective} ${styleDirection}`.toLowerCase();
  const stylePreset = /editorial|light|magazine|knowledge library|minimal|apple/.test(combined)
    ? "editorial-light"
    : /kinetic|electric|blue|technology|motion|energy/.test(combined)
      ? "kinetic-blue"
      : "cinematic-obsidian";
  const subject = deriveSubject(objective);
  const promise = derivePromise(objective);
  return {
    version: "kairos-website-builder-manifest-v2",
    objective,
    stylePreset,
    siteName: "Mindset Media Group™",
    motion: { reveal: true, mediaParallax: stylePreset !== "editorial-light" },
    composition: { generatedBy: "doctrine-compiler-fallback", styleDirection },
    sections: [
      section("hero", "Opening experience", promise.heading, promise.body, "Explore the ecosystem", "#pathways", "full-bleed", true),
      section("pathways", "Guided pathways", "Choose the path that matches what you want to build.", `Start with the objective. Kairos connects ${subject} to the right knowledge, resource, service, and next action.`, "Start with Kairos", "#kairos", "cards", true, [
        item("Publish knowledge", "Turn expertise and lived experience into professional books, guides, and publishing assets."),
        item("Build the brand", "Create a clearer presence through strategy, design, content, and connected systems."),
        item("Move into execution", "Use practical resources, professional support, and Kairos-guided workflows to finish the work."),
      ]),
      section("resources", "Knowledge and resources", "Practical knowledge should create visible progress.", "Explore focused guides, creator education, and digital resources organized around the next useful action.", "Explore resources", "/collections/all", "editorial", true),
      section("services", "Professional production", "Move from idea or draft to a professional deliverable.", "Publishing, editorial, design, creator, and business support are coordinated around the outcome—not sold as disconnected tasks.", "Explore services", "/collections/all", "split", true),
      section("subscriptions", "Continued development", "Keep building after the first result.", "Choose a recurring learning cadence aligned to your role, interests, and current objectives so momentum continues.", "Explore subscriptions", "/pages/contact", "editorial", true),
      section("kairos", "Kairos guidance", "One objective. Coordinated execution.", "Describe what you want finished. Kairos retrieves the governing knowledge, selects the correct path, preserves visible progress, and coordinates the work toward a verified result.", "Start with Kairos", "#final-next-step", "spotlight", true, [], {
        enabled: true,
        label: "Hear the Kairos welcome",
        transcript: "Hi, I’m Kairos. Welcome to Mindset Media Group. Tell me what you want to build, and I’ll help organize the path forward.",
        src: "",
      }),
      section("mission", "Mission and trust", "We’re not gatekeepers. We’re door openers.", "Knowledge grows when it is shared. Opportunity grows when doors are opened. MMG reduces unnecessary complexity while preserving professional quality and integrity.", "Our mission", "/pages/about-us", "quote", true),
      section("final-next-step", "Continue the journey", "Start with the objective in front of you.", "Choose a pathway, explore a resource, request professional support, or let Kairos coordinate the next step.", "Begin", "#pathways", "final", true),
    ],
  };
}

function normalizeGeneratedManifest(value, fallback, objective) {
  const source = value && typeof value === "object" ? value : {};
  const byID = new Map((Array.isArray(source.sections) ? source.sections : []).map(section => [slug(section?.id), section]));
  const sections = fallback.sections.map(base => {
    const generated = byID.get(base.id) || {};
    return {
      ...base,
      label: clean(generated.label, 120) || base.label,
      enabled: ["hero", "pathways", "kairos"].includes(base.id) ? true : generated.enabled !== false,
      eyebrow: clean(generated.eyebrow, 180) || base.eyebrow,
      heading: clean(generated.heading, 320) || base.heading,
      body: clean(generated.body, 2800) || base.body,
      ctaLabel: clean(generated.ctaLabel, 120) || base.ctaLabel,
      ctaHref: safeHref(generated.ctaHref) || base.ctaHref,
      layout: ["split", "cards", "editorial", "spotlight", "quote", "final", "full-bleed"].includes(generated.layout) ? generated.layout : base.layout,
      theme: ["auto", "dark", "light", "accent"].includes(generated.theme) ? generated.theme : base.theme,
      items: normalizeItems(generated.items).length ? normalizeItems(generated.items) : base.items,
      audio: {
        ...base.audio,
        enabled: Boolean(generated?.audio?.enabled ?? base.audio.enabled),
        label: clean(generated?.audio?.label, 160) || base.audio.label,
        transcript: clean(generated?.audio?.transcript, 2000) || base.audio.transcript,
      },
    };
  });
  return {
    ...fallback,
    version: "kairos-website-builder-manifest-v2",
    objective,
    stylePreset: STYLE_PRESETS.includes(source.stylePreset) ? source.stylePreset : fallback.stylePreset,
    siteName: clean(source.siteName, 180) || fallback.siteName,
    composition: { generatedBy: "kairos-private-runtime" },
    sections,
  };
}

function assignAssets(manifest, assets, requestURL) {
  const origin = new URL(requestURL).origin;
  const available = (Array.isArray(assets) ? assets : []).map(asset => ({
    ...asset,
    src: asset.src || asset.remoteURL || `${origin}${ASSET_ROOT}/${encodeURIComponent(asset.id)}/content`,
    searchable: `${asset.name || ""} ${asset.alt || ""} ${(asset.tags || []).join(" ")}`.toLowerCase(),
  }));
  const used = new Set();
  const matches = [];
  const sections = manifest.sections.map(section => {
    const keywords = sectionKeywords(section.id);
    const image = bestAsset(available, "image", keywords, used);
    const audio = section.id === "kairos" ? bestAsset(available, "audio", ["kairos", "welcome", "voice", "moment", "audio"], used) : null;
    if (image) { used.add(image.id); matches.push({ sectionID: section.id, assetID: image.id, kind: "image" }); }
    if (audio) { used.add(audio.id); matches.push({ sectionID: section.id, assetID: audio.id, kind: "audio" }); }
    return {
      ...section,
      media: image ? { src: image.src, alt: image.alt || image.name || section.heading, fit: "cover", assetID: image.id } : section.media,
      audio: audio ? { ...section.audio, enabled: true, src: audio.src, assetID: audio.id, label: section.audio.label || audio.name } : section.audio,
    };
  });
  return { manifest: { ...manifest, sections }, matches };
}

function bestAsset(assets, kind, keywords, used) {
  return assets
    .filter(asset => asset.kind === kind && !used.has(asset.id))
    .map(asset => ({ asset, score: keywords.reduce((score, keyword) => score + (asset.searchable.includes(keyword) ? (keyword.includes(" ") ? 4 : 2) : 0), 0) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || String(b.asset.createdAt).localeCompare(String(a.asset.createdAt)))[0]?.asset || null;
}

function sectionKeywords(id) {
  const map = {
    hero: ["hero", "homepage", "brand", "opening", "banner", "mindset"],
    pathways: ["pathway", "journey", "direction", "creator", "publishing"],
    resources: ["resource", "book", "guide", "education", "library", "product"],
    services: ["service", "production", "design", "editorial", "business"],
    subscriptions: ["subscription", "learning", "delivery", "membership"],
    kairos: ["kairos", "technology", "intelligence", "system", "interface"],
    mission: ["mission", "door", "community", "faith", "people", "trust"],
    "final-next-step": ["cta", "action", "future", "next", "momentum"],
  };
  return map[id] || [id];
}

function deriveSubject(objective) {
  const text = clean(objective, 240).replace(/[.?!]+$/g, "");
  return text.length > 120 ? `${text.slice(0, 117)}…` : text.toLowerCase();
}

function derivePromise(objective) {
  const normalized = objective.toLowerCase();
  if (/publish|book|author|manuscript/.test(normalized)) return { heading: "Turn knowledge into work people can hold, use, and remember.", body: "Build a premium publishing experience that guides ideas from lived experience and expertise into books, resources, and lasting intellectual property." };
  if (/creator|brand|content|audience/.test(normalized)) return { heading: "Build a brand that moves with purpose.", body: "Connect creator education, professional production, practical tools, and guided execution in one experience designed to create momentum." };
  if (/business|service|customer|revenue/.test(normalized)) return { heading: "Make the next business move clearer.", body: "Guide visitors from their objective to the right resource, service, relationship, and verified next action without unnecessary friction." };
  return { heading: "Your knowledge has value. Build what comes next.", body: "Mindset Media Group connects practical knowledge, professional production, digital resources, and Kairos-guided execution around the objective in front of you." };
}

function section(id, label, heading, body, ctaLabel, ctaHref, layout, enabled, items = [], audio = null) {
  return { id, label, enabled, eyebrow: label, heading, body, ctaLabel, ctaHref, layout, theme: "auto", media: { src: "", alt: "", fit: "cover" }, audio: audio || { enabled: false, label: "Hear the Kairos Moment", transcript: "", src: "" }, items };
}
function item(title, body) { return { title, body }; }
function normalizeItems(items) { return (Array.isArray(items) ? items : []).slice(0, 8).map(item => ({ title: clean(item?.title, 180), body: clean(item?.body, 700) })).filter(item => item.title || item.body); }
function compactManifest(value) {
  if (!value || typeof value !== "object") return null;
  return { stylePreset: value.stylePreset, sections: (Array.isArray(value.sections) ? value.sections : []).map(section => ({ id: section.id, heading: section.heading, body: section.body, layout: section.layout, enabled: section.enabled })) };
}
function safeHref(value) { const href = clean(value, 1200); return /^(https:\/\/|\/|#)/i.test(href) && !/^\/\//.test(href) ? href : ""; }
function slug(value) { return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function clean(value, max) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function safeMessage(error) { return error instanceof Error && error.message ? error.message : "Kairos could not complete the website composition."; }
async function safeJSON(request) { try { return await request.json(); } catch { return {}; } }
async function safeResponseJSON(response) { try { return await response.json(); } catch { return {}; } }
function failure(status, code, message) { return json({ status: status >= 500 ? "failed" : "needs-attention", build: KAIROS_WEBSITE_BUILDER_V2_BUILD, error: { code, message }, safeguards: { externalInferenceAPI: false, liveThemeChanged: false } }, status); }
function json(value, status = 200, extraHeaders = {}) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Website-Builder-V2": KAIROS_WEBSITE_BUILDER_V2_BUILD, "X-Content-Type-Options": "nosniff", ...extraHeaders } }); }
