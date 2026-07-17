import {
  hashText,
  httpError,
  inspectStagingSource,
  inspectThemeFiles,
  parseShopifyJson,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";
import { parseStrictJSON, runKairosIntelligence } from "./kairos-intelligence-v1.js";

export const KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD = "kairos-homepage-liquid-text-fallback-20260716-1";

const PLAN_ROUTE = "/api/shopify/staging/plan/jobs";
const EXECUTE_ROUTE = "/api/shopify/staging/execute/jobs";
const TEMPLATE_FILE = "templates/index.json";
const BLOCK_TAGS = new Set(["address","article","aside","blockquote","button","div","figcaption","figure","footer","form","h1","h2","h3","h4","h5","h6","header","li","main","nav","p","section","td","th"]);
const BLOCKED_TAGS = new Set(["script","style","svg","template","noscript","code","pre"]);
const HOMEPAGE_SECTION_HINT = /(home|homepage|landing|mmg|hero)/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === PLAN_ROUTE) return plan(request, env);
    if (request.method === "POST" && url.pathname === EXECUTE_ROUTE) return execute(request, env);
    return json({ status: "not-found", build: KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD }, 404);
  },
};

async function plan(request, env) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 3) throw httpError(400, "objective_required", "Tell Kairos what you want changed on the homepage.");
    if (objective.length > 12000) throw httpError(413, "objective_too_long", "Homepage objective exceeds 12,000 characters.");

    const initial = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD, [TEMPLATE_FILE]);
    const evidence = initial?.evidence || {};
    validateBoundary(evidence.stagingTheme, evidence.mainTheme);

    const mainTemplateInspection = await inspectThemeFiles(env, evidence.mainTheme.gid, [TEMPLATE_FILE]);
    const mainTemplate = fileByName(mainTemplateInspection.files, TEMPLATE_FILE);
    const stagingTemplate = fileByName(evidence.files, TEMPLATE_FILE);
    if (!mainTemplate?.content || !stagingTemplate?.content) throw httpError(409, "homepage_template_unavailable", "Kairos could not read the published and staging homepage templates.");

    const publishedDocument = parseShopifyJson(mainTemplate.content, "Published MAIN homepage");
    const sectionFilenames = activeHomepageSectionFilenames(publishedDocument);
    if (!sectionFilenames.length) throw httpError(409, "homepage_liquid_section_missing", "The published homepage has no active homepage-specific Liquid section that can be edited safely.");

    const mainSectionsInspection = await inspectThemeFiles(env, evidence.mainTheme.gid, sectionFilenames);
    const stagingInspection = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD, [TEMPLATE_FILE, ...sectionFilenames]);
    const stagingFiles = new Map((stagingInspection?.evidence?.files || []).map(file => [file.filename, file]));
    const mainFiles = new Map((mainSectionsInspection.files || []).map(file => [file.filename, file]));
    const eligible = sectionFilenames.filter(filename => {
      const file = mainFiles.get(filename);
      return file?.content && isHomepageSpecificSection(filename, file.content);
    });
    if (!eligible.length) throw httpError(409, "homepage_liquid_scope_unsafe", "Kairos found no homepage-specific Liquid section. It will not edit a shared section that could affect other pages.");

    const inventories = [];
    for (const filename of eligible) {
      const file = mainFiles.get(filename);
      const groups = buildGroups(tokenize(file.content), filename);
      for (const group of groups) {
        if (group.text.length < 2 || group.text.length > 1200) continue;
        inventories.push({
          id: group.id,
          filename,
          text: group.text,
          primary: group.primary,
          nodeCount: group.textIndexes.length,
        });
      }
    }
    if (!inventories.length) throw httpError(409, "homepage_liquid_visible_text_missing", "The published homepage Liquid section exposes no safe literal customer-facing text nodes.");

    const generated = await runKairosIntelligence(env, {
      purpose: "published-homepage-liquid-visible-text-plan",
      temperature: 0.1,
      maxTokens: 4096,
      seed: 1913,
      system: [
        "You are Kairos, the governed MMG homepage copy editor.",
        "Return strict JSON only, without markdown or commentary.",
        "Use only the supplied literal visible-text groups from the published MAIN homepage.",
        "Change only customer-facing words. Markup, Liquid, classes, links, attributes, scripts, styles, section structure, block structure, and responsive behavior are immutable.",
        "Every replacement must copy id and before exactly from the inventory.",
        "Do not include HTML, Liquid tokens, URLs, testimonials, metrics, awards, prices, guarantees, or unsupported claims.",
        "Return at least one meaningful primary-copy change when the objective requires a rewrite.",
        "Schema: {\"summary\":\"...\",\"replacements\":[{\"id\":\"exact\",\"before\":\"exact\",\"after\":\"new literal text\",\"reason\":\"brief\"}]}",
      ].join("\n"),
      user: JSON.stringify({
        objective,
        sourceOfTruth: "published-main-theme",
        immutableContract: {
          markupAndLiquidTokens: true,
          classesAttributesLinksAndURLs: true,
          sectionAndBlockStructure: true,
          CSSAssetsColorsTypographySpacingLayoutAnimationResponsiveBehavior: true,
          targetIsNonLiveStaging: true,
        },
        visibleTextInventory: inventories.slice(0, 240),
      }),
    });

    const proposal = parseStrictJSON(generated.text);
    const normalized = normalizeReplacements(proposal?.replacements, inventories);
    if (!normalized.length) throw httpError(409, "safe_liquid_text_changes_missing", "Kairos produced no source-bound Liquid text changes that preserve the published homepage framework.");

    const byFile = new Map();
    for (const replacement of normalized) {
      if (!byFile.has(replacement.filename)) byFile.set(replacement.filename, []);
      byFile.get(replacement.filename).push(replacement);
    }

    const liquidTextPatches = [];
    for (const [filename, replacements] of byFile) {
      const mainFile = mainFiles.get(filename);
      const stagingFile = stagingFiles.get(filename);
      if (!mainFile?.content || !stagingFile?.content) throw httpError(409, "homepage_liquid_source_unavailable", `Kairos could not read ${filename} from both published MAIN and staging.`);
      const tokens = tokenize(mainFile.content);
      const groups = new Map(buildGroups(tokens, filename).map(group => [group.id, group]));
      const applied = [];
      for (const replacement of replacements) {
        const group = groups.get(replacement.id);
        if (!group || group.text !== replacement.before) continue;
        writeGroupPreservingNodes(tokens, group, replacement.after);
        applied.push({ ...replacement, nodeDistributionPreserved: true });
      }
      if (!applied.length) continue;
      const candidateSource = tokens.join("");
      const beforeSignature = markupSignature(mainFile.content);
      const afterSignature = markupSignature(candidateSource);
      if (beforeSignature !== afterSignature) throw httpError(409, "liquid_markup_signature_mismatch", `The proposed text change altered markup or Liquid in ${filename}.`);
      liquidTextPatches.push({
        filename,
        publishedSource: mainFile.content,
        stagingBeforeSource: stagingFile.content,
        candidateSource,
        publishedSha256: mainFile.sha256,
        stagingBeforeSha256: stagingFile.sha256,
        expectedCandidateSha256: await hashText(candidateSource),
        beforeSignature,
        afterSignature,
        replacements: applied,
        nodeDistributionPreserved: true,
      });
    }
    if (!liquidTextPatches.length) throw httpError(409, "liquid_text_patch_empty", "Kairos could not bind the requested wording to the published homepage Liquid source.");

    const sourceHashes = {
      [`published:${TEMPLATE_FILE}`]: mainTemplate.sha256,
      [`staging:${TEMPLATE_FILE}`]: stagingTemplate.sha256,
    };
    for (const patch of liquidTextPatches) {
      sourceHashes[`published:${patch.filename}`] = patch.publishedSha256;
      sourceHashes[`staging:${patch.filename}`] = patch.stagingBeforeSha256;
    }

    const now = new Date().toISOString();
    const summary = String(proposal?.summary || `Kairos prepared ${normalized.length} visible homepage text replacement${normalized.length === 1 ? "" : "s"} inside the published Liquid framework.`).trim();
    const result = {
      actionID: crypto.randomUUID(),
      planID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      requestType: "homepage-preserve-design",
      homepageMode: "preserve-published-framework",
      status: "ready-for-approval",
      readOnly: true,
      build: KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD,
      kernel: "published-homepage-liquid-visible-text-plan-v1",
      startedAt: now,
      completedAt: now,
      objective,
      summary,
      plan: {
        summary,
        strategy: "Copy the published MAIN homepage template into staging and rewrite only verified literal text nodes in homepage-specific Liquid sections.",
        changes: liquidTextPatches.flatMap(patch => patch.replacements.map(item => ({
          filename: patch.filename,
          changeType: "replace-visible-text",
          purpose: `Replace “${item.before}” with approved customer-facing copy.`,
          expectedOutcome: item.reason || "Visible homepage wording changes inside the unchanged framework.",
        }))),
        risks: ["Longer wording may wrap differently inside the unchanged responsive design."],
        acceptanceCriteria: [
          "The published MAIN homepage remains the source of truth.",
          "Only templates/index.json and homepage-specific section Liquid files may be written to staging.",
          "Only literal visible text nodes change inside Liquid files.",
          "Liquid/HTML token signatures and styled text-node distribution remain identical.",
          "CSS, assets, classes, links, section structure, block structure, order, colors, typography, spacing, layout, animation, and responsive behavior remain unchanged.",
          "The live MAIN theme remains unchanged.",
        ],
        rollbackPlan: ["Restore the exact pre-execution staging template and Liquid section sources."],
        installationMode: "published-main-liquid-visible-text-v1",
        templatePatch: {
          filename: TEMPLATE_FILE,
          publishedSource: mainTemplate.content,
          stagingBeforeSource: stagingTemplate.content,
          publishedSha256: mainTemplate.sha256,
          stagingBeforeSha256: stagingTemplate.sha256,
          expectedCandidateSha256: mainTemplate.sha256,
        },
        liquidTextPatches,
        canonicalPackage: null,
        targetTheme: evidence.stagingTheme,
        publishedTheme: evidence.mainTheme,
        sourceTheme: evidence.mainTheme,
        sourceHashes,
        mutationScope: "published-main-homepage-liquid-literal-text-only",
        executable: true,
        preserveExistingDesign: true,
        preservePublishedFramework: true,
        liquidTextOnly: true,
        structuralMutationAuthorized: false,
        styleMutationAuthorized: false,
        assetMutationAuthorized: false,
        liquidStructureMutationAuthorized: false,
        productionPublishAuthorized: false,
        liveThemeMutationAuthorized: false,
      },
      evidence: {
        sourceOfTruth: "published-main-theme",
        planningEngine: KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD,
        intelligenceRuntime: generated.runtime,
        intelligenceModel: generated.model,
        privacy: generated.privacy,
        modelReasoningStored: false,
        publishedFrameworkPreserved: true,
        literalLiquidTextOnly: true,
        replacementCount: liquidTextPatches.reduce((sum, patch) => sum + patch.replacements.length, 0),
        liquidFiles: liquidTextPatches.map(patch => patch.filename),
        stylesheetsChanged: 0,
        assetsChanged: 0,
      },
    };

    return completeJob(request, result, summary, now, "plan");
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : Number(error?.statusCode || 500);
    return json({
      status: "needs-attention",
      build: KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD,
      summary: "Kairos could not prepare the node-preserving homepage Liquid text update.",
      error: {
        status,
        code: typeof error?.code === "string" ? error.code : "homepage_liquid_text_plan_failed",
        message: error instanceof Error ? error.message : "Homepage Liquid text planning failed.",
      },
    }, status);
  }
}

async function execute(request, env) {
  const startedAt = new Date().toISOString();
  try {
    const payload = await request.json();
    const planEnvelope = payload?.plan;
    const approval = payload?.approval;
    validateApproval(planEnvelope, approval);
    const plan = planEnvelope?.plan || {};
    if (plan.installationMode !== "published-main-liquid-visible-text-v1") throw httpError(409, "liquid_text_mode_invalid", "The approved Liquid text fallback mode is missing.");
    const templatePatch = plan.templatePatch;
    const liquidTextPatches = Array.isArray(plan.liquidTextPatches) ? plan.liquidTextPatches : [];
    if (!templatePatch || templatePatch.filename !== TEMPLATE_FILE || !liquidTextPatches.length) throw httpError(409, "liquid_text_package_missing", "The approved homepage Liquid text package is missing.");
    if (liquidTextPatches.some(patch => patch.beforeSignature !== patch.afterSignature || patch.nodeDistributionPreserved !== true || !Array.isArray(patch.replacements) || !patch.replacements.length)) {
      throw httpError(409, "liquid_text_preservation_proof_missing", "The approved package does not prove markup and text-node preservation.");
    }

    const filenames = [TEMPLATE_FILE, ...liquidTextPatches.map(patch => patch.filename)];
    const stagingInspection = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD, filenames);
    const evidence = stagingInspection?.evidence || {};
    validateBoundary(evidence.stagingTheme, evidence.mainTheme);
    if (approval?.targetThemeID !== evidence.stagingTheme.gid || plan?.targetTheme?.gid !== evidence.stagingTheme.gid) throw httpError(409, "staging_theme_changed", "The approved staging target no longer matches Kairos Staging.");

    const mainInspection = await inspectThemeFiles(env, evidence.mainTheme.gid, filenames);
    const stagingFiles = new Map((evidence.files || []).map(file => [file.filename, file]));
    const mainFiles = new Map((mainInspection.files || []).map(file => [file.filename, file]));

    for (const filename of filenames) {
      const mainFile = mainFiles.get(filename);
      const stagingFile = stagingFiles.get(filename);
      const expectedMain = plan.sourceHashes?.[`published:${filename}`];
      const expectedStaging = plan.sourceHashes?.[`staging:${filename}`];
      if (!mainFile?.content || !stagingFile?.content || !expectedMain || !expectedStaging) throw httpError(409, "homepage_source_hashes_missing", `The approved source evidence is missing for ${filename}.`);
      if (mainFile.sha256 !== expectedMain || stagingFile.sha256 !== expectedStaging || approval?.sourceHashes?.[`published:${filename}`] !== expectedMain || approval?.sourceHashes?.[`staging:${filename}`] !== expectedStaging) {
        throw httpError(409, "homepage_source_changed", `${filename} changed after approval. Build a new preview.`);
      }
    }

    if (mainFiles.get(TEMPLATE_FILE).content !== templatePatch.publishedSource) throw httpError(409, "published_template_changed", "The published homepage template changed after approval.");
    for (const patch of liquidTextPatches) {
      const mainFile = mainFiles.get(patch.filename);
      if (mainFile.content !== patch.publishedSource) throw httpError(409, "published_liquid_changed", `${patch.filename} changed after approval.`);
      if (markupSignature(mainFile.content) !== patch.beforeSignature || markupSignature(patch.candidateSource) !== patch.afterSignature || patch.beforeSignature !== patch.afterSignature) {
        throw httpError(409, "liquid_markup_signature_mismatch", `The approved candidate no longer preserves ${patch.filename}.`);
      }
    }

    const writes = [
      { filename: TEMPLATE_FILE, content: templatePatch.publishedSource },
      ...liquidTextPatches.map(patch => ({ filename: patch.filename, content: patch.candidateSource })),
    ];
    const originalStaging = writes.map(file => ({
      filename: file.filename,
      existed: true,
      sha256: stagingFiles.get(file.filename).sha256,
      content: stagingFiles.get(file.filename).content,
    }));
    const write = await writeThemeFiles(env, evidence.stagingTheme.gid, writes);

    const verifyStaging = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD, filenames);
    const verifyMain = await inspectThemeFiles(env, evidence.mainTheme.gid, filenames);
    const readBackStaging = new Map((verifyStaging?.evidence?.files || []).map(file => [file.filename, file]));
    const readBackMain = new Map((verifyMain.files || []).map(file => [file.filename, file]));

    for (const expected of writes) {
      const actual = readBackStaging.get(expected.filename);
      if (!actual?.content || actual.content !== expected.content || actual.sha256 !== await hashText(expected.content)) throw httpError(502, "homepage_liquid_readback_mismatch", `Kairos Staging did not persist the exact approved ${expected.filename}.`);
    }
    for (const filename of filenames) {
      const before = mainFiles.get(filename);
      const after = readBackMain.get(filename);
      if (!after?.content || after.content !== before.content || after.sha256 !== before.sha256) throw httpError(502, "published_main_theme_changed", `The published MAIN file changed during staging execution: ${filename}.`);
    }
    for (const patch of liquidTextPatches) {
      if (markupSignature(readBackStaging.get(patch.filename).content) !== patch.beforeSignature) throw httpError(502, "liquid_readback_structure_mismatch", `${patch.filename} changed markup or Liquid during read-back.`);
    }

    const completedAt = new Date().toISOString();
    const replacementCount = liquidTextPatches.reduce((sum, patch) => sum + patch.replacements.length, 0);
    const result = {
      actionID: crypto.randomUUID(),
      actionType: "shopify.staging.execute",
      status: "completed",
      build: KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD,
      kernel: "published-homepage-liquid-visible-text-executor-v1",
      completedAt,
      summary: `Kairos copied the published homepage framework into staging, replaced ${replacementCount} verified visible text group${replacementCount === 1 ? "" : "s"}, and preserved every markup and design token.`,
      objective: planEnvelope.objective,
      execution: {
        operation: "themeFilesUpsert",
        engine: "published-homepage-liquid-visible-text-executor-v1",
        sourceTheme: evidence.mainTheme,
        targetTheme: evidence.stagingTheme,
        publishedTheme: evidence.mainTheme,
        publishedThemeChanged: false,
        productionPublishAuthorized: false,
        filesWritten: writes.map(file => ({
          filename: file.filename,
          beforeSha256: stagingFiles.get(file.filename).sha256,
          afterSha256: readBackStaging.get(file.filename).sha256,
        })),
        templateCopiedFromPublished: true,
        templateTextOnly: false,
        liquidTextOnly: true,
        publishedFrameworkPreserved: true,
        structurePreserved: true,
        nodeDistributionPreserved: true,
        stylesheetsWritten: [],
        assetsWritten: [],
        classesChanged: false,
        designTokensChanged: false,
      },
      verification: writes.map(file => ({
        filename: file.filename,
        expectedSha256: null,
        actualSha256: readBackStaging.get(file.filename).sha256,
        matched: true,
        sourceOfTruth: "published-main-theme",
        frameworkPreserved: true,
      })),
      evidence: {
        credentialPath: write?.credentialPath || "direct-shopify-graphql",
        mutationResult: write?.mutationResult || null,
        sourceOfTruth: "published-main-theme",
        visibleTextReplacementCount: replacementCount,
        literalLiquidTextOnly: true,
        nodeDistributionPreserved: true,
        publishedFrameworkPreserved: true,
        liquidFiles: liquidTextPatches.map(patch => patch.filename),
      },
      rollback: {
        required: false,
        authorized: false,
        targetThemeID: evidence.stagingTheme.gid,
        files: originalStaging,
        instruction: "Rollback restores the exact pre-execution Kairos Staging template and Liquid section files. The published MAIN theme was never modified.",
      },
    };

    return completeJob(request, result, result.summary, startedAt, "execute");
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return json({
      status: "needs-attention",
      build: KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD,
      summary: "Kairos could not complete the node-preserving homepage Liquid text staging execution.",
      error: {
        status,
        code: error?.code || "homepage_liquid_text_execution_failed",
        message: error instanceof Error ? error.message : "Homepage Liquid text execution failed.",
      },
    }, status);
  }
}

function activeHomepageSectionFilenames(document) {
  const order = Array.isArray(document?.order) ? document.order : [];
  const types = [];
  for (const sectionId of order) {
    const section = document?.sections?.[sectionId];
    if (!section || section.disabled === true) continue;
    const type = String(section.type || "").trim();
    if (!/^[a-z0-9_-]+$/i.test(type)) continue;
    if (!types.includes(type)) types.push(type);
  }
  return types.map(type => `sections/${type}.liquid`).slice(0, 40);
}

function isHomepageSpecificSection(filename, source) {
  if (HOMEPAGE_SECTION_HINT.test(filename)) return true;
  const schema = String(source || "").match(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/i)?.[1] || "";
  return HOMEPAGE_SECTION_HINT.test(schema);
}

function normalizeReplacements(value, inventory) {
  if (!Array.isArray(value)) return [];
  const byId = new Map(inventory.map(item => [item.id, item]));
  const used = new Set();
  const normalized = [];
  for (const item of value) {
    const id = String(item?.id || "").trim();
    const before = String(item?.before ?? "");
    const after = String(item?.after ?? "").trim();
    const source = byId.get(id);
    if (!source || used.has(id) || before !== source.text || !after || after === before || after.length > 1200) continue;
    if (/[<>]|{{|{%|%}|}}/.test(after)) continue;
    used.add(id);
    normalized.push({
      id,
      filename: source.filename,
      before,
      after,
      reason: String(item?.reason || "").replace(/\s+/g, " ").trim().slice(0, 300),
      primary: source.primary,
    });
  }
  return normalized.slice(0, 80);
}

function tokenize(source) {
  return String(source || "").split(/({{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>)/g);
}

function buildGroups(tokens, filename) {
  const groups = [];
  let current = [];
  let blockedTagDepth = 0;
  let schemaDepth = 0;
  let ordinal = 0;
  const flush = () => {
    const textIndexes = current.filter(index => isVisibleText(tokens[index]));
    const text = textIndexes.map(index => decodeEntities(tokens[index])).join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      const markup = current.map(index => tokens[index]).filter(token => String(token).startsWith("<")).join(" ");
      groups.push({
        id: `${filename}#${ordinal++}`,
        filename,
        text,
        textIndexes,
        primary: /<\s*h[1-3]\b/i.test(markup) || /<\s*p\b/i.test(markup),
      });
    }
    current = [];
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token.startsWith("{%")) {
      if (/{%\s*schema\s*%}/i.test(token)) { flush(); schemaDepth += 1; continue; }
      if (/{%\s*endschema\s*%}/i.test(token)) { schemaDepth = Math.max(0, schemaDepth - 1); continue; }
      if (schemaDepth === 0 && blockedTagDepth === 0) current.push(index);
      continue;
    }
    if (schemaDepth > 0) continue;
    if (token.startsWith("{{")) {
      if (blockedTagDepth === 0) current.push(index);
      continue;
    }
    if (token.startsWith("<")) {
      const close = token.match(/^<\s*\/\s*([a-z0-9:-]+)/i);
      const open = token.match(/^<\s*([a-z0-9:-]+)/i);
      const tag = String(close?.[1] || open?.[1] || "").toLowerCase();
      if (close && BLOCKED_TAGS.has(tag)) blockedTagDepth = Math.max(0, blockedTagDepth - 1);
      if (blockedTagDepth === 0 && BLOCK_TAGS.has(tag)) flush();
      if (blockedTagDepth === 0) current.push(index);
      if (open && !close && !/\/\s*>$/.test(token) && BLOCKED_TAGS.has(tag)) blockedTagDepth += 1;
      if (blockedTagDepth === 0 && close && BLOCK_TAGS.has(tag)) flush();
      continue;
    }
    if (blockedTagDepth === 0) current.push(index);
  }
  flush();
  return groups;
}

function isVisibleText(token) {
  const value = String(token || "");
  return Boolean(value.trim()) && !value.startsWith("<") && !value.startsWith("{{") && !value.startsWith("{% ");
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

function markupSignature(source) {
  return (String(source || "").match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>/g) || []).join("\u001f");
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

function validateApproval(planEnvelope, approval) {
  if (!planEnvelope?.planID || approval?.status !== "approved" || approval?.planID !== planEnvelope.planID) throw httpError(403, "approval_required", "Approve the exact homepage text proposal before building the preview.");
  if (!approval?.targetThemeID || !approval?.sourceHashes) throw httpError(409, "approval_evidence_missing", "The approved staging target and source hashes are required.");
}

function validateBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The live MAIN theme could not be verified.");
}

function fileByName(files, filename) {
  return (Array.isArray(files) ? files : []).find(file => file?.filename === filename) || null;
}

function completeJob(request, result, summary, submittedAt, phase) {
  const completedAt = result.completedAt || new Date().toISOString();
  const jobID = crypto.randomUUID();
  const completed = { jobID, status: "completed", build: KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD, submittedAt, updatedAt: completedAt, completedAt, summary, result };
  return caches.default.put(jobRequest(request, jobID), new Response(JSON.stringify(completed), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-MMG-Runtime": KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD },
  })).then(() => json({ jobID, status: "completed", build: KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD, pollURL: `/api/shopify/staging/${phase}/jobs/${jobID}`, summary, result }, 202));
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
      "X-MMG-Runtime": KAIROS_HOMEPAGE_LIQUID_TEXT_FALLBACK_BUILD,
      "X-Kairos-Homepage-Liquid-Fallback": "node-preserving-literal-text",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
