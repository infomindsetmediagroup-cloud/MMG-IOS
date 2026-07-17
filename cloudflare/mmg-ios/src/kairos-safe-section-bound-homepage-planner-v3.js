import {
  hashText,
  httpError,
  parseShopifyJson,
  validateHomepageDocument,
} from "./kairos-compact-homepage-utils-v1.js";
import {
  handleSectionBoundHomepagePlan,
  KAIROS_SECTION_BOUND_HOMEPAGE_PLANNER_BUILD,
} from "./kairos-section-bound-homepage-planner-v2.js";

export const KAIROS_SAFE_SECTION_BOUND_HOMEPAGE_BUILD = "kairos-safe-section-bound-homepage-20260717-3";

const TEMPLATE_FILE = "templates/index.json";
const WEBSITE_MODE = "autonomous-text-only-v1";
const JOB_TTL_SECONDS = 60 * 60;

const GLOBAL_CHROME_TEXT = new Set([
  "Mindset Media Group™",
  "Mindset Media Group",
  "Books · AI · Business · Creator Education",
  "Back to Top",
]);

export async function handleSafeSectionBoundHomepagePlan(request, env, continuation = null) {
  const response = await handleSectionBoundHomepagePlan(request, env, continuation);
  if (!response) return null;

  const payload = await responseJSON(response);
  const result = payload?.result;
  const plan = result?.plan;
  const packageResult = plan?.textOnlyPackage;
  if (!packageResult?.files?.length) return response;

  const safeOperations = (packageResult.operations || []).filter(operation => !isGlobalChromeOperation(operation));
  if (!safeOperations.length) {
    throw httpError(409, "safe_section_bound_no_content_changes", "Kairos preserved global homepage chrome and found no remaining section-bound content substitutions.");
  }

  const removedOperations = (packageResult.operations || []).filter(isGlobalChromeOperation);
  const rebuiltPackage = await rebuildPackage(packageResult, safeOperations);
  const summary = `Kairos prepared ${safeOperations.length} section-bound constitutional text substitution${safeOperations.length === 1 ? "" : "s"}. Global homepage chrome was explicitly preserved and excluded from content curation.`;

  result.build = KAIROS_SAFE_SECTION_BOUND_HOMEPAGE_BUILD;
  result.summary = summary;
  plan.summary = summary;
  plan.textOnlyPackage = rebuiltPackage;
  plan.sourceHashes = rebuiltPackage.sourceHashes;
  plan.changes = rebuiltPackage.files.map(file => ({
    filename: file.filename,
    changeType: "replace-visible-section-text-in-place",
    purpose: `${file.operations.length} section-bound text substitution${file.operations.length === 1 ? "" : "s"}.`,
    expectedOutcome: "The existing page remains byte-identical outside approved visible section text. Global brand strip, page frame, navigation destinations, and Back to Top remain unchanged.",
  }));
  plan.globalHomepageChromePreserved = true;
  plan.outerCustomLiquidWrapperIsNotContentSection = true;
  plan.removedGlobalChromeOperations = removedOperations.map(operation => operation.id);
  plan.sectionIdentityPreserved = true;
  plan.genericJourneyZoneAssignmentUsed = false;
  plan.positionFallbackUsed = false;
  plan.sectionRepurposingAuthorized = false;

  result.evidence = {
    ...(result.evidence || {}),
    plannerMode: "safe-constitutional-inner-section-bound-copy",
    underlyingPlanner: KAIROS_SECTION_BOUND_HOMEPAGE_PLANNER_BUILD,
    globalHomepageChromePreserved: true,
    outerCustomLiquidWrapperIsNotContentSection: true,
    removedGlobalChromeOperationCount: removedOperations.length,
    replacementCount: safeOperations.length,
    filesChanged: rebuiltPackage.files.length,
    urlsChanged: false,
    designChanged: false,
    structureChanged: false,
    workersAIUsed: false,
    privateRuntimeUsed: false,
    neuronsConsumed: 0,
  };

  payload.build = KAIROS_SAFE_SECTION_BOUND_HOMEPAGE_BUILD;
  payload.summary = summary;
  payload.result = result;
  await storePlanJob(request, payload.jobID, result, summary);
  return json(payload, response.status || 202);
}

function isGlobalChromeOperation(operation) {
  const before = String(operation?.before || "").trim();
  if (GLOBAL_CHROME_TEXT.has(before)) return true;
  if (/^back\s+to\s+top$/i.test(before)) return true;
  return false;
}

async function rebuildPackage(originalPackage, operations) {
  const grouped = groupBy(operations, operation => operation.filename);
  const files = [];
  const sourceHashes = {};

  for (const originalFile of originalPackage.files || []) {
    const fileOperations = grouped.get(originalFile.filename) || [];
    if (!fileOperations.length) continue;

    let candidateSource;
    if (originalFile.filename === TEMPLATE_FILE) {
      const original = parseShopifyJson(originalFile.beforeSource, "Current managed Kairos Staging homepage");
      const candidate = applyTemplateOperations(original, fileOperations);
      validateHomepageDocument(candidate, original);
      candidateSource = serializeLikeSource(originalFile.beforeSource, candidate);
    } else {
      candidateSource = applyVisibleOperations(originalFile.beforeSource, fileOperations);
      if (sourceSkeleton(candidateSource) !== sourceSkeleton(originalFile.beforeSource)) {
        throw httpError(409, "safe_section_bound_structure_changed", `${originalFile.filename} changed outside approved visible section text.`);
      }
    }

    const afterSha256 = await hashText(candidateSource);
    if (afterSha256 === originalFile.beforeSha256) continue;
    sourceHashes[originalFile.filename] = originalFile.beforeSha256;
    files.push({
      ...originalFile,
      afterSha256,
      candidateSource,
      operations: fileOperations.map(compactOperation),
    });
  }

  if (!files.length) throw httpError(409, "safe_section_bound_package_unchanged", "The safe section-bound planner produced no source change.");
  return {
    version: WEBSITE_MODE,
    operations: operations.map(compactOperation),
    files,
    sourceHashes,
    sectionFiles: files.filter(file => file.filename.startsWith("sections/")).map(file => file.filename),
  };
}

function applyTemplateOperations(original, operations) {
  const candidate = structuredClone(original);
  for (const operation of operations.filter(item => item.kind === "json-text")) {
    setSetting(candidate, operation, operation.after);
  }

  const groups = groupBy(
    operations.filter(item => item.kind === "json-markup-text"),
    item => `${item.scope}:${item.sectionId}:${item.blockId}:${item.key}`,
  );
  for (const items of groups.values()) {
    const before = getSetting(candidate, items[0]);
    const after = applyVisibleOperations(before, items);
    if (sourceSkeleton(before) !== sourceSkeleton(after)) {
      throw httpError(409, "safe_section_bound_markup_structure_changed", "A markup-backed setting changed outside approved visible text nodes.");
    }
    setSetting(candidate, items[0], after);
  }

  const unsupported = operations.filter(item => !["json-text", "json-markup-text"].includes(item.kind));
  if (unsupported.length) throw httpError(409, "safe_section_bound_template_operation_invalid", "The template plan contains an unsupported operation type.");
  return candidate;
}

function applyVisibleOperations(source, operations) {
  let candidate = String(source || "");
  const segments = visibleTextSegments(candidate);
  const replacements = operations.map(operation => {
    const segment = Number.isInteger(operation.segmentIndex) ? segments[operation.segmentIndex] : null;
    if (!segment) throw httpError(409, "safe_section_bound_segment_missing", `The visible text segment is missing for ${operation.id}.`);
    return { start: segment.start, end: segment.end, after: operation.after };
  }).sort((left, right) => right.start - left.start);

  for (const replacement of replacements) {
    candidate = `${candidate.slice(0, replacement.start)}${replacement.after}${candidate.slice(replacement.end)}`;
  }
  return candidate;
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
  if (isVisibleCopy(value)) segments.push({ start: valueStart, end: valueEnd, text: value });
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
  let result = String(source || "");
  for (const segment of [...visibleTextSegments(result)].sort((left, right) => right.start - left.start)) {
    result = `${result.slice(0, segment.start)}§TEXT§${result.slice(segment.end)}`;
  }
  return result;
}

function isVisibleCopy(value) {
  const text = String(value || "").trim();
  if (text.length < 2 || text.length > 2400) return false;
  if ((text.match(/[A-Za-z]/g) || []).length < 2) return false;
  if (/^(https?:\/\/|\/|#|mailto:|tel:|shopify:\/\/)/i.test(text)) return false;
  return true;
}

function applySettingPath(document, operation) {
  const section = document.sections?.[operation.sectionId];
  if (!section) throw httpError(409, "safe_section_bound_section_missing", `Homepage section ${operation.sectionId} is missing.`);
  if (operation.scope === "section") return section.settings;
  const block = section.blocks?.[operation.blockId];
  if (!block) throw httpError(409, "safe_section_bound_block_missing", `Homepage block ${operation.sectionId}/${operation.blockId} is missing.`);
  return block.settings;
}

function getSetting(document, operation) {
  const settings = applySettingPath(document, operation);
  if (!settings || typeof settings[operation.key] !== "string") throw httpError(409, "safe_section_bound_setting_missing", `Text setting ${operation.id} is missing.`);
  return settings[operation.key];
}

function setSetting(document, operation, value) {
  const settings = applySettingPath(document, operation);
  if (!settings || typeof settings[operation.key] !== "string") throw httpError(409, "safe_section_bound_setting_missing", `Text setting ${operation.id} is missing.`);
  settings[operation.key] = value;
}

function compactOperation(operation) {
  return {
    id: operation.id,
    kind: operation.kind,
    filename: operation.filename,
    scope: operation.scope || "",
    sectionId: operation.sectionId || "",
    blockId: operation.blockId || "",
    key: operation.key || "",
    segmentIndex: Number.isInteger(operation.segmentIndex) ? operation.segmentIndex : null,
    before: operation.before,
    after: operation.after,
    reason: operation.reason || "",
    zone: operation.zone || "",
  };
}

function serializeLikeSource(source, document) {
  const text = String(source || "");
  const leadingComment = text.trimStart().startsWith("/*") ? text.slice(0, text.indexOf("*/") + 2) : "";
  const indent = /\n(\s+)"/.exec(text)?.[1]?.length || 2;
  const newline = text.endsWith("\n") ? "\n" : "";
  return `${leadingComment ? `${leadingComment}\n` : ""}${JSON.stringify(document, null, indent)}${newline}`;
}

function groupBy(values, keyFn) {
  const map = new Map();
  for (const value of values) {
    const key = keyFn(value);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }
  return map;
}

async function responseJSON(response) {
  try { return await response.clone().json(); }
  catch { return null; }
}

async function storePlanJob(request, jobID, result, summary) {
  const now = new Date().toISOString();
  const envelope = { jobID, status: "completed", build: KAIROS_SAFE_SECTION_BOUND_HOMEPAGE_BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary, result };
  const key = new Request(new URL(`/_kairos/autonomous-plan-jobs/${jobID}`, request.url).toString(), { method: "GET" });
  await caches.default.put(key, new Response(JSON.stringify(envelope), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}` } }));
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_SAFE_SECTION_BOUND_HOMEPAGE_BUILD,
      "X-Kairos-Global-Homepage-Chrome-Preserved": "true",
      "X-Kairos-Outer-Wrapper-Is-Content-Section": "false",
      "X-Kairos-Generic-Zone-Assignment": "false",
      "X-Kairos-Section-Repurposing-Authorized": "false",
      "X-Kairos-Workers-AI-Used": "false",
      "X-Kairos-Neurons-Consumed": "0",
      "X-Kairos-Visual-Baseline": "tuesday-command-center-6f96b10d",
    },
  });
}
