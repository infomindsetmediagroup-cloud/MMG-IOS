import {
  hashText,
  httpError,
  inspectStagingSource,
  inspectThemeFiles,
  parseShopifyJson,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";
import { parseStrictJSON, runKairosIntelligence } from "./kairos-intelligence-v1.js";

export const KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD = "kairos-homepage-instance-liquid-fallback-20260717-1";

const PLAN_ROUTE = "/api/shopify/staging/plan/jobs";
const EXECUTE_ROUTE = "/api/shopify/staging/execute/jobs";
const TEMPLATE_FILE = "templates/index.json";
const MISSING = "__KAIROS_THEME_FILE_MISSING__";
const BLOCK_TAGS = new Set(["address", "article", "aside", "blockquote", "button", "div", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "li", "main", "nav", "p", "section", "td", "th"]);
const BLOCKED_TAGS = new Set(["script", "style", "svg", "template", "noscript", "code", "pre"]);

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === PLAN_ROUTE) return createPlan(request, env);
    if (request.method === "POST" && path === EXECUTE_ROUTE) return executePlan(request, env);
    return json({ status: "not-found", build: KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD }, 404);
  },
};

async function createPlan(request, env) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 3) throw httpError(400, "objective_required", "Tell Kairos what you want changed on the homepage.");
    if (objective.length > 12000) throw httpError(413, "objective_too_long", "Homepage objective exceeds 12,000 characters.");

    const stagingInspection = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, [TEMPLATE_FILE]);
    const stagingEvidence = stagingInspection?.evidence || {};
    validateThemeBoundary(stagingEvidence.stagingTheme, stagingEvidence.mainTheme);

    const mainTemplateRead = await inspectThemeFiles(env, stagingEvidence.mainTheme.gid, [TEMPLATE_FILE]);
    const mainTemplate = findFile(mainTemplateRead.files, TEMPLATE_FILE);
    const stagingTemplate = findFile(stagingEvidence.files, TEMPLATE_FILE);
    if (!mainTemplate?.content || !stagingTemplate?.content) throw httpError(409, "homepage_template_unavailable", "Kairos could not read the published and staging homepage templates.");

    const publishedDocument = parseShopifyJson(mainTemplate.content, "Published MAIN homepage");
    const instances = activeInstances(publishedDocument);
    if (!instances.length) throw httpError(409, "homepage_section_instances_missing", "The published homepage exposes no active section instances.");

    const sourceNames = [...new Set(instances.map(item => item.sourceFilename))];
    const sourceRead = await inspectThemeFiles(env, stagingEvidence.mainTheme.gid, sourceNames);
    const sources = new Map((sourceRead.files || []).map(file => [file.filename, file]));
    const inventory = [];
    for (const instance of instances) {
      const file = sources.get(instance.sourceFilename);
      if (!file?.content) continue;
      for (const group of extractTextGroups(file.content)) {
        if (group.text.length < 2 || group.text.length > 1200) continue;
        inventory.push({
          id: `${instance.sectionId}::${group.ordinal}`,
          sectionId: instance.sectionId,
          sourceType: instance.sourceType,
          sourceFilename: instance.sourceFilename,
          text: group.text,
          primary: group.primary,
        });
      }
    }
    if (!inventory.length) throw httpError(409, "homepage_instance_visible_text_missing", "The published homepage sections expose no safe literal customer-facing text nodes.");

    const generated = await runKairosIntelligence(env, {
      purpose: "published-homepage-instance-liquid-visible-text-plan",
      temperature: 0.1,
      maxTokens: 4096,
      seed: 1914,
      system: [
        "You are Kairos, the governed MMG homepage copy editor.",
        "Return strict JSON only.",
        "Use only the supplied visible-text groups from active published homepage section instances.",
        "Change only literal customer-facing words. HTML, Liquid, classes, attributes, URLs, assets, styles, settings, blocks, order, and responsive behavior are immutable.",
        "Every replacement must copy id and before exactly from the inventory.",
        "Do not invent testimonials, metrics, awards, prices, guarantees, or unsupported claims.",
        "Return at least one meaningful heading or paragraph change.",
        "Schema: {\"summary\":\"...\",\"replacements\":[{\"id\":\"exact\",\"before\":\"exact\",\"after\":\"new literal text\",\"reason\":\"brief\"}]}",
      ].join("\n"),
      user: JSON.stringify({
        objective,
        sourceOfTruth: "published-main-theme",
        isolationContract: "Every edited shared section is cloned and bound only to its homepage section instance.",
        immutableContract: {
          originalSharedSectionFiles: true,
          markupAndLiquidTokens: true,
          classesAttributesLinksAndURLs: true,
          settingsBlocksAndOrder: true,
          CSSAssetsColorsTypographySpacingLayoutAnimationResponsiveBehavior: true,
          liveMainThemeDuringPreview: true,
        },
        visibleTextInventory: inventory.slice(0, 260),
      }),
    });

    const proposal = parseStrictJSON(generated.text);
    const replacements = normalizeReplacements(proposal?.replacements, inventory);
    if (!replacements.length) throw httpError(409, "safe_instance_text_changes_missing", "Kairos produced no source-bound homepage text changes.");
    if (!replacements.some(item => item.primary)) throw httpError(409, "primary_homepage_copy_delta_missing", "Kairos must change at least one visible heading or paragraph before reporting success.");

    const candidateDocument = structuredClone(publishedDocument);
    const bySection = groupBy(replacements, item => item.sectionId);
    const instancePatches = [];
    for (const [sectionId, requested] of bySection) {
      const instance = instances.find(item => item.sectionId === sectionId);
      const source = instance ? sources.get(instance.sourceFilename) : null;
      if (!instance || !source?.content) continue;
      const tokens = tokenize(source.content);
      const groups = new Map(buildGroups(tokens).map(group => [group.ordinal, group]));
      const applied = [];
      for (const replacement of requested) {
        const group = groups.get(replacement.ordinal);
        if (!group || group.text !== replacement.before) continue;
        replaceGroupText(tokens, group, replacement.after);
        applied.push({ ...replacement, nodeDistributionPreserved: true });
      }
      if (!applied.length) continue;
      const cloneType = cloneTypeFor(sectionId, instance.sourceType);
      const candidateSource = tokens.join("");
      const signature = markupSignature(source.content);
      if (markupSignature(candidateSource) !== signature) throw httpError(409, "instance_liquid_markup_signature_mismatch", `The proposed wording altered markup or Liquid for homepage section ${sectionId}.`);
      candidateDocument.sections[sectionId].type = cloneType;
      instancePatches.push({
        sectionId,
        sourceType: instance.sourceType,
        sourceFilename: instance.sourceFilename,
        cloneType,
        cloneFilename: `sections/${cloneType}.liquid`,
        publishedSource: source.content,
        publishedSourceSha256: source.sha256,
        candidateSource,
        expectedCandidateSha256: await hashText(candidateSource),
        beforeSignature: signature,
        afterSignature: signature,
        replacements: applied,
        originalSharedSourceChanged: false,
        homepageInstanceIsolated: true,
        nodeDistributionPreserved: true,
      });
    }
    if (!instancePatches.length) throw httpError(409, "homepage_instance_patch_empty", "Kairos could not bind the requested words to an active homepage section instance.");

    validateTemplateIsolation(publishedDocument, candidateDocument, instancePatches);
    const candidateTemplate = serializeShopifyJson(mainTemplate.content, candidateDocument);
    const cloneNames = instancePatches.map(patch => patch.cloneFilename);
    const stagingCloneRead = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, [TEMPLATE_FILE, ...cloneNames]);
    const stagingFiles = new Map((stagingCloneRead?.evidence?.files || []).map(file => [file.filename, file]));
    const sourceHashes = {
      [`published:${TEMPLATE_FILE}`]: mainTemplate.sha256,
      [`staging:${TEMPLATE_FILE}`]: stagingTemplate.sha256,
    };
    for (const patch of instancePatches) {
      sourceHashes[`published:${patch.sourceFilename}`] = patch.publishedSourceSha256;
      sourceHashes[`staging:${patch.cloneFilename}`] = stagingFiles.get(patch.cloneFilename)?.sha256 || MISSING;
    }

    const count = instancePatches.reduce((sum, patch) => sum + patch.replacements.length, 0);
    const now = new Date().toISOString();
    const summary = String(proposal?.summary || `Kairos prepared ${count} visible homepage text replacement${count === 1 ? "" : "s"} in homepage-only section clones.`).trim();
    const result = {
      actionID: crypto.randomUUID(),
      planID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      requestType: "homepage-preserve-design",
      homepageMode: "preserve-published-framework",
      status: "ready-for-approval",
      readOnly: true,
      build: KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD,
      kernel: "published-homepage-instance-liquid-text-plan-v1",
      startedAt: now,
      completedAt: now,
      objective,
      summary,
      plan: {
        summary,
        strategy: "Clone each edited shared section for the homepage only, rewrite literal words in the clone, and leave the original shared source untouched.",
        changes: instancePatches.flatMap(patch => patch.replacements.map(item => ({ filename: patch.cloneFilename, changeType: "homepage-instance-text-isolation", purpose: `Replace “${item.before}” with approved homepage copy.`, expectedOutcome: item.reason || "Visible homepage wording changes without affecting another page." }))),
        risks: ["Longer wording may wrap differently inside the unchanged responsive design."],
        acceptanceCriteria: [
          "The published MAIN homepage is the source of truth.",
          "The original shared section files remain byte-for-byte unchanged.",
          "Only templates/index.json and deterministic homepage-only section clones may be written to staging.",
          "Only selected homepage section instance type references may change.",
          "Settings, blocks, order, classes, attributes, links, Liquid tokens, CSS, assets, design tokens, and responsive behavior remain unchanged.",
          "The live MAIN theme remains unchanged during preview construction.",
        ],
        rollbackPlan: ["Restore the exact pre-execution staging homepage template and any pre-existing clone source."],
        installationMode: "published-main-homepage-instance-liquid-text-v1",
        templatePatch: {
          filename: TEMPLATE_FILE,
          publishedSource: mainTemplate.content,
          stagingBeforeSource: stagingTemplate.content,
          candidateSource: candidateTemplate,
          publishedSha256: mainTemplate.sha256,
          stagingBeforeSha256: stagingTemplate.sha256,
          expectedCandidateSha256: await hashText(candidateTemplate),
        },
        instancePatches,
        canonicalPackage: null,
        targetTheme: stagingEvidence.stagingTheme,
        publishedTheme: stagingEvidence.mainTheme,
        sourceTheme: stagingEvidence.mainTheme,
        sourceHashes,
        mutationScope: "homepage-instance-isolated-liquid-literal-text-only",
        executable: true,
        preserveExistingDesign: true,
        preservePublishedFramework: true,
        homepageInstanceIsolation: true,
        originalSharedSectionsImmutable: true,
        literalLiquidTextOnly: true,
        structuralMutationAuthorized: false,
        styleMutationAuthorized: false,
        assetMutationAuthorized: false,
        liquidStructureMutationAuthorized: false,
        productionPublishAuthorized: false,
        liveThemeMutationAuthorized: false,
      },
      evidence: {
        sourceOfTruth: "published-main-theme",
        planningEngine: KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD,
        intelligenceRuntime: generated.runtime,
        intelligenceModel: generated.model,
        privacy: generated.privacy,
        modelReasoningStored: false,
        publishedFrameworkPreserved: true,
        homepageInstancesIsolated: instancePatches.length,
        originalSharedFilesChanged: 0,
        literalLiquidTextOnly: true,
        replacementCount: count,
        cloneFiles: cloneNames,
        stylesheetsChanged: 0,
        assetsChanged: 0,
      },
    };
    return completedJob(result, 202);
  } catch (error) {
    return failedJob(error, "Kairos could not prepare the homepage-instance text update.", "homepage_instance_text_plan_failed");
  }
}

async function executePlan(request, env) {
  try {
    const payload = await request.json();
    const envelope = payload?.plan;
    const approval = payload?.approval;
    validateApproval(envelope, approval);
    const plan = envelope?.plan || {};
    if (plan.installationMode !== "published-main-homepage-instance-liquid-text-v1") throw httpError(409, "homepage_instance_mode_invalid", "The approved homepage-instance text mode is missing.");
    const templatePatch = plan.templatePatch;
    const patches = Array.isArray(plan.instancePatches) ? plan.instancePatches : [];
    if (!templatePatch || templatePatch.filename !== TEMPLATE_FILE || !patches.length) throw httpError(409, "homepage_instance_package_missing", "The approved homepage-instance package is missing.");
    if (patches.some(patch => patch.beforeSignature !== patch.afterSignature || patch.homepageInstanceIsolated !== true || patch.nodeDistributionPreserved !== true || !patch.replacements?.length)) throw httpError(409, "homepage_instance_preservation_proof_missing", "The approved package lacks instance-isolation proof.");

    const cloneNames = patches.map(patch => patch.cloneFilename);
    const stagingRead = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, [TEMPLATE_FILE, ...cloneNames]);
    const evidence = stagingRead?.evidence || {};
    validateThemeBoundary(evidence.stagingTheme, evidence.mainTheme);
    if (approval?.targetThemeID !== evidence.stagingTheme.gid || plan?.targetTheme?.gid !== evidence.stagingTheme.gid) throw httpError(409, "staging_theme_changed", "The approved staging target no longer matches Kairos Staging.");

    const sourceNames = [...new Set(patches.map(patch => patch.sourceFilename))];
    const mainRead = await inspectThemeFiles(env, evidence.mainTheme.gid, [TEMPLATE_FILE, ...sourceNames]);
    const mainFiles = new Map((mainRead.files || []).map(file => [file.filename, file]));
    const stagingFiles = new Map((stagingRead?.evidence?.files || []).map(file => [file.filename, file]));
    const mainTemplate = mainFiles.get(TEMPLATE_FILE);
    const stagingTemplate = stagingFiles.get(TEMPLATE_FILE);
    if (!mainTemplate?.content || !stagingTemplate?.content) throw httpError(409, "homepage_instance_sources_missing", "The approved homepage sources are unavailable.");
    assertHash(plan, approval, `published:${TEMPLATE_FILE}`, mainTemplate.sha256);
    assertHash(plan, approval, `staging:${TEMPLATE_FILE}`, stagingTemplate.sha256);
    if (mainTemplate.content !== templatePatch.publishedSource) throw httpError(409, "published_template_changed", "The published homepage template changed after approval.");

    for (const patch of patches) {
      const source = mainFiles.get(patch.sourceFilename);
      if (!source?.content || source.content !== patch.publishedSource || source.sha256 !== patch.publishedSourceSha256) throw httpError(409, "published_shared_section_changed", `${patch.sourceFilename} changed after approval.`);
      assertHash(plan, approval, `published:${patch.sourceFilename}`, source.sha256);
      assertHash(plan, approval, `staging:${patch.cloneFilename}`, stagingFiles.get(patch.cloneFilename)?.sha256 || MISSING);
      if (markupSignature(source.content) !== patch.beforeSignature || markupSignature(patch.candidateSource) !== patch.afterSignature) throw httpError(409, "homepage_instance_markup_changed", `${patch.cloneFilename} no longer preserves the original markup.`);
    }

    const writes = [...patches.map(patch => ({ filename: patch.cloneFilename, content: patch.candidateSource })), { filename: TEMPLATE_FILE, content: templatePatch.candidateSource }];
    const rollbackFiles = [
      { filename: TEMPLATE_FILE, existed: true, sha256: stagingTemplate.sha256, content: stagingTemplate.content },
      ...patches.map(patch => ({ filename: patch.cloneFilename, existed: Boolean(stagingFiles.get(patch.cloneFilename)), sha256: stagingFiles.get(patch.cloneFilename)?.sha256 || null, content: stagingFiles.get(patch.cloneFilename)?.content ?? null })),
    ];
    const write = await writeThemeFiles(env, evidence.stagingTheme.gid, writes);
    const readBack = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, [TEMPLATE_FILE, ...cloneNames]);
    const readBackFiles = new Map((readBack?.evidence?.files || []).map(file => [file.filename, file]));
    for (const expected of writes) {
      const actual = readBackFiles.get(expected.filename);
      if (!actual?.content || actual.content !== expected.content || actual.sha256 !== await hashText(expected.content)) throw httpError(502, "homepage_instance_readback_mismatch", `Kairos Staging did not persist the exact approved ${expected.filename}.`);
    }
    for (const patch of patches) if (markupSignature(readBackFiles.get(patch.cloneFilename).content) !== patch.beforeSignature) throw httpError(502, "homepage_instance_structure_mismatch", `${patch.cloneFilename} changed markup during read-back.`);

    const mainAfterRead = await inspectThemeFiles(env, evidence.mainTheme.gid, [TEMPLATE_FILE, ...sourceNames]);
    const mainAfter = new Map((mainAfterRead.files || []).map(file => [file.filename, file]));
    for (const [filename, before] of mainFiles) {
      const after = mainAfter.get(filename);
      if (!after?.content || after.content !== before.content || after.sha256 !== before.sha256) throw httpError(502, "published_main_theme_changed", `The published MAIN file changed during staging execution: ${filename}.`);
    }

    const count = patches.reduce((sum, patch) => sum + patch.replacements.length, 0);
    const result = {
      actionID: crypto.randomUUID(),
      actionType: "shopify.staging.execute",
      status: "completed",
      build: KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD,
      kernel: "published-homepage-instance-liquid-text-executor-v1",
      completedAt: new Date().toISOString(),
      objective: envelope.objective,
      summary: `Kairos isolated ${patches.length} homepage section instance${patches.length === 1 ? "" : "s"}, replaced ${count} visible text group${count === 1 ? "" : "s"}, and left every original shared section untouched.`,
      execution: {
        operation: "themeFilesUpsert",
        engine: "published-homepage-instance-liquid-text-executor-v1",
        sourceTheme: evidence.mainTheme,
        targetTheme: evidence.stagingTheme,
        publishedTheme: evidence.mainTheme,
        publishedThemeChanged: false,
        filesWritten: writes.map(file => ({ filename: file.filename, beforeSha256: stagingFiles.get(file.filename)?.sha256 || null, afterSha256: readBackFiles.get(file.filename).sha256 })),
        templateCopiedFromPublished: true,
        homepageInstanceIsolation: true,
        originalSharedSectionsChanged: false,
        liquidTextOnly: true,
        publishedFrameworkPreserved: true,
        structurePreserved: true,
        nodeDistributionPreserved: true,
        stylesheetsWritten: [],
        assetsWritten: [],
        classesChanged: false,
        designTokensChanged: false,
      },
      verification: writes.map(file => ({ filename: file.filename, actualSha256: readBackFiles.get(file.filename).sha256, matched: true, sourceOfTruth: "published-main-theme", frameworkPreserved: true })),
      evidence: {
        credentialPath: write?.credentialPath || "direct-shopify-graphql",
        mutationResult: write?.mutationResult || null,
        sourceOfTruth: "published-main-theme",
        visibleTextReplacementCount: count,
        homepageInstancesIsolated: patches.length,
        originalSharedFilesChanged: 0,
        literalLiquidTextOnly: true,
        nodeDistributionPreserved: true,
        publishedFrameworkPreserved: true,
        cloneFiles: cloneNames,
      },
      rollback: {
        required: false,
        authorized: false,
        targetThemeID: evidence.stagingTheme.gid,
        files: rollbackFiles,
        instruction: "Rollback restores the prior staging homepage template and any pre-existing clone files. Newly created clones become unreferenced when the template is restored.",
      },
    };
    return completedJob(result, 202);
  } catch (error) {
    return failedJob(error, "Kairos could not complete the homepage-instance staging update.", "homepage_instance_text_execution_failed");
  }
}

function activeInstances(document) {
  const result = [];
  for (const sectionId of Array.isArray(document?.order) ? document.order : []) {
    const section = document?.sections?.[sectionId];
    const sourceType = String(section?.type || "").trim();
    if (!section || section.disabled === true || !/^[a-z0-9_-]+$/i.test(sourceType)) continue;
    result.push({ sectionId, sourceType, sourceFilename: `sections/${sourceType}.liquid` });
  }
  return result;
}

function normalizeReplacements(value, inventory) {
  if (!Array.isArray(value)) return [];
  const byId = new Map(inventory.map(item => [item.id, item]));
  const used = new Set();
  const result = [];
  for (const item of value) {
    const id = String(item?.id || "").trim();
    const source = byId.get(id);
    const before = String(item?.before ?? "");
    const after = String(item?.after ?? "").trim();
    const ordinal = Number(id.split("::").pop());
    if (!source || used.has(id) || !Number.isInteger(ordinal) || before !== source.text || !after || after === before || after.length > 1200 || /[<>]|{{|{%|%}|}}/.test(after)) continue;
    used.add(id);
    result.push({ id, ordinal, sectionId: source.sectionId, sourceType: source.sourceType, sourceFilename: source.sourceFilename, before, after, reason: clean(item?.reason).slice(0, 300), primary: source.primary });
  }
  return result.slice(0, 100);
}

function extractTextGroups(source) { return buildGroups(tokenize(source)); }
function tokenize(source) { return String(source || "").split(/({{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>)/g); }

function buildGroups(tokens) {
  const groups = [];
  let current = [];
  let blocked = 0;
  let schema = 0;
  let ordinal = 0;
  const flush = () => {
    const textIndexes = current.filter(index => isLiteralText(tokens[index]));
    const text = textIndexes.map(index => decodeEntities(tokens[index])).join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      const markup = current.map(index => tokens[index]).filter(token => String(token).startsWith("<")).join(" ");
      groups.push({ ordinal: ordinal++, text, textIndexes, primary: /<\s*h[1-3]\b/i.test(markup) || /<\s*p\b/i.test(markup) });
    }
    current = [];
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token.startsWith("{%")) {
      if (/{%\s*schema\s*%}/i.test(token)) { flush(); schema += 1; continue; }
      if (/{%\s*endschema\s*%}/i.test(token)) { schema = Math.max(0, schema - 1); continue; }
      if (!schema && !blocked) current.push(index);
      continue;
    }
    if (schema) continue;
    if (token.startsWith("{{")) { if (!blocked) current.push(index); continue; }
    if (token.startsWith("<")) {
      const close = token.match(/^<\s*\/\s*([a-z0-9:-]+)/i);
      const open = token.match(/^<\s*([a-z0-9:-]+)/i);
      const tag = String(close?.[1] || open?.[1] || "").toLowerCase();
      if (close && BLOCKED_TAGS.has(tag)) blocked = Math.max(0, blocked - 1);
      if (!blocked && BLOCK_TAGS.has(tag)) flush();
      if (!blocked) current.push(index);
      if (open && !close && !/\/\s*>$/.test(token) && BLOCKED_TAGS.has(tag)) blocked += 1;
      if (!blocked && close && BLOCK_TAGS.has(tag)) flush();
      continue;
    }
    if (!blocked) current.push(index);
  }
  flush();
  return groups;
}

function isLiteralText(token) {
  const value = String(token || "");
  return Boolean(value.trim()) && !value.startsWith("<") && !value.startsWith("{{") && !value.startsWith("{%");
}

function replaceGroupText(tokens, group, replacement) {
  const originals = group.textIndexes.map(index => tokens[index]);
  const weights = originals.map(value => Math.max(1, decodeEntities(value).trim().split(/\s+/).filter(Boolean).length));
  const parts = distributeWords(replacement, weights);
  group.textIndexes.forEach((tokenIndex, index) => {
    const original = originals[index];
    tokens[tokenIndex] = `${original.match(/^\s*/)?.[0] || ""}${parts[index] || ""}${original.match(/\s*$/)?.[0] || ""}`;
  });
}

function distributeWords(replacement, weights) {
  if (weights.length <= 1) return [replacement];
  const words = replacement.split(/\s+/).filter(Boolean);
  if (words.length < weights.length) return weights.map((_, index) => index === 0 ? replacement : "");
  const total = weights.reduce((sum, value) => sum + value, 0) || weights.length;
  const counts = weights.map(weight => Math.max(1, Math.floor(words.length * weight / total)));
  let assigned = counts.reduce((sum, value) => sum + value, 0);
  while (assigned > words.length) {
    let changed = false;
    for (let index = counts.length - 1; index >= 0 && assigned > words.length; index -= 1) if (counts[index] > 1) { counts[index] -= 1; assigned -= 1; changed = true; }
    if (!changed) break;
  }
  while (assigned < words.length) { counts[counts.length - 1] += 1; assigned += 1; }
  let cursor = 0;
  return counts.map(count => { const part = words.slice(cursor, cursor + count).join(" "); cursor += count; return part; });
}

function validateTemplateIsolation(original, candidate, patches) {
  const before = structuredClone(original);
  const after = structuredClone(candidate);
  for (const patch of patches) {
    if (after?.sections?.[patch.sectionId]?.type !== patch.cloneType) throw httpError(409, "homepage_instance_type_binding_missing", `Homepage section ${patch.sectionId} was not bound to its clone.`);
    after.sections[patch.sectionId].type = before.sections[patch.sectionId].type;
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) throw httpError(409, "homepage_instance_template_scope_exceeded", "The homepage template changed outside selected section type references.");
}

function cloneTypeFor(sectionId, sourceType) {
  let hash = 0x811c9dc5;
  for (const character of `${sectionId}:${sourceType}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 0x01000193); }
  return `kairos-home-${(hash >>> 0).toString(36).padStart(7, "0").slice(0, 8)}`;
}

function serializeShopifyJson(originalSource, document) {
  const source = String(originalSource || "").replace(/^\uFEFF/, "");
  const trimmed = source.trimStart();
  let prefix = "";
  if (trimmed.startsWith("/*")) {
    const offset = source.length - trimmed.length;
    const end = source.indexOf("*/", offset + 2);
    if (end >= 0) prefix = `${source.slice(0, end + 2)}\n`;
  }
  return `${prefix}${JSON.stringify(document, null, 2)}\n`;
}

function markupSignature(source) { return (String(source || "").match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>/g) || []).join("\u001f"); }
function decodeEntities(value) { return String(value || "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">"); }
function groupBy(items, keyFn) { const map = new Map(); for (const item of items) { const key = keyFn(item); if (!map.has(key)) map.set(key, []); map.get(key).push(item); } return map; }
function findFile(files, filename) { return (Array.isArray(files) ? files : []).find(file => file?.filename === filename) || null; }
function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }

function validateThemeBoundary(staging, main) {
  if (!staging?.gid || String(staging.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  if (!main?.gid || String(main.role || "").toUpperCase() !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The live MAIN theme could not be verified.");
}

function validateApproval(envelope, approval) {
  if (!envelope?.planID || !envelope?.actionID || envelope.status !== "ready-for-approval") throw httpError(409, "homepage_plan_invalid", "The approved homepage plan is invalid.");
  if (approval?.status !== "approved" || approval?.planID !== envelope.planID || approval?.actionID !== envelope.actionID) throw httpError(403, "homepage_plan_not_approved", "This exact homepage plan was not approved for staging execution.");
  if (JSON.stringify(approval?.sourceHashes || {}) !== JSON.stringify(envelope?.plan?.sourceHashes || {})) throw httpError(409, "homepage_approval_hash_mismatch", "The approval does not match the inspected homepage sources.");
}

function assertHash(plan, approval, key, actual) {
  const expected = plan?.sourceHashes?.[key];
  if (!expected || expected !== actual || approval?.sourceHashes?.[key] !== expected) throw httpError(409, "homepage_source_changed", `${key} changed after approval. Build a new preview.`);
}

function completedJob(result, status = 202) {
  return json({ jobID: crypto.randomUUID(), status: "completed", build: KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, summary: result.summary, result }, status);
}

function failedJob(error, summary, fallbackCode) {
  const status = Number.isInteger(error?.status) ? error.status : Number(error?.statusCode || 500);
  return json({ status: "needs-attention", build: KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, summary, error: { status, code: typeof error?.code === "string" ? error.code : fallbackCode, message: error instanceof Error ? error.message : summary } }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, "X-Kairos-Homepage-Instance-Isolation": "shared-section-clone", "X-Content-Type-Options": "nosniff" } });
}
