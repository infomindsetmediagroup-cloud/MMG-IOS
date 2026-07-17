import {
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  validateHomepageDocument,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_NEURON_FREE_HOMEPAGE_BUILD = "kairos-neuron-free-homepage-planner-20260717-1";

const PLAN_PATH = "/api/shopify/staging/plan/jobs";
const TEMPLATE_FILE = "templates/index.json";
const MAX_REPLACEMENTS = 16;

const FIELD_RULES = Object.freeze([
  { aliases: ["hero heading", "primary hero heading", "hero headline"], role: "heading", zone: "hero" },
  { aliases: ["hero supporting text", "hero support text", "hero description", "hero body"], role: "body", zone: "hero" },
  { aliases: ["primary hero button label", "hero primary button label", "primary button label"], role: "button", zone: "hero", ordinal: 0 },
  { aliases: ["secondary hero button label", "hero secondary button label", "secondary button label"], role: "button", zone: "hero", ordinal: 1 },
  { aliases: ["guided-path heading", "guided path heading", "pathway heading", "guided pathway heading"], role: "heading", zone: "pathway" },
  { aliases: ["guided-path supporting text", "guided path supporting text", "pathway supporting text", "guided pathway supporting text"], role: "body", zone: "pathway" },
  { aliases: ["kairos heading"], role: "heading", zone: "kairos" },
  { aliases: ["kairos supporting text", "kairos support text", "kairos description"], role: "body", zone: "kairos" },
  { aliases: ["products and services heading", "products heading", "services heading"], role: "heading", zone: "products" },
  { aliases: ["products and services supporting text", "products supporting text", "services supporting text"], role: "body", zone: "products" },
  { aliases: ["mission heading", "trust heading"], role: "heading", zone: "mission" },
  { aliases: ["mission supporting text", "mission support text", "trust supporting text"], role: "body", zone: "mission" },
  { aliases: ["final heading", "final call to action heading", "final cta heading"], role: "heading", zone: "final" },
  { aliases: ["final supporting text", "final call to action supporting text", "final cta supporting text"], role: "body", zone: "final" },
  { aliases: ["final primary button label", "final cta primary button label"], role: "button", zone: "final", ordinal: 0 },
  { aliases: ["final secondary button label", "final cta secondary button label"], role: "button", zone: "final", ordinal: 1 },
]);

export async function handleNeuronFreeHomepagePlan(request, env, _ctx, delegate) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== PLAN_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  const requestType = String(payload?.requestType || "homepage").trim().toLowerCase();
  const objective = String(payload?.objective || "").trim();
  if (requestType !== "homepage" || !objective || hasExplicitLiteralReplacement(objective)) return null;

  const requested = parseRequestedFields(objective);
  if (!requested.length) return null;

  const source = await inspectHomepageSource(request, env);
  const inventory = buildInventory(source);
  if (!inventory.length) throw httpError(409, "homepage_text_inventory_empty", "Kairos could not find editable visible text in the freshly duplicated homepage.");

  const replacements = bindRequestedFields(requested, inventory);
  if (!replacements.length) return null;

  const explicitObjective = buildExplicitObjective(objective, replacements);
  const repairedRequest = rebuildRequest(request, {
    ...payload,
    objective: explicitObjective,
    promptBinding: {
      build: KAIROS_NEURON_FREE_HOMEPAGE_BUILD,
      mode: "deterministic-verified-source-binding",
      originalObjective: objective,
      replacementCount: replacements.length,
      workersAIUsed: false,
      neuronsConsumed: 0,
    },
  });

  const response = await delegate(repairedRequest);
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Neuron-Free-Homepage", KAIROS_NEURON_FREE_HOMEPAGE_BUILD);
  headers.set("X-Kairos-Homepage-Planner-Mode", "deterministic-source-binding");
  headers.set("X-Kairos-Workers-AI-Used", "false");
  headers.set("X-Kairos-Neurons-Consumed", "0");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function inspectHomepageSource(request, env) {
  const initial = await inspectStagingSource(null, request, env, KAIROS_NEURON_FREE_HOMEPAGE_BUILD, [TEMPLATE_FILE]);
  const templateFile = fileByName(initial?.evidence?.files, TEMPLATE_FILE);
  if (!templateFile?.content) throw httpError(409, "homepage_template_unavailable", "Kairos could not read the freshly duplicated homepage template.");
  const document = parseShopifyJson(templateFile.content, "Fresh Kairos Staging homepage");
  validateHomepageDocument(structuredClone(document), document);
  const sectionFiles = deriveSectionFiles(document);
  const full = sectionFiles.length
    ? await inspectStagingSource(null, request, env, KAIROS_NEURON_FREE_HOMEPAGE_BUILD, [TEMPLATE_FILE, ...sectionFiles])
    : initial;
  return {
    document,
    sectionFiles,
    files: new Map((full?.evidence?.files || []).map(file => [file.filename, file])),
  };
}

function parseRequestedFields(objective) {
  const lines = String(objective || "").replace(/\r/g, "").split("\n");
  const fields = [];
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (!raw || !raw.endsWith(":")) continue;
    const label = normalizeLabel(raw.slice(0, -1));
    const rule = FIELD_RULES.find(item => item.aliases.some(alias => label === alias));
    if (!rule) continue;
    let cursor = index + 1;
    while (cursor < lines.length && !lines[cursor].trim()) cursor += 1;
    if (cursor >= lines.length) continue;
    const value = lines[cursor].trim();
    if (!safeReplacement(value) || value.endsWith(":")) continue;
    fields.push({ ...rule, label, value, sourceIndex: index });
  }
  return dedupeFields(fields).slice(0, MAX_REPLACEMENTS);
}

function buildInventory(source) {
  const order = Array.isArray(source.document?.order) ? source.document.order : Object.keys(source.document?.sections || {});
  const sectionIndex = new Map(order.map((id, index) => [id, index]));
  const inventory = [];

  for (const [sectionId, section] of Object.entries(source.document?.sections || {})) {
    const context = {
      sectionId,
      sectionType: String(section?.type || ""),
      sectionIndex: sectionIndex.get(sectionId) ?? 999,
      sectionCount: Math.max(order.length, 1),
    };
    collectSettings(inventory, { ...context, scope: "section", blockId: "", blockType: "", settings: section?.settings || {} });
    for (const [blockId, block] of Object.entries(section?.blocks || {})) {
      collectSettings(inventory, { ...context, scope: "block", blockId, blockType: String(block?.type || ""), settings: block?.settings || {} });
    }
  }

  for (const filename of source.sectionFiles) {
    const file = source.files.get(filename);
    if (!file?.content) continue;
    const type = filename.replace(/^sections\//, "").replace(/\.liquid$/, "");
    visibleTextSegments(file.content).forEach((segment, index) => {
      inventory.push({
        id: `liquid:${filename}:${index}`,
        filename,
        kind: "liquid-text",
        role: inferRole("visible-text", segment.text),
        key: "visible-text",
        before: segment.text,
        sectionId: "",
        sectionType: type,
        sectionIndex: 999,
        sectionCount: Math.max(order.length, 1),
        blockId: "",
        blockType: "",
      });
    });
  }

  return inventory.filter(item => safeSourceText(item.before));
}

function collectSettings(inventory, context) {
  for (const [key, value] of Object.entries(context.settings || {})) {
    if (typeof value !== "string" || !safeSourceText(value)) continue;
    if (isNonTextSetting(key, value)) continue;
    const base = `json:${context.scope}:${context.sectionId}:${context.blockId || "section"}:${key}`;
    if (isMarkupSetting(key, value)) {
      visibleTextSegments(value).forEach((segment, index) => inventory.push({
        id: `${base}:segment:${index}`,
        filename: TEMPLATE_FILE,
        kind: "json-markup-text",
        role: inferRole(key, segment.text),
        key,
        before: segment.text,
        ...withoutSettings(context),
      }));
      continue;
    }
    if (/[<>{}%]/.test(value)) continue;
    inventory.push({
      id: base,
      filename: TEMPLATE_FILE,
      kind: "json-text",
      role: inferRole(key, value),
      key,
      before: value.trim(),
      ...withoutSettings(context),
    });
  }
}

function bindRequestedFields(requested, inventory) {
  const used = new Set();
  const bound = [];

  for (const field of requested) {
    const candidates = inventory
      .filter(item => !used.has(item.id) && item.role === field.role)
      .map(item => ({ item, score: bindingScore(field, item) }))
      .filter(candidate => candidate.score >= 45)
      .sort((left, right) => right.score - left.score);

    if (!candidates.length) continue;
    let selected = candidates[0];
    if (field.role === "button" && Number.isInteger(field.ordinal)) {
      const sameZone = candidates.filter(candidate => zoneScore(field.zone, candidate.item) >= 25);
      if (sameZone[field.ordinal]) selected = sameZone[field.ordinal];
    }

    used.add(selected.item.id);
    bound.push({
      id: selected.item.id,
      filename: selected.item.filename,
      before: selected.item.before,
      after: field.value,
      label: field.label,
      score: selected.score,
    });
  }

  return bound.slice(0, MAX_REPLACEMENTS);
}

function bindingScore(field, item) {
  let score = 0;
  if (field.role === item.role) score += 55;
  score += zoneScore(field.zone, item);

  const key = normalizeLabel(item.key);
  const type = normalizeLabel(`${item.sectionType} ${item.blockType}`);
  if (field.role === "heading" && /(heading|headline|title)/.test(key)) score += 25;
  if (field.role === "body" && /(text|description|content|copy|body|subheading|subtitle)/.test(key)) score += 22;
  if (field.role === "button" && /(button|label|cta)/.test(key)) score += 30;
  if (field.zone && type.includes(field.zone)) score += 35;
  if (item.kind === "json-text") score += 12;
  if (item.kind === "json-markup-text") score += 8;
  if (item.kind === "liquid-text") score -= 12;
  if (field.role === "heading" && item.before.length <= 100) score += 10;
  if (field.role === "body" && item.before.length >= 40) score += 10;
  if (field.role === "button" && item.before.length <= 45) score += 10;
  return score;
}

function zoneScore(zone, item) {
  const type = normalizeLabel(`${item.sectionType} ${item.blockType} ${item.key}`);
  const position = item.sectionCount > 1 ? item.sectionIndex / (item.sectionCount - 1) : 0;
  let score = 0;

  if (zone === "hero") {
    if (/(hero|banner|slideshow|image banner)/.test(type)) score += 45;
    if (position <= 0.2) score += 30;
  } else if (zone === "final") {
    if (/(footer|final|call to action|cta|newsletter)/.test(type)) score += 35;
    if (position >= 0.75 && position <= 1) score += 30;
  } else if (zone === "pathway") {
    if (/(multicolumn|collection|featured|grid|path|journey|cards)/.test(type)) score += 35;
    if (position >= 0.15 && position <= 0.55) score += 15;
  } else if (zone === "products") {
    if (/(product|collection|featured)/.test(type)) score += 45;
    if (position >= 0.35 && position <= 0.8) score += 15;
  } else if (zone === "kairos") {
    if (/(kairos|rich text|image with text|custom liquid)/.test(type)) score += 35;
    if (position >= 0.25 && position <= 0.8) score += 10;
  } else if (zone === "mission") {
    if (/(mission|about|rich text|image with text|quote)/.test(type)) score += 35;
    if (position >= 0.45 && position <= 0.9) score += 15;
  }

  return score;
}

function buildExplicitObjective(originalObjective, replacements) {
  const lines = [
    "EXACT SOURCE-BOUND TEXT REPLACEMENT JOB.",
    "This replacement package was generated deterministically from the verified Shopify homepage inventory without Workers AI.",
    "Apply only the literal replacements below. Do not change any other character, setting, file, style, structure, asset, link, or behavior.",
    "Do not redesign, restructure, regenerate, restore, or replace the homepage.",
    "",
  ];

  replacements.forEach((item, index) => {
    lines.push(`REPLACEMENT ${index + 1}`);
    lines.push(`Replace “${sanitizeQuoted(item.before)}” with “${sanitizeQuoted(item.after)}”.`);
    lines.push(`Verified source file: ${item.filename}`);
    lines.push(`Requested field: ${item.label}`);
    lines.push("");
  });

  lines.push("ORIGINAL BUSINESS OBJECTIVE FOR CONTEXT ONLY:");
  lines.push(originalObjective);
  lines.push("");
  lines.push("The replacement list above is the complete authorization boundary. Shopify MAIN remains locked.");
  return lines.join("\n");
}

function inferRole(key, value) {
  const name = normalizeLabel(key);
  const text = String(value || "").trim();
  if (/(button|cta|label)/.test(name) && text.length <= 80) return "button";
  if (/(heading|headline|title)/.test(name) && !/(subtitle|subheading)/.test(name)) return "heading";
  if (/(subheading|subtitle|description|content|copy|body|text|message)/.test(name)) return "body";
  if (text.length <= 70 && text.split(/\s+/).length <= 10) return "heading";
  return "body";
}

function isNonTextSetting(key, value) {
  const name = normalizeLabel(key);
  const text = String(value || "").trim();
  if (/(url|link(?!.*label)|href|image|video|color|colour|font|size|width|height|alignment|position|id$|handle|product|collection|menu|icon|animation|spacing|padding|margin|opacity|scheme|style|layout|desktop|mobile|enabled|show |hide |class|asset|file|src|target|rel|aria|tabindex)/.test(name)) return true;
  if (/^(https?:\/\/|\/|#|mailto:|tel:|shopify:\/\/)/i.test(text)) return true;
  return false;
}

function isMarkupSetting(key, value) {
  return /(custom liquid|richtext|rich text|markup|html|content)/.test(normalizeLabel(key)) && /[<{]/.test(String(value || "")) && visibleTextSegments(value).length > 0;
}

function visibleTextSegments(source) {
  const text = String(source || "");
  const protectedList = protectedRanges(text);
  const segments = [];
  let cursor = 0;
  for (const range of [...protectedList, { start: text.length, end: text.length }]) {
    if (cursor < range.start) collectVisibleRun(text, cursor, range.start, segments);
    cursor = Math.max(cursor, range.end);
  }
  return segments;
}

function collectVisibleRun(source, start, end, segments) {
  const raw = source.slice(start, end);
  const leading = raw.match(/^\s*/)?.[0].length || 0;
  const trailing = raw.match(/\s*$/)?.[0].length || 0;
  const valueStart = start + leading;
  const valueEnd = end - trailing;
  if (valueEnd <= valueStart) return;
  const value = source.slice(valueStart, valueEnd);
  if (safeSourceText(value)) segments.push({ start: valueStart, end: valueEnd, text: value });
}

function protectedRanges(source) {
  const patterns = [
    /{%\s*(schema|javascript|stylesheet|comment)\s*%}[\s\S]*?{%\s*end\1\s*%}/gi,
    /<!--[\s\S]*?-->/g,
    /<script\b[\s\S]*?<\/script\s*>/gi,
    /<style\b[\s\S]*?<\/style\s*>/gi,
    /{{-?[\s\S]*?-?}}/g,
    /{%-?[\s\S]*?-?%}/g,
    /<[^>]+>/g,
  ];
  const ranges = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  ranges.sort((left, right) => left.start - right.start || right.end - left.end);
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end) merged.push({ ...range });
    else previous.end = Math.max(previous.end, range.end);
  }
  return merged;
}

function deriveSectionFiles(document) {
  return [...new Set(Object.values(document?.sections || {})
    .map(section => String(section?.type || "").trim().toLowerCase())
    .filter(type => /^[a-z0-9_-]+$/.test(type) && type !== "apps")
    .map(type => `sections/${type}.liquid`))].slice(0, 44);
}

function safeSourceText(value) {
  const text = String(value || "").trim();
  if (text.length < 2 || text.length > 1800) return false;
  if ((text.match(/[A-Za-z]/g) || []).length < 2) return false;
  if (/{{|}}|{%|%}|<\/?(?:script|style|iframe|object|embed|form)\b/i.test(text)) return false;
  return true;
}

function safeReplacement(value) {
  const text = String(value || "").trim();
  return safeSourceText(text) && !/[“”"]/.test(text) && !/javascript:|\bon[a-z]+\s*=/i.test(text);
}

function sanitizeQuoted(value) {
  return String(value || "").replace(/[“”"]/g, "'").trim();
}

function hasExplicitLiteralReplacement(value) {
  return /(?:replace|change|swap)\s+["“][^"”]+["”]\s+(?:with|to|for)\s+["“][^"”]+["”]/i.test(String(value || ""));
}

function normalizeLabel(value) {
  return String(value || "").toLowerCase().replace(/[_–—-]+/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function dedupeFields(fields) {
  const seen = new Set();
  return fields.filter(field => {
    const key = `${field.zone}:${field.role}:${field.ordinal ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withoutSettings(context) {
  const { settings: _settings, ...rest } = context;
  return rest;
}

function fileByName(files, filename) {
  return (Array.isArray(files) ? files : []).find(file => file?.filename === filename) || null;
}

function rebuildRequest(request, payload) {
  return new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
    body: JSON.stringify(payload),
    redirect: request.redirect,
  });
}

async function safeRequestJSON(request) {
  try { return await request.json(); }
  catch { return {}; }
}
