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
const BLOCK_TAGS = new Set(["address","article","aside","blockquote","button","div","figcaption","figure","footer","form","h1","h2","h3","h4","h5","h6","header","li","main","nav","p","section","td","th"]);
const BLOCKED_TAGS = new Set(["script","style","svg","template","noscript","code","pre"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === PLAN_ROUTE) return plan(request, env);
    if (request.method === "POST" && url.pathname === EXECUTE_ROUTE) return execute(request, env);
    return json({ status: "not-found", build: KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD }, 404);
  },
};

async function plan(request, env) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 3) throw httpError(400, "objective_required", "Tell Kairos what you want changed on the homepage.");
    if (objective.length > 12000) throw httpError(413, "objective_too_long", "Homepage objective exceeds 12,000 characters.");

    const initial = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, [TEMPLATE_FILE]);
    const evidence = initial?.evidence || {};
    validateBoundary(evidence.stagingTheme, evidence.mainTheme);

    const mainTemplateRead = await inspectThemeFiles(env, evidence.mainTheme.gid, [TEMPLATE_FILE]);
    const mainTemplate = fileByName(mainTemplateRead.files, TEMPLATE_FILE);
    const stagingTemplate = fileByName(evidence.files, TEMPLATE_FILE);
    if (!mainTemplate?.content || !stagingTemplate?.content) throw httpError(409, "homepage_template_unavailable", "Kairos could not read the published and staging homepage templates.");

    const publishedDocument = parseShopifyJson(mainTemplate.content, "Published MAIN homepage");
    const activeInstances = activeSectionInstances(publishedDocument);
    if (!activeInstances.length) throw httpError(409, "homepage_section_instances_missing", "The published homepage exposes no active section instances.");

    const sourceFilenames = [...new Set(activeInstances.map(item => item.sourceFilename))];
    const sourceRead = await inspectThemeFiles(env, evidence.mainTheme.gid, sourceFilenames);
    const sourceFiles = new Map((sourceRead.files || []).map(file => [file.filename, file]));
    const inventory = [];
    for (const instance of activeInstances) {
      const source = sourceFiles.get(instance.sourceFilename);
      if (!source?.content) continue;
      for (const group of buildGroups(tokenize(source.content))) {
        if (group.text.length < 2 || group.text.length > 1200) continue;
        inventory.push({
          id: `${instance.sectionId}::${group.ordinal}`,
          sectionId: instance.sectionId,
          sourceType: instance.sourceType,
          sourceFilename: instance.sourceFilename,
          text: group.text,
          primary: group.primary,
          nodeCount: group.textIndexes.length,
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
        "Return strict JSON only, without markdown or commentary.",
        "Use only the supplied visible-text groups from active published homepage section instances.",
        "Change only customer-facing words. HTML, Liquid, classes, attributes, URLs, assets, scripts, styles, settings, blocks, order, and responsive behavior are immutable.",
        "Every replacement must copy id and before exactly from the inventory.",
        "Do not include HTML, Liquid tokens, URLs, testimonials, metrics, awards, prices, guarantees, or unsupported claims.",
        "Return meaningful primary-copy changes for the objective.",
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

    const replacementsBySection = groupBy(replacements, item => item.sectionId);
    const candidateDocument = structuredClone(publishedDocument);
    const instancePatches = [];

    for (const [sectionId, sectionReplacements] of replacementsBySection) {
      const instance = activeInstances.find(item => item.sectionId === sectionId);
      const sourceFile = instance ? sourceFiles.get(instance.sourceFilename) : null;
      if (!instance || !sourceFile?.content) continue;
      const tokens = tokenize(sourceFile.content);
      const groups = new Map(buildGroups(tokens).map(group => [group.ordinal, group]));
      const applied = [];
      for (const replacement of sectionReplacements) {
        const group = groups.get(replacement.ordinal);
        if (!group || group.text !== replacement.before) continue;
        writeGroupPreservingNodes(tokens, group, replacement.after);
        applied.push({ ...replacement, nodeDistributionPreserved: true });
      }
      if (!applied.length) continue;

      const cloneType = homepageCloneType(instance.sectionId, instance.sourceType);
      const cloneFilename = `sections/${cloneType}.liquid`;
      const candidateSource = tokens.join("");
      const beforeSignature = markupSignature(sourceFile.content);
      const afterSignature = markupSignature(candidateSource);
      if (beforeSignature !== afterSignature) throw httpError(409, "instance_liquid_markup_signature_mismatch", `The proposed wording altered markup or Liquid for homepage section ${sectionId}.`);
      candidateDocument.sections[sectionId].type = cloneType;
      instancePatches.push({
        sectionId,
        sourceType: instance.sourceType,
        sourceFilename: instance.sourceFilename,
        cloneType,
        cloneFilename,
        publishedSource: sourceFile.content,
        publishedSourceSha256: sourceFile.sha256,
        candidateSource,
        expectedCandidateSha256: await hashText(candidateSource),
        beforeSignature,
        afterSignature,
        replacements: applied,
        originalSharedSourceChanged: false,
        homepageInstanceIsolated: true,
        nodeDistributionPreserved: true,
      });
    }
    if (!instancePatches.length) throw httpError(409, "homepage_instance_patch_empty", "Kairos could not bind the requested words to an active homepage section instance.");

    validateInstanceTemplateMutation(publishedDocument, candidateDocument, instancePatches);
    const candidateTemplateSource = serializeShopifyJson(mainTemplate.content, candidateDocument);
    const cloneFilenames = instancePatches.map(patch => patch.cloneFilename);
    const stagingRead = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, [TEMPLATE_FILE, ...cloneFilenames]);
    const stagingFiles = new Map((stagingRead?.evidence?.files || []).map(file => [file.filename, file]));

    const sourceHashes = {
      [`published:${TEMPLATE_FILE}`]: mainTemplate.sha256,
      [`staging:${TEMPLATE_FILE}`]: stagingTemplate.sha256,
    };
    for (const patch of instancePatches) {
      sourceHashes[`published:${patch.sourceFilename}`] = patch.publishedSourceSha256;
      sourceHashes[`staging:${patch.cloneFilename}`] = stagingFiles.get(patch.cloneFilename)?.sha256 || MISSING;
      patch.stagingCloneBefore = stagingFiles.get(patch.cloneFilename)?.content ?? null;
      patch.stagingCloneBeforeSha256 = stagingFiles.get(patch.cloneFilename)?.sha256 || MISSING;
      patch.cloneExistedBefore = Boolean(stagingFiles.get(patch.cloneFilename));
    }

    const now = new Date().toISOString();
    const count = instancePatches.reduce((sum, patch) => sum + patch.replacements.length, 0);
    const summary = String(proposal?.summary || `Kairos prepared ${count} visible homepage text replacement${count === 1 ? "" : "s"} in homepage-isolated section clones.`).trim();
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
        strategy: "Clone only the edited shared section instances for the homepage, rewrite literal words inside each clone, and leave the original shared section files untouched.",
        changes: instancePatches.flatMap(patch => patch.replacements.map(item => ({
          filename: patch.cloneFilename,
          changeType: "homepage-instance-text-isolation",
          purpose: `Isolate homepage section ${patch.sectionId} and replace “${item.before}” with approved customer-facing copy.`,
          expectedOutcome: item.reason || "Visible homepage wording changes without affecting another page.",
        }))),
        risks: ["Longer wording may wrap differently inside the unchanged responsive design."],
        acceptanceCriteria: [
          "The published MAIN homepage is the source of truth.",
          "The original shared section files remain byte-for-byte unchanged.",
          "Only templates/index.json and deterministic homepage-only section clones may be written to staging.",
          "Only the selected homepage section instance type references change.",
          "All section settings, blocks, block order, classes, attributes, links, Liquid tokens, CSS, assets, design tokens, and responsive behavior remain unchanged.",
          "The live MAIN theme remains unchanged during preview construction.",
        ],
        rollbackPlan: ["Restore the exact pre-execution staging homepage template. Homepage-only clone files become unreferenced; existing clone sources are restored when they predated this execution."],
        installationMode: "published-main-homepage-instance-liquid-text-v1",
        templatePatch: {
          filename: TEMPLATE_FILE,
          publishedSource: mainTemplate.content,
          stagingBeforeSource: stagingTemplate.content,
          candidateSource: candidateTemplateSource,
          publishedSha256: mainTemplate.sha256,
          stagingBeforeSha256: stagingTemplate.sha256,
          expectedCandidateSha256: await hashText(candidateTemplateSource),
        },
        instancePatches,
        canonicalPackage: null,
        targetTheme: evidence.stagingTheme,
        publishedTheme: evidence.mainTheme,
        sourceTheme: evidence.mainTheme,
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
        cloneFiles: cloneFilenames,
        stylesheetsChanged: 0,
        assetsChanged: 0,
      },
    };
    return complete(result, 202);
  } catch (error) {
    return failure(error, "Kairos could not prepare the homepage-instance text update.", "homepage_instance_text_plan_failed");
  }
}

async function execute(request, env) {
  try {
    const payload = await request.json();
    const envelope = payload?.plan;
    const approval = payload?.approval;
    validateApproval(envelope, approval);
    const plan = envelope?.plan || {};
    if (plan.installationMode !== "published-main-homepage-instance-liquid-text-v1") throw httpError(409, "homepage_instance_mode_invalid", "The approved homepage-instance text mode is missing.");
    const templatePatch = plan.templatePatch;
    const instancePatches = Array.isArray(plan.instancePatches) ? plan.instancePatches : [];
    if (!templatePatch || templatePatch.filename !== TEMPLATE_FILE || !instancePatches.length) throw httpError(409, "homepage_instance_package_missing", "The approved homepage-instance package is missing.");
    if (instancePatches.some(patch => patch.beforeSignature !== patch.afterSignature || patch.nodeDistributionPreserved !== true || patch.homepageInstanceIsolated !== true || !patch.replacements?.length)) {
      throw httpError(409, "homepage_instance_preservation_proof_missing", "The approved package does not prove homepage-instance isolation and markup preservation.");
    }

    const sourceFilenames = [...new Set(instancePatches.map(patch => patch.sourceFilename))];
    const cloneFilenames = instancePatches.map(patch => patch.cloneFilename);
    const stagingRead = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, [TEMPLATE_FILE, ...cloneFilenames]);
    const evidence = stagingRead?.evidence || {};
    validateBoundary(evidence.stagingTheme, evidence.mainTheme);
    if (approval?.targetThemeID !== evidence.stagingTheme.gid || plan?.targetTheme?.gid !== evidence.stagingTheme.gid) throw httpError(409, "staging_theme_changed", "The approved staging target no longer matches Kairos Staging.");

    const mainRead = await inspectThemeFiles(env, evidence.mainTheme.gid, [TEMPLATE_FILE, ...sourceFilenames]);
    const mainFiles = new Map((mainRead.files || []).map(file => [file.filename, file]));
    const stagingFiles = new Map((stagingRead?.evidence?.files || []).map(file => [file.filename, file]));
    const mainTemplate = mainFiles.get(TEMPLATE_FILE);
    const stagingTemplate = stagingFiles.get(TEMPLATE_FILE);
    if (!mainTemplate?.content || !stagingTemplate?.content) throw httpError(409, "homepage_instance_sources_missing", "The approved homepage sources are unavailable.");
    assertHash(plan, approval, `published:${TEMPLATE_FILE}`, mainTemplate.sha256);
    assertHash(plan, approval, `staging:${TEMPLATE_FILE}`, stagingTemplate.sha256);
    if (mainTemplate.content !== templatePatch.publishedSource) throw httpError(409, "published_template_changed", "The published homepage template changed after approval.");

    for (const patch of instancePatches) {
      const source = mainFiles.get(patch.sourceFilename);
      if (!source?.content || source.content !== patch.publishedSource || source.sha256 !== patch.publishedSourceSha256) throw httpError(409, "published_shared_section_changed", `${patch.sourceFilename} changed after approval.`);
      assertHash(plan, approval, `published:${patch.sourceFilename}`, source.sha256);
      const currentClone = stagingFiles.get(patch.cloneFilename);
      const actualCloneHash = currentClone?.sha256 || MISSING;
      assertHash(plan, approval, `staging:${patch.cloneFilename}`, actualCloneHash);
      if (markupSignature(source.content) !== patch.beforeSignature || markupSignature(patch.candidateSource) !== patch.afterSignature || patch.beforeSignature !== patch.afterSignature) {
        throw httpError(409, "homepage_instance_markup_changed", `${patch.cloneFilename} no longer preserves the original section markup.`);
      }
    }

    const writes = [
      ...instancePatches.map(patch => ({ filename: patch.cloneFilename, content: patch.candidateSource })),
      { filename: TEMPLATE_FILE, content: templatePatch.candidateSource },
    ];
    const rollbackFiles = [
      { filename: TEMPLATE_FILE, existed: true, sha256: stagingTemplate.sha256, content: stagingTemplate.content },
      ...instancePatches.map(patch => {
        const current = stagingFiles.get(patch.cloneFilename);
        return { filename: patch.cloneFilename, existed: Boolean(current), sha256: current?.sha256 || null, content: current?.content ?? null };
      }),
    ];

    const write = await writeThemeFiles(env, evidence.stagingTheme.gid, writes);
    const readBack = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, [TEMPLATE_FILE, ...cloneFilenames]);
    const readBackFiles = new Map((readBack?.evidence?.files || []).map(file => [file.filename, file]));
    for (const expected of writes) {
      const actual = readBackFiles.get(expected.filename);
      if (!actual?.content || actual.content !== expected.content || actual.sha256 !== await hashText(expected.content)) throw httpError(502, "homepage_instance_readback_mismatch", `Kairos Staging did not persist the exact approved ${expected.filename}.`);
    }
    for (const patch of instancePatches) {
      if (markupSignature(readBackFiles.get(patch.cloneFilename).content) !== patch.beforeSignature) throw httpError(502, "homepage_instance_structure_mismatch", `${patch.cloneFilename} changed markup or Liquid during read-back.`);
    }

    const mainAfterRead = await inspectThemeFiles(env, evidence.mainTheme.gid, [TEMPLATE_FILE, ...sourceFilenames]);
    const mainAfter = new Map((mainAfterRead.files || []).map(file => [file.filename, file]));
    for (const [filename, before] of mainFiles) {
      const after = mainAfter.get(filename);
      if (!after?.content || after.content !== before.content || after.sha256 !== before.sha256) throw httpError(502, "published_main_theme_changed", `The published MAIN file changed during staging execution: ${filename}.`);
    }

    const count = instancePatches.reduce((sum, patch) => sum + patch.replacements.length, 0);
    const result = {
      actionID: crypto.randomUUID(),
      actionType: "shopify.staging.execute",
      status: "completed",
      build: KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD,
      kernel: "published-homepage-instance-liquid-text-executor-v1",
      completedAt: new Date().toISOString(),
      objective: envelope.objective,
      summary: `Kairos isolated ${instancePatches.length} homepage section instance${instancePatches.length === 1 ? "" : "s"}, replaced ${count} verified visible text group${count === 1 ? "" : "s"}, and left every original shared section untouched.`,
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
        homepageInstancesIsolated: instancePatches.length,
        originalSharedFilesChanged: 0,
        literalLiquidTextOnly: true,
        nodeDistributionPreserved: true,
        publishedFrameworkPreserved: true,
        cloneFiles: cloneFilenames,
      },
      rollback: {
        required: false,
        authorized: false,
        targetThemeID: evidence.stagingTheme.gid,
        files: rollbackFiles,
        instruction: "Rollback restores the exact prior staging homepage template and any pre-existing clone files. Newly created clones become unreferenced when the template is restored.",
      },
    };
    return complete(result, 202);
  } catch (error) {
    return failure(error, "Kairos could not complete the homepage-instance staging update.", "homepage_instance_text_execution_failed");
  }
}

function activeSectionInstances(document) {
  const result = [];
  for (const sectionId of Array.isArray(document?.order) ? document.order : []) {
    const section = document?.sections?.[sectionId];
    if (!section || section.disabled === true) continue;
    const sourceType = String(section.type || "").trim();
    if (!/^[a-z0-9_-]+$/i.test(sourceType)) continue;
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
    const before = String(item?.before ?? "");
    const after = String(item?.after ?? "").trim();
    const source = byId.get(id);
    if (!source || used.has(id) || before !== source.text || !after || after === before || after.length > 1200 || /[<>]|{{|{%|%}|}}/.test(after)) continue;
    const ordinal = Number(id.split("::").pop());
    if (!Number.isInteger(ordinal)) continue;
    used.add(id);
    result.push({ id, ordinal, sectionId: source.sectionId, sourceType: source.sourceType, sourceFilename: source.sourceFilename, before, after, reason: clean(item?.reason).slice(0, 300), primary: source.primary });
  }
  return result.slice(0, 100);
}

function tokenize(source) { return String(source || "").split(/({{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>)/g); }

function buildGroups(tokens) {
  const groups = [];
  let current = [];
  let blockedDepth = 0;
  let schemaDepth = 0;
  let ordinal = 0;
  const flush = () => {
    const textIndexes = current.filter(index => isVisibleText(tokens[index]));
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
      if (/{%\s*schema\s*%}/i.test(token)) { flush(); schemaDepth += 1; continue; }
      if (/{%\s*endschema\s*%}/i.test(token)) { schemaDepth = Math.max(0, schemaDepth - 1); continue; }
      if (!schemaDepth && !blockedDepth) current.push(index);
      continue;
    }
    if (schemaDepth) continue;
    if (token.startsWith("{{")) { if (!blockedDepth) current.push(index); continue; }
    if (token.startsWith("<")) {
      const close = token.match(/^<\s*\/\s*([a-z0-9:-]+)/i);
      const open = token.match(/^<\s*([a-z0-9:-]+)/i);
      const tag = String(close?.[1] || open?.[1] || "").toLowerCase();
      if (close && BLOCKED_TAGS.has(tag)) blockedDepth = Math.max(0, blockedDepth - 1);
      if (!blockedDepth && BLOCK_TAGS.has(tag)) flush();
      if (!blockedDepth) current.push(index);
      if (open && !close && !/\/\s*>$/.test(token) && BLOCKED_TAGS.has(tag)) blockedDepth += 1;
      if (!blockedDepth && close && BLOCK_TAGS.has(tag)) flush();
      continue;
    }
    if (!blockedDepth) current.push(index);
  }
  flush();
  return groups;
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

function validateInstanceTemplateMutation(original, candidate, patches) {
  const allowed = new Map(patches.map(patch => [patch.sectionId, patch.cloneType]));
  const originalCopy = structuredClone(original);
  const candidateCopy = structuredClone(candidate);
  for (const [sectionId, cloneType] of allowed) {
    if (candidateCopy?.sections?.[sectionId]?.type !== cloneType) throw httpError(409, "homepage_instance_type_binding_missing", `Homepage section ${sectionId} was not bound to its isolated clone.`);
    candidateCopy.sections[sectionId].type = originalCopy.sections[sectionId].type;
  }
  if (JSON.stringify(originalCopy) !== JSON.stringify(candidateCopy)) throw httpError(409, "homepage_instance_template_scope_exceeded", "The homepage template changed outside approved section-instance type references.");
}

function homepageCloneType(sectionId, sourceType) {
  return `kairos-home-${fnv1a(`${sectionId}:${sourceType}`)}`;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 8);
}

function serializeShopifyJson(originalSource, document) {
  const source = String(originalSource || "").replace(/^\uFEFF/, "");
  const trimmed = source.trimStart();
  let prefix = "";
  if (trimmed.startsWith("/*")) {
    const offset = source.length - trimmed.length;
    const end = source.indexOf("*/", offset + 2);
    if (end >= 0) prefix = source.slice(0, end + 2) + "\n";
  }
  return `${prefix}${JSON.stringify(document, null, 2)}\n`;
}

function markupSignature(source) { return (String(source || "").match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>/g) || []).join("\u001f"); }
function decodeEntities(value) { return String(value || "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">"); }
function groupBy(items, key) { const map = new Map(); for (const item of items) { const value = key(item); if (!map.has(value)) map.set(value, []); map.get(value).push(item); } return map; }
function fileByName(files, filename) { return (Array.isArray(files) ? files : []).find(file => file?.filename === filename) || null; }
function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }

function validateBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The live MAIN theme could not be verified.");
}

function validateApproval(envelope, approval) {
  if (!envelope?.planID || !envelope?.actionID || envelope?.status !== "ready-for-approval") throw httpError(409, "homepage_plan_invalid", "The approved homepage plan is invalid.");
  if (approval?.status !== "approved" || approval?.planID !== envelope.planID || approval?.actionID !== envelope.actionID) throw httpError(403, "homepage_plan_not_approved", "This exact homepage plan was not approved for staging execution.");
  if (JSON.stringify(approval?.sourceHashes || {}) !== JSON.stringify(envelope?.plan?.sourceHashes || {})) throw httpError(409, "homepage_approval_hash_mismatch", "The approval does not match the inspected homepage sources.");
}

function assertHash(plan, approval, key, actual) {
  const expected = plan?.sourceHashes?.[key];
  if (!expected || expected !== actual || approval?.sourceHashes?.[key] !== expected) throw httpError(409, "homepage_source_changed", `${key} changed after approval. Build a new preview.`);
}

function complete(result, status = 202) {
  return json({ jobID: crypto.randomUUID(), status: "completed", build: KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, summary: result.summary, result }, status);
}

function failure(error, summary, fallbackCode) {
  const status = Number.isInteger(error?.status) ? error.status : Number(error?.statusCode || 500);
  return json({ status: "needs-attention", build: KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, summary, error: { status, code: typeof error?.code === "string" ? error.code : fallbackCode, message: error instanceof Error ? error.message : summary } }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": KAIROS_HOMEPAGE_INSTANCE_LIQUID_FALLBACK_BUILD, "X-Kairos-Homepage-Instance-Isolation": "shared-section-clone", "X-Content-Type-Options": "nosniff" } });
}
