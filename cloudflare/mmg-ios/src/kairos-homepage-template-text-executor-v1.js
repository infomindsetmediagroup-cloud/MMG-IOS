import {
  buildEditableMap,
  hashText,
  httpError,
  inspectStagingSource,
  inspectThemeFiles,
  parseShopifyJson,
  semanticHash,
  validateHomepageDocument,
  writeThemeFile,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_HOMEPAGE_TEMPLATE_TEXT_EXECUTOR_BUILD = "kairos-homepage-template-text-executor-20260716-1";

const TEMPLATE_FILE = "templates/index.json";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/shopify/staging/execute/jobs") return execute(request, env);
    return json({ status: "not-found", build: KAIROS_HOMEPAGE_TEMPLATE_TEXT_EXECUTOR_BUILD }, 404);
  },
};

async function execute(request, env) {
  const startedAt = new Date().toISOString();
  try {
    const payload = await request.json();
    const planEnvelope = payload?.plan;
    const approval = payload?.approval;
    validateApproval(planEnvelope, approval);
    const plan = planEnvelope?.plan || {};
    if (plan.installationMode !== "published-main-template-text-settings-v1") {
      throw httpError(409, "published_template_text_mode_invalid", "The approved published-framework text mode is missing.");
    }
    const patch = plan.templateTextPatch;
    if (!patch || patch.filename !== TEMPLATE_FILE || typeof patch.publishedSource !== "string" || typeof patch.candidateSource !== "string") {
      throw httpError(409, "published_template_text_patch_missing", "The approved published-framework template text package is missing.");
    }
    if (patch.onlyExistingStringSettingsChanged !== true || patch.publishedFrameworkPreserved !== true || !Array.isArray(patch.operations) || !patch.operations.length) {
      throw httpError(409, "published_framework_proof_missing", "The approved package does not prove text-only preservation of the published homepage framework.");
    }

    const stagingInspection = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_TEMPLATE_TEXT_EXECUTOR_BUILD, [TEMPLATE_FILE]);
    const stagingEvidence = stagingInspection?.evidence || {};
    validateBoundary(stagingEvidence.stagingTheme, stagingEvidence.mainTheme);
    if (approval.targetThemeID !== stagingEvidence.stagingTheme.gid || plan?.targetTheme?.gid !== stagingEvidence.stagingTheme.gid) {
      throw httpError(409, "staging_theme_changed", "The approved staging target no longer matches Kairos Staging.");
    }

    const mainInspection = await inspectThemeFiles(env, stagingEvidence.mainTheme.gid, [TEMPLATE_FILE]);
    const currentMain = fileByName(mainInspection.files, TEMPLATE_FILE);
    const currentStaging = fileByName(stagingEvidence.files, TEMPLATE_FILE);
    if (!currentMain?.content || !currentStaging?.content) {
      throw httpError(409, "homepage_template_unavailable", "Kairos could not re-read the published MAIN and staging homepage templates before execution.");
    }

    const expectedMainHash = plan.sourceHashes?.["published:templates/index.json"];
    const expectedStagingHash = plan.sourceHashes?.["staging:templates/index.json"];
    if (!expectedMainHash || !expectedStagingHash || approval?.sourceHashes?.["published:templates/index.json"] !== expectedMainHash || approval?.sourceHashes?.["staging:templates/index.json"] !== expectedStagingHash) {
      throw httpError(409, "approval_source_hashes_missing", "The approved published and staging template hashes are required.");
    }
    if (currentMain.sha256 !== expectedMainHash || currentMain.sha256 !== patch.publishedSha256) {
      throw httpError(409, "published_homepage_changed", "The published homepage changed after approval. Build a new preview from the current live framework.");
    }
    if (currentStaging.sha256 !== expectedStagingHash || currentStaging.sha256 !== patch.stagingBeforeSha256) {
      throw httpError(409, "staging_homepage_changed", "Kairos Staging changed after approval. Build a new preview.");
    }
    if (currentMain.content !== patch.publishedSource) {
      throw httpError(409, "published_homepage_source_changed", "The published homepage source no longer matches the approved framework baseline.");
    }

    const publishedDocument = parseShopifyJson(currentMain.content, "Published MAIN homepage");
    const candidateDocument = parseShopifyJson(patch.candidateSource, "Approved staging homepage candidate");
    validateHomepageDocument(candidateDocument, publishedDocument);
    assertOperationsBoundToPublishedSource(publishedDocument, candidateDocument, patch.operations);

    const publishedStructure = structureSignature(publishedDocument);
    const candidateStructure = structureSignature(candidateDocument);
    if (publishedStructure !== patch.publishedStructureSignature || candidateStructure !== patch.candidateStructureSignature || publishedStructure !== candidateStructure) {
      throw httpError(409, "published_framework_structure_changed", "The approved candidate does not preserve the published homepage structure exactly.");
    }
    const publishedSemanticHash = await semanticHash(publishedDocument);
    const candidateSemanticHash = await semanticHash(candidateDocument);
    if (publishedSemanticHash !== patch.publishedSemanticHash || candidateSemanticHash !== patch.candidateSemanticHash) {
      throw httpError(409, "homepage_semantic_hash_mismatch", "The approved template text package no longer matches its verified documents.");
    }

    const expectedCandidateSha256 = await hashText(patch.candidateSource);
    if (expectedCandidateSha256 !== patch.expectedCandidateSha256) {
      throw httpError(409, "candidate_source_hash_mismatch", "The approved staging candidate source hash is invalid.");
    }

    const beforeSha256 = currentStaging.sha256 || await hashText(currentStaging.content);
    if (beforeSha256 === expectedCandidateSha256 && currentStaging.content === patch.candidateSource) {
      return complete(request, {
        startedAt,
        planEnvelope,
        patch,
        stagingTheme: stagingEvidence.stagingTheme,
        mainTheme: stagingEvidence.mainTheme,
        beforeSha256,
        actualSha256: beforeSha256,
        expectedCandidateSha256,
        originalStagingSource: currentStaging.content,
        sourceActionID: stagingInspection.actionID,
        verifyActionID: stagingInspection.actionID,
        write: null,
        noWrite: true,
      });
    }

    const write = await writeThemeFile(env, stagingEvidence.stagingTheme.gid, TEMPLATE_FILE, patch.candidateSource);
    const verifyStagingInspection = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_TEMPLATE_TEXT_EXECUTOR_BUILD, [TEMPLATE_FILE]);
    const verifyMainInspection = await inspectThemeFiles(env, stagingEvidence.mainTheme.gid, [TEMPLATE_FILE]);
    const readBackStaging = fileByName(verifyStagingInspection?.evidence?.files, TEMPLATE_FILE);
    const readBackMain = fileByName(verifyMainInspection.files, TEMPLATE_FILE);
    if (!readBackStaging?.content || !readBackMain?.content) {
      throw httpError(502, "homepage_template_readback_missing", "Shopify returned no homepage template source after the staging write.");
    }
    const actualSha256 = readBackStaging.sha256 || await hashText(readBackStaging.content);
    if (readBackStaging.content !== patch.candidateSource || actualSha256 !== expectedCandidateSha256) {
      throw httpError(502, "homepage_template_readback_mismatch", "Kairos Staging did not persist the exact approved template text candidate.");
    }
    if (readBackMain.sha256 !== currentMain.sha256 || readBackMain.content !== currentMain.content) {
      throw httpError(502, "published_main_theme_changed", "The published MAIN homepage changed during the staging-only operation.");
    }
    const readBackDocument = parseShopifyJson(readBackStaging.content, "Kairos Staging homepage read-back");
    validateHomepageDocument(readBackDocument, publishedDocument);
    assertOperationsBoundToPublishedSource(publishedDocument, readBackDocument, patch.operations);
    if (structureSignature(readBackDocument) !== publishedStructure) {
      throw httpError(502, "staging_framework_readback_mismatch", "The staging read-back no longer matches the published homepage framework.");
    }
    validateBoundary(verifyStagingInspection?.evidence?.stagingTheme, verifyStagingInspection?.evidence?.mainTheme);

    return complete(request, {
      startedAt,
      planEnvelope,
      patch,
      stagingTheme: stagingEvidence.stagingTheme,
      mainTheme: stagingEvidence.mainTheme,
      beforeSha256,
      actualSha256,
      expectedCandidateSha256,
      originalStagingSource: currentStaging.content,
      sourceActionID: stagingInspection.actionID,
      verifyActionID: verifyStagingInspection.actionID,
      write,
      noWrite: false,
    });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return json({
      status: "needs-attention",
      build: KAIROS_HOMEPAGE_TEMPLATE_TEXT_EXECUTOR_BUILD,
      summary: "Kairos could not complete the published-framework homepage text staging execution.",
      error: { status, code: error?.code || "homepage_template_text_execution_failed", message: error instanceof Error ? error.message : "Published-framework template text execution failed." },
    }, status);
  }
}

async function complete(request, context) {
  const completedAt = new Date().toISOString();
  const result = {
    actionID: crypto.randomUUID(),
    actionType: "shopify.staging.execute",
    status: "completed",
    build: KAIROS_HOMEPAGE_TEMPLATE_TEXT_EXECUTOR_BUILD,
    kernel: "published-homepage-template-text-executor-v1",
    completedAt,
    summary: context.noWrite
      ? "The approved published-framework homepage text was already present on Kairos Staging; Kairos verified it without rebuilding anything."
      : "Kairos copied the published homepage framework into staging, changed only approved existing text settings, and verified the exact read-back.",
    objective: context.planEnvelope.objective,
    execution: {
      operation: context.noWrite ? "verifiedNoWrite" : "themeFileUpsert",
      engine: "published-homepage-template-text-executor-v1",
      sourceTheme: context.mainTheme,
      targetTheme: context.stagingTheme,
      publishedTheme: context.mainTheme,
      publishedThemeChanged: false,
      productionPublishAuthorized: false,
      filesWritten: context.noWrite ? [] : [{ filename: TEMPLATE_FILE, beforeSha256: context.beforeSha256, afterSha256: context.actualSha256 }],
      templateTextOnly: true,
      publishedFrameworkPreserved: true,
      sectionStructurePreserved: true,
      blockStructurePreserved: true,
      sectionOrderPreserved: true,
      liquidFilesWritten: [],
      stylesheetsWritten: [],
      assetsWritten: [],
      classesChanged: false,
      designTokensChanged: false,
      idempotent: context.noWrite,
    },
    verification: [
      { filename: TEMPLATE_FILE, expectedSha256: context.expectedCandidateSha256, actualSha256: context.actualSha256, matched: true, sourceOfTruth: "published-main-theme", textSettingsOnly: true, frameworkPreserved: true, idempotent: context.noWrite },
      { scope: "published-main-theme", unchanged: true, matched: true },
      { scope: "Liquid-CSS-assets", filesWritten: 0, unchanged: true, matched: true },
    ],
    evidence: {
      credentialPath: context.write?.credentialPath || "read-only-verification",
      mutationResult: context.write?.mutationResult || null,
      sourceInspectionActionID: context.sourceActionID,
      readBackInspectionActionID: context.verifyActionID,
      sourceOfTruth: "published-main-theme",
      textSettingReplacementCount: context.patch.operations.length,
      onlyExistingStringSettingsChanged: true,
      publishedFrameworkPreserved: true,
      idempotent: context.noWrite,
    },
    rollback: {
      required: false,
      authorized: false,
      targetThemeID: context.stagingTheme.gid,
      files: [{ filename: TEMPLATE_FILE, existed: true, sha256: context.beforeSha256, content: context.originalStagingSource }],
      instruction: "Rollback restores the exact pre-execution Kairos Staging homepage template. The published MAIN theme was never modified.",
    },
  };
  const jobID = crypto.randomUUID();
  const completed = { jobID, status: "completed", build: KAIROS_HOMEPAGE_TEMPLATE_TEXT_EXECUTOR_BUILD, submittedAt: context.startedAt, updatedAt: completedAt, completedAt, summary: result.summary, result };
  await caches.default.put(jobRequest(request, jobID), new Response(JSON.stringify(completed), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-MMG-Runtime": KAIROS_HOMEPAGE_TEMPLATE_TEXT_EXECUTOR_BUILD },
  }));
  return json({ jobID, status: "completed", build: KAIROS_HOMEPAGE_TEMPLATE_TEXT_EXECUTOR_BUILD, pollURL: `/api/shopify/staging/execute/jobs/${jobID}`, summary: result.summary, result }, 202);
}

function validateApproval(planEnvelope, approval) {
  if (!planEnvelope?.planID || approval?.status !== "approved" || approval?.planID !== planEnvelope.planID) {
    throw httpError(403, "approval_required", "Approve the exact published-framework homepage text proposal before building the preview.");
  }
  if (!approval?.targetThemeID || !approval?.sourceHashes) {
    throw httpError(409, "approval_evidence_missing", "The approved staging target and published/staging source hashes are required.");
  }
}

function assertOperationsBoundToPublishedSource(publishedDocument, candidateDocument, operations) {
  const published = settingsMap(buildEditableMap(publishedDocument));
  const candidate = settingsMap(buildEditableMap(candidateDocument));
  const allowed = new Map(operations.map(item => [item.location || `${item.scope}:${item.sectionId}:${item.blockId || "section"}:${item.key}`, item]));
  if (published.size !== candidate.size) throw httpError(409, "homepage_setting_map_changed", "The homepage setting map changed.");
  for (const [location, previous] of published) {
    if (!candidate.has(location)) throw httpError(409, "homepage_setting_removed", `A homepage setting disappeared: ${location}.`);
    const next = candidate.get(location);
    if (deepEqual(previous, next)) continue;
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
      "X-MMG-Runtime": KAIROS_HOMEPAGE_TEMPLATE_TEXT_EXECUTOR_BUILD,
      "X-Kairos-Homepage-Mode": "preserve-published-framework",
      "X-Kairos-Homepage-Source": "published-main-theme",
      "X-Kairos-Mutation-Scope": "templates-index-json-existing-string-settings-only",
      "X-Kairos-Liquid-Files-Written": "0",
      "X-Kairos-Stylesheets-Written": "0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
