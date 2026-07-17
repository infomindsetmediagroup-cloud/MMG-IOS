import {
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  validateHomepageDocument,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_DIRECT_HOMEPAGE_EXECUTION_BUILD = "kairos-direct-homepage-execution-20260717-1";

const EXECUTE_PATH = "/api/shopify/staging/execute/jobs";
const TEMPLATE_FILE = "templates/index.json";
const WEBSITE_MODE = "autonomous-text-only-v1";
const JOB_TTL_SECONDS = 60 * 60;
const DIRECT_PLAN_KERNEL = "direct-homepage-plan-v1";

export async function handleDirectHomepageExecution(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== EXECUTE_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  const planEnvelope = payload?.plan || {};
  const plan = planEnvelope?.plan || {};
  const packageResult = plan?.textOnlyPackage;
  const directPlan = planEnvelope?.kernel === DIRECT_PLAN_KERNEL
    || String(planEnvelope?.build || "").startsWith("kairos-direct-homepage-plan-");
  if (!directPlan) return null;

  const approval = payload?.approval || {};
  validateApproval(planEnvelope, plan, packageResult, approval);

  const files = Array.isArray(packageResult.files) ? packageResult.files : [];
  const filenames = files.map(file => clean(file?.filename, 300)).filter(Boolean);
  if (!files.length || filenames.length !== files.length || new Set(filenames).size !== filenames.length) {
    throw httpError(409, "direct_package_files_invalid", "The approved direct text package does not contain a valid unique file set.");
  }

  const inspection = await inspectStagingSource(
    null,
    request,
    env,
    KAIROS_DIRECT_HOMEPAGE_EXECUTION_BUILD,
    [TEMPLATE_FILE, ...filenames],
  );
  const evidence = inspection?.evidence || {};
  validateThemeBoundary(evidence.stagingTheme, evidence.mainTheme);
  validateTargetBoundary(plan, approval, evidence.stagingTheme);

  const currentFiles = new Map((evidence.files || []).map(file => [file.filename, file]));
  const verifiedCandidates = [];

  for (const approvedFile of files) {
    const filename = approvedFile.filename;
    const current = currentFiles.get(filename);
    validateCurrentFile(current, approvedFile, plan, approval);

    const rebuilt = await rebuildApprovedCandidate(current.content, approvedFile);
    if (rebuilt.candidateSource !== approvedFile.candidateSource) {
      throw httpError(409, "approved_candidate_source_mismatch", `${filename} no longer produces the exact approved text-only candidate.`);
    }
    if (rebuilt.afterSha256 !== approvedFile.afterSha256) {
      throw httpError(409, "approved_candidate_hash_mismatch", `${filename} no longer matches the approved candidate hash.`);
    }
    if (rebuilt.structureSignature !== approvedFile.structureSignature) {
      throw httpError(409, "approved_structure_signature_mismatch", `${filename} no longer matches the approved structural signature.`);
    }

    verifiedCandidates.push({
      filename,
      content: rebuilt.candidateSource,
      beforeSha256: current.sha256,
      afterSha256: rebuilt.afterSha256,
      structureSignature: rebuilt.structureSignature,
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
    KAIROS_DIRECT_HOMEPAGE_EXECUTION_BUILD,
    [TEMPLATE_FILE, ...filenames],
  );
  const readBackMap = new Map((readBackInspection?.evidence?.files || []).map(file => [file.filename, file]));
  const verification = [];

  for (const candidate of verifiedCandidates) {
    const readBack = readBackMap.get(candidate.filename);
    const matched = Boolean(readBack?.content === candidate.content && readBack?.sha256 === candidate.afterSha256);
    if (!matched) {
      throw httpError(502, "direct_staging_readback_mismatch", `Shopify did not preserve the exact approved source for ${candidate.filename}.`);
    }
    verification.push({
      filename: candidate.filename,
      expectedSha256: candidate.afterSha256,
      actualSha256: readBack.sha256,
      matched: true,
      textOnly: true,
      structurePreserved: true,
      approvalTimeRebindingUsed: false,
    });
  }

  const completedAt = new Date().toISOString();
  const previewURL = stagingPreviewURL(env, evidence.stagingTheme.gid);
  const operations = Array.isArray(packageResult.operations) ? packageResult.operations : [];
  const result = {
    actionID: crypto.randomUUID(),
    actionType: "shopify.staging.execute",
    status: "completed",
    build: KAIROS_DIRECT_HOMEPAGE_EXECUTION_BUILD,
    kernel: "direct-homepage-execution-v1",
    completedAt,
    objective: planEnvelope.objective || approval.objective || "Approved homepage text update",
    summary: `Kairos applied ${operations.length} approved visible text replacement${operations.length === 1 ? "" : "s"} directly to the verified staging snapshot and confirmed every file read-back.`,
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
      })),
      textOnly: true,
      directApprovedPackage: true,
      approvalTimeRebindingUsed: false,
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
      approvedPackageExecutedDirectly: true,
      sourceHashesVerified: true,
      candidateHashesVerified: true,
      structuralSignaturesVerified: true,
      approvalTimeInventoryRebuildUsed: false,
      workersAIUsed: false,
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
      instruction: "Rollback restores the exact pre-execution Kairos Staging file bytes. Shopify MAIN was never modified.",
    },
  };

  const jobID = crypto.randomUUID();
  await storeExecutionJob(request, jobID, result, result.summary);
  return json({
    jobID,
    status: "completed",
    build: KAIROS_DIRECT_HOMEPAGE_EXECUTION_BUILD,
    pollURL: `/api/shopify/staging/execute/jobs/${jobID}`,
    summary: result.summary,
    result,
  }, 202);
}

function validateApproval(planEnvelope, plan, packageResult, approval) {
  if (!planEnvelope?.planID || approval?.status !== "approved" || approval?.planID !== planEnvelope.planID) {
    throw httpError(403, "approval_required", "Approve the exact direct text-only plan before Kairos writes any Shopify file.");
  }
  if (plan?.installationMode !== WEBSITE_MODE || packageResult?.version !== WEBSITE_MODE) {
    throw httpError(409, "direct_text_package_missing", "The approved direct text-only package is missing or invalid.");
  }
  if (plan?.structuralMutationAuthorized !== false
    || plan?.styleMutationAuthorized !== false
    || plan?.visualMutationAuthorized !== false
    || plan?.liveThemeMutationAuthorized !== false
    || plan?.productionPublishAuthorized !== false) {
    throw httpError(409, "direct_plan_boundary_invalid", "The approved plan does not preserve the required staging-only text boundary.");
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
    throw httpError(409, "staging_source_changed", `${filename} changed after approval. Start a new text-only job from the current MAIN duplicate.`);
  }
}

async function rebuildApprovedCandidate(currentSource, approvedFile) {
  const operations = Array.isArray(approvedFile?.operations) ? approvedFile.operations : [];
  if (!operations.length) {
    throw httpError(409, "approved_operations_missing", `${approvedFile.filename} does not contain approved text operations.`);
  }

  let candidateSource;
  let structureSignature;
  if (approvedFile.filename === TEMPLATE_FILE) {
    const original = parseShopifyJson(currentSource, "Current Kairos Staging homepage");
    const candidate = applyTemplateOperations(original, operations);
    validateHomepageDocument(candidate, original);
    candidateSource = serializeLikeSource(currentSource, candidate);
    structureSignature = templateStructureSignature(original);
    if (templateStructureSignature(candidate) !== structureSignature) {
      throw httpError(409, "template_structure_changed", "The approved direct text package changes the Shopify homepage structure.");
    }
  } else {
    candidateSource = applyVisibleOperations(currentSource, operations);
    structureSignature = sourceSkeleton(currentSource);
    if (sourceSkeleton(candidateSource) !== structureSignature) {
      throw httpError(409, "liquid_structure_changed", `${approvedFile.filename} changes content outside approved visible text nodes.`);
    }
  }

  return {
    candidateSource,
    afterSha256: await hashText(candidateSource),
    structureSignature,
  };
}

function applyTemplateOperations(original, operations) {
  const candidate = structuredClone(original);

  for (const item of operations.filter(operation => operation.kind === "json-text")) {
    validateOperation(item);
    const current = getSetting(candidate, item);
    if (current !== item.before) {
      throw httpError(409, "approved_text_source_changed", `The approved source text changed for ${item.id}.`);
    }
    setSetting(candidate, item, item.after);
  }

  const groups = new Map();
  for (const item of operations.filter(operation => operation.kind === "json-markup-text")) {
    validateOperation(item);
    const key = `${item.scope}:${item.sectionId}:${item.blockId}:${item.key}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  for (const items of groups.values()) {
    const before = getSetting(candidate, items[0]);
    const after = applyVisibleOperations(before, items);
    if (sourceSkeleton(before) !== sourceSkeleton(after)) {
      throw httpError(409, "markup_structure_changed", "The approved markup-backed text operations change non-text structure.");
    }
    setSetting(candidate, items[0], after);
  }

  const unsupported = operations.filter(operation => !["json-text", "json-markup-text"].includes(operation?.kind));
  if (unsupported.length) {
    throw httpError(409, "template_operation_kind_invalid", "The template package contains an unsupported operation kind.");
  }
  return candidate;
}

function applyVisibleOperations(source, operations) {
  let candidate = String(source || "");
  const segments = visibleTextSegments(candidate);
  const replacements = operations.map(item => {
    validateOperation(item);
    if (!["liquid-text", "json-markup-text"].includes(item.kind)) {
      throw httpError(409, "visible_operation_kind_invalid", `Unsupported visible text operation: ${item.kind || "unknown"}.`);
    }
    const index = Number(item.segmentIndex);
    const segment = Number.isInteger(index) ? segments[index] : null;
    if (!segment || segment.text !== item.before) {
      throw httpError(409, "approved_text_segment_changed", `The approved source text changed for ${item.id}.`);
    }
    return { start: segment.start, end: segment.end, after: item.after };
  }).sort((left, right) => right.start - left.start);

  for (const replacement of replacements) {
    candidate = `${candidate.slice(0, replacement.start)}${replacement.after}${candidate.slice(replacement.end)}`;
  }
  return candidate;
}

function validateOperation(item) {
  if (!item?.id || !item?.filename || !item?.kind || typeof item?.before !== "string" || typeof item?.after !== "string") {
    throw httpError(409, "approved_operation_invalid", "An approved text operation is incomplete.");
  }
  if (!safeReplacement(item.after) || item.after === item.before) {
    throw httpError(409, "approved_replacement_invalid", `The approved replacement is invalid for ${item.id}.`);
  }
}

function applySettingPath(document, item) {
  const section = document?.sections?.[item.sectionId];
  if (!section) throw httpError(409, "section_missing", `Homepage section ${item.sectionId} is missing.`);
  if (item.scope === "section") return section.settings;
  if (item.scope !== "block") throw httpError(409, "setting_scope_invalid", `Unsupported setting scope for ${item.id}.`);
  const block = section?.blocks?.[item.blockId];
  if (!block) throw httpError(409, "block_missing", `Homepage block ${item.sectionId}/${item.blockId} is missing.`);
  return block.settings;
}

function getSetting(document, item) {
  const settings = applySettingPath(document, item);
  if (!settings || typeof settings[item.key] !== "string") {
    throw httpError(409, "text_setting_missing", `Text setting ${item.id} is missing.`);
  }
  return settings[item.key];
}

function setSetting(document, item, value) {
  const settings = applySettingPath(document, item);
  if (!settings || typeof settings[item.key] !== "string") {
    throw httpError(409, "text_setting_missing", `Text setting ${item.id} is missing.`);
  }
  settings[item.key] = value;
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
    while ((match = pattern.exec(source))) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
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

function serializeLikeSource(source, document) {
  const text = String(source || "");
  const leadingComment = text.trimStart().startsWith("/*") ? text.slice(0, text.indexOf("*/") + 2) : "";
  const indent = /\n(\s+)"/.exec(text)?.[1]?.length || 2;
  const newline = text.endsWith("\n") ? "\n" : "";
  return `${leadingComment ? `${leadingComment}\n` : ""}${JSON.stringify(document, null, indent)}${newline}`;
}

function validateThemeBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") {
    throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  }
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN") {
    throw httpError(409, "main_theme_verification_failed", "The live MAIN theme could not be verified.");
  }
}

function isVisibleCopy(value) {
  const text = String(value || "").trim();
  if (text.length < 2 || text.length > 1600) return false;
  if ((text.match(/[A-Za-z]/g) || []).length < 2) return false;
  if (/^(https?:\/\/|\/|#|mailto:|tel:|shopify:\/\/)/i.test(text)) return false;
  if (/^[a-z0-9_.-]+\.(png|jpe?g|gif|webp|svg|css|js|json|liquid)$/i.test(text)) return false;
  if (/^[a-z0-9_.-]+$/i.test(text) && !/\s/.test(text) && text.length < 30) return false;
  return true;
}

function safeReplacement(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 2400) return false;
  if (/<\/?(?:script|style|iframe|object|embed|form)\b/i.test(text)) return false;
  if (/{{|}}|{%|%}|javascript:|\bon[a-z]+\s*=/i.test(text)) return false;
  return true;
}

async function storeExecutionJob(request, jobID, result, summary) {
  const now = new Date().toISOString();
  const envelope = {
    jobID,
    status: "completed",
    build: KAIROS_DIRECT_HOMEPAGE_EXECUTION_BUILD,
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

function clean(value, max) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
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
      "X-MMG-Runtime": KAIROS_DIRECT_HOMEPAGE_EXECUTION_BUILD,
      "X-Kairos-Direct-Approved-Package": "true",
      "X-Kairos-Approval-Time-Rebinding": "false",
      "X-Kairos-Workers-AI-Used": "false",
      "X-Kairos-Neurons-Consumed": "0",
      "X-Kairos-Visual-Baseline": "tuesday-command-center-6f96b10d",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
