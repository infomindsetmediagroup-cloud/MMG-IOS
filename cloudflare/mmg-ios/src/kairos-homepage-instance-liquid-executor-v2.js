import {
  hashText,
  httpError,
  inspectStagingSource,
  inspectThemeFiles,
  parseShopifyJson,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_HOMEPAGE_INSTANCE_LIQUID_EXECUTOR_BUILD = "kairos-homepage-instance-liquid-executor-20260717-2";

const EXECUTE_ROUTE = "/api/shopify/staging/execute/jobs";
const TEMPLATE_FILE = "templates/index.json";
const MISSING = "__KAIROS_THEME_FILE_MISSING__";

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === EXECUTE_ROUTE) return executePlan(request, env);
    return json({ status: "not-found", build: KAIROS_HOMEPAGE_INSTANCE_LIQUID_EXECUTOR_BUILD }, 404);
  },
};

async function executePlan(request, env) {
  try {
    const payload = await request.json();
    const envelope = payload?.plan;
    const approval = payload?.approval;
    validateApproval(envelope, approval);

    const plan = envelope?.plan || {};
    if (plan.installationMode !== "published-main-homepage-instance-liquid-text-v1") {
      throw httpError(409, "homepage_instance_mode_invalid", "The approved homepage-instance text mode is missing.");
    }
    const templatePatch = plan.templatePatch;
    const patches = Array.isArray(plan.instancePatches) ? plan.instancePatches : [];
    if (!templatePatch || templatePatch.filename !== TEMPLATE_FILE || !patches.length) {
      throw httpError(409, "homepage_instance_package_missing", "The approved homepage-instance package is missing.");
    }
    if (patches.some(patch => patch.beforeSignature !== patch.afterSignature
      || patch.homepageInstanceIsolated !== true
      || patch.originalSharedSourceChanged !== false
      || patch.nodeDistributionPreserved !== true
      || !Array.isArray(patch.replacements)
      || !patch.replacements.length)) {
      throw httpError(409, "homepage_instance_preservation_proof_missing", "The approved package lacks homepage-instance isolation proof.");
    }

    const cloneNames = patches.map(patch => patch.cloneFilename);
    const stagingRead = await inspectStagingSource(
      null,
      request,
      env,
      KAIROS_HOMEPAGE_INSTANCE_LIQUID_EXECUTOR_BUILD,
      [TEMPLATE_FILE, ...cloneNames],
    );
    const evidence = stagingRead?.evidence || {};
    validateThemeBoundary(evidence.stagingTheme, evidence.mainTheme);
    if (approval?.targetThemeID !== evidence.stagingTheme.gid || plan?.targetTheme?.gid !== evidence.stagingTheme.gid) {
      throw httpError(409, "staging_theme_changed", "The approved staging target no longer matches Kairos Staging.");
    }

    const sourceNames = [...new Set(patches.map(patch => patch.sourceFilename))];
    const mainRead = await inspectThemeFiles(env, evidence.mainTheme.gid, [TEMPLATE_FILE, ...sourceNames]);
    const mainFiles = new Map((mainRead.files || []).map(file => [file.filename, file]));
    const stagingFiles = new Map((stagingRead?.evidence?.files || []).map(file => [file.filename, file]));
    const mainTemplate = mainFiles.get(TEMPLATE_FILE);
    const stagingTemplate = stagingFiles.get(TEMPLATE_FILE);
    if (!mainTemplate?.content || !stagingTemplate?.content) {
      throw httpError(409, "homepage_instance_sources_missing", "The approved homepage sources are unavailable.");
    }

    assertHash(plan, approval, `published:${TEMPLATE_FILE}`, mainTemplate.sha256);
    assertHash(plan, approval, `staging:${TEMPLATE_FILE}`, stagingTemplate.sha256);
    if (mainTemplate.content !== templatePatch.publishedSource) {
      throw httpError(409, "published_template_changed", "The published homepage template changed after approval.");
    }

    for (const patch of patches) {
      const source = mainFiles.get(patch.sourceFilename);
      if (!source?.content || source.content !== patch.publishedSource || source.sha256 !== patch.publishedSourceSha256) {
        throw httpError(409, "published_shared_section_changed", `${patch.sourceFilename} changed after approval.`);
      }
      assertHash(plan, approval, `published:${patch.sourceFilename}`, source.sha256);
      assertHash(plan, approval, `staging:${patch.cloneFilename}`, stagingFiles.get(patch.cloneFilename)?.sha256 || MISSING);
      if (markupSignature(source.content) !== patch.beforeSignature
        || markupSignature(patch.candidateSource) !== patch.afterSignature
        || patch.beforeSignature !== patch.afterSignature) {
        throw httpError(409, "homepage_instance_markup_changed", `${patch.cloneFilename} no longer preserves the original markup and Liquid signature.`);
      }
    }

    const writes = [
      ...patches.map(patch => ({ filename: patch.cloneFilename, content: patch.candidateSource })),
      { filename: TEMPLATE_FILE, content: templatePatch.candidateSource },
    ];
    const rollbackFiles = [
      { filename: TEMPLATE_FILE, existed: true, sha256: stagingTemplate.sha256, content: stagingTemplate.content },
      ...patches.map(patch => {
        const current = stagingFiles.get(patch.cloneFilename);
        return {
          filename: patch.cloneFilename,
          existed: Boolean(current),
          sha256: current?.sha256 || null,
          content: current?.content ?? null,
        };
      }),
    ];

    const write = await writeThemeFiles(env, evidence.stagingTheme.gid, writes);
    const readBack = await inspectStagingSource(
      null,
      request,
      env,
      KAIROS_HOMEPAGE_INSTANCE_LIQUID_EXECUTOR_BUILD,
      [TEMPLATE_FILE, ...cloneNames],
    );
    const readBackFiles = new Map((readBack?.evidence?.files || []).map(file => [file.filename, file]));
    const verification = [];
    for (const expected of writes) {
      const actual = readBackFiles.get(expected.filename);
      if (!actual?.content) {
        throw httpError(502, "homepage_instance_readback_mismatch", `Kairos Staging did not persist the approved ${expected.filename}.`);
      }
      const isTemplate = expected.filename === TEMPLATE_FILE;
      const matched = isTemplate
        ? canonicalJsonEqual(actual.content, expected.content)
        : actual.content === expected.content && actual.sha256 === await hashText(expected.content);
      if (!matched) {
        throw httpError(502, "homepage_instance_readback_mismatch", `Kairos Staging did not persist the approved ${expected.filename}.`);
      }
      verification.push({
        filename: expected.filename,
        actualSha256: actual.sha256,
        matched: true,
        verificationMode: isTemplate ? "canonical-json-semantics" : "exact-bytes-and-sha256",
        sourceOfTruth: "published-main-theme",
        frameworkPreserved: true,
      });
    }
    for (const patch of patches) {
      if (markupSignature(readBackFiles.get(patch.cloneFilename)?.content) !== patch.beforeSignature) {
        throw httpError(502, "homepage_instance_structure_mismatch", `${patch.cloneFilename} changed markup or Liquid during read-back.`);
      }
    }

    const mainAfterRead = await inspectThemeFiles(env, evidence.mainTheme.gid, [TEMPLATE_FILE, ...sourceNames]);
    const mainAfter = new Map((mainAfterRead.files || []).map(file => [file.filename, file]));
    for (const [filename, before] of mainFiles) {
      const after = mainAfter.get(filename);
      if (!after?.content || after.content !== before.content || after.sha256 !== before.sha256) {
        throw httpError(502, "published_main_theme_changed", `The published MAIN file changed during staging execution: ${filename}.`);
      }
    }

    const count = patches.reduce((sum, patch) => sum + patch.replacements.length, 0);
    const result = {
      actionID: crypto.randomUUID(),
      actionType: "shopify.staging.execute",
      status: "completed",
      build: KAIROS_HOMEPAGE_INSTANCE_LIQUID_EXECUTOR_BUILD,
      kernel: "published-homepage-instance-liquid-text-executor-v2",
      completedAt: new Date().toISOString(),
      objective: envelope.objective,
      summary: `Kairos isolated ${patches.length} homepage section instance${patches.length === 1 ? "" : "s"}, replaced ${count} visible text group${count === 1 ? "" : "s"}, and left every original shared section untouched.`,
      execution: {
        operation: "themeFilesUpsert",
        engine: "published-homepage-instance-liquid-text-executor-v2",
        sourceTheme: evidence.mainTheme,
        targetTheme: evidence.stagingTheme,
        publishedTheme: evidence.mainTheme,
        publishedThemeChanged: false,
        filesWritten: writes.map(file => ({
          filename: file.filename,
          beforeSha256: stagingFiles.get(file.filename)?.sha256 || null,
          afterSha256: readBackFiles.get(file.filename)?.sha256 || null,
        })),
        templateCopiedFromPublished: true,
        homepageInstanceIsolation: true,
        originalSharedSectionsChanged: false,
        liquidTextOnly: true,
        publishedFrameworkPreserved: true,
        structurePreserved: true,
        nodeDistributionPreserved: true,
        templateReadbackVerification: "canonical-json-semantics",
        cloneReadbackVerification: "exact-bytes-and-sha256",
        stylesheetsWritten: [],
        assetsWritten: [],
        classesChanged: false,
        designTokensChanged: false,
      },
      verification,
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
        templateSemanticReadbackVerified: true,
        cloneExactReadbackVerified: true,
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

function canonicalJsonEqual(actualSource, expectedSource) {
  const actual = parseShopifyJson(actualSource, "Staging homepage read-back");
  const expected = parseShopifyJson(expectedSource, "Approved homepage template");
  return stableStringify(actual) === stableStringify(expected);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function markupSignature(source) {
  return (String(source || "").match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>/g) || []).join("\u001f");
}

function validateThemeBoundary(staging, main) {
  if (!staging?.gid || String(staging.role || "").toUpperCase() === "MAIN") {
    throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  }
  if (!main?.gid || String(main.role || "").toUpperCase() !== "MAIN") {
    throw httpError(409, "main_theme_verification_failed", "The live MAIN theme could not be verified.");
  }
}

function validateApproval(envelope, approval) {
  if (!envelope?.planID || !envelope?.actionID || envelope.status !== "ready-for-approval") {
    throw httpError(409, "homepage_plan_invalid", "The approved homepage plan is invalid.");
  }
  if (approval?.status !== "approved" || approval?.planID !== envelope.planID || approval?.actionID !== envelope.actionID) {
    throw httpError(403, "homepage_plan_not_approved", "This exact homepage plan was not approved for staging execution.");
  }
  if (JSON.stringify(approval?.sourceHashes || {}) !== JSON.stringify(envelope?.plan?.sourceHashes || {})) {
    throw httpError(409, "homepage_approval_hash_mismatch", "The approval does not match the inspected homepage sources.");
  }
}

function assertHash(plan, approval, key, actual) {
  const expected = plan?.sourceHashes?.[key];
  if (!expected || expected !== actual || approval?.sourceHashes?.[key] !== expected) {
    throw httpError(409, "homepage_source_changed", `${key} changed after approval. Build a new preview.`);
  }
}

function completedJob(result, status = 202) {
  return json({
    jobID: crypto.randomUUID(),
    status: "completed",
    build: KAIROS_HOMEPAGE_INSTANCE_LIQUID_EXECUTOR_BUILD,
    summary: result.summary,
    result,
  }, status);
}

function failedJob(error, summary, fallbackCode) {
  const status = Number.isInteger(error?.status) ? error.status : Number(error?.statusCode || 500);
  return json({
    status: "needs-attention",
    build: KAIROS_HOMEPAGE_INSTANCE_LIQUID_EXECUTOR_BUILD,
    summary,
    error: {
      status,
      code: typeof error?.code === "string" ? error.code : fallbackCode,
      message: error instanceof Error ? error.message : summary,
    },
  }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_HOMEPAGE_INSTANCE_LIQUID_EXECUTOR_BUILD,
      "X-Kairos-Homepage-Instance-Executor": "semantic-template-exact-clone-readback",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
