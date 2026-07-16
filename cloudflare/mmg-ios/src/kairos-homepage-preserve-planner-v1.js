import {
  applyCompactPatch,
  buildEditableMap,
  hashText,
  httpError,
  inspectStagingSource,
  inspectThemeFiles,
  parseShopifyJson,
  semanticHash,
  validateHomepageDocument,
} from "./kairos-compact-homepage-utils-v1.js";
import { parseStrictJSON, runKairosIntelligence } from "./kairos-intelligence-v1.js";

export const KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD = "kairos-homepage-preserve-planner-20260716-2";

const TEMPLATE_FILE = "templates/index.json";
const TEXT_KEY = /(heading|title|text|description|subheading|caption|label|eyebrow|kicker|copy|content|quote|announcement|button.*label|cta.*label)/i;
const NON_TEXT_KEY = /(url|link(?!.*label)|href|image|video|color|font|size|width|height|alignment|position|id$|handle|product|collection|menu|icon|animation|spacing|padding|margin|opacity|scheme|style|layout|desktop|mobile|enabled|show_|hide_)/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/shopify/staging/plan/jobs") return createPlan(request, env);
    return json({ status: "not-found", build: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD }, 404);
  },
};

async function createPlan(request, env) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 3) throw httpError(400, "objective_required", "Tell Kairos what you want changed on the homepage.");
    if (objective.length > 12000) throw httpError(413, "objective_too_long", "Homepage objective exceeds 12,000 characters.");

    const stagingInspection = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD, [TEMPLATE_FILE]);
    const stagingEvidence = stagingInspection?.evidence || {};
    validateBoundary(stagingEvidence.stagingTheme, stagingEvidence.mainTheme);

    const mainInspection = await inspectThemeFiles(env, stagingEvidence.mainTheme.gid, [TEMPLATE_FILE]);
    const mainFile = fileByName(mainInspection.files, TEMPLATE_FILE);
    const stagingFile = fileByName(stagingEvidence.files, TEMPLATE_FILE);
    if (!mainFile?.content || !stagingFile?.content) {
      throw httpError(409, "homepage_template_unavailable", "Kairos must be able to read the published MAIN homepage and Kairos Staging homepage templates.");
    }

    const publishedDocument = parseShopifyJson(mainFile.content, "Published MAIN homepage");
    const stagingDocument = parseShopifyJson(stagingFile.content, "Kairos Staging homepage");
    validateHomepageDocument(structuredClone(publishedDocument), publishedDocument);
    validateHomepageDocument(structuredClone(stagingDocument), stagingDocument);

    const editableMap = buildEditableMap(publishedDocument);
    const inventory = buildTextInventory(editableMap);
    if (!inventory.length) {
      throw httpError(409, "published_homepage_text_settings_missing", "The published homepage exposes no safe customer-facing text settings. Kairos will not rebuild the framework to force a change.");
    }

    const generated = await runKairosIntelligence(env, {
      purpose: "published-homepage-template-text-plan",
      temperature: 0.1,
      maxTokens: 4096,
      seed: 1912,
      system: [
        "You are Kairos, the governed MMG homepage copy editor.",
        "Return strict JSON only, with no markdown or commentary.",
        "The published MAIN Shopify homepage is the immutable framework source of truth.",
        "Change only existing customer-facing string settings supplied in the inventory.",
        "Never add, remove, reorder, rename, or replace sections, blocks, templates, Liquid files, stylesheets, assets, links, classes, colors, typography, spacing, cards, pills, layout, animation, or responsive behavior.",
        "Every operation must copy scope, sectionId, blockId, key, and before exactly from one inventory item.",
        "If before contains HTML or Liquid tokens, after must preserve the exact same token sequence.",
        "Do not invent testimonials, metrics, awards, prices, guarantees, partnerships, product availability, or factual claims.",
        "Return only useful copy changes required by the objective.",
        "Schema: {\"summary\":\"...\",\"operations\":[{\"scope\":\"section|block\",\"sectionId\":\"exact\",\"blockId\":\"exact or empty\",\"key\":\"exact\",\"before\":\"exact current string\",\"after\":\"new string\",\"reason\":\"brief reason\"}]}.",
      ].join("\n"),
      user: JSON.stringify({
        objective,
        sourceOfTruth: "published-main-theme",
        immutableContract: {
          templateStructure: true,
          sectionIDsTypesAndOrder: true,
          blockIDsTypesAndOrder: true,
          LiquidCSSAssetsAndClasses: true,
          colorsTypographySpacingCardsPillsAndLayout: true,
          linksAndResponsiveBehavior: true,
          onlyExistingStringSettingsMayChange: true,
          targetIsNonLiveStaging: true,
        },
        textSettingInventory: inventory,
      }),
    });

    const proposal = parseStrictJSON(generated.text);
    const normalized = normalizeOperations(proposal?.operations, inventory);
    if (!normalized.length) {
      throw httpError(409, "safe_template_text_changes_missing", "Kairos produced no source-bound text changes that preserve the published homepage framework exactly.");
    }

    const patch = {
      order: [],
      operations: normalized.map(item => ({
        scope: item.scope,
        sectionId: item.sectionId,
        blockId: item.blockId,
        key: item.key,
        valueJson: JSON.stringify(item.after),
      })),
    };
    const candidateDocument = applyCompactPatch(publishedDocument, patch);
    validateHomepageDocument(candidateDocument, publishedDocument);
    assertOnlyApprovedTextChanged(publishedDocument, candidateDocument, normalized);

    const candidateSource = serializeLikeSource(mainFile.content, candidateDocument);
    const publishedSemanticHash = await semanticHash(publishedDocument);
    const candidateSemanticHash = await semanticHash(candidateDocument);
    const expectedCandidateSha256 = await hashText(candidateSource);
    const publishedStructureSignature = structureSignature(publishedDocument);
    const candidateStructureSignature = structureSignature(candidateDocument);
    if (publishedStructureSignature !== candidateStructureSignature) {
      throw httpError(409, "published_framework_structure_changed", "The proposed homepage copy changed the published framework structure.");
    }

    const sourceHashes = {
      "published:templates/index.json": mainFile.sha256,
      "staging:templates/index.json": stagingFile.sha256,
    };
    const now = new Date().toISOString();
    const summary = String(proposal?.summary || `Kairos prepared ${normalized.length} text-only homepage update${normalized.length === 1 ? "" : "s"} against the published framework.`).trim();
    const result = {
      actionID: crypto.randomUUID(),
      planID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      requestType: "homepage-preserve-design",
      homepageMode: "preserve-published-framework",
      status: "ready-for-approval",
      readOnly: true,
      build: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD,
      kernel: "published-homepage-template-text-plan-v1",
      startedAt: now,
      completedAt: now,
      objective,
      summary,
      plan: {
        summary,
        strategy: "Clone the currently published MAIN homepage template into Kairos Staging and change only approved existing customer-facing string settings.",
        changes: normalized.map(item => ({
          filename: TEMPLATE_FILE,
          changeType: "modify-setting",
          purpose: `Replace the existing ${item.scope} setting ${item.sectionId}/${item.blockId || "section"}/${item.key}.`,
          expectedOutcome: item.reason || "Updated customer-facing homepage copy inside the existing published framework.",
        })),
        risks: ["Longer copy may wrap differently inside the unchanged responsive framework."],
        acceptanceCriteria: [
          "The published MAIN homepage template is the source of truth.",
          "Only existing string settings change.",
          "Section IDs, section types, block IDs, block types, and order remain identical.",
          "No Liquid, CSS, asset, class, color, typography, spacing, card, pill, layout, link, animation, or responsive behavior changes.",
          "Only templates/index.json may be written to Kairos Staging.",
          "The live MAIN theme remains unchanged.",
        ],
        rollbackPlan: ["Restore the exact pre-execution Kairos Staging templates/index.json source."],
        installationMode: "published-main-template-text-settings-v1",
        templateTextPatch: {
          filename: TEMPLATE_FILE,
          publishedSource: mainFile.content,
          candidateSource,
          operations: normalized,
          publishedSha256: mainFile.sha256,
          stagingBeforeSha256: stagingFile.sha256,
          expectedCandidateSha256,
          publishedSemanticHash,
          candidateSemanticHash,
          publishedStructureSignature,
          candidateStructureSignature,
          onlyExistingStringSettingsChanged: true,
          publishedFrameworkPreserved: true,
        },
        canonicalPackage: null,
        targetTheme: stagingEvidence.stagingTheme,
        publishedTheme: stagingEvidence.mainTheme,
        sourceTheme: stagingEvidence.mainTheme,
        sourceHashes,
        mutationScope: "published-main-template-text-settings-only",
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
        stagingInspectionActionID: stagingInspection.actionID || "",
        stagingTheme: stagingEvidence.stagingTheme,
        mainTheme: stagingEvidence.mainTheme,
        sourceTheme: stagingEvidence.mainTheme,
        sourceOfTruth: "published-main-theme",
        planningEngine: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD,
        intelligenceRuntime: generated.runtime,
        intelligenceModel: generated.model,
        privacy: generated.privacy,
        modelReasoningStored: false,
        publishedTemplateSha256: mainFile.sha256,
        stagingTemplateSha256: stagingFile.sha256,
        publishedFrameworkPreserved: true,
        onlyExistingStringSettingsChanged: true,
        templateOnly: true,
        liquidFilesChanged: 0,
        stylesheetsChanged: 0,
        assetsChanged: 0,
        replacementCount: normalized.length,
      },
    };

    const jobID = crypto.randomUUID();
    const completed = { jobID, status: "completed", build: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary, result };
    await caches.default.put(jobRequest(request, jobID), new Response(JSON.stringify(completed), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-MMG-Runtime": KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD },
    }));
    return json({ jobID, status: "completed", build: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD, pollURL: `/api/shopify/staging/plan/jobs/${jobID}`, summary, result }, 202);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : Number(error?.statusCode || 500);
    return json({
      status: "needs-attention",
      build: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD,
      summary: "Kairos could not prepare the published-framework homepage text update.",
      error: { status, code: typeof error?.code === "string" ? error.code : "homepage_preserve_plan_failed", message: error instanceof Error ? error.message : "Published-framework homepage planning failed." },
    }, status);
  }
}

function buildTextInventory(editableMap) {
  const inventory = [];
  for (const section of editableMap.sections || []) {
    collectSettings(inventory, "section", section.sectionId, "", section.settings);
    for (const block of section.blocks || []) collectSettings(inventory, "block", section.sectionId, block.blockId, block.settings);
  }
  return inventory.slice(0, 240);
}

function collectSettings(inventory, scope, sectionId, blockId, settings) {
  for (const [key, value] of Object.entries(settings || {})) {
    if (!isEditableTextSetting(key, value)) continue;
    inventory.push({
      scope,
      sectionId,
      blockId,
      key,
      before: value,
      tokenSignature: tokenSignature(value),
      location: `${scope}:${sectionId}:${blockId || "section"}:${key}`,
    });
  }
}

function isEditableTextSetting(key, value) {
  if (typeof value !== "string") return false;
  if (!value.trim() || value.length > 5000) return false;
  if (NON_TEXT_KEY.test(key)) return false;
  if (TEXT_KEY.test(key)) return true;
  return /[A-Za-z]{3}/.test(value) && !/^https?:\/\//i.test(value) && !/^shopify:\/\//i.test(value) && !/^#(?:[0-9a-f]{3}){1,2}$/i.test(value);
}

function normalizeOperations(value, inventory) {
  if (!Array.isArray(value)) return [];
  const byLocation = new Map(inventory.map(item => [item.location, item]));
  const used = new Set();
  const normalized = [];
  for (const item of value) {
    const scope = String(item?.scope || "").trim();
    const sectionId = String(item?.sectionId || "").trim();
    const blockId = String(item?.blockId || "").trim();
    const key = String(item?.key || "").trim();
    const before = String(item?.before ?? "");
    const after = String(item?.after ?? "");
    const location = `${scope}:${sectionId}:${blockId || "section"}:${key}`;
    const source = byLocation.get(location);
    if (!source || used.has(location)) continue;
    if (before !== source.before || !after.trim() || after === before || after.length > 5000) continue;
    if (tokenSignature(after) !== source.tokenSignature) continue;
    used.add(location);
    normalized.push({ scope, sectionId, blockId, key, before, after, reason: String(item?.reason || "").trim().slice(0, 300), location });
  }
  return normalized.slice(0, 120);
}

function assertOnlyApprovedTextChanged(before, after, operations) {
  const allowed = new Set(operations.map(item => item.location));
  const beforeMap = settingsMap(buildEditableMap(before));
  const afterMap = settingsMap(buildEditableMap(after));
  if (beforeMap.size !== afterMap.size) throw httpError(409, "homepage_setting_map_changed", "The homepage setting map changed.");
  for (const [location, previous] of beforeMap) {
    if (!afterMap.has(location)) throw httpError(409, "homepage_setting_removed", `The homepage setting disappeared: ${location}.`);
    const next = afterMap.get(location);
    if (deepEqual(previous, next)) continue;
    if (!allowed.has(location) || typeof previous !== "string" || typeof next !== "string") {
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
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function jobRequest(request, jobID) { return new Request(new URL(`/_kairos/standalone-execution-jobs/${jobID}`, request.url).toString(), { method: "GET" }); }
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD,
      "X-Kairos-Homepage-Mode": "preserve-published-framework",
      "X-Kairos-Homepage-Source": "published-main-theme",
      "X-Kairos-Mutation-Scope": "templates-index-json-existing-string-settings-only",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
