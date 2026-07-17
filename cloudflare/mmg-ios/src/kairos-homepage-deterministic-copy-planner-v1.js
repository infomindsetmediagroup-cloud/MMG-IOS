import {
  applyCompactPatch,
  hashText,
  httpError,
  inspectStagingSource,
  inspectThemeFiles,
  parseShopifyJson,
  semanticHash,
  validateHomepageDocument,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_HOMEPAGE_DETERMINISTIC_COPY_PLANNER_BUILD = "kairos-homepage-deterministic-copy-planner-20260717-1";

const TEMPLATE_FILE = "templates/index.json";
const PRIMARY_KEY = /(heading|title|headline|subheading|description|text|copy|content|eyebrow|kicker)/i;
const HEADING_KEY = /(heading|title|headline)/i;
const BODY_KEY = /(subheading|description|text|copy|content)/i;
const EXCLUDED_KEY = /(button|label|link|url|image|video|menu|product|collection|color|scheme|font|size|layout|style|position|alignment|mobile|desktop|show|hide|enable|icon|animation|spacing|padding|margin|id$|handle)/i;
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
      return json({ status: "not-found", build: KAIROS_HOMEPAGE_DETERMINISTIC_COPY_PLANNER_BUILD }, 404);
    }
    return createPlan(request, env);
  },
};

async function createPlan(request, env) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 3) throw httpError(400, "objective_required", "Tell Kairos what you want changed on the homepage.");

    const inspection = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_DETERMINISTIC_COPY_PLANNER_BUILD, [TEMPLATE_FILE]);
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

    const candidates = activePlainTextCandidates(publishedDocument);
    const operations = buildDeterministicOperations(candidates);
    if (!operations.length) throw httpError(409, "deterministic_visible_copy_missing", "The active homepage exposes no safe plain rendered heading or body settings for deterministic copy replacement.");

    const patch = {
      order: [],
      operations: operations.map(operation => ({
        scope: operation.scope,
        sectionId: operation.sectionId,
        blockId: operation.blockId,
        key: operation.key,
        valueJson: JSON.stringify(operation.after),
      })),
    };
    const candidateDocument = applyCompactPatch(publishedDocument, patch);
    validateHomepageDocument(candidateDocument, publishedDocument);
    assertOnlyOperationsChanged(publishedDocument, candidateDocument, operations);

    const candidateSource = serializeLikeSource(mainFile.content, candidateDocument);
    const publishedSemanticHash = await semanticHash(publishedDocument);
    const candidateSemanticHash = await semanticHash(candidateDocument);
    const expectedCandidateSha256 = await hashText(candidateSource);
    const publishedStructureSignature = structureSignature(publishedDocument);
    const candidateStructureSignature = structureSignature(candidateDocument);
    if (publishedStructureSignature !== candidateStructureSignature) throw httpError(409, "published_framework_structure_changed", "The deterministic copy plan changed the homepage structure.");

    const sourceHashes = {
      "published:templates/index.json": mainFile.sha256,
      "staging:templates/index.json": stagingFile.sha256,
    };
    const now = new Date().toISOString();
    const summary = `Kairos prepared ${operations.length} deterministic, source-bound visible homepage copy replacements.`;
    const result = {
      actionID: crypto.randomUUID(),
      planID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      requestType: "homepage-preserve-design",
      homepageMode: "preserve-published-framework",
      status: "ready-for-approval",
      readOnly: true,
      build: KAIROS_HOMEPAGE_DETERMINISTIC_COPY_PLANNER_BUILD,
      kernel: "published-homepage-deterministic-template-copy-plan-v1",
      startedAt: now,
      completedAt: now,
      objective,
      summary,
      plan: {
        summary,
        strategy: "Apply a bounded approved MMG copy sequence to the highest-impact active plain heading and body settings in the published homepage framework.",
        changes: operations.map(operation => ({
          filename: TEMPLATE_FILE,
          changeType: "modify-setting",
          purpose: `Replace “${operation.before}” with “${operation.after}” in ${operation.sectionId}/${operation.blockId || "section"}/${operation.key}.`,
          expectedOutcome: operation.reason,
        })),
        risks: ["Longer copy may wrap differently inside the unchanged responsive framework."],
        acceptanceCriteria: [
          "At least one active rendered heading and one active rendered body setting change when both are available.",
          "Only existing plain customer-facing string settings change.",
          "Section and block IDs, types, order, Liquid, CSS, assets, classes, links, layout, animation, and responsive behavior remain unchanged.",
          "Only the verified non-live Kairos Staging theme may be written before final approval.",
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
        },
        canonicalPackage: null,
        targetTheme: evidence.stagingTheme,
        publishedTheme: evidence.mainTheme,
        sourceTheme: evidence.mainTheme,
        sourceHashes,
        mutationScope: "published-main-active-plain-template-copy-only",
        executable: true,
        preserveExistingDesign: true,
        preservePublishedFramework: true,
        templateTextOnly: true,
        structuralMutationAuthorized: false,
        styleMutationAuthorized: false,
        liquidMutationAuthorized: false,
        assetMutationAuthorized: false,
        productionPublishAuthorized: false,
        liveThemeMutationAuthorized: false,
      },
      evidence: {
        stagingInspectionActionID: inspection.actionID || "",
        sourceOfTruth: "published-main-theme",
        planningEngine: KAIROS_HOMEPAGE_DETERMINISTIC_COPY_PLANNER_BUILD,
        intelligenceRuntime: "deterministic-native",
        intelligenceModel: null,
        privacy: "local-deterministic-processing",
        modelReasoningStored: false,
        deterministicFallback: true,
        activeCandidateCount: candidates.length,
        replacementCount: operations.length,
        visibleTextReplacementCount: operations.length,
        publishedFrameworkPreserved: true,
        onlyExistingStringSettingsChanged: true,
        templateOnly: true,
        liquidFilesChanged: 0,
        stylesheetsChanged: 0,
        assetsChanged: 0,
      },
    };

    const jobID = crypto.randomUUID();
    const completed = { jobID, status: "completed", build: KAIROS_HOMEPAGE_DETERMINISTIC_COPY_PLANNER_BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary, result };
    await caches.default.put(jobRequest(request, jobID), new Response(JSON.stringify(completed), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-MMG-Runtime": KAIROS_HOMEPAGE_DETERMINISTIC_COPY_PLANNER_BUILD },
    }));
    return json({ ...completed, pollURL: `/api/shopify/staging/plan/jobs/${jobID}` }, 202);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : Number(error?.statusCode || 500);
    return json({
      status: status >= 500 ? "failed" : "needs-attention",
      build: KAIROS_HOMEPAGE_DETERMINISTIC_COPY_PLANNER_BUILD,
      error: { code: error?.code || "deterministic_homepage_copy_plan_failed", message: error instanceof Error ? error.message : "Deterministic homepage copy planning failed." },
    }, status);
  }
}

function activePlainTextCandidates(document) {
  const candidates = [];
  const order = Array.isArray(document?.order) ? document.order : [];
  order.forEach((sectionId, sectionIndex) => {
    const section = document?.sections?.[sectionId];
    if (!section || section.disabled === true) return;
    collect(candidates, "section", sectionId, "", section.settings, sectionIndex, -1);
    const blocks = section?.blocks && typeof section.blocks === "object" ? section.blocks : {};
    const blockOrder = Array.isArray(section?.block_order) && section.block_order.length ? section.block_order : Object.keys(blocks);
    blockOrder.forEach((blockId, blockIndex) => {
      const block = blocks[blockId];
      if (!block || block.disabled === true) return;
      collect(candidates, "block", sectionId, blockId, block.settings, sectionIndex, blockIndex);
    });
  });
  return candidates.sort((a, b) => b.score - a.score);
}

function collect(candidates, scope, sectionId, blockId, settings, sectionIndex, blockIndex) {
  for (const [key, value] of Object.entries(settings || {})) {
    if (typeof value !== "string" || !value.trim() || value.length > 1600) continue;
    if (!PRIMARY_KEY.test(key) || EXCLUDED_KEY.test(key)) continue;
    if (tokenSignature(value)) continue;
    if (/^https?:\/\//i.test(value) || /^shopify:\/\//i.test(value) || /^#[0-9a-f]{3,8}$/i.test(value)) continue;
    const kind = HEADING_KEY.test(key) ? "heading" : BODY_KEY.test(key) ? "body" : "other";
    if (kind === "other") continue;
    const score = (kind === "heading" ? 200 : 160) + Math.max(0, 80 - sectionIndex * 8) + (scope === "section" ? 20 : 0) + Math.max(0, 20 - blockIndex * 2);
    candidates.push({ scope, sectionId, blockId, key, before: value, kind, score, location: `${scope}:${sectionId}:${blockId || "section"}:${key}` });
  }
}

function buildDeterministicOperations(candidates) {
  const used = new Set();
  const operations = [];
  for (const replacement of COPY_SEQUENCE) {
    const candidate = candidates.find(item => item.kind === replacement.kind && !used.has(item.location) && item.before.trim() !== replacement.text);
    if (!candidate) continue;
    used.add(candidate.location);
    operations.push({
      ...candidate,
      after: replacement.text,
      reason: replacement.kind === "heading" ? "Clarify the customer-facing journey and value proposition." : "Explain MMG services and customer outcomes in direct language.",
    });
  }
  return operations.slice(0, 8);
}

function assertOnlyOperationsChanged(before, after, operations) {
  const allowed = new Set(operations.map(operation => operation.location));
  const beforeMap = settingsMap(before);
  const afterMap = settingsMap(after);
  if (beforeMap.size !== afterMap.size) throw httpError(409, "homepage_setting_map_changed", "The homepage setting map changed.");
  for (const [location, previous] of beforeMap) {
    if (!afterMap.has(location)) throw httpError(409, "homepage_setting_removed", `A homepage setting disappeared: ${location}.`);
    const next = afterMap.get(location);
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    if (!allowed.has(location) || typeof previous !== "string" || typeof next !== "string") throw httpError(409, "non_text_homepage_change_detected", `A non-approved homepage setting changed: ${location}.`);
  }
}

function settingsMap(document) {
  const map = new Map();
  for (const [sectionId, section] of Object.entries(document?.sections || {})) {
    for (const [key, value] of Object.entries(section?.settings || {})) map.set(`section:${sectionId}:section:${key}`, value);
    for (const [blockId, block] of Object.entries(section?.blocks || {})) for (const [key, value] of Object.entries(block?.settings || {})) map.set(`block:${sectionId}:${blockId}:${key}`, value);
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

function tokenSignature(value) {
  return (String(value || "").match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<\/?[a-z0-9:-]+(?:\s[^>]*)?>/gi) || []).join("\u001f");
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
      "X-MMG-Runtime": KAIROS_HOMEPAGE_DETERMINISTIC_COPY_PLANNER_BUILD,
      "X-Kairos-Homepage-Mode": "preserve-published-framework",
      "X-Kairos-Deterministic-Copy": "active-plain-rendered-settings",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
