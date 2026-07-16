import {
  applyCompactPatch,
  deleteThemeFiles,
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  safeJSON,
  semanticHash,
  writeThemeFile,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";
import { buildDeterministicHomepagePackage } from "./kairos-deterministic-homepage-v1.js";
import {
  KAIROS_CANONICAL_HOMEPAGE_VERSION,
  CANONICAL_HOMEPAGE_FILENAMES,
  buildCanonicalHomepagePackage,
} from "./kairos-canonical-homepage-package-v1.js";

const BUILD = "kairos-standalone-shopify-20260715-3";
const HOMEPAGE_FILE = "templates/index.json";
const JOB_TTL_SECONDS = 3600;
const MAX_OBJECTIVE_CHARS = 12000;
const SHOPIFY_READBACK_RETRY_DELAYS_MS = [250, 500, 1_000, 2_000, 3_000, 5_000, 8_000];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        status: "ready",
        runtime: "cloudflare-workers",
        build: BUILD,
        kernel: "standalone-shopify-v2",
        openaiAPIUsed: false,
        capabilities: capabilities(),
        checkedAt: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/capabilities" && request.method === "GET") {
      return json({
        status: "ready",
        build: BUILD,
        kernel: "standalone-shopify-v2",
        capabilities: capabilities(),
      });
    }

    if (url.pathname === "/api/shopify/staging/plan/jobs" && request.method === "POST") {
      return createPlan(request, env);
    }

    const planMatch = url.pathname.match(/^\/api\/shopify\/staging\/plan\/jobs\/([a-f0-9-]+)$/i);
    if (planMatch && request.method === "GET") {
      return readJob(request, "plan", planMatch[1]);
    }

    if (url.pathname === "/api/shopify/staging/execute/jobs" && request.method === "POST") {
      return executePlan(request, env);
    }

    if (url.pathname === "/api/shopify/staging/rollback/jobs" && request.method === "POST") {
      return executeRollback(request, env);
    }

    const executionMatch = url.pathname.match(/^\/api\/shopify\/staging\/execute\/jobs\/([a-f0-9-]+)$/i);
    if (executionMatch && request.method === "GET") {
      return readJob(request, "execution", executionMatch[1]);
    }

    const rollbackMatch = url.pathname.match(/^\/api\/shopify\/staging\/rollback\/jobs\/([a-f0-9-]+)$/i);
    if (rollbackMatch && request.method === "GET") {
      return readJob(request, "rollback", rollbackMatch[1]);
    }

    if (url.pathname === "/api/hub/run" && request.method === "POST") {
      const body = await safeJSON(request.clone());
      const action = String(body?.action || "").trim().toLowerCase();
      if (["website", "website-retool", "shopify-website", "homepage-retool"].includes(action)) {
        return json({
          status: "blocked",
          build: BUILD,
          error: {
            code: "legacy_website_route_disabled",
            message: "Website Retool must use the governed Kairos-native Shopify staging route.",
          },
        }, 409);
      }
      return json({
        status: "unavailable",
        build: BUILD,
        error: {
          code: "capability_not_promoted",
          message: "This command-center action is not yet promoted in the standalone Shopify runtime.",
        },
      }, 501);
    }

    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return json({ status: "error", build: BUILD, error: { code: "assets_binding_missing", message: "The Kairos shell assets binding is unavailable." } }, 503);
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone-shopify-v2");
    if (response.headers.get("Content-Type")?.includes("text/html")) {
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

function capabilities() {
  return {
    commandCenterShell: "available",
    runtimeHealth: "operational",
    capabilityRegistry: "operational",
    shopifyConnectionValidation: "operational",
    shopifyStagingInspection: "operational",
    deterministicHomepagePlanning: "operational",
    deterministicHomepageExecution: "operational",
    canonicalHomepagePackageInstaller: "operational",
    canonicalHomepageThreeFileRollback: "operational",
    homepageRetoolNativeOnly: "operational",
    openAIProvider: "prohibited",
    liveThemeMutation: "disabled",
    productionPublishing: "disabled",
  };
}

async function createPlan(request, env) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 8) throw httpError(400, "objective_required", "Enter a specific website objective before starting the job.");
    if (objective.length > MAX_OBJECTIVE_CHARS) throw httpError(413, "objective_too_long", `Website objective exceeds ${MAX_OBJECTIVE_CHARS.toLocaleString()} characters.`);

    const sourceBody = await inspectStagingSource(null, request, env, BUILD, CANONICAL_HOMEPAGE_FILENAMES);
    const evidence = sourceBody?.evidence || {};
    const stagingTheme = evidence?.stagingTheme;
    const mainTheme = evidence?.mainTheme;
    const filesByName = themeFileMap(evidence);
    const sourceFile = filesByName.get(HOMEPAGE_FILE);

    validateBoundary(stagingTheme, mainTheme);
    if (!sourceFile?.content) throw httpError(409, "homepage_source_unavailable", "templates/index.json was not readable from Kairos Staging.");

    const document = parseShopifyJson(sourceFile.content, "Current Kairos Staging homepage");
    let packageResult;
    let installationMode = "existing-text-settings";
    try {
      packageResult = buildDeterministicHomepagePackage(document, objective);
    } catch (error) {
      if (error?.code !== "canonical_homepage_package_required") throw error;
      packageResult = buildCanonicalHomepagePackage(document, objective);
      installationMode = KAIROS_CANONICAL_HOMEPAGE_VERSION;
    }
    const targetFilenames = installationMode === KAIROS_CANONICAL_HOMEPAGE_VERSION ? CANONICAL_HOMEPAGE_FILENAMES : [HOMEPAGE_FILE];
    const sourceHashes = Object.fromEntries(targetFilenames.map(filename => [filename, filesByName.get(filename)?.sha256 || null]));
    const canonicalPackage = installationMode === KAIROS_CANONICAL_HOMEPAGE_VERSION ? {
      version: packageResult.version,
      sectionId: packageResult.sectionId,
      files: await fileManifest(packageResult.files),
    } : null;
    const now = new Date().toISOString();
    const result = {
      actionID: crypto.randomUUID(),
      planID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      status: "ready-for-approval",
      readOnly: true,
      build: BUILD,
      kernel: "standalone-shopify-v2",
      startedAt: now,
      completedAt: now,
      objective,
      summary: packageResult.summary,
      plan: {
        summary: packageResult.summary,
        strategy: packageResult.strategy,
        changes: packageResult.changes,
        risks: packageResult.risks,
        acceptanceCriteria: packageResult.acceptanceCriteria,
        rollbackPlan: packageResult.rollbackPlan,
        installationMode,
        deterministicPatch: packageResult.patch || null,
        canonicalPackage,
        targetTheme: stagingTheme,
        publishedTheme: mainTheme,
        sourceHashes,
        productionPublishAuthorized: false,
        liveThemeMutationAuthorized: false,
        providerPolicy: { openai: "prohibited", externalInferenceProviders: "prohibited" },
      },
      evidence: {
        sourceInspectionActionID: sourceBody.actionID || "",
        stagingTheme,
        mainTheme,
        suppliedFiles: targetFilenames.map(filename => ({ filename, exists: filesByName.has(filename), sha256: filesByName.get(filename)?.sha256 || null, bytes: filesByName.get(filename)?.bytes || 0 })),
        planningEngine: installationMode === KAIROS_CANONICAL_HOMEPAGE_VERSION ? KAIROS_CANONICAL_HOMEPAGE_VERSION : "deterministic-homepage-v1",
        openaiAPIUsed: false,
        externalInferenceProviderUsed: false,
        evidenceNotes: packageResult.evidenceNotes,
      },
    };

    const jobID = crypto.randomUUID();
    const completed = { jobID, status: "completed", build: BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary: result.summary, result };
    await writeJob(request, "plan", jobID, completed);
    return json({ jobID, status: "completed", build: BUILD, pollURL: `/api/shopify/staging/plan/jobs/${jobID}`, summary: result.summary }, 202);
  } catch (error) {
    return failure("Kairos could not prepare the native Shopify homepage plan.", error);
  }
}

async function executePlan(request, env) {
  const startedAt = new Date().toISOString();
  try {
    const payload = await request.json();
    const planEnvelope = payload?.plan;
    const approval = payload?.approval;
    validateApproval(planEnvelope, approval);

    const installationMode = String(planEnvelope?.plan?.installationMode || "existing-text-settings");
    if (installationMode === KAIROS_CANONICAL_HOMEPAGE_VERSION) {
      return await executeCanonicalPlan(request, env, planEnvelope, approval, startedAt);
    }
    if (installationMode !== "existing-text-settings") throw httpError(409, "homepage_installation_mode_invalid", "The approved homepage installation mode is not supported.");

    const patch = planEnvelope?.plan?.deterministicPatch;
    if (!patch || !Array.isArray(patch.operations)) throw httpError(409, "deterministic_patch_missing", "The approved deterministic homepage patch is missing.");

    const sourceBody = await inspectStagingSource(null, request, env, BUILD);
    const evidence = sourceBody?.evidence || {};
    const stagingTheme = evidence?.stagingTheme;
    const mainTheme = evidence?.mainTheme;
    const sourceFile = (Array.isArray(evidence?.files) ? evidence.files : []).find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");

    validateBoundary(stagingTheme, mainTheme);
    if (!sourceFile?.content) throw httpError(409, "homepage_source_unavailable", "templates/index.json was not readable from Kairos Staging.");
    if (approval?.targetThemeID !== stagingTheme.gid || planEnvelope?.plan?.targetTheme?.gid !== stagingTheme.gid) throw httpError(409, "staging_theme_changed", "The approved staging target no longer matches Kairos Staging.");
    if (approval?.sourceHashes?.[HOMEPAGE_FILE] !== sourceFile.sha256 || planEnvelope?.plan?.sourceHashes?.[HOMEPAGE_FILE] !== sourceFile.sha256) throw httpError(409, "source_hash_mismatch", "templates/index.json changed after approval. Generate and approve a new plan.");

    const original = parseShopifyJson(sourceFile.content, "Current Kairos Staging homepage");
    const candidate = applyCompactPatch(original, patch);
    const beforeSemanticHash = await semanticHash(original);
    const expectedSemanticHash = await semanticHash(candidate);
    if (expectedSemanticHash === beforeSemanticHash) throw httpError(409, "generated_content_unchanged", "The deterministic patch produced no semantic homepage change.");

    const replacement = `${JSON.stringify(candidate, null, 2)}\n`;
    const write = await writeThemeFile(env, stagingTheme.gid, HOMEPAGE_FILE, replacement);
    const verifyBody = await inspectStagingSource(null, request, env, BUILD);
    const readBack = (Array.isArray(verifyBody?.evidence?.files) ? verifyBody.evidence.files : []).find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");
    if (!readBack?.content) throw httpError(502, "staging_readback_missing", "Shopify returned no homepage source after the staging write.");

    const verified = parseShopifyJson(readBack.content, "Shopify staging read-back");
    const actualSemanticHash = await semanticHash(verified);
    if (actualSemanticHash !== expectedSemanticHash) throw httpError(502, "staging_readback_semantic_mismatch", "The Shopify read-back did not match the approved deterministic homepage result.");

    const afterMain = verifyBody?.evidence?.mainTheme;
    const afterStaging = verifyBody?.evidence?.stagingTheme;
    validateBoundary(afterStaging, afterMain);
    if (afterMain.gid !== mainTheme.gid) throw httpError(502, "main_theme_changed_during_staging_write", "The live Rise theme did not remain unchanged.");

    const completedAt = new Date().toISOString();
    const result = {
      actionID: crypto.randomUUID(),
      actionType: "shopify.staging.execute",
      status: "completed",
      build: BUILD,
      kernel: "standalone-shopify-v2",
      completedAt,
      summary: "Kairos applied and semantically verified the approved native homepage retool on Kairos Staging.",
      objective: planEnvelope.objective,
      execution: {
        operation: "themeFilesUpsert",
        engine: "deterministic-homepage-v1",
        targetTheme: afterStaging,
        publishedTheme: afterMain,
        publishedThemeChanged: false,
        productionPublishAuthorized: false,
        openaiAPIUsed: false,
        externalInferenceProviderUsed: false,
        filesWritten: [{ filename: HOMEPAGE_FILE, beforeSha256: sourceFile.sha256, afterSha256: readBack.sha256, beforeSemanticSha256: beforeSemanticHash, afterSemanticSha256: actualSemanticHash }],
      },
      verification: [{ filename: HOMEPAGE_FILE, expectedSemanticSha256: expectedSemanticHash, actualSemanticSha256: actualSemanticHash, matched: true, jsonValid: true, structurePreserved: true }],
      evidence: { credentialPath: write.credentialPath, mutationResult: write.mutationResult, patchOperationCount: patch.operations.length, sourceInspectionActionID: sourceBody.actionID, readBackInspectionActionID: verifyBody.actionID },
      rollback: { required: false, authorized: false, targetThemeID: stagingTheme.gid, files: [{ filename: HOMEPAGE_FILE, existed: true, sha256: sourceFile.sha256, semanticSha256: beforeSemanticHash, content: sourceFile.content }], instruction: "Rollback requires separate approval and restores the original templates/index.json on Kairos Staging." },
    };

    const jobID = crypto.randomUUID();
    const completed = { jobID, status: "completed", build: BUILD, submittedAt: startedAt, updatedAt: completedAt, completedAt, summary: result.summary, result };
    await writeJob(request, "execution", jobID, completed);
    return json({ jobID, status: "completed", build: BUILD, pollURL: `/api/shopify/staging/execute/jobs/${jobID}`, summary: result.summary, result }, 202);
  } catch (error) {
    return failure("Kairos could not complete the native homepage execution.", error);
  }
}

async function executeCanonicalPlan(request, env, planEnvelope, approval, startedAt) {
  const approvedPackage = planEnvelope?.plan?.canonicalPackage;
  if (approvedPackage?.version !== KAIROS_CANONICAL_HOMEPAGE_VERSION || !Array.isArray(approvedPackage?.files)) {
    throw httpError(409, "canonical_package_missing", "The approved canonical homepage package manifest is missing.");
  }
  validateCanonicalManifestFilenames(approvedPackage.files);

  const sourceBody = await inspectStagingSource(null, request, env, BUILD, CANONICAL_HOMEPAGE_FILENAMES);
  const evidence = sourceBody?.evidence || {};
  const stagingTheme = evidence?.stagingTheme;
  const mainTheme = evidence?.mainTheme;
  const filesByName = themeFileMap(evidence);
  const sourceFile = filesByName.get(HOMEPAGE_FILE);
  validateBoundary(stagingTheme, mainTheme);
  if (!sourceFile?.content) throw httpError(409, "homepage_source_unavailable", "templates/index.json was not readable from Kairos Staging.");
  if (approval?.targetThemeID !== stagingTheme.gid || planEnvelope?.plan?.targetTheme?.gid !== stagingTheme.gid) {
    throw httpError(409, "staging_theme_changed", "The approved staging target no longer matches Kairos Staging.");
  }
  validateSourceHashes(planEnvelope.plan.sourceHashes, approval?.sourceHashes, filesByName, CANONICAL_HOMEPAGE_FILENAMES);

  const original = parseShopifyJson(sourceFile.content, "Current Kairos Staging homepage");
  const packageResult = buildCanonicalHomepagePackage(original, planEnvelope.objective);
  if (packageResult.sectionId !== approvedPackage.sectionId) throw httpError(409, "canonical_section_changed", "The canonical section identity changed after approval.");
  const expectedManifest = await fileManifest(packageResult.files);
  validateApprovedManifest(approvedPackage.files, expectedManifest);

  const beforeSemanticHash = await semanticHash(original);
  const expectedSemanticHash = await semanticHash(packageResult.document);
  const write = await writeThemeFiles(env, stagingTheme.gid, packageResult.files);
  const { verifyBody, verifiedFiles, attempts: readBackAttempts } = await verifyCanonicalReadback(request, env, expectedManifest);
  const verification = expectedManifest.map(expected => {
    const actual = verifiedFiles.get(expected.filename);
    return {
      filename: expected.filename,
      expectedSha256: expected.sha256,
      actualSha256: actual.sha256,
      matched: true,
      bytes: actual.bytes,
      jsonValid: expected.filename === HOMEPAGE_FILE ? true : null,
    };
  });

  const verifiedTemplate = parseShopifyJson(verifiedFiles.get(HOMEPAGE_FILE).content, "Shopify canonical homepage read-back");
  const actualSemanticHash = await semanticHash(verifiedTemplate);
  if (actualSemanticHash !== expectedSemanticHash) throw httpError(502, "staging_readback_semantic_mismatch", "The Shopify homepage read-back did not match the approved canonical document.");

  const afterMain = verifyBody?.evidence?.mainTheme;
  const afterStaging = verifyBody?.evidence?.stagingTheme;
  validateBoundary(afterStaging, afterMain);
  if (afterMain.gid !== mainTheme.gid) throw httpError(502, "main_theme_changed_during_staging_write", "The live Rise theme did not remain unchanged.");

  const rollbackFiles = CANONICAL_HOMEPAGE_FILENAMES.map(filename => {
    const originalFile = filesByName.get(filename);
    return originalFile ? {
      filename,
      existed: true,
      sha256: originalFile.sha256,
      semanticSha256: filename === HOMEPAGE_FILE ? beforeSemanticHash : null,
      content: originalFile.content,
    } : {
      filename,
      existed: false,
      sha256: null,
      semanticSha256: null,
      content: null,
    };
  });
  const filesWritten = expectedManifest.map(expected => ({
    filename: expected.filename,
    beforeSha256: filesByName.get(expected.filename)?.sha256 || null,
    afterSha256: verifiedFiles.get(expected.filename).sha256,
    created: !filesByName.has(expected.filename),
  }));
  const completedAt = new Date().toISOString();
  const result = {
    actionID: crypto.randomUUID(),
    actionType: "shopify.staging.execute",
    status: "completed",
    build: BUILD,
    kernel: "standalone-shopify-v2",
    completedAt,
    summary: "Kairos installed and verified the canonical MMG homepage package on Kairos Staging.",
    objective: planEnvelope.objective,
    execution: {
      operation: "themeFilesUpsert",
      engine: KAIROS_CANONICAL_HOMEPAGE_VERSION,
      targetTheme: afterStaging,
      publishedTheme: afterMain,
      publishedThemeChanged: false,
      productionPublishAuthorized: false,
      openaiAPIUsed: false,
      externalInferenceProviderUsed: false,
      filesWritten,
      beforeSemanticSha256: beforeSemanticHash,
      afterSemanticSha256: actualSemanticHash,
    },
    verification,
    evidence: {
      credentialPath: write.credentialPath,
      mutationResult: write.mutationResult,
      sourceInspectionActionID: sourceBody.actionID,
      readBackInspectionActionID: verifyBody.actionID,
      readBackAttempts,
      packageVersion: packageResult.version,
      sectionId: packageResult.sectionId,
    },
    rollback: {
      required: false,
      authorized: false,
      targetThemeID: stagingTheme.gid,
      currentHashes: Object.fromEntries(CANONICAL_HOMEPAGE_FILENAMES.map(filename => [filename, verifiedFiles.get(filename)?.sha256 || null])),
      files: rollbackFiles,
      instruction: "Rollback requires separate approval, restores every pre-existing file byte-for-byte, and deletes package files that did not previously exist.",
    },
  };

  const jobID = crypto.randomUUID();
  const completed = { jobID, status: "completed", build: BUILD, submittedAt: startedAt, updatedAt: completedAt, completedAt, summary: result.summary, result };
  await writeJob(request, "execution", jobID, completed);
  return json({ jobID, status: "completed", build: BUILD, pollURL: "/api/shopify/staging/execute/jobs/" + jobID, summary: result.summary, result }, 202);
}

async function verifyCanonicalReadback(request, env, expectedManifest) {
  let verifyBody = null;
  let verifiedFiles = new Map();
  let mismatches = [];

  for (let attempt = 0; attempt <= SHOPIFY_READBACK_RETRY_DELAYS_MS.length; attempt += 1) {
    verifyBody = await inspectStagingSource(null, request, env, BUILD, CANONICAL_HOMEPAGE_FILENAMES);
    verifiedFiles = themeFileMap(verifyBody?.evidence || {});
    mismatches = expectedManifest.filter(expected => verifiedFiles.get(expected.filename)?.sha256 !== expected.sha256);
    if (!mismatches.length) return { verifyBody, verifiedFiles, attempts: attempt + 1 };
    if (attempt < SHOPIFY_READBACK_RETRY_DELAYS_MS.length) {
      await new Promise(resolve => setTimeout(resolve, SHOPIFY_READBACK_RETRY_DELAYS_MS[attempt]));
    }
  }

  const expected = mismatches[0];
  const actual = verifiedFiles.get(expected.filename);
  if (!actual?.content) throw httpError(502, "staging_readback_missing", "Shopify returned no read-back for " + expected.filename + ".");
  throw httpError(502, "staging_readback_hash_mismatch", "Shopify read-back did not converge to the approved " + expected.filename + " before the verification deadline.");
}

async function executeRollback(request, env) {
  const startedAt = new Date().toISOString();
  try {
    const payload = await request.json();
    const rollback = payload?.rollback;
    const approval = payload?.approval;
    if (!rollback || !Array.isArray(rollback.files) || rollback.files.length < 1 || rollback.files.length > 3) throw httpError(400, "rollback_package_required", "A one-to-three-file staging rollback package is required.");
    if (!approval || approval.status !== "approved") throw httpError(403, "staging_rollback_approval_required", "Explicit staging rollback approval is required.");
    if (approval.targetThemeID !== rollback.targetThemeID) throw httpError(409, "rollback_approval_mismatch", "The approval does not match the rollback target.");
    if (rollback.files.length > 1 || rollback.files.some(file => file?.filename !== HOMEPAGE_FILE)) {
      return executeCanonicalRollback(request, env, rollback, approval, startedAt);
    }
    const rollbackFile = rollback.files[0];
    if (rollbackFile.filename !== HOMEPAGE_FILE || typeof rollbackFile.content !== "string") throw httpError(409, "rollback_file_invalid", "The rollback package must restore only templates/index.json.");

    const sourceBody = await inspectStagingSource(null, request, env, BUILD);
    const evidence = sourceBody?.evidence || {};
    const stagingTheme = evidence?.stagingTheme;
    const mainTheme = evidence?.mainTheme;
    const sourceFile = (Array.isArray(evidence?.files) ? evidence.files : []).find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");
    validateBoundary(stagingTheme, mainTheme);
    if (stagingTheme.gid !== rollback.targetThemeID) throw httpError(409, "rollback_target_changed", "The rollback target no longer matches Kairos Staging.");
    if (!sourceFile?.content) throw httpError(409, "homepage_source_unavailable", "The current staging homepage was not readable.");
    if (approval.expectedCurrentSha256 !== sourceFile.sha256) throw httpError(409, "rollback_source_hash_mismatch", "Kairos Staging changed after rollback approval. A new inspection is required.");

    const original = parseShopifyJson(rollbackFile.content, "Approved staging rollback");
    const expectedSemanticHash = await semanticHash(original);
    if (expectedSemanticHash !== rollbackFile.semanticSha256) throw httpError(409, "rollback_package_hash_mismatch", "The rollback content does not match its approved semantic hash.");

    const write = await writeThemeFile(env, stagingTheme.gid, HOMEPAGE_FILE, rollbackFile.content);
    const verifyBody = await inspectStagingSource(null, request, env, BUILD);
    const readBack = (Array.isArray(verifyBody?.evidence?.files) ? verifyBody.evidence.files : []).find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");
    if (!readBack?.content) throw httpError(502, "rollback_readback_missing", "Shopify returned no homepage source after rollback.");
    const verified = parseShopifyJson(readBack.content, "Shopify rollback read-back");
    const actualSemanticHash = await semanticHash(verified);
    if (actualSemanticHash !== expectedSemanticHash) throw httpError(502, "rollback_readback_mismatch", "Shopify read-back did not match the approved rollback content.");

    const afterMain = verifyBody?.evidence?.mainTheme;
    const afterStaging = verifyBody?.evidence?.stagingTheme;
    validateBoundary(afterStaging, afterMain);
    if (afterMain.gid !== mainTheme.gid) throw httpError(502, "main_theme_changed_during_rollback", "The live Rise theme did not remain unchanged.");

    const completedAt = new Date().toISOString();
    const result = {
      actionID: crypto.randomUUID(),
      actionType: "shopify.staging.rollback",
      status: "completed",
      build: BUILD,
      completedAt,
      execution: {
        targetTheme: afterStaging,
        publishedTheme: afterMain,
        publishedThemeChanged: false,
        filesRestored: [{ filename: HOMEPAGE_FILE, beforeSha256: sourceFile.sha256, afterSha256: readBack.sha256, semanticSha256: actualSemanticHash }],
      },
      verification: { matched: true, jsonValid: true, expectedSemanticSha256: expectedSemanticHash, actualSemanticSha256: actualSemanticHash },
      evidence: { credentialPath: write.credentialPath, mutationResult: write.mutationResult, sourceInspectionActionID: sourceBody.actionID, readBackInspectionActionID: verifyBody.actionID },
    };
    const jobID = crypto.randomUUID();
    const completed = { jobID, status: "completed", build: BUILD, submittedAt: startedAt, updatedAt: completedAt, completedAt, summary: "Kairos restored and verified the approved pre-change homepage on Kairos Staging.", result };
    await writeJob(request, "rollback", jobID, completed);
    return json({ jobID, status: "completed", build: BUILD, pollURL: `/api/shopify/staging/rollback/jobs/${jobID}`, summary: completed.summary, result }, 202);
  } catch (error) {
    return failure("Kairos could not complete the approved staging rollback.", error);
  }
}

async function executeCanonicalRollback(request, env, rollback, approval, startedAt) {
  const names = rollback.files.map(file => String(file?.filename || ""));
  if (new Set(names).size !== CANONICAL_HOMEPAGE_FILENAMES.length || CANONICAL_HOMEPAGE_FILENAMES.some(filename => !names.includes(filename))) {
    throw httpError(409, "canonical_rollback_files_invalid", "The canonical rollback must describe the homepage template, Liquid section, and stylesheet exactly once.");
  }
  const currentHashes = approval.currentHashes || approval.expectedCurrentHashes || rollback.currentHashes;
  if (!currentHashes || typeof currentHashes !== "object") throw httpError(409, "rollback_current_hashes_required", "Approved current file hashes are required for canonical rollback.");

  const sourceBody = await inspectStagingSource(null, request, env, BUILD, CANONICAL_HOMEPAGE_FILENAMES);
  const evidence = sourceBody?.evidence || {};
  const stagingTheme = evidence?.stagingTheme;
  const mainTheme = evidence?.mainTheme;
  const currentFiles = themeFileMap(evidence);
  validateBoundary(stagingTheme, mainTheme);
  if (stagingTheme.gid !== rollback.targetThemeID) throw httpError(409, "rollback_target_changed", "The rollback target no longer matches Kairos Staging.");
  for (const filename of CANONICAL_HOMEPAGE_FILENAMES) {
    const actual = currentFiles.get(filename)?.sha256 || null;
    if ((currentHashes[filename] || null) !== actual || (rollback.currentHashes?.[filename] || null) !== actual) {
      throw httpError(409, "rollback_source_hash_mismatch", filename + " changed after rollback approval. A new inspection is required.");
    }
  }

  const restoreFiles = [];
  const deleteFiles = [];
  for (const file of rollback.files) {
    if (file.existed === true) {
      if (typeof file.content !== "string" || await hashText(file.content) !== file.sha256) {
        throw httpError(409, "rollback_package_hash_mismatch", "Rollback content does not match the approved hash for " + file.filename + ".");
      }
      if (file.filename === HOMEPAGE_FILE) {
        const document = parseShopifyJson(file.content, "Approved canonical homepage rollback");
        if (file.semanticSha256 && await semanticHash(document) !== file.semanticSha256) {
          throw httpError(409, "rollback_package_semantic_mismatch", "The homepage rollback content does not match its approved semantic hash.");
        }
      }
      restoreFiles.push({ filename: file.filename, content: file.content });
    } else {
      if (file.filename === HOMEPAGE_FILE) throw httpError(409, "homepage_template_delete_forbidden", "The Shopify homepage template cannot be deleted.");
      deleteFiles.push(file.filename);
    }
  }
  if (!restoreFiles.some(file => file.filename === HOMEPAGE_FILE)) throw httpError(409, "rollback_homepage_missing", "Canonical rollback must restore templates/index.json.");

  const restore = await writeThemeFiles(env, stagingTheme.gid, restoreFiles);
  const removal = deleteFiles.length ? await deleteThemeFiles(env, stagingTheme.gid, deleteFiles) : null;
  const verifyBody = await inspectStagingSource(null, request, env, BUILD, CANONICAL_HOMEPAGE_FILENAMES);
  const verifiedFiles = themeFileMap(verifyBody?.evidence || {});
  const verification = [];
  for (const file of rollback.files) {
    const actual = verifiedFiles.get(file.filename);
    if (file.existed === true) {
      if (!actual || actual.sha256 !== file.sha256) throw httpError(502, "rollback_readback_mismatch", "Shopify read-back did not match the approved rollback for " + file.filename + ".");
      verification.push({ filename: file.filename, restored: true, deleted: false, expectedSha256: file.sha256, actualSha256: actual.sha256, matched: true });
    } else {
      if (actual) throw httpError(502, "rollback_delete_readback_mismatch", file.filename + " still exists after approved rollback deletion.");
      verification.push({ filename: file.filename, restored: false, deleted: true, expectedSha256: null, actualSha256: null, matched: true });
    }
  }

  const afterMain = verifyBody?.evidence?.mainTheme;
  const afterStaging = verifyBody?.evidence?.stagingTheme;
  validateBoundary(afterStaging, afterMain);
  if (afterMain.gid !== mainTheme.gid) throw httpError(502, "main_theme_changed_during_rollback", "The live Rise theme did not remain unchanged.");
  const completedAt = new Date().toISOString();
  const result = {
    actionID: crypto.randomUUID(),
    actionType: "shopify.staging.rollback",
    status: "completed",
    build: BUILD,
    kernel: "standalone-shopify-v2",
    completedAt,
    summary: "Kairos restored and verified the complete pre-installation homepage package on Kairos Staging.",
    execution: {
      targetTheme: afterStaging,
      publishedTheme: afterMain,
      publishedThemeChanged: false,
      filesRestored: restoreFiles.map(file => file.filename),
      filesDeleted: deleteFiles,
      openaiAPIUsed: false,
      externalInferenceProviderUsed: false,
    },
    verification,
    evidence: {
      credentialPath: restore.credentialPath,
      restoreMutationResult: restore.mutationResult,
      deleteMutationResult: removal?.mutationResult || null,
      sourceInspectionActionID: sourceBody.actionID,
      readBackInspectionActionID: verifyBody.actionID,
    },
  };
  const jobID = crypto.randomUUID();
  const completed = { jobID, status: "completed", build: BUILD, submittedAt: startedAt, updatedAt: completedAt, completedAt, summary: result.summary, result };
  await writeJob(request, "rollback", jobID, completed);
  return json({ jobID, status: "completed", build: BUILD, pollURL: "/api/shopify/staging/rollback/jobs/" + jobID, summary: result.summary, result }, 202);
}

async function readJob(request, type, jobID) {
  const response = await caches.default.match(jobRequest(request, type, jobID));
  if (!response) return json({ jobID, status: "not-found", build: BUILD, error: { message: `The website ${type} job was not found or expired.` } }, 404);
  const body = await safeJSON(response);
  return json(body, body.status === "needs-attention" ? Number(body.httpStatus || 500) : 200);
}

async function writeJob(request, type, jobID, body) {
  await caches.default.put(jobRequest(request, type, jobID), new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}`, "X-MMG-Runtime": BUILD },
  }));
}

function jobRequest(request, type, jobID) {
  return new Request(new URL(`/_kairos/standalone-${type}-jobs/${jobID}`, request.url).toString(), { method: "GET" });
}

function themeFileMap(evidence) {
  return new Map((Array.isArray(evidence?.files) ? evidence.files : [])
    .filter(file => file?.readable && typeof file?.filename === "string" && typeof file?.content === "string")
    .map(file => [file.filename, file]));
}

async function fileManifest(files) {
  const manifest = [];
  for (const file of Array.isArray(files) ? files : []) {
    const filename = String(file?.filename || "").trim();
    const content = file?.content;
    if (!filename || typeof content !== "string") throw httpError(500, "canonical_package_file_invalid", "Kairos generated an invalid canonical package file.");
    manifest.push({ filename, sha256: await hashText(content), bytes: new TextEncoder().encode(content).length });
  }
  if (new Set(manifest.map(file => file.filename)).size !== manifest.length) throw httpError(500, "canonical_package_duplicate_file", "Kairos generated duplicate canonical package filenames.");
  return manifest;
}

function validateCanonicalManifestFilenames(manifest) {
  const names = manifest.map(file => String(file?.filename || ""));
  if (new Set(names).size !== CANONICAL_HOMEPAGE_FILENAMES.length || CANONICAL_HOMEPAGE_FILENAMES.some(filename => !names.includes(filename))) {
    throw httpError(409, "canonical_package_files_invalid", "The approved canonical package must include the homepage template, Liquid section, and stylesheet exactly once.");
  }
}

function validateApprovedManifest(approved, expected) {
  validateCanonicalManifestFilenames(approved);
  const approvedByName = new Map(approved.map(file => [file.filename, file]));
  for (const file of expected) {
    const approval = approvedByName.get(file.filename);
    if (!approval || approval.sha256 !== file.sha256 || Number(approval.bytes) !== file.bytes) {
      throw httpError(409, "canonical_package_manifest_changed", "The canonical package changed after approval. Prepare and approve a new plan.");
    }
  }
}

function validateSourceHashes(plannedHashes, approvedHashes, filesByName, filenames) {
  if (!plannedHashes || !approvedHashes) throw httpError(409, "source_hashes_missing", "Approved staging source hashes are missing.");
  for (const filename of filenames) {
    const actual = filesByName.get(filename)?.sha256 || null;
    if ((plannedHashes[filename] || null) !== actual || (approvedHashes[filename] || null) !== actual) {
      throw httpError(409, "source_hash_mismatch", filename + " changed after approval. Prepare and approve a new plan.");
    }
  }
}

function validateBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || stagingTheme.role === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  if (!mainTheme?.gid || mainTheme.role !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The live Rise theme could not be verified.");
}

function validateApproval(planEnvelope, approval) {
  if (!planEnvelope?.plan) throw httpError(400, "staging_plan_required", "The approved staging plan is missing.");
  if (!approval || approval.status !== "approved") throw httpError(403, "staging_plan_approval_required", "Explicit staging plan approval is required.");
  if (approval.planID !== planEnvelope.planID || approval.actionID !== planEnvelope.actionID) throw httpError(409, "approval_plan_mismatch", "The approval does not match the current staging plan.");
}

function failure(summary, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const normalized = {
    status,
    code: typeof error?.code === "string" ? error.code : "native_homepage_failed",
    message: error instanceof Error ? error.message : "Native homepage operation failed.",
  };
  return json({ status: "needs-attention", build: BUILD, summary, error: normalized }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Kernel": "standalone-shopify-v2",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
