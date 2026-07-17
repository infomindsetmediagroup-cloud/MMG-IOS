import {
  buildEditableMap,
  hashText,
  httpError,
  inspectStagingSource,
  inspectThemeFiles,
  parseShopifyJson,
  semanticHash,
  validateHomepageDocument,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_HOMEPAGE_DETERMINISTIC_MARKUP_COPY_PLANNER_BUILD = "kairos-homepage-deterministic-markup-copy-planner-20260717-1";

const TEMPLATE_FILE = "templates/index.json";
const MARKUP_KEY = /(liquid|html|markup|custom|code|content)/i;
const BLOCK_TAGS = new Set(["address","article","aside","blockquote","button","div","figcaption","figure","footer","form","h1","h2","h3","h4","h5","h6","header","li","main","nav","p","section","td","th"]);
const BLOCKED_TAGS = new Set(["script","style","svg","template","noscript","code","pre"]);
const COPY_SEQUENCE = Object.freeze([
  { kind: "heading", text: "Turn what you know into something valuable" },
  { kind: "body", text: "Mindset Media Group helps creators, entrepreneurs, authors, educators, and small businesses transform ideas and experience into professional books, digital products, educational resources, and business assets." },
  { kind: "heading", text: "Your connected knowledge journey" },
  { kind: "body", text: "Explore practical guidance, creator education, publishing support, and professional resources designed to move you from idea to finished asset." },
  { kind: "heading", text: "Create, publish, and grow" },
  { kind: "body", text: "Build useful intellectual property, strengthen your platform, and turn your knowledge into work that serves people and creates lasting value." },
  { kind: "heading", text: "Choose your next step" },
  { kind: "body", text: "Start with the resource, product, or service that matches where you are now. Every step is designed to create clear, visible progress." },
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/api/shopify/staging/plan/jobs") {
      return json({ status: "not-found", build: KAIROS_HOMEPAGE_DETERMINISTIC_MARKUP_COPY_PLANNER_BUILD }, 404);
    }
    return createPlan(request, env);
  },
};

async function createPlan(request, env) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 3) throw httpError(400, "objective_required", "Tell Kairos what you want changed on the homepage.");

    const inspection = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_DETERMINISTIC_MARKUP_COPY_PLANNER_BUILD, [TEMPLATE_FILE]);
    const evidence = inspection?.evidence || {};
    validateBoundary(evidence.stagingTheme, evidence.mainTheme);
    const mainInspection = await inspectThemeFiles(env, evidence.mainTheme.gid, [TEMPLATE_FILE]);
    const mainFile = fileByName(mainInspection.files, TEMPLATE_FILE);
    const stagingFile = fileByName(evidence.files, TEMPLATE_FILE);
    if (!mainFile?.content || !stagingFile?.content) throw httpError(409, "homepage_template_unavailable", "Kairos could not read the published and staging homepage templates.");

    const publishedDocument = parseShopifyJson(mainFile.content, "Published MAIN homepage");
    const stagingDocument = parseShopifyJson(stagingFile.content, "Kairos Staging homepage");
    validateHomepageDocument(structuredClone(publishedDocument), publishedDocument);
    validateHomepageDocument(structuredClone(stagingDocument), stagingDocument);

    const settings = activeEmbeddedMarkupSettings(publishedDocument);
    const candidates = settings.flatMap((setting, settingIndex) => buildGroups(tokenize(setting.before), setting.location).map((group, groupIndex) => ({
      ...group,
      location: setting.location,
      scope: setting.scope,
      sectionId: setting.sectionId,
      blockId: setting.blockId,
      key: setting.key,
      settingIndex,
      groupIndex,
      score: groupScore(group, settingIndex, groupIndex),
    }))).filter(candidate => candidate.kind !== "other" && candidate.text.length >= 2 && candidate.text.length <= 1200)
      .sort((a, b) => b.score - a.score);
    const replacements = deterministicReplacements(candidates);
    if (!replacements.length) throw httpError(409, "deterministic_embedded_visible_copy_missing", "The active homepage embedded markup exposes no safe visible heading or paragraph nodes for deterministic replacement.");

    const settingsByLocation = new Map(settings.map(setting => [setting.location, setting]));
    const byLocation = new Map();
    for (const replacement of replacements) {
      if (!byLocation.has(replacement.location)) byLocation.set(replacement.location, []);
      byLocation.get(replacement.location).push(replacement);
    }

    const operations = [];
    for (const [location, locationReplacements] of byLocation) {
      const setting = settingsByLocation.get(location);
      if (!setting) continue;
      const tokens = tokenize(setting.before);
      const groups = new Map(buildGroups(tokens, location).map(group => [group.id, group]));
      const applied = [];
      for (const replacement of locationReplacements) {
        const group = groups.get(replacement.id);
        if (!group || group.text !== replacement.before) continue;
        writeGroupPreservingNodes(tokens, group, replacement.after);
        applied.push(replacement);
      }
      if (!applied.length) continue;
      const after = tokens.join("");
      if (markupSignature(setting.before) !== markupSignature(after)) throw httpError(409, "embedded_markup_signature_changed", `The deterministic copy changed HTML or Liquid tokens at ${location}.`);
      operations.push({
        scope: setting.scope,
        sectionId: setting.sectionId,
        blockId: setting.blockId,
        key: setting.key,
        before: setting.before,
        after,
        reason: applied.map(item => item.reason).join("; ").slice(0, 300),
        location,
        embeddedMarkupTextOnly: true,
        deterministicFallback: true,
        visibleTextReplacementCount: applied.length,
        nodeDistributionPreserved: true,
        visibleReplacements: applied.map(item => ({ id: item.id, before: item.before, after: item.after, reason: item.reason, kind: item.kind })),
      });
    }
    if (!operations.length) throw httpError(409, "deterministic_embedded_markup_patch_empty", "Kairos could not bind deterministic copy to the active embedded homepage markup.");

    const candidateDocument = structuredClone(publishedDocument);
    for (const operation of operations) setSetting(candidateDocument, operation, operation.after);
    validateHomepageDocument(candidateDocument, publishedDocument);
    assertOnlyApprovedSettingsChanged(publishedDocument, candidateDocument, operations);
    const publishedStructureSignature = structureSignature(publishedDocument);
    const candidateStructureSignature = structureSignature(candidateDocument);
    if (publishedStructureSignature !== candidateStructureSignature) throw httpError(409, "published_framework_structure_changed", "The deterministic embedded copy plan changed the homepage structure.");

    const candidateSource = serializeLikeSource(mainFile.content, candidateDocument);
    const publishedSemanticHash = await semanticHash(publishedDocument);
    const candidateSemanticHash = await semanticHash(candidateDocument);
    const expectedCandidateSha256 = await hashText(candidateSource);
    const sourceHashes = {
      "published:templates/index.json": mainFile.sha256,
      "staging:templates/index.json": stagingFile.sha256,
    };
    const replacementCount = operations.reduce((sum, operation) => sum + operation.visibleTextReplacementCount, 0);
    const now = new Date().toISOString();
    const summary = `Kairos prepared ${replacementCount} deterministic visible copy replacements inside the active embedded homepage markup.`;
    const result = {
      actionID: crypto.randomUUID(),
      planID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      requestType: "homepage-preserve-design",
      homepageMode: "preserve-published-framework",
      status: "ready-for-approval",
      readOnly: true,
      build: KAIROS_HOMEPAGE_DETERMINISTIC_MARKUP_COPY_PLANNER_BUILD,
      kernel: "published-homepage-deterministic-embedded-markup-copy-plan-v1",
      startedAt: now,
      completedAt: now,
      objective,
      summary,
      plan: {
        summary,
        strategy: "Apply a bounded approved MMG copy sequence to visible heading and paragraph nodes inside the active published homepage HTML or Liquid setting while preserving every markup and Liquid token.",
        changes: replacements.map(item => ({
          filename: TEMPLATE_FILE,
          changeType: "replace-embedded-visible-text",
          purpose: `Replace “${item.before}” with “${item.after}”.`,
          expectedOutcome: item.reason,
        })),
        risks: ["Longer wording may wrap differently inside the unchanged responsive framework."],
        acceptanceCriteria: [
          "Only visible text nodes inside active ordered homepage embedded markup change.",
          "HTML and Liquid token signatures remain identical.",
          "Styled text-node distribution remains preserved.",
          "Section IDs, block IDs, types, order, CSS, assets, classes, links, colors, typography, spacing, layout, animation, and responsive behavior remain unchanged.",
          "Only verified non-live Kairos Staging may be written before final approval.",
        ],
        rollbackPlan: ["Restore the exact pre-execution Kairos Staging templates/index.json source."],
        installationMode: "published-main-template-text-settings-v1",
        templateTextPatch: {
          filename: TEMPLATE_FILE,
          publishedSource: mainFile.content,
          candidateSource,
          operations,
          publishedSha256: mainFile.sha256,
          stagingBeforeSha256: stagingFile.sha256,
          expectedCandidateSha256,
          publishedSemanticHash,
          candidateSemanticHash,
          publishedStructureSignature,
          candidateStructureSignature,
          onlyExistingStringSettingsChanged: true,
          publishedFrameworkPreserved: true,
          deterministicFallback: true,
          embeddedMarkupTextOnly: true,
          visibleTextReplacementCount: replacementCount,
          nodeDistributionPreserved: true,
        },
        canonicalPackage: null,
        targetTheme: evidence.stagingTheme,
        publishedTheme: evidence.mainTheme,
        sourceTheme: evidence.mainTheme,
        sourceHashes,
        mutationScope: "published-main-template-embedded-markup-deterministic-visible-text-only",
        executable: true,
        preserveExistingDesign: true,
        preservePublishedFramework: true,
        templateTextOnly: true,
        embeddedMarkupTextOnly: true,
        structuralMutationAuthorized: false,
        styleMutationAuthorized: false,
        liquidStructureMutationAuthorized: false,
        assetMutationAuthorized: false,
        productionPublishAuthorized: false,
        liveThemeMutationAuthorized: false,
      },
      evidence: {
        stagingInspectionActionID: inspection.actionID || "",
        sourceOfTruth: "published-main-theme",
        planningEngine: KAIROS_HOMEPAGE_DETERMINISTIC_MARKUP_COPY_PLANNER_BUILD,
        intelligenceRuntime: "deterministic-native",
        intelligenceModel: null,
        privacy: "local-deterministic-processing",
        modelReasoningStored: false,
        deterministicFallback: true,
        embeddedMarkupTextOnly: true,
        activeCandidateCount: candidates.length,
        replacementCount,
        visibleTextReplacementCount: replacementCount,
        nodeDistributionPreserved: true,
        publishedFrameworkPreserved: true,
        templateOnly: true,
        liquidFilesChanged: 0,
        stylesheetsChanged: 0,
        assetsChanged: 0,
      },
    };

    const jobID = crypto.randomUUID();
    const completed = { jobID, status: "completed", build: KAIROS_HOMEPAGE_DETERMINISTIC_MARKUP_COPY_PLANNER_BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary, result };
    await caches.default.put(jobRequest(request, jobID), new Response(JSON.stringify(completed), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-MMG-Runtime": KAIROS_HOMEPAGE_DETERMINISTIC_MARKUP_COPY_PLANNER_BUILD },
    }));
    return json({ ...completed, pollURL: `/api/shopify/staging/plan/jobs/${jobID}` }, 202);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : Number(error?.statusCode || 500);
    return json({
      status: status >= 500 ? "failed" : "needs-attention",
      build: KAIROS_HOMEPAGE_DETERMINISTIC_MARKUP_COPY_PLANNER_BUILD,
      error: { code: error?.code || "deterministic_embedded_homepage_copy_plan_failed", message: error instanceof Error ? error.message : "Deterministic embedded homepage copy planning failed." },
    }, status);
  }
}

function activeEmbeddedMarkupSettings(document) {
  const settings = [];
  const order = Array.isArray(document?.order) ? document.order : [];
  for (const sectionId of order) {
    const section = document?.sections?.[sectionId];
    if (!section || section.disabled === true) continue;
    collectMarkupSettings(settings, "section", sectionId, "", section.settings);
    const blocks = section?.blocks && typeof section.blocks === "object" ? section.blocks : {};
    const blockOrder = Array.isArray(section?.block_order) && section.block_order.length ? section.block_order : Object.keys(blocks);
    for (const blockId of blockOrder) {
      const block = blocks[blockId];
      if (!block || block.disabled === true) continue;
      collectMarkupSettings(settings, "block", sectionId, blockId, block.settings);
    }
  }
  return settings.slice(0, 80);
}

function collectMarkupSettings(target, scope, sectionId, blockId, settings) {
  for (const [key, value] of Object.entries(settings || {})) {
    if (typeof value !== "string" || value.length < 3 || value.length > 100000) continue;
    if (!MARKUP_KEY.test(key) && !/<[a-z][\s\S]*?>|{{[\s\S]*?}}|{%[\s\S]*?%}/i.test(value)) continue;
    const groups = buildGroups(tokenize(value), `${scope}:${sectionId}:${blockId || "section"}:${key}`);
    if (!groups.some(group => group.text.length >= 2)) continue;
    target.push({ scope, sectionId, blockId, key, before: value, location: `${scope}:${sectionId}:${blockId || "section"}:${key}` });
  }
}

function tokenize(source) {
  return String(source || "").split(/({{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>)/g);
}

function buildGroups(tokens, prefix) {
  const groups = [];
  let current = [];
  let blockedDepth = 0;
  let ordinal = 0;
  const flush = () => {
    const textIndexes = current.filter(index => isVisibleText(tokens[index]));
    const text = textIndexes.map(index => decodeEntities(tokens[index])).join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      const markup = current.map(index => tokens[index]).filter(token => String(token).startsWith("<")).join(" ");
      const kind = /<\s*h[1-3]\b/i.test(markup) ? "heading" : /<\s*p\b/i.test(markup) ? "body" : "other";
      groups.push({ id: `${prefix}#${ordinal++}`, text, textIndexes, kind, primary: kind !== "other" });
    }
    current = [];
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token.startsWith("{{") || token.startsWith("{%")) {
      if (blockedDepth === 0) current.push(index);
      continue;
    }
    if (token.startsWith("<")) {
      const close = token.match(/^<\s*\/\s*([a-z0-9:-]+)/i);
      const open = token.match(/^<\s*([a-z0-9:-]+)/i);
      const tag = String(close?.[1] || open?.[1] || "").toLowerCase();
      if (close && BLOCKED_TAGS.has(tag)) blockedDepth = Math.max(0, blockedDepth - 1);
      if (blockedDepth === 0 && BLOCK_TAGS.has(tag)) flush();
      if (blockedDepth === 0) current.push(index);
      if (open && !close && !/\/\s*>$/.test(token) && BLOCKED_TAGS.has(tag)) blockedDepth += 1;
      if (blockedDepth === 0 && close && BLOCK_TAGS.has(tag)) flush();
      continue;
    }
    if (blockedDepth === 0) current.push(index);
  }
  flush();
  return groups;
}

function groupScore(group, settingIndex, groupIndex) {
  return (group.kind === "heading" ? 220 : group.kind === "body" ? 180 : 0) + Math.max(0, 100 - settingIndex * 10) + Math.max(0, 60 - groupIndex * 3) + Math.min(20, Math.floor(group.text.length / 25));
}

function deterministicReplacements(candidates) {
  const used = new Set();
  const replacements = [];
  for (const replacement of COPY_SEQUENCE) {
    const candidate = candidates.find(item => item.kind === replacement.kind && !used.has(item.id) && item.text.trim() !== replacement.text);
    if (!candidate) continue;
    used.add(candidate.id);
    replacements.push({
      id: candidate.id,
      location: candidate.location,
      scope: candidate.scope,
      sectionId: candidate.sectionId,
      blockId: candidate.blockId,
      key: candidate.key,
      before: candidate.text,
      after: replacement.text,
      kind: replacement.kind,
      reason: replacement.kind === "heading" ? "Clarify the customer-facing journey and value proposition." : "Explain MMG services and customer outcomes in direct language.",
    });
  }
  return replacements.slice(0, 8);
}

function isVisibleText(token) {
  const value = String(token || "");
  return Boolean(value.trim()) && !value.startsWith("<") && !value.startsWith("{{") && !value.startsWith("{%");
}

function writeGroupPreservingNodes(tokens, group, replacement) {
  const originals = group.textIndexes.map(index => tokens[index]);
  const weights = originals.map(token => Math.max(1, decodeEntities(token).trim().split(/\s+/).filter(Boolean).length));
  const parts = distributeWords(replacement, weights);
  group.textIndexes.forEach((tokenIndex, index) => {
    const original = originals[index];
    const leading = original.match(/^\s*/)?.[0] || "";
    const trailing = original.match(/\s*$/)?.[0] || "";
    tokens[tokenIndex] = `${leading}${parts[index] || ""}${trailing}`;
  });
}

function distributeWords(replacement, weights) {
  if (weights.length <= 1) return [replacement];
  const words = String(replacement || "").split(/\s+/).filter(Boolean);
  if (words.length < weights.length) return weights.map((_, index) => index === 0 ? replacement : "");
  const total = weights.reduce((sum, value) => sum + value, 0) || weights.length;
  const counts = weights.map(weight => Math.max(1, Math.floor(words.length * weight / total)));
  let assigned = counts.reduce((sum, value) => sum + value, 0);
  while (assigned > words.length) {
    let changed = false;
    for (let index = counts.length - 1; index >= 0 && assigned > words.length; index -= 1) {
      if (counts[index] > 1) { counts[index] -= 1; assigned -= 1; changed = true; }
    }
    if (!changed) break;
  }
  while (assigned < words.length) { counts[counts.length - 1] += 1; assigned += 1; }
  let cursor = 0;
  return counts.map(count => {
    const part = words.slice(cursor, cursor + count).join(" ");
    cursor += count;
    return part;
  });
}

function setSetting(document, operation, value) {
  const section = document?.sections?.[operation.sectionId];
  if (!section) throw httpError(409, "unknown_section", `Unknown homepage section ${operation.sectionId}.`);
  const settings = operation.scope === "section" ? section.settings : section?.blocks?.[operation.blockId]?.settings;
  if (!settings || !(operation.key in settings)) throw httpError(409, "unknown_setting", `Unknown homepage setting ${operation.location}.`);
  settings[operation.key] = value;
}

function assertOnlyApprovedSettingsChanged(before, after, operations) {
  const allowed = new Map(operations.map(operation => [operation.location, operation]));
  const beforeMap = settingsMap(buildEditableMap(before));
  const afterMap = settingsMap(buildEditableMap(after));
  if (beforeMap.size !== afterMap.size) throw httpError(409, "homepage_setting_map_changed", "The homepage setting map changed.");
  for (const [location, previous] of beforeMap) {
    if (!afterMap.has(location)) throw httpError(409, "homepage_setting_removed", `A homepage setting disappeared: ${location}.`);
    const next = afterMap.get(location);
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    const operation = allowed.get(location);
    if (!operation || typeof previous !== "string" || typeof next !== "string" || operation.before !== previous || operation.after !== next) {
      throw httpError(409, "non_text_homepage_change_detected", `A non-approved homepage setting changed: ${location}.`);
    }
  }
}

function settingsMap(editableMap) {
  const map = new Map();
  for (const section of editableMap.sections || []) {
    for (const [key, value] of Object.entries(section.settings || {})) map.set(`section:${section.sectionId}:section:${key}`, value);
    for (const block of section.blocks || []) for (const [key, value] of Object.entries(block.settings || {})) map.set(`block:${section.sectionId}:${block.blockId}:${key}`, value);
  }
  return map;
}

function structureSignature(document) {
  return JSON.stringify({
    topLevelKeys: Object.keys(document || {}).sort(),
    order: Array.isArray(document?.order) ? [...document.order] : [],
    sections: Object.entries(document?.sections || {}).map(([sectionId, section]) => ({
      sectionId,
      type: section?.type || "",
      disabled: section?.disabled === true,
      settingKeys: Object.keys(section?.settings || {}).sort(),
      blocks: Object.entries(section?.blocks || {}).map(([blockId, block]) => ({ blockId, type: block?.type || "", settingKeys: Object.keys(block?.settings || {}).sort() })),
      blockOrder: Array.isArray(section?.block_order) ? [...section.block_order] : [],
    })),
  });
}

function serializeLikeSource(source, document) {
  const text = String(source || "").replace(/^\uFEFF/, "");
  const trimmed = text.trimStart();
  let prefix = "";
  if (trimmed.startsWith("/*")) {
    const offset = text.length - trimmed.length;
    const end = text.indexOf("*/", offset + 2);
    if (end >= 0) prefix = `${text.slice(0, end + 2).trimEnd()}\n`;
  }
  return `${prefix}${JSON.stringify(document, null, 2)}\n`;
}

function markupSignature(value) {
  return (String(value || "").match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<\/?[a-z0-9:-]+(?:\s[^>]*)?>/gi) || []).join("\u001f");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function fileByName(files, filename) {
  return (Array.isArray(files) ? files : []).find(file => file?.filename === filename && file?.readable && typeof file?.content === "string") || null;
}

function validateBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The published MAIN theme could not be verified.");
}

function jobRequest(request, jobID) {
  return new Request(new URL(`/_kairos/standalone-execution-jobs/${jobID}`, request.url).toString(), { method: "GET" });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_HOMEPAGE_DETERMINISTIC_MARKUP_COPY_PLANNER_BUILD,
      "X-Kairos-Homepage-Mode": "preserve-published-framework",
      "X-Kairos-Homepage-Source": "published-main-theme",
      "X-Kairos-Homepage-Text-Source": "deterministic-embedded-template-markup",
      "X-Kairos-Mutation-Scope": "templates-index-json-embedded-visible-text-only",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
