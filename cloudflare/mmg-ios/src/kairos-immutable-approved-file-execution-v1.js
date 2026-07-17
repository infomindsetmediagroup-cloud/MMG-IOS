import {
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  validateHomepageDocument,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD = "kairos-immutable-approved-file-execution-20260717-1";

const EXECUTE_PATH = "/api/shopify/staging/execute/jobs";
const TEMPLATE_FILE = "templates/index.json";
const WEBSITE_MODE = "autonomous-text-only-v1";
const JOB_TTL_SECONDS = 60 * 60;
const DIRECT_PLAN_KERNEL = "direct-homepage-plan-v1";

export async function handleImmutableApprovedFileExecution(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== EXECUTE_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  const planEnvelope = payload?.plan || {};
  const plan = planEnvelope?.plan || {};
  const packageResult = plan?.textOnlyPackage;
  const directPlan = planEnvelope?.kernel === DIRECT_PLAN_KERNEL
    || String(planEnvelope?.build || "").startsWith("kairos-direct-homepage-plan-")
    || String(planEnvelope?.build || "").startsWith("kairos-whole-homepage-planner-");
  if (!directPlan) return null;

  const approval = payload?.approval || {};
  validateApproval(planEnvelope, plan, packageResult, approval);

  const files = Array.isArray(packageResult?.files) ? packageResult.files : [];
  const filenames = files.map(file => String(file?.filename || "").trim()).filter(Boolean);
  if (!files.length || filenames.length !== files.length || new Set(filenames).size !== filenames.length) {
    throw httpError(409, "immutable_package_files_invalid", "The approved homepage package does not contain a valid unique file set.");
  }

  const inspection = await inspectStagingSource(
    null,
    request,
    env,
    KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD,
    [TEMPLATE_FILE, ...filenames],
  );
  const evidence = inspection?.evidence || {};
  validateThemeBoundary(evidence.stagingTheme, evidence.mainTheme);
  validateTargetBoundary(plan, approval, evidence.stagingTheme);

  const currentFiles = new Map((evidence.files || []).map(file => [file.filename, file]));
  const verifiedCandidates = [];

  for (const approvedFile of files) {
    const current = currentFiles.get(approvedFile.filename);
    validateCurrentFile(current, approvedFile, plan, approval);
    await validateApprovedCandidate(approvedFile);

    verifiedCandidates.push({
      filename: approvedFile.filename,
      content: approvedFile.candidateSource,
      beforeSha256: approvedFile.beforeSha256,
      afterSha256: approvedFile.afterSha256,
      structureSignature: approvedFile.structureSignature,
      operations: Array.isArray(approvedFile.operations) ? approvedFile.operations.length : 0,
    });
  }

  const write = await writeThemeFiles(
    env,
    evidence.stagingTheme.gid,
    verifiedCandidates.map(file => ({ filename: file.filename, content: file.content })),
  );

  const readBackInspection = await inspectStagingSource(
    null,
    request,
    env,
    KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD,
    [TEMPLATE_FILE, ...filenames],
  );
  const readBackMap = new Map((readBackInspection?.evidence?.files || []).map(file => [file.filename, file]));
  const verification = [];

  for (const candidate of verifiedCandidates) {
    const readBack = readBackMap.get(candidate.filename);
    if (!readBack || readBack.content !== candidate.content || readBack.sha256 !== candidate.afterSha256) {
      throw httpError(502, "immutable_staging_readback_mismatch", `Shopify did not preserve the exact approved source for ${candidate.filename}.`);
    }
    verification.push({
      filename: candidate.filename,
      expectedSha256: candidate.afterSha256,
      actualSha256: readBack.sha256,
      matched: true,
      textOnly: true,
      structurePreserved: true,
      immutableApprovedCandidateUsed: true,
      approvalTimeReconstructionUsed: false,
    });
  }

  const operations = Array.isArray(packageResult.operations) ? packageResult.operations : [];
  const completedAt = new Date().toISOString();
  const previewURL = stagingPreviewURL(env, evidence.stagingTheme.gid);
  const result = {
    actionID: crypto.randomUUID(),
    actionType: "shopify.staging.execute",
    status: "completed",
    build: KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD,
    kernel: "immutable-approved-file-execution-v1",
    completedAt,
    objective: planEnvelope.objective || approval.objective || "Approved homepage text update",
    summary: `Kairos applied ${operations.length} approved visible text replacement${operations.length === 1 ? "" : "s"} from the immutable approved file package and verified every Shopify read-back.`,
    execution: {
      operation: "themeFilesUpsert",
      engine: WEBSITE_MODE,
      targetTheme: evidence.stagingTheme,
      publishedTheme: evidence.mainTheme,
      publishedThemeChanged: false,
      productionPublishAuthorized: false,
      filesWritten: verifiedCandidates.map(file => ({
        filename: file.filename,
        beforeSha256: file.beforeSha256,
        afterSha256: file.afterSha256,
        approvedOperations: file.operations,
      })),
      textOnly: true,
      immutableApprovedCandidateUsed: true,
      approvalTimeReconstructionUsed: false,
      stylesheetsWritten: [],
      assetsWritten: [],
      structureChanged: false,
      classesChanged: false,
      designTokensChanged: false,
    },
    verification,
    preview: {
      url: previewURL,
      mobileURL: previewURL,
      desktopURL: previewURL,
      targetThemeName: evidence.stagingTheme.name,
    },
    evidence: {
      credentialPath: write.credentialPath,
      mutationResult: write.mutationResult,
      sourceInspectionActionID: inspection.actionID,
      readBackInspectionActionID: readBackInspection.actionID,
      replacementCount: operations.length,
      sourceHashesVerified: true,
      approvedCandidateHashesVerified: true,
      authorizedDiffVerified: true,
      approvalTimeTextComparisonUsed: false,
      approvalTimeInventoryRebuildUsed: false,
      workersAIUsed: false,
      privateRuntimeUsed: false,
      neuronsConsumed: 0,
      visualBaseline: "tuesday-command-center-6f96b10d",
    },
    rollback: {
      required: false,
      authorized: false,
      targetThemeID: evidence.stagingTheme.gid,
      files: files.map(file => ({
        filename: file.filename,
        existed: true,
        sha256: file.beforeSha256,
        content: file.beforeSource,
      })),
      instruction: "Rollback restores the exact pre-execution Kairos Staging bytes. Shopify MAIN was never modified.",
    },
  };

  const jobID = crypto.randomUUID();
  await storeExecutionJob(request, jobID, result, result.summary);
  return json({
    jobID,
    status: "completed",
    build: KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD,
    pollURL: `/api/shopify/staging/execute/jobs/${jobID}`,
    summary: result.summary,
    result,
  }, 202);
}

function validateApproval(planEnvelope, plan, packageResult, approval) {
  if (!planEnvelope?.planID || approval?.status !== "approved" || approval?.planID !== planEnvelope.planID) {
    throw httpError(403, "approval_required", "Approve the exact text-only homepage plan before Kairos writes any Shopify file.");
  }
  if (plan?.installationMode !== WEBSITE_MODE || packageResult?.version !== WEBSITE_MODE) {
    throw httpError(409, "immutable_text_package_missing", "The approved immutable text-only package is missing or invalid.");
  }
  if (plan?.structuralMutationAuthorized !== false
    || plan?.styleMutationAuthorized !== false
    || plan?.visualMutationAuthorized !== false
    || plan?.liveThemeMutationAuthorized !== false
    || plan?.productionPublishAuthorized !== false) {
    throw httpError(409, "immutable_plan_boundary_invalid", "The approved plan does not preserve the staging-only text boundary.");
  }
}

function validateTargetBoundary(plan, approval, stagingTheme) {
  const target = String(stagingTheme?.gid || "");
  if (!target || approval?.targetThemeID !== target || plan?.targetTheme?.gid !== target) {
    throw httpError(409, "staging_theme_changed", "The approved target no longer matches the verified Kairos Staging theme.");
  }
}

function validateCurrentFile(current, approvedFile, plan, approval) {
  const filename = approvedFile.filename;
  if (!current?.content || !current?.sha256) {
    throw httpError(409, "staging_source_missing", `${filename} is no longer readable from Kairos Staging.`);
  }
  if (current.sha256 !== approvedFile.beforeSha256
    || current.sha256 !== plan?.sourceHashes?.[filename]
    || current.sha256 !== approval?.sourceHashes?.[filename]
    || current.content !== approvedFile.beforeSource) {
    throw httpError(409, "staging_source_changed", `${filename} changed after approval. Start a new text-only plan from the current staging source.`);
  }
}

async function validateApprovedCandidate(approvedFile) {
  if (typeof approvedFile.beforeSource !== "string" || typeof approvedFile.candidateSource !== "string") {
    throw httpError(409, "immutable_candidate_source_missing", `${approvedFile.filename} is missing approved source bytes.`);
  }
  const beforeHash = await hashText(approvedFile.beforeSource);
  const afterHash = await hashText(approvedFile.candidateSource);
  if (beforeHash !== approvedFile.beforeSha256 || afterHash !== approvedFile.afterSha256) {
    throw httpError(409, "immutable_candidate_hash_invalid", `${approvedFile.filename} does not match its approved source hashes.`);
  }
  const operations = Array.isArray(approvedFile.operations) ? approvedFile.operations : [];
  if (!operations.length) throw httpError(409, "immutable_operations_missing", `${approvedFile.filename} has no approved text operations.`);

  if (approvedFile.filename === TEMPLATE_FILE) {
    validateTemplateDiff(approvedFile.beforeSource, approvedFile.candidateSource, operations);
  } else {
    validateVisibleDiff(approvedFile.beforeSource, approvedFile.candidateSource, operations, approvedFile.filename);
  }
}

function validateTemplateDiff(beforeSource, afterSource, operations) {
  const before = parseShopifyJson(beforeSource, "Approved homepage source");
  const after = parseShopifyJson(afterSource, "Approved homepage candidate");
  validateHomepageDocument(after, before);
  if (templateStructureSignature(before) !== templateStructureSignature(after)) {
    throw httpError(409, "immutable_template_structure_changed", "The approved homepage candidate changes template structure.");
  }

  const operationsByPath = groupOperationsByPath(operations);
  const changedPaths = new Set();
  compareTemplateSettings(before, after, operationsByPath, changedPaths);

  for (const path of operationsByPath.keys()) {
    if (!changedPaths.has(path)) throw httpError(409, "immutable_operation_not_applied", `The approved operation path did not change: ${path}.`);
  }
}

function compareTemplateSettings(before, after, operationsByPath, changedPaths) {
  for (const [sectionId, beforeSection] of Object.entries(before?.sections || {})) {
    const afterSection = after?.sections?.[sectionId];
    compareSettings(beforeSection?.settings || {}, afterSection?.settings || {}, `section:${sectionId}:section`, operationsByPath, changedPaths);
    for (const [blockId, beforeBlock] of Object.entries(beforeSection?.blocks || {})) {
      const afterBlock = afterSection?.blocks?.[blockId];
      compareSettings(beforeBlock?.settings || {}, afterBlock?.settings || {}, `block:${sectionId}:${blockId}`, operationsByPath, changedPaths);
    }
  }
}

function compareSettings(beforeSettings, afterSettings, prefix, operationsByPath, changedPaths) {
  const keys = new Set([...Object.keys(beforeSettings), ...Object.keys(afterSettings)]);
  for (const key of keys) {
    const beforeValue = beforeSettings[key];
    const afterValue = afterSettings[key];
    if (deepEqual(beforeValue, afterValue)) continue;

    const path = `${prefix}:${key}`;
    const operations = operationsByPath.get(path);
    if (!operations?.length) throw httpError(409, "immutable_unauthorized_setting_change", `The approved candidate changed an unauthorized setting: ${path}.`);
    validateSettingChange(beforeValue, afterValue, operations, path);
    changedPaths.add(path);
  }
}

function validateSettingChange(beforeValue, afterValue, operations, path) {
  const kinds = new Set(operations.map(operation => operation.kind));
  if (kinds.size !== 1) throw httpError(409, "immutable_mixed_operation_kinds", `The approved setting mixes operation types: ${path}.`);
  const kind = operations[0].kind;

  if (kind === "json-text") {
    if (operations.length !== 1 || typeof afterValue !== "string" || afterValue !== operations[0].after) {
      throw httpError(409, "immutable_plain_text_candidate_invalid", `The approved plain-text value is invalid: ${path}.`);
    }
    return;
  }

  if (kind === "json-markup-text") {
    if (typeof beforeValue !== "string" || typeof afterValue !== "string") {
      throw httpError(409, "immutable_markup_value_invalid", `The approved markup-backed value is invalid: ${path}.`);
    }
    validateVisibleDiff(beforeValue, afterValue, operations, path);
    return;
  }

  throw httpError(409, "immutable_setting_operation_invalid", `Unsupported approved operation type for ${path}: ${kind}.`);
}

function validateVisibleDiff(beforeSource, afterSource, operations, label) {
  if (sourceSkeleton(beforeSource) !== sourceSkeleton(afterSource)) {
    throw httpError(409, "immutable_non_text_structure_changed", `The approved candidate changes non-text structure in ${label}.`);
  }
  const beforeSegments = visibleTextSegments(beforeSource);
  const afterSegments = visibleTextSegments(afterSource);
  if (beforeSegments.length !== afterSegments.length) {
    throw httpError(409, "immutable_segment_count_changed", `The approved candidate changes visible-text segmentation in ${label}.`);
  }

  const approvedByIndex = new Map();
  for (const operation of operations) {
    if (!["json-markup-text", "liquid-text"].includes(operation?.kind)) {
      throw httpError(409, "immutable_visible_operation_invalid", `Unsupported visible-text operation in ${label}.`);
    }
    const index = Number(operation.segmentIndex);
    if (!Number.isInteger(index) || approvedByIndex.has(index)) {
      throw httpError(409, "immutable_segment_identity_invalid", `The approved text segment is invalid or duplicated in ${label}.`);
    }
    approvedByIndex.set(index, operation);
  }

  for (let index = 0; index < beforeSegments.length; index += 1) {
    const beforeText = beforeSegments[index].text;
    const afterText = afterSegments[index].text;
    const operation = approvedByIndex.get(index);
    if (operation) {
      if (afterText !== operation.after || afterText === beforeText) {
        throw httpError(409, "immutable_segment_candidate_invalid", `The approved replacement is not present at segment ${index} in ${label}.`);
      }
    } else if (afterText !== beforeText) {
      throw httpError(409, "immutable_unauthorized_segment_change", `The approved candidate changes an unauthorized text segment in ${label}.`);
    }
  }
}

function groupOperationsByPath(operations) {
  const groups = new Map();
  const seenIDs = new Set();
  for (const operation of operations) {
    if (!operation?.id || seenIDs.has(operation.id)) throw httpError(409, "immutable_operation_identity_invalid", "The approved operation identity is missing or duplicated.");
    seenIDs.add(operation.id);
    const scope = operation.scope === "block" ? "block" : "section";
    const path = `${scope}:${operation.sectionId}:${scope === "block" ? operation.blockId : "section"}:${operation.key}`;
    if (!groups.has(path)) groups.set(path, []);
    groups.get(path).push(operation);
  }
  return groups;
}

function templateStructureSignature(document) {
  const structure = {
    order: Array.isArray(document?.order) ? document.order : [],
    sections: Object.fromEntries(Object.entries(document?.sections || {}).map(([sectionId, section]) => [sectionId, {
      type: section?.type || "",
      disabled: Boolean(section?.disabled),
      settingKeys: Object.keys(section?.settings || {}).sort(),
      blocks: Object.fromEntries(Object.entries(section?.blocks || {}).map(([blockId, block]) => [blockId, {
        type: block?.type || "",
        settingKeys: Object.keys(block?.settings || {}).sort(),
      }])),
      blockOrder: Array.isArray(section?.block_order) ? section.block_order : [],
    }])),
  };
  return stableStringify(structure);
}

function visibleTextSegments(source) {
  const text = String(source || "");
  const ranges = protectedRanges(text);
  const segments = [];
  let cursor = 0;
  for (const range of [...ranges, { start: text.length, end: text.length }]) {
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
  if (!isVisibleCopy(value)) return;
  segments.push({ start: valueStart, end: valueEnd, text: value });
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

function sourceSkeleton(source) {
  const segments = visibleTextSegments(source);
  let result = String(source || "");
  for (const segment of [...segments].sort((left, right) => right.start - left.start)) {
    result = `${result.slice(0, segment.start)}§TEXT§${result.slice(segment.end)}`;
  }
  return result;
}

function isVisibleCopy(value) {
  const text = String(value || "").trim();
  if (text.length < 2 || text.length > 2400) return false;
  if ((text.match(/[A-Za-z]/g) || []).length < 2) return false;
  if (/^(https?:\/\/|\/|#|mailto:|tel:|shopify:\/\/)/i.test(text)) return false;
  if (/^[a-z0-9_.-]+\.(png|jpe?g|gif|webp|svg|css|js|json|liquid)$/i.test(text)) return false;
  return true;
}

function validateThemeBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") {
    throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  }
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN") {
    throw httpError(409, "main_theme_verification_failed", "The live MAIN theme could not be verified.");
  }
}

async function storeExecutionJob(request, jobID, result, summary) {
  const now = new Date().toISOString();
  const envelope = {
    jobID,
    status: "completed",
    build: KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD,
    submittedAt: now,
    updatedAt: now,
    completedAt: now,
    summary,
    result,
  };
  const key = new Request(new URL(`/_kairos/autonomous-execution-jobs/${jobID}`, request.url).toString(), { method: "GET" });
  await caches.default.put(key, new Response(JSON.stringify(envelope), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}`,
    },
  }));
}

function stagingPreviewURL(env, gid) {
  const origin = String(env.MMG_STOREFRONT_ORIGIN || "https://themindsetmediagroup.com").replace(/\/+$/, "");
  const themeID = String(gid || "").split("/").pop();
  return themeID ? `${origin}/?preview_theme_id=${encodeURIComponent(themeID)}` : origin;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepEqual(left, right) {
  return stableStringify(left) === stableStringify(right);
}

async function safeRequestJSON(request) {
  try { return await request.json(); }
  catch { return {}; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD,
      "X-Kairos-Immutable-Approved-Candidate": "true",
      "X-Kairos-Approval-Time-Reconstruction": "false",
      "X-Kairos-Workers-AI-Used": "false",
      "X-Kairos-Neurons-Consumed": "0",
      "X-Kairos-Visual-Baseline": "tuesday-command-center-6f96b10d",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
