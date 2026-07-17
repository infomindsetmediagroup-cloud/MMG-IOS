import {
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  validateHomepageDocument,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_DIRECT_HOMEPAGE_PLAN_BUILD = "kairos-direct-homepage-plan-20260717-1";

const PLAN_PATH = "/api/shopify/staging/plan/jobs";
const TEMPLATE_FILE = "templates/index.json";
const WEBSITE_MODE = "autonomous-text-only-v1";
const JOB_TTL_SECONDS = 60 * 60;
const MAX_INVENTORY_ITEMS = 180;
const MAX_OPERATIONS = 16;

const FIELD_RULES = Object.freeze([
  { aliases: ["hero heading", "primary hero heading", "hero headline"], role: "heading", zone: "hero" },
  { aliases: ["hero supporting text", "hero support text", "hero description", "hero body"], role: "body", zone: "hero" },
  { aliases: ["primary hero button label", "hero primary button label", "primary button label"], role: "button", zone: "hero", ordinal: 0 },
  { aliases: ["secondary hero button label", "hero secondary button label", "secondary button label"], role: "button", zone: "hero", ordinal: 1 },
  { aliases: ["guided path heading", "guided pathway heading", "pathway heading"], role: "heading", zone: "pathway" },
  { aliases: ["guided path supporting text", "guided pathway supporting text", "pathway supporting text"], role: "body", zone: "pathway" },
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

export async function handleDirectHomepagePlan(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== PLAN_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  const requestType = clean(payload?.requestType, 80).toLowerCase() || "homepage";
  const objective = clean(payload?.objective, 12000);
  if (requestType !== "homepage" || !objective) return null;

  const requested = parseRequestedFields(objective);
  if (!requested.length) return null;

  const source = await inspectHomepageSource(request, env);
  const inventory = buildHomepageInventory(source);
  if (!inventory.length) {
    throw httpError(409, "homepage_text_inventory_empty", "Kairos could not locate editable visible homepage text in the fresh MAIN-theme duplicate.");
  }

  const operations = bindRequestedFields(requested, inventory);
  if (!operations.length) {
    throw httpError(409, "direct_homepage_binding_empty", `Kairos recognized ${requested.length} labeled copy field${requested.length === 1 ? "" : "s"}, but the current homepage contains no compatible existing text locations.`);
  }

  const packageResult = await buildTextPackage(source, operations);
  const now = new Date().toISOString();
  const summary = `Kairos prepared ${operations.length} direct, source-bound text replacement${operations.length === 1 ? "" : "s"} without using model inference or changing the theme design.`;
  const result = {
    actionID: crypto.randomUUID(),
    planID: crypto.randomUUID(),
    actionType: "shopify.staging.plan",
    status: "ready-for-approval",
    readOnly: true,
    build: KAIROS_DIRECT_HOMEPAGE_PLAN_BUILD,
    kernel: "direct-homepage-plan-v1",
    startedAt: now,
    completedAt: now,
    objective,
    summary,
    plan: {
      summary,
      strategy: "Start from the verified full duplicate of the current live MAIN theme and replace only existing visible text values selected from Shopify source inventory.",
      changes: packageResult.files.map(file => ({
        filename: file.filename,
        changeType: "replace-visible-text",
        purpose: `${file.operations.length} exact source-bound text replacement${file.operations.length === 1 ? "" : "s"}.`,
        expectedOutcome: "New visible wording with identical Liquid, HTML, settings, styles, assets, links, layout, and behavior.",
      })),
      risks: ["Longer replacement copy may wrap differently inside the unchanged design."],
      acceptanceCriteria: [
        "Only the approved existing visible text values change.",
        "Every section, block, setting key, Liquid token, HTML tag and attribute, class, link, asset, color, typography rule, spacing rule, and layout instruction remains unchanged.",
        "All writes target the verified non-live Kairos Staging theme only.",
        "Every changed file is read back from Shopify and must match the approved candidate exactly.",
        "The live MAIN theme remains unchanged.",
      ],
      rollbackPlan: ["Restore the exact pre-execution bytes for every changed Kairos Staging file."],
      installationMode: WEBSITE_MODE,
      textOnlyPackage: packageResult,
      targetTheme: source.stagingTheme,
      publishedTheme: source.mainTheme,
      sourceHashes: packageResult.sourceHashes,
      executable: true,
      textOnly: true,
      preserveExistingDesign: true,
      structuralMutationAuthorized: false,
      styleMutationAuthorized: false,
      visualMutationAuthorized: false,
      liquidStructureMutationAuthorized: false,
      cssMutationAuthorized: false,
      assetMutationAuthorized: false,
      liveThemeMutationAuthorized: false,
      productionPublishAuthorized: false,
    },
    evidence: {
      sourceInspectionActionID: source.actionID,
      sourceAdapter: "shopify-graphql-theme-files",
      inventoryCount: inventory.length,
      requestedFieldCount: requested.length,
      replacementCount: operations.length,
      skippedFieldCount: Math.max(0, requested.length - operations.length),
      filesChanged: packageResult.files.length,
      plannerMode: "deterministic-direct-source-plan",
      workersAIUsed: false,
      neuronsConsumed: 0,
      secondBindingPassUsed: false,
      freshMainDuplicateRequired: true,
      visualBaseline: "tuesday-command-center-6f96b10d",
      browserSurfaceChanged: false,
    },
  };

  const jobID = crypto.randomUUID();
  await storePlanJob(request, jobID, result, summary);
  return json({
    jobID,
    status: "completed",
    build: KAIROS_DIRECT_HOMEPAGE_PLAN_BUILD,
    pollURL: `/api/shopify/staging/plan/jobs/${jobID}`,
    summary,
    result,
  }, 202);
}

async function inspectHomepageSource(request, env) {
  const initial = await inspectStagingSource(null, request, env, KAIROS_DIRECT_HOMEPAGE_PLAN_BUILD, [TEMPLATE_FILE]);
  const templateFile = fileByName(initial?.evidence?.files, TEMPLATE_FILE);
  if (!templateFile?.content) throw httpError(409, "homepage_template_unavailable", "Kairos could not read templates/index.json from the fresh Kairos Staging theme.");

  const document = parseShopifyJson(templateFile.content, "Fresh Kairos Staging homepage");
  validateHomepageDocument(structuredClone(document), document);
  const sectionFiles = deriveSectionFiles(document);
  const full = sectionFiles.length
    ? await inspectStagingSource(null, request, env, KAIROS_DIRECT_HOMEPAGE_PLAN_BUILD, [TEMPLATE_FILE, ...sectionFiles])
    : initial;
  const evidence = full?.evidence || {};
  validateThemeBoundary(evidence.stagingTheme, evidence.mainTheme);
  return {
    actionID: full.actionID,
    stagingTheme: evidence.stagingTheme,
    mainTheme: evidence.mainTheme,
    document,
    templateFile: fileByName(evidence.files, TEMPLATE_FILE),
    sectionFiles,
    files: new Map((evidence.files || []).map(file => [file.filename, file])),
  };
}

function parseRequestedFields(objective) {
  const lines = String(objective || "").replace(/\r/g, "").split("\n");
  const fields = [];
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (!raw) continue;
    const match = raw.match(/^([^:]{2,100}):(?:\s*(.*))?$/);
    if (!match) continue;
    const label = normalizeLabel(match[1]);
    const rule = FIELD_RULES.find(item => item.aliases.includes(label));
    if (!rule) continue;

    let value = clean(match[2], 2400);
    if (!value) {
      let cursor = index + 1;
      while (cursor < lines.length && !lines[cursor].trim()) cursor += 1;
      if (cursor < lines.length) value = clean(lines[cursor], 2400);
    }
    if (!safeReplacement(value)) continue;
    fields.push({ ...rule, label, value, sourceIndex: index });
  }
  return dedupeFields(fields).slice(0, MAX_OPERATIONS);
}

function buildHomepageInventory(source) {
  const order = Array.isArray(source.document?.order) ? source.document.order : Object.keys(source.document?.sections || {});
  const sectionIndex = new Map(order.map((id, index) => [id, index]));
  const typePositions = new Map();
  for (const [sectionId, section] of Object.entries(source.document?.sections || {})) {
    const type = normalizeLabel(section?.type);
    if (!typePositions.has(type)) typePositions.set(type, []);
    typePositions.get(type).push(sectionIndex.get(sectionId) ?? 999);
  }

  const inventory = [];
  for (const [sectionId, section] of Object.entries(source.document?.sections || {})) {
    const context = {
      sectionId,
      sectionType: String(section?.type || ""),
      sectionIndex: sectionIndex.get(sectionId) ?? 999,
      sectionCount: Math.max(order.length, 1),
    };
    collectSettingsInventory(inventory, "section", context, "", "", section?.settings || {});
    for (const [blockId, block] of Object.entries(section?.blocks || {})) {
      collectSettingsInventory(inventory, "block", context, blockId, String(block?.type || ""), block?.settings || {});
    }
  }

  for (const filename of source.sectionFiles || []) {
    const file = source.files.get(filename);
    if (!file?.content) continue;
    const sectionType = filename.replace(/^sections\//, "").replace(/\.liquid$/, "");
    const positions = typePositions.get(normalizeLabel(sectionType)) || [];
    const index = positions.length ? Math.min(...positions) : 999;
    visibleTextSegments(file.content).forEach((segment, segmentIndex) => inventory.push({
      id: `liquid:${filename}:${segmentIndex}`,
      kind: "liquid-text",
      filename,
      segmentIndex,
      before: segment.text,
      start: segment.start,
      end: segment.end,
      score: textScore("", segment.text, "liquid"),
      role: inferRole("visible-text", segment.text, segment.tagName),
      key: "visible-text",
      scope: "section-liquid",
      sectionId: "",
      blockId: "",
      sectionType,
      blockType: "",
      sectionIndex: index,
      sectionCount: Math.max(order.length, 1),
      tagName: segment.tagName,
    }));
  }

  return inventory
    .filter(item => item.before && item.before.length <= 1600)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_INVENTORY_ITEMS);
}

function collectSettingsInventory(inventory, scope, context, blockId, blockType, settings) {
  for (const [key, value] of Object.entries(settings || {})) {
    if (typeof value !== "string" || !value.trim()) continue;
    const base = `json:${scope}:${context.sectionId}:${blockId || "section"}:${key}`;
    if (isPlainEditableText(key, value)) {
      inventory.push({
        id: base,
        kind: "json-text",
        filename: TEMPLATE_FILE,
        scope,
        sectionId: context.sectionId,
        blockId,
        key,
        before: value,
        score: textScore(key, value, "json"),
        role: inferRole(key, value, ""),
        sectionType: context.sectionType,
        blockType,
        sectionIndex: context.sectionIndex,
        sectionCount: context.sectionCount,
      });
      continue;
    }
    if (isMarkupSetting(key, value)) {
      visibleTextSegments(value).forEach((segment, segmentIndex) => inventory.push({
        id: `${base}:segment:${segmentIndex}`,
        kind: "json-markup-text",
        filename: TEMPLATE_FILE,
        scope,
        sectionId: context.sectionId,
        blockId,
        key,
        segmentIndex,
        before: segment.text,
        start: segment.start,
        end: segment.end,
        score: textScore(key, segment.text, "markup"),
        role: inferRole(key, segment.text, segment.tagName),
        sectionType: context.sectionType,
        blockType,
        sectionIndex: context.sectionIndex,
        sectionCount: context.sectionCount,
        tagName: segment.tagName,
      }));
    }
  }
}

function bindRequestedFields(requested, inventory) {
  const used = new Set();
  const operations = [];
  for (const field of requested) {
    const candidates = inventory
      .filter(item => !used.has(item.id) && roleCompatible(field, item))
      .map(item => ({ item, score: bindingScore(field, item) }))
      .sort((left, right) => right.score - left.score);
    if (!candidates.length) continue;

    let selected = candidates[0];
    if (field.role === "button" && Number.isInteger(field.ordinal)) {
      const sameZone = candidates.filter(candidate => zoneScore(field.zone, candidate.item) >= 20);
      if (sameZone[field.ordinal]) selected = sameZone[field.ordinal];
    }
    if (!safeReplacement(field.value) || field.value === selected.item.before) continue;

    used.add(selected.item.id);
    operations.push({
      ...selected.item,
      after: field.value,
      reason: `Labeled field: ${field.label}`,
    });
  }
  return operations.slice(0, MAX_OPERATIONS);
}

function roleCompatible(field, item) {
  if (item.role === field.role) return true;
  if (field.role === "button") {
    return item.before.length <= 55 && item.before.split(/\s+/).length <= 9 && ["a", "button"].includes(item.tagName);
  }
  return false;
}

function bindingScore(field, item) {
  let score = item.role === field.role ? 65 : 35;
  score += zoneScore(field.zone, item);
  const key = normalizeLabel(item.key);
  if (field.role === "heading" && /(heading|headline|title)/.test(key)) score += 28;
  if (field.role === "body" && /(text|description|content|copy|body|subheading|subtitle|message)/.test(key)) score += 24;
  if (field.role === "button" && /(button|label|cta)/.test(key)) score += 34;
  if (field.role === "button" && ["a", "button"].includes(item.tagName)) score += 40;
  if (item.kind === "json-text") score += 14;
  if (item.kind === "json-markup-text") score += 9;
  if (item.kind === "liquid-text") score -= 8;
  if (field.role === "heading" && item.before.length <= 110) score += 10;
  if (field.role === "body" && item.before.length >= 35) score += 10;
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

async function buildTextPackage(source, operations) {
  const grouped = new Map();
  for (const operation of operations) {
    if (!grouped.has(operation.filename)) grouped.set(operation.filename, []);
    grouped.get(operation.filename).push(operation);
  }

  const files = [];
  const sourceHashes = {};
  for (const [filename, fileOperations] of grouped) {
    const file = source.files.get(filename);
    if (!file?.content) throw httpError(409, "source_file_missing", `${filename} is no longer readable from Kairos Staging.`);

    let candidateSource;
    let structureSignature;
    if (filename === TEMPLATE_FILE) {
      const original = parseShopifyJson(file.content, "Kairos Staging homepage");
      const candidate = applyTemplateOperations(original, fileOperations);
      validateHomepageDocument(candidate, original);
      candidateSource = serializeLikeSource(file.content, candidate);
      structureSignature = templateStructureSignature(original);
      if (templateStructureSignature(candidate) !== structureSignature) throw httpError(409, "template_structure_changed", "The direct text plan changed the Shopify homepage structure.");
    } else {
      candidateSource = applyVisibleOperations(file.content, fileOperations);
      structureSignature = sourceSkeleton(file.content);
      if (sourceSkeleton(candidateSource) !== structureSignature) throw httpError(409, "liquid_structure_changed", `${filename} changed outside visible text nodes.`);
    }

    const afterSha256 = await hashText(candidateSource);
    if (afterSha256 === file.sha256) continue;
    sourceHashes[filename] = file.sha256;
    files.push({
      filename,
      beforeSha256: file.sha256,
      afterSha256,
      beforeSource: file.content,
      candidateSource,
      structureSignature,
      operations: fileOperations.map(compactOperation),
    });
  }

  if (!files.length) throw httpError(409, "text_changes_unchanged", "The labeled text request produced no source change.");
  return {
    version: WEBSITE_MODE,
    operations: operations.map(compactOperation),
    files,
    sourceHashes,
    sectionFiles: source.sectionFiles || [],
  };
}

function applyTemplateOperations(original, operations) {
  const candidate = structuredClone(original);
  for (const item of operations.filter(operation => operation.kind === "json-text")) {
    const current = getSetting(candidate, item);
    if (current !== item.before) throw httpError(409, "text_setting_changed", `The source text changed for ${item.id}.`);
    setSetting(candidate, item, item.after);
  }

  const groups = new Map();
  for (const item of operations.filter(operation => operation.kind === "json-markup-text")) {
    const key = `${item.scope}:${item.sectionId}:${item.blockId}:${item.key}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const items of groups.values()) {
    const before = getSetting(candidate, items[0]);
    const after = applyVisibleOperations(before, items);
    if (sourceSkeleton(before) !== sourceSkeleton(after)) throw httpError(409, "markup_structure_changed", "A markup-backed setting changed outside visible text.");
    setSetting(candidate, items[0], after);
  }
  return candidate;
}

function applyVisibleOperations(source, operations) {
  let candidate = String(source || "");
  const segments = visibleTextSegments(candidate);
  const replacements = operations.map(item => {
    const segment = segments[item.segmentIndex];
    if (!segment || segment.text !== item.before) throw httpError(409, "text_segment_changed", `The source text changed for ${item.id}.`);
    return { start: segment.start, end: segment.end, after: item.after };
  }).sort((left, right) => right.start - left.start);
  for (const replacement of replacements) {
    candidate = `${candidate.slice(0, replacement.start)}${replacement.after}${candidate.slice(replacement.end)}`;
  }
  return candidate;
}

function visibleTextSegments(source) {
  const text = String(source || "");
  const ranges = protectedRanges(text);
  const segments = [];
  let cursor = 0;
  for (const range of [...ranges, { start: text.length, end: text.length }]) {
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
  if (!isVisibleCopy(value)) return;
  segments.push({ start: valueStart, end: valueEnd, text: value, tagName: nearestTagName(source, valueStart) });
}

function nearestTagName(source, position) {
  const open = source.lastIndexOf("<", position);
  const close = source.lastIndexOf(">", position);
  if (open < 0 || open < close) return "";
  const match = source.slice(open, position).match(/^<\s*([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : "";
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

function sourceSkeleton(source) {
  const segments = visibleTextSegments(source);
  let result = String(source || "");
  for (const segment of [...segments].sort((left, right) => right.start - left.start)) {
    result = `${result.slice(0, segment.start)}§TEXT§${result.slice(segment.end)}`;
  }
  return result;
}

function isVisibleCopy(value) {
  const text = String(value || "").trim();
  if (text.length < 2 || text.length > 1600) return false;
  if ((text.match(/[A-Za-z]/g) || []).length < 2) return false;
  if (/^(https?:\/\/|\/|#|mailto:|tel:|shopify:\/\/)/i.test(text)) return false;
  if (/^[a-z0-9_.-]+\.(png|jpe?g|gif|webp|svg|css|js|json|liquid)$/i.test(text)) return false;
  if (/^[a-z0-9_.-]+$/i.test(text) && !/\s/.test(text) && text.length < 30) return false;
  return true;
}

function isPlainEditableText(key, value) {
  const name = String(key || "").toLowerCase();
  const text = String(value || "").trim();
  if (!isVisibleCopy(text)) return false;
  if (/(url|link(?!.*label)|href|image|video|color|colour|font|size|width|height|alignment|position|id$|handle|product|collection|menu|icon|animation|spacing|padding|margin|opacity|scheme|style|layout|desktop|mobile|enabled|show_|hide_|class|asset|file|src|target|rel|aria|tabindex)/i.test(name)) return false;
  if (/[<>{}%]/.test(text)) return false;
  return true;
}

function isMarkupSetting(key, value) {
  const name = String(key || "").toLowerCase();
  const text = String(value || "");
  return /(custom_liquid|richtext|rich_text|markup|html|content)/.test(name) && /[<{]/.test(text) && visibleTextSegments(text).length > 0;
}

function inferRole(key, value, tagName) {
  const name = normalizeLabel(key);
  const text = String(value || "").trim();
  if (["a", "button"].includes(tagName)) return "button";
  if (/(button|cta|label)/.test(name) && text.length <= 80) return "button";
  if (/(heading|headline|title)/.test(name) && !/(subtitle|subheading)/.test(name)) return "heading";
  if (/(subheading|subtitle|description|content|copy|body|text|message)/.test(name)) return "body";
  if (text.length <= 70 && text.split(/\s+/).length <= 10) return "heading";
  return "body";
}

function safeReplacement(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 2400) return false;
  if (/<\/?(?:script|style|iframe|object|embed|form)\b/i.test(text)) return false;
  if (/{{|}}|{%|%}|javascript:|\bon[a-z]+\s*=/i.test(text)) return false;
  return true;
}

function applySettingPath(document, item) {
  const section = document?.sections?.[item.sectionId];
  if (!section) throw httpError(409, "section_missing", `Homepage section ${item.sectionId} is missing.`);
  if (item.scope === "section") return section.settings;
  const block = section?.blocks?.[item.blockId];
  if (!block) throw httpError(409, "block_missing", `Homepage block ${item.sectionId}/${item.blockId} is missing.`);
  return block.settings;
}

function getSetting(document, item) {
  const settings = applySettingPath(document, item);
  if (!settings || typeof settings[item.key] !== "string") throw httpError(409, "text_setting_missing", `Text setting ${item.id} is missing.`);
  return settings[item.key];
}

function setSetting(document, item, value) {
  const settings = applySettingPath(document, item);
  if (!settings || typeof settings[item.key] !== "string") throw httpError(409, "text_setting_missing", `Text setting ${item.id} is missing.`);
  settings[item.key] = value;
}

function compactOperation(item) {
  return {
    id: item.id,
    kind: item.kind,
    filename: item.filename,
    scope: item.scope || "",
    sectionId: item.sectionId || "",
    blockId: item.blockId || "",
    key: item.key || "",
    segmentIndex: Number.isInteger(item.segmentIndex) ? item.segmentIndex : null,
    before: item.before,
    after: item.after,
    reason: item.reason || "",
  };
}

function templateStructureSignature(document) {
  const structure = {
    order: Array.isArray(document?.order) ? document.order : [],
    sections: Object.fromEntries(Object.entries(document?.sections || {}).map(([sectionId, section]) => [sectionId, {
      type: section?.type || "",
      disabled: Boolean(section?.disabled),
      settingKeys: Object.keys(section?.settings || {}).sort(),
      blocks: Object.fromEntries(Object.entries(section?.blocks || {}).map(([blockId, block]) => [blockId, {
        type: block?.type || "",
        settingKeys: Object.keys(block?.settings || {}).sort(),
      }])),
      blockOrder: Array.isArray(section?.block_order) ? section.block_order : [],
    }])),
  };
  return stableStringify(structure);
}

function serializeLikeSource(source, document) {
  const text = String(source || "");
  const leadingComment = text.trimStart().startsWith("/*") ? text.slice(0, text.indexOf("*/") + 2) : "";
  const indent = /\n(\s+)"/.exec(text)?.[1]?.length || 2;
  const newline = text.endsWith("\n") ? "\n" : "";
  return `${leadingComment ? `${leadingComment}\n` : ""}${JSON.stringify(document, null, indent)}${newline}`;
}

function validateThemeBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The live MAIN theme could not be verified.");
}

function deriveSectionFiles(document) {
  return [...new Set(Object.values(document?.sections || {})
    .map(section => clean(section?.type, 120).toLowerCase())
    .filter(type => /^[a-z0-9_-]+$/.test(type) && type !== "apps")
    .map(type => `sections/${type}.liquid`))].slice(0, 45);
}

function textScore(key, value, kind) {
  const name = String(key || "").toLowerCase();
  const text = String(value || "").trim();
  let score = kind === "json" ? 20 : kind === "markup" ? 15 : 10;
  if (/(heading|title|headline)/.test(name)) score += 80;
  if (/(subheading|subtitle|description|content|copy|message|body|intro|summary|tagline)/.test(name)) score += 60;
  if (text.length >= 8 && text.length <= 120) score += 30;
  if (text.split(/\s+/).length >= 3) score += 20;
  return score;
}

async function storePlanJob(request, jobID, result, summary) {
  const now = new Date().toISOString();
  const envelope = {
    jobID,
    status: "completed",
    build: KAIROS_DIRECT_HOMEPAGE_PLAN_BUILD,
    submittedAt: now,
    updatedAt: now,
    completedAt: now,
    summary,
    result,
  };
  const key = new Request(new URL(`/_kairos/autonomous-plan-jobs/${jobID}`, request.url).toString(), { method: "GET" });
  await caches.default.put(key, new Response(JSON.stringify(envelope), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}`,
    },
  }));
}

function fileByName(files, filename) {
  return (Array.isArray(files) ? files : []).find(file => file?.filename === filename) || null;
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

function normalizeLabel(value) {
  return String(value || "").toLowerCase().replace(/[_–—-]+/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function clean(value, max) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

async function safeRequestJSON(request) {
  try { return await request.json(); }
  catch { return {}; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_DIRECT_HOMEPAGE_PLAN_BUILD,
      "X-Kairos-Homepage-Planner-Mode": "deterministic-direct-source-plan",
      "X-Kairos-Workers-AI-Used": "false",
      "X-Kairos-Neurons-Consumed": "0",
      "X-Kairos-Second-Binding-Pass": "false",
      "X-Kairos-Visual-Baseline": "tuesday-command-center-6f96b10d",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
