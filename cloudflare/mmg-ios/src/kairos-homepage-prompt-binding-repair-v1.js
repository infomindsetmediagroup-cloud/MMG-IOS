import {
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  validateHomepageDocument,
} from "./kairos-compact-homepage-utils-v1.js";
import { parseStrictJSON, runKairosIntelligence } from "./kairos-intelligence-v1.js";

export const KAIROS_HOMEPAGE_PROMPT_BINDING_REPAIR_BUILD = "kairos-homepage-prompt-binding-repair-20260717-1";

const PLAN_PATH = "/api/shopify/staging/plan/jobs";
const TEMPLATE_FILE = "templates/index.json";
const DEFAULT_ACCOUNT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const MAX_INVENTORY = 180;
const MAX_REPLACEMENTS = 12;

export async function handleHomepagePromptBindingRepair(request, env, ctx, delegate) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== PLAN_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  const objective = String(payload?.objective || "").trim();
  if (!objective || hasUsableExplicitReplacement(objective)) return stamp(await delegate(request), "explicit-source-prompt");

  try {
    const source = await inspectHomepageSource(request, env);
    const inventory = buildBindingInventory(source)
      .filter(item => explicitPromptSafe(item.before))
      .slice(0, MAX_INVENTORY);

    if (!inventory.length) return stamp(await delegate(request), "no-repair-inventory");

    const proposal = await proposeBindings(env, objective, inventory);
    const replacements = normalizeBindings(proposal?.operations, inventory);
    if (!replacements.length) return stamp(await delegate(request), "model-returned-no-bindings");

    const explicitObjective = buildExplicitObjective(objective, replacements);
    const repairedRequest = rebuildRequest(request, {
      ...payload,
      objective: explicitObjective,
      promptBinding: {
        build: KAIROS_HOMEPAGE_PROMPT_BINDING_REPAIR_BUILD,
        mode: "verified-id-to-exact-source-text",
        originalObjective: objective,
        replacementCount: replacements.length,
      },
    });

    return stamp(await delegate(repairedRequest), "verified-id-bound");
  } catch (error) {
    const fallback = await delegate(request);
    const headers = new Headers(fallback.headers);
    headers.set("X-Kairos-Prompt-Binding", "repair-fallback");
    headers.set("X-Kairos-Prompt-Binding-Error", String(error?.code || "binding-repair-failed").slice(0, 120));
    return new Response(fallback.body, { status: fallback.status, statusText: fallback.statusText, headers });
  }
}

async function inspectHomepageSource(request, env) {
  const initial = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_PROMPT_BINDING_REPAIR_BUILD, [TEMPLATE_FILE]);
  const templateFile = fileByName(initial?.evidence?.files, TEMPLATE_FILE);
  if (!templateFile?.content) throw httpError(409, "homepage_template_unavailable", "Kairos could not read the staging homepage template.");

  const document = parseShopifyJson(templateFile.content, "Kairos Staging homepage");
  validateHomepageDocument(structuredClone(document), document);
  const sectionFiles = deriveSectionFiles(document);
  const fullInspection = sectionFiles.length
    ? await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_PROMPT_BINDING_REPAIR_BUILD, [TEMPLATE_FILE, ...sectionFiles])
    : initial;

  const files = new Map((fullInspection?.evidence?.files || []).map(file => [file.filename, file]));
  return {
    document,
    sectionFiles,
    files,
    stagingTheme: fullInspection?.evidence?.stagingTheme || null,
  };
}

function buildBindingInventory(source) {
  const inventory = [];
  for (const [sectionId, section] of Object.entries(source.document?.sections || {})) {
    const sectionType = String(section?.type || "");
    collectSettings(inventory, {
      scope: "section",
      sectionId,
      sectionType,
      blockId: "",
      blockType: "",
      settings: section?.settings || {},
    });
    for (const [blockId, block] of Object.entries(section?.blocks || {})) {
      collectSettings(inventory, {
        scope: "block",
        sectionId,
        sectionType,
        blockId,
        blockType: String(block?.type || ""),
        settings: block?.settings || {},
      });
    }
  }

  for (const filename of source.sectionFiles) {
    const file = source.files.get(filename);
    if (!file?.content) continue;
    visibleTextSegments(file.content).forEach((segment, index) => {
      inventory.push({
        id: `liquid:${filename}:${index}`,
        kind: "liquid-text",
        filename,
        scope: "section-liquid",
        sectionId: "",
        sectionType: filename.replace(/^sections\//, "").replace(/\.liquid$/, ""),
        blockId: "",
        blockType: "",
        key: "visible-text",
        before: segment.text,
        score: scoreItem("visible-text", segment.text, filename),
      });
    });
  }

  return dedupeInventory(inventory)
    .filter(item => item.before.length >= 2 && item.before.length <= 1500)
    .sort((left, right) => right.score - left.score);
}

function collectSettings(inventory, context) {
  for (const [key, value] of Object.entries(context.settings || {})) {
    if (typeof value !== "string" || !value.trim()) continue;
    const base = `json:${context.scope}:${context.sectionId}:${context.blockId || "section"}:${key}`;
    if (isPlainTextSetting(key, value)) {
      inventory.push({
        id: base,
        kind: "json-text",
        filename: TEMPLATE_FILE,
        ...context,
        settings: undefined,
        key,
        before: value.trim(),
        score: scoreItem(key, value, context.sectionType),
      });
      continue;
    }
    if (isMarkupSetting(key, value)) {
      visibleTextSegments(value).forEach((segment, index) => {
        inventory.push({
          id: `${base}:segment:${index}`,
          kind: "json-markup-text",
          filename: TEMPLATE_FILE,
          ...context,
          settings: undefined,
          key,
          before: segment.text,
          score: scoreItem(key, segment.text, context.sectionType),
        });
      });
    }
  }
}

async function proposeBindings(env, objective, inventory) {
  const compact = inventory.map(item => ({
    id: item.id,
    currentText: item.before,
    filename: item.filename,
    scope: item.scope,
    sectionType: item.sectionType,
    blockType: item.blockType,
    settingKey: item.key,
  }));

  const system = [
    "You are Kairos, mapping a homepage-copy objective to verified existing Shopify text locations.",
    "Return strict JSON only.",
    "Select inventory entries by exact id. The server already owns the authoritative old text, so do not return or reproduce the old text.",
    "Write replacement copy only in the after field.",
    "Preserve the current visual design completely. Never request new sections, blocks, files, HTML, Liquid, CSS, links, URLs, classes, assets, colors, typography, spacing, layout, animations, products, prices, testimonials, metrics, or factual claims.",
    "Prefer the smallest set of high-impact changes that communicates the user's objective.",
    `Return between 1 and ${MAX_REPLACEMENTS} operations.`,
    "Do not use quotation marks inside replacement copy unless essential.",
    "Schema: {\"summary\":\"brief summary\",\"operations\":[{\"id\":\"exact inventory id\",\"after\":\"replacement visible text\",\"reason\":\"brief reason\"}]}",
  ].join("\n");

  const generated = await runStructuredIntelligence(env, {
    purpose: "homepage-prompt-binding-repair",
    system,
    user: JSON.stringify({
      objective,
      immutableContract: {
        visibleTextOnly: true,
        currentDesignFrozen: true,
        sourceTextIsAuthoritative: true,
        nonLiveStagingOnly: true,
      },
      inventory: compact,
    }),
  });

  return generated;
}

function normalizeBindings(value, inventory) {
  if (!Array.isArray(value)) return [];
  const byID = new Map(inventory.map(item => [item.id, item]));
  const used = new Set();
  const replacements = [];

  for (const raw of value) {
    const id = String(raw?.id || "").trim();
    const source = byID.get(id);
    if (!source || used.has(id)) continue;
    const after = normalizeReplacement(raw?.after);
    if (!after || after === source.before || !explicitPromptSafe(after) || !safeVisibleReplacement(after)) continue;
    used.add(id);
    replacements.push({
      id,
      filename: source.filename,
      before: source.before,
      after,
      reason: String(raw?.reason || "Source-bound homepage copy update").trim().slice(0, 300),
    });
    if (replacements.length >= MAX_REPLACEMENTS) break;
  }

  return replacements;
}

function buildExplicitObjective(originalObjective, replacements) {
  const lines = [
    "EXACT SOURCE-BOUND TEXT REPLACEMENT JOB.",
    "Use the current Kairos Staging source exactly as it is.",
    "Apply only the literal replacements below. Do not change any other character, setting, file, style, structure, asset, link, or behavior.",
    "Do not redesign, restructure, regenerate, restore, or replace the homepage.",
    "",
  ];

  replacements.forEach((item, index) => {
    lines.push(`REPLACEMENT ${index + 1}`);
    lines.push(`Replace “${item.before}” with “${item.after}”.`);
    lines.push(`Verified source file: ${item.filename}`);
    lines.push("");
  });

  lines.push("ORIGINAL BUSINESS OBJECTIVE FOR CONTEXT ONLY:");
  lines.push(originalObjective);
  lines.push("");
  lines.push("The replacement list above is the complete authorization boundary. Shopify MAIN remains locked.");
  return lines.join("\n");
}

async function runStructuredIntelligence(env, input) {
  if (env?.AI && typeof env.AI.run === "function") {
    const model = String(env.KAIROS_WORKERS_AI_MODEL || DEFAULT_ACCOUNT_MODEL).trim();
    const result = await env.AI.run(model, {
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      temperature: 0,
      max_tokens: 4096,
      seed: 1912,
      response_format: { type: "json_object" },
    });
    const text = extractGeneratedText(result);
    if (!text) throw httpError(502, "binding_intelligence_empty", "Kairos returned no homepage text bindings.");
    return parseStrictJSON(text);
  }

  const generated = await runKairosIntelligence(env, {
    purpose: input.purpose,
    system: input.system,
    user: input.user,
    temperature: 0,
    maxTokens: 4096,
    structuredOutput: true,
  });
  return parseStrictJSON(generated.text);
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
  if (isVisibleCopy(value)) segments.push({ start: valueStart, end: valueEnd, text: value });
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
    .map(type => `sections/${type}.liquid`))].slice(0, 45);
}

function isPlainTextSetting(key, value) {
  const name = String(key || "").toLowerCase();
  const text = String(value || "").trim();
  if (!isVisibleCopy(text) || /[<>{}%]/.test(text)) return false;
  if (/(url|link(?!.*label)|href|image|video|color|colour|font|size|width|height|alignment|position|id$|handle|product|collection|menu|icon|animation|spacing|padding|margin|opacity|scheme|style|layout|desktop|mobile|enabled|show_|hide_|class|asset|file|src|target|rel|aria|tabindex)/i.test(name)) return false;
  return true;
}

function isMarkupSetting(key, value) {
  const name = String(key || "").toLowerCase();
  const source = String(value || "");
  return /(custom_liquid|richtext|rich_text|markup|html|content)/.test(name)
    && /[<{]/.test(source)
    && visibleTextSegments(source).length > 0;
}

function isVisibleCopy(value) {
  const text = String(value || "").trim();
  if (text.length < 2 || text.length > 1500) return false;
  if ((text.match(/[A-Za-z]/g) || []).length < 2) return false;
  if (/^(https?:\/\/|\/|#|mailto:|tel:|shopify:\/\/)/i.test(text)) return false;
  if (/^[a-z0-9_.-]+\.(png|jpe?g|gif|webp|svg|css|js|json|liquid)$/i.test(text)) return false;
  if (/^[a-z0-9_.-]+$/i.test(text) && !/\s/.test(text) && text.length < 30) return false;
  return true;
}

function explicitPromptSafe(value) {
  const text = String(value || "");
  return !/["“”]/.test(text) && !/[\r\n]/.test(text) && text.length <= 1500;
}

function safeVisibleReplacement(value) {
  const text = String(value || "").trim();
  if (!isVisibleCopy(text)) return false;
  if (/<\/?(?:script|style|iframe|object|embed|form)\b/i.test(text)) return false;
  if (/{{|}}|{%|%}|javascript:|\bon[a-z]+\s*=/i.test(text)) return false;
  return true;
}

function normalizeReplacement(value) {
  return String(value ?? "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, 1500);
}

function hasUsableExplicitReplacement(objective) {
  const pattern = /(?:replace|change|swap)\s+["“]([^"”]+)["”]\s+(?:with|to|for)\s+["“]([^"”]+)["”]/gi;
  let count = 0;
  let match;
  while ((match = pattern.exec(objective))) {
    const before = String(match[1] || "").trim();
    const after = String(match[2] || "").trim();
    if (!/PASTE THE EXACT|CURRENT EXACT TEXT|NEW TEXT/i.test(`${before} ${after}`)) count += 1;
  }
  return count > 0;
}

function dedupeInventory(inventory) {
  const seen = new Set();
  return inventory.filter(item => {
    const key = `${item.id}:${item.before}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreItem(key, value, context) {
  const name = String(key || "").toLowerCase();
  const text = String(value || "").trim();
  const area = String(context || "").toLowerCase();
  let score = 0;
  if (/(heading|title|headline)/.test(name)) score += 90;
  if (/(subheading|subtitle|description|content|copy|message|body|intro|summary|tagline)/.test(name)) score += 65;
  if (/(hero|banner|rich-text|image-with-text|multicolumn)/.test(area)) score += 35;
  if (text.length >= 8 && text.length <= 180) score += 30;
  if (text.split(/\s+/).length >= 3) score += 20;
  return score;
}

function fileByName(files, filename) {
  return (Array.isArray(files) ? files : []).find(file => file?.filename === filename) || null;
}

function extractGeneratedText(result) {
  if (typeof result === "string") return result.trim();
  if (typeof result?.response === "string") return result.response.trim();
  const choice = result?.choices?.[0]?.message?.content ?? result?.choices?.[0]?.text;
  if (typeof choice === "string") return choice.trim();
  if (result?.response && typeof result.response === "object") return JSON.stringify(result.response);
  return "";
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

function stamp(response, mode) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Prompt-Binding", mode);
  headers.set("X-Kairos-Prompt-Binding-Build", KAIROS_HOMEPAGE_PROMPT_BINDING_REPAIR_BUILD);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
