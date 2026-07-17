import {
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  validateHomepageDocument,
} from "./kairos-compact-homepage-utils-v1.js";
import {
  KAIROS_CANONICAL_HOMEPAGE_COPY,
  KAIROS_CANONICAL_HOMEPAGE_COPY_BUILD,
  KAIROS_HOMEPAGE_DOCTRINE_IDS,
} from "./kairos-canonical-homepage-copy-v1.js";

export const KAIROS_SECTION_BOUND_HOMEPAGE_PLANNER_BUILD = "kairos-section-bound-homepage-planner-20260717-2";

const PLAN_PATH = "/api/shopify/staging/plan/jobs";
const TEMPLATE_FILE = "templates/index.json";
const WEBSITE_MODE = "autonomous-text-only-v1";
const JOB_TTL_SECONDS = 60 * 60;
const MAX_OPERATIONS = 200;
const MAX_SECTION_FILES = 48;

const GENERIC_SHARED_SECTION_TYPES = new Set([
  "announcement-bar", "apps", "blog-posts", "collage", "collection-list", "contact-form", "custom-liquid",
  "email-signup-banner", "featured-blog", "featured-collection", "featured-product", "footer", "header",
  "image-banner", "image-with-text", "main-blog", "main-cart-footer", "main-cart-items", "main-collection-banner",
  "main-collection-product-grid", "main-list-collections", "main-page", "main-product", "multicolumn", "newsletter",
  "page", "password-footer", "password-header", "predictive-search", "related-products", "rich-text", "slideshow",
]);

export async function handleSectionBoundHomepagePlan(request, env, continuation = null) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== PLAN_PATH || !continuation?.active) return null;

  const source = await inspectHomepageSource(request, env);
  const inventory = buildSectionBoundInventory(source);
  if (!inventory.length) throw httpError(409, "section_bound_inventory_empty", "Kairos could not locate safe visible homepage text in the managed staging source.");

  assertUniqueIDs(inventory);
  const groups = groupSemanticRegions(inventory);
  const reviews = [];
  const operations = [];

  for (const group of groups) {
    const classification = classifySemanticRegion(group);
    const copy = classification.identity ? KAIROS_CANONICAL_HOMEPAGE_COPY[classification.identity] : null;
    const selected = copy ? buildRegionOperations(group.items, copy, classification.identity) : [];
    operations.push(...selected);
    reviews.push({
      semanticRegion: group.key,
      shopifySectionId: group.sectionId,
      shopifySectionType: group.sectionType,
      htmlSectionId: group.htmlSectionId || "",
      sectionIndex: group.sectionIndex,
      identity: classification.identity || "preserved",
      confidence: classification.confidence,
      evidence: classification.evidence,
      textLocationsReviewed: group.items.length,
      replacementsPrepared: selected.length,
    });
  }

  const finalOperations = dedupe(operations).slice(0, MAX_OPERATIONS);
  if (!finalOperations.length) throw httpError(409, "section_bound_no_safe_changes", "Kairos reviewed every safe homepage text region but found no in-place constitutional substitutions that preserve the current section purposes.");

  const packageResult = await buildTextPackage(source, finalOperations);
  const changedIdentities = unique(finalOperations.map(operation => operation.identity));
  const preservedRegions = reviews.filter(review => review.replacementsPrepared === 0).map(review => review.semanticRegion);
  const now = new Date().toISOString();
  const summary = `Kairos prepared ${finalOperations.length} section-bound text substitution${finalOperations.length === 1 ? "" : "s"} across ${changedIdentities.length} canonical homepage purpose${changedIdentities.length === 1 ? "" : "s"}. Each inner Custom Liquid section retained its own identity.`;

  const result = {
    actionID: crypto.randomUUID(),
    planID: crypto.randomUUID(),
    actionType: "shopify.staging.plan",
    status: "ready-for-approval",
    readOnly: true,
    build: KAIROS_SECTION_BOUND_HOMEPAGE_PLANNER_BUILD,
    kernel: "direct-homepage-plan-v1",
    startedAt: now,
    completedAt: now,
    objective: continuation.originalObjective || "Curate the existing homepage copy in place.",
    summary,
    plan: {
      summary,
      strategy: "Inspect the complete current homepage, resolve actual inner HTML section boundaries inside Custom Liquid, preserve each section’s existing purpose, consult the canonical MMG constitutional doctrine and v6.6 homepage source, and replace only visible text at the same verified source paths.",
      changes: packageResult.files.map(file => ({
        filename: file.filename,
        changeType: "replace-visible-text-in-place",
        purpose: `${file.operations.length} section-bound text substitution${file.operations.length === 1 ? "" : "s"}.`,
        expectedOutcome: "The same storefront, same sections, same blocks, same links, same design, and same behavior with canonical wording substituted only into existing visible text locations.",
      })),
      risks: ["Longer approved wording may wrap differently inside the unchanged design."],
      acceptanceCriteria: [
        "The first actual hero region remains the hero and cannot receive publishing, subscription, service, product, mission, or Kairos-section copy.",
        "Every internal Custom Liquid <section> is classified independently by its existing id, classes, aria label, and visible copy.",
        "Unknown or ambiguous regions remain unchanged rather than being repurposed.",
        "Only existing visible text values may change.",
        "Every URL, href, product reference, collection reference, menu, section, block, Liquid token, HTML element, CSS rule, JavaScript behavior, asset, color, typography rule, spacing value, layout instruction, animation, and responsive rule remains unchanged.",
        "All writes target Kairos Staging only and every changed file is read back exactly.",
        "Shopify MAIN remains unchanged.",
      ],
      rollbackPlan: packageResult.files.map(file => `Restore the exact pre-execution bytes for ${file.filename}.`),
      installationMode: WEBSITE_MODE,
      textOnlyPackage: packageResult,
      targetTheme: source.stagingTheme,
      publishedTheme: source.mainTheme,
      sourceHashes: packageResult.sourceHashes,
      executable: true,
      textOnly: true,
      preserveExistingDesign: true,
      continuationMode: true,
      preserveManagedStaging: true,
      duplicateMainBeforePlanning: false,
      priorApprovedTextPreserved: true,
      constitutionalAuthority: KAIROS_HOMEPAGE_DOCTRINE_IDS,
      canonicalCopySource: "MMG-HOMEPAGE-v6.6.0-KAIROS-OPERATIONAL-ACTIVATION-GREEN-CANDIDATE",
      canonicalCopyRegistry: KAIROS_CANONICAL_HOMEPAGE_COPY_BUILD,
      innerHTMLSectionBoundariesUsed: true,
      sectionIdentityPreserved: true,
      genericJourneyZoneAssignmentUsed: false,
      positionFallbackUsed: false,
      sectionRepurposingAuthorized: false,
      structuralMutationAuthorized: false,
      styleMutationAuthorized: false,
      visualMutationAuthorized: false,
      liquidStructureMutationAuthorized: false,
      cssMutationAuthorized: false,
      assetMutationAuthorized: false,
      linkMutationAuthorized: false,
      liveThemeMutationAuthorized: false,
      productionPublishAuthorized: false,
      semanticRegionReview: reviews,
      preservedSemanticRegions: preservedRegions,
      journeyCoverage: {
        reviewed: unique(reviews.map(review => review.identity).filter(identity => identity !== "preserved")),
        coveredByChanges: changedIdentities,
        preservedBecauseIdentityWasUncertain: preservedRegions,
        complete: reviews.every(review => review.replacementsPrepared > 0 || review.identity === "preserved"),
      },
    },
    evidence: {
      sourceInspectionActionID: source.actionID,
      sourceAdapter: "shopify-graphql-theme-files",
      plannerMode: "constitutional-inner-section-bound-in-place-copy",
      constitutionalAuthority: KAIROS_HOMEPAGE_DOCTRINE_IDS,
      canonicalCopySource: "MMG-HOMEPAGE-v6.6.0-KAIROS-OPERATIONAL-ACTIVATION-GREEN-CANDIDATE",
      innerHTMLSectionBoundariesUsed: true,
      templateAndSectionSourceCoverage: true,
      templateFileInspected: true,
      sectionFilesRequested: source.sectionFiles.length,
      sectionFilesReadable: source.sectionFiles.filter(filename => source.files.has(filename)).length,
      semanticRegionsReviewed: reviews.length,
      unknownRegionsPreserved: preservedRegions.length,
      inventoryCount: inventory.length,
      replacementCount: finalOperations.length,
      filesChanged: packageResult.files.length,
      currentManagedStagingReused: true,
      heroIdentityLocked: true,
      genericJourneyZoneAssignmentUsed: false,
      positionFallbackUsed: false,
      sectionRepurposingAuthorized: false,
      urlsChanged: false,
      designChanged: false,
      structureChanged: false,
      workersAIUsed: false,
      privateRuntimeUsed: false,
      neuronsConsumed: 0,
      visualBaseline: "tuesday-command-center-6f96b10d",
      browserSurfaceChanged: false,
    },
  };

  const jobID = crypto.randomUUID();
  await storePlanJob(request, jobID, result, summary);
  return json({ jobID, status: "completed", build: KAIROS_SECTION_BOUND_HOMEPAGE_PLANNER_BUILD, pollURL: `/api/shopify/staging/plan/jobs/${jobID}`, summary, result }, 202);
}

async function inspectHomepageSource(request, env) {
  const firstInspection = await inspectStagingSource(null, request, env, KAIROS_SECTION_BOUND_HOMEPAGE_PLANNER_BUILD, [TEMPLATE_FILE]);
  const firstEvidence = firstInspection?.evidence || {};
  validateThemeBoundary(firstEvidence.stagingTheme, firstEvidence.mainTheme);
  const firstTemplate = fileByName(firstEvidence.files, TEMPLATE_FILE);
  if (!firstTemplate?.content) throw httpError(409, "section_bound_template_unavailable", "Kairos could not read templates/index.json from the managed staging theme.");
  const firstDocument = parseShopifyJson(firstTemplate.content, "Current managed Kairos Staging homepage");
  validateHomepageDocument(structuredClone(firstDocument), firstDocument);

  const sectionFiles = deriveSectionFiles(firstDocument).slice(0, MAX_SECTION_FILES);
  const inspection = sectionFiles.length
    ? await inspectStagingSource(null, request, env, KAIROS_SECTION_BOUND_HOMEPAGE_PLANNER_BUILD, [TEMPLATE_FILE, ...sectionFiles])
    : firstInspection;
  const evidence = inspection?.evidence || {};
  validateThemeBoundary(evidence.stagingTheme, evidence.mainTheme);
  const templateFile = fileByName(evidence.files, TEMPLATE_FILE);
  if (!templateFile?.content) throw httpError(409, "section_bound_template_unavailable", "Kairos could not read templates/index.json from the managed staging theme.");
  const document = parseShopifyJson(templateFile.content, "Current managed Kairos Staging homepage");
  validateHomepageDocument(structuredClone(document), document);
  return {
    actionID: inspection.actionID,
    stagingTheme: evidence.stagingTheme,
    mainTheme: evidence.mainTheme,
    templateFile,
    document,
    sectionFiles,
    files: new Map((evidence.files || []).map(file => [file.filename, file])),
  };
}

function deriveSectionFiles(document) {
  const order = Array.isArray(document?.order) ? document.order : Object.keys(document?.sections || {});
  return unique(order
    .map(sectionId => String(document?.sections?.[sectionId]?.type || "").trim().toLowerCase())
    .filter(type => /^[a-z0-9_-]+$/.test(type) && type !== "apps")
    .map(type => `sections/${type}.liquid`));
}

function buildSectionBoundInventory(source) {
  const template = buildTemplateInventory(source);
  const liquid = buildSafeSectionLiquidInventory(source);
  return [...template, ...liquid].sort((left, right) => left.sectionIndex - right.sectionIndex || left.sourceOrder - right.sourceOrder || left.filename.localeCompare(right.filename));
}

function buildTemplateInventory(source) {
  const document = source.document;
  const order = Array.isArray(document?.order) ? document.order : Object.keys(document?.sections || {});
  const sectionIndex = new Map(order.map((id, index) => [id, index]));
  const inventory = [];

  for (const [sectionId, section] of Object.entries(document?.sections || {})) {
    const context = {
      sectionId,
      sectionType: String(section?.type || ""),
      sectionIndex: sectionIndex.get(sectionId) ?? 999,
      sectionCount: Math.max(order.length, 1),
    };
    collectSettings(inventory, "section", context, "", "", section?.settings || {}, source);
    for (const [blockId, block] of Object.entries(section?.blocks || {})) {
      collectSettings(inventory, "block", context, blockId, String(block?.type || ""), block?.settings || {}, source);
    }
  }
  return inventory;
}

function collectSettings(inventory, scope, context, blockId, blockType, settings, source) {
  let sourceOrder = 0;
  for (const [key, value] of Object.entries(settings || {})) {
    sourceOrder += 1;
    if (typeof value !== "string" || !value.trim()) continue;
    const path = `${scope}:${context.sectionId}:${blockId || "section"}:${key}`;
    const markupContainer = isMarkupContainer(context.sectionType, blockType, key, value);

    if (markupContainer) {
      const segments = visibleTextSegments(value);
      segments.forEach((segment, segmentIndex) => {
        const region = findSemanticRegion(value, segment.start, `${path}:root`);
        inventory.push({
          id: `json:${path}:segment:${segmentIndex}`,
          kind: "json-markup-text",
          filename: TEMPLATE_FILE,
          scope,
          sectionId: context.sectionId,
          blockId,
          key,
          segmentIndex,
          before: segment.text,
          role: inferSegmentRole(value, segment, key),
          sectionType: context.sectionType,
          blockType,
          sectionIndex: context.sectionIndex,
          sectionCount: context.sectionCount,
          sourceOrder: sourceOrder * 1000 + segmentIndex,
          semanticGroup: `${TEMPLATE_FILE}:${path}:${region.key}`,
          semanticText: normalize(`${context.sectionType} ${blockType} ${region.openTag} ${region.visibleText}`),
          htmlSectionId: region.htmlSectionId,
          explicitHero: region.explicitHero || (context.sectionIndex === 0 && /(image banner|slideshow|hero)/.test(normalize(context.sectionType))),
        });
      });
      continue;
    }

    if (!isPlainEditableText(key, value)) continue;
    inventory.push({
      id: `json:${path}`,
      kind: "json-text",
      filename: TEMPLATE_FILE,
      scope,
      sectionId: context.sectionId,
      blockId,
      key,
      segmentIndex: null,
      before: value,
      role: inferRole(key, value),
      sectionType: context.sectionType,
      blockType,
      sectionIndex: context.sectionIndex,
      sectionCount: context.sectionCount,
      sourceOrder: sourceOrder * 1000,
      semanticGroup: `${TEMPLATE_FILE}:shopify:${context.sectionId}`,
      semanticText: normalize(`${context.sectionType} ${blockType} ${key} ${value}`),
      htmlSectionId: "",
      explicitHero: context.sectionIndex === 0 || (context.sectionIndex <= 1 && /(image banner|slideshow|hero)/.test(normalize(context.sectionType))),
    });
  }
}

function buildSafeSectionLiquidInventory(source) {
  const order = Array.isArray(source.document?.order) ? source.document.order : Object.keys(source.document?.sections || {});
  const sectionsByType = new Map();
  for (const sectionId of order) {
    const type = String(source.document?.sections?.[sectionId]?.type || "").trim().toLowerCase();
    if (!type) continue;
    if (!sectionsByType.has(type)) sectionsByType.set(type, []);
    sectionsByType.get(type).push(sectionId);
  }

  const inventory = [];
  for (const [type, sectionIds] of sectionsByType) {
    if (sectionIds.length !== 1) continue;
    const filename = `sections/${type}.liquid`;
    const file = source.files.get(filename);
    if (!file?.content || !isPageBoundSectionSource(type, file.content)) continue;
    const sectionId = sectionIds[0];
    const sectionIndex = order.indexOf(sectionId);
    visibleTextSegments(file.content).forEach((segment, segmentIndex) => {
      const region = findSemanticRegion(file.content, segment.start, `${filename}:root`);
      inventory.push({
        id: `liquid:${filename}:${segmentIndex}`,
        kind: "liquid-text",
        filename,
        scope: "section-file",
        sectionId,
        blockId: "",
        key: "",
        segmentIndex,
        before: segment.text,
        role: inferSegmentRole(file.content, segment, type),
        sectionType: type,
        blockType: "",
        sectionIndex,
        sectionCount: Math.max(order.length, 1),
        sourceOrder: 900000 + segmentIndex,
        semanticGroup: `${filename}:${region.key}`,
        semanticText: normalize(`${type} ${region.openTag} ${region.visibleText}`),
        htmlSectionId: region.htmlSectionId,
        explicitHero: region.explicitHero || (sectionIndex === 0 && /(image banner|slideshow|hero)/.test(normalize(type))),
      });
    });
  }
  return inventory;
}

function findSemanticRegion(source, position, fallbackKey) {
  const text = String(source || "");
  const candidates = ["section", "article"];
  for (const tag of candidates) {
    const prefix = text.slice(0, position);
    const openMatches = [...prefix.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))];
    const closeMatches = [...prefix.matchAll(new RegExp(`</${tag}\\s*>`, "gi"))];
    const lastOpen = openMatches.at(-1);
    const lastClose = closeMatches.at(-1);
    if (!lastOpen || (lastClose && lastClose.index > lastOpen.index)) continue;
    const openTag = lastOpen[0];
    const start = lastOpen.index;
    const endIndex = text.indexOf(`</${tag}`, position);
    const end = endIndex >= 0 ? Math.min(text.length, endIndex + tag.length + 3) : Math.min(text.length, start + 12000);
    const regionSource = text.slice(start, end);
    const htmlSectionId = attribute(openTag, "id") || attribute(openTag, "aria-label") || attribute(openTag, "class");
    const visibleText = visibleTextSegments(regionSource).slice(0, 80).map(segment => segment.text).join(" ");
    const identityText = normalize(`${htmlSectionId} ${openTag}`);
    return {
      key: normalize(htmlSectionId) || `${tag}-${start}`,
      htmlSectionId,
      openTag,
      visibleText,
      explicitHero: /(^|\s)hero($|\s)|mmg hero|homepage hero/.test(identityText),
    };
  }
  const windowStart = Math.max(0, position - 1200);
  const windowEnd = Math.min(text.length, position + 2400);
  return {
    key: fallbackKey,
    htmlSectionId: "",
    openTag: "",
    visibleText: visibleTextSegments(text.slice(windowStart, windowEnd)).slice(0, 40).map(segment => segment.text).join(" "),
    explicitHero: false,
  };
}

function attribute(openTag, name) {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(openTag || "");
  return match?.[1] || "";
}

function groupSemanticRegions(inventory) {
  const grouped = groupBy(inventory, item => item.semanticGroup);
  return [...grouped.entries()].map(([key, items]) => ({
    key,
    items: [...items].sort((left, right) => left.sourceOrder - right.sourceOrder),
    sectionId: items[0]?.sectionId || "",
    sectionType: items[0]?.sectionType || "",
    htmlSectionId: items[0]?.htmlSectionId || "",
    sectionIndex: items[0]?.sectionIndex ?? 999,
    sectionCount: items[0]?.sectionCount ?? 1,
    explicitHero: items.some(item => item.explicitHero),
    semanticText: normalize(items.map(item => `${item.semanticText} ${item.before}`).join(" ")),
  })).sort((left, right) => left.sectionIndex - right.sectionIndex || left.items[0].sourceOrder - right.items[0].sourceOrder);
}

function classifySemanticRegion(group) {
  if (group.explicitHero) return verdict("hero", 100, "explicit inner hero id/class/aria or first hero-type Shopify section");
  const text = group.semanticText;
  const identity = classifyIdentity(text);
  if (identity) return verdict(identity, 95, "existing inner section id/class/aria and visible text");
  return verdict(null, 0, "identity uncertain; preserve semantic region without rewriting");
}

function classifyIdentity(text) {
  if (/(founder story|founder-story|built from the ground|honda|our story)/.test(text)) return "founder";
  if (/(road to 1m|road-to-one-million|road to one million|one million followers|post consistently|study what works)/.test(text)) return "road-to-1m";
  if (/(social-channels|social channels|follow the build|follow on tiktok|mindset media group social)/.test(text)) return "social";
  if (/(creator-toolkit|free creator toolkit|get a free system before you buy|prompts hooks templates checklist)/.test(text)) return "free-toolkit";
  if (/(product-series|connected ecosystem|every path connects|not separate shelves)/.test(text)) return "connected-ecosystem";
  if (/(continue-building|when the idea becomes real|choose how you want to build|book build|cover design|interior formatting|editorial enhancement|listing publishing optimization)/.test(text)) return "build-options";
  if (/(knowledge-system|mmg guided path|understand the journey|discover learn apply|find the idea worth building)/.test(text)) return "guided-path";
  if (/(featured-products|learning resources|resource that supports your stage|creator s bible|ai prompting)/.test(text)) return "learning-resources";
  if (/(production-pathway|production specification|intake approval|project progress|quality assurance|final dashboard delivery)/.test(text)) return "production-pathway";
  if (/(subscription|weekly cadence|bi weekly|bi-weekly|monthly cadence|recurring learning)/.test(text)) return "subscription";
  if (/(kairos section|meet kairos|intelligence operating system|guided execution)/.test(text)) return "kairos";
  if (/(final-cta|choose your next step|next step that fits)/.test(text)) return "final-next-step";
  if (/(door opener|not gatekeepers|mission and trust|our mission|customer first|customer-first)/.test(text)) return "mission";
  return null;
}

function buildRegionOperations(items, copy, identity) {
  const output = [];
  const cursors = { label: 0, heading: 0, body: 0, button: 0 };
  for (const item of items) {
    const role = item.role;
    const values = copy[`${role}s`] || [];
    if (cursors[role] >= values.length) continue;
    const after = values[cursors[role]++];
    if (!safeReplacement(after) || after === item.before) continue;
    output.push({ ...item, after, identity, zone: identity, reason: `Canonical section-bound ${identity} ${role} ${cursors[role]}` });
  }
  return output;
}

async function buildTextPackage(source, operations) {
  const grouped = groupBy(operations, operation => operation.filename);
  const files = [];
  const sourceHashes = {};

  for (const [filename, fileOperations] of grouped) {
    const sourceFile = source.files.get(filename);
    if (!sourceFile?.content || !sourceFile?.sha256) throw httpError(409, "section_bound_source_missing", `${filename} is no longer readable from Kairos Staging.`);
    let candidateSource;
    let structureSignature;

    if (filename === TEMPLATE_FILE) {
      const original = parseShopifyJson(sourceFile.content, "Current managed Kairos Staging homepage");
      const candidate = applyTemplateOperations(original, fileOperations);
      validateHomepageDocument(candidate, original);
      structureSignature = templateStructureSignature(original);
      if (templateStructureSignature(candidate) !== structureSignature) throw httpError(409, "section_bound_template_structure_changed", "The section-bound text plan changed the Shopify homepage structure.");
      candidateSource = serializeLikeSource(sourceFile.content, candidate);
    } else {
      candidateSource = applyVisibleOperations(sourceFile.content, fileOperations);
      structureSignature = sourceSkeleton(sourceFile.content);
      if (sourceSkeleton(candidateSource) !== structureSignature) throw httpError(409, "section_bound_liquid_structure_changed", `${filename} changed outside approved visible text nodes.`);
    }

    const afterSha256 = await hashText(candidateSource);
    if (afterSha256 === sourceFile.sha256) continue;
    const compact = fileOperations.map(compactOperation);
    sourceHashes[filename] = sourceFile.sha256;
    files.push({ filename, beforeSha256: sourceFile.sha256, afterSha256, beforeSource: sourceFile.content, candidateSource, structureSignature, operations: compact });
  }

  if (!files.length) throw httpError(409, "section_bound_package_unchanged", "The section-bound homepage planner produced no source change.");
  return { version: WEBSITE_MODE, operations: operations.map(compactOperation), files, sourceHashes, sectionFiles: files.filter(file => file.filename.startsWith("sections/")).map(file => file.filename) };
}

function applyTemplateOperations(original, operations) {
  const candidate = structuredClone(original);
  const plainPaths = new Set();
  for (const item of operations.filter(operation => operation.kind === "json-text")) {
    const path = `${item.scope}:${item.sectionId}:${item.blockId}:${item.key}`;
    if (plainPaths.has(path)) throw httpError(409, "section_bound_duplicate_plain_path", `A plain setting path was selected more than once: ${item.id}.`);
    plainPaths.add(path);
    setSetting(candidate, item, item.after);
  }

  const groups = groupBy(operations.filter(operation => operation.kind === "json-markup-text"), item => `${item.scope}:${item.sectionId}:${item.blockId}:${item.key}`);
  for (const items of groups.values()) {
    const before = getSetting(candidate, items[0]);
    const after = applyVisibleOperations(before, items);
    if (sourceSkeleton(before) !== sourceSkeleton(after)) throw httpError(409, "section_bound_markup_structure_changed", "A markup-backed text setting changed outside visible text nodes.");
    setSetting(candidate, items[0], after);
  }

  const unsupported = operations.filter(operation => !["json-text", "json-markup-text"].includes(operation.kind));
  if (unsupported.length) throw httpError(409, "section_bound_template_operation_invalid", "The template plan contains an unsupported operation type.");
  return candidate;
}

function applyVisibleOperations(source, operations) {
  let candidate = String(source || "");
  const segments = visibleTextSegments(candidate);
  const replacements = operations.map(item => {
    const segment = Number.isInteger(item.segmentIndex) ? segments[item.segmentIndex] : null;
    if (!segment) throw httpError(409, "section_bound_visible_segment_missing", `The visible text segment is missing for ${item.id}.`);
    return { start: segment.start, end: segment.end, after: item.after };
  }).sort((left, right) => right.start - left.start);
  for (const replacement of replacements) candidate = `${candidate.slice(0, replacement.start)}${replacement.after}${candidate.slice(replacement.end)}`;
  return candidate;
}

function isMarkupContainer(sectionType, blockType, key, value) {
  const identity = normalize(`${sectionType} ${blockType} ${key}`);
  const containerSignal = /(custom liquid|rich text|richtext|markup|html|content|liquid code|liquid)/.test(identity);
  const sourceSignal = /[<>{}%]/.test(String(value || ""));
  return (containerSignal || sourceSignal) && visibleTextSegments(value).length > 0;
}

function isPageBoundSectionSource(type, content) {
  const normalizedType = normalize(type);
  const normalizedSource = normalize(String(content || "").slice(0, 24000));
  const strongSignal = /(mindset media group|kairos|door opener|knowledge ecosystem|personalized subscription|publishing service|editorial service|creator service|guided execution|homepage journey|mmg)/.test(normalizedSource);
  const typeSignal = /(mmg|mindset|kairos|homepage|home ecosystem|journey|door opener|subscription|publishing|services|mission|pathway)/.test(normalizedType);
  if (GENERIC_SHARED_SECTION_TYPES.has(String(type || "").toLowerCase()) && !strongSignal) return false;
  return strongSignal || typeSignal;
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
  for (const segment of [...visibleTextSegments(result)].sort((left, right) => right.start - left.start)) result = `${result.slice(0, segment.start)}§TEXT§${result.slice(segment.end)}`;
  return result;
}

function isPlainEditableText(key, value) {
  const name = String(key || "").toLowerCase();
  const text = String(value || "").trim();
  if (!isVisibleCopy(text)) return false;
  if (/(custom_liquid|richtext|rich_text|markup|html|content|liquid)/i.test(name)) return false;
  if (/(url|link(?!.*label)|href|image|video|color|colour|font|size|width|height|alignment|position|id$|handle|product|collection|menu|icon|animation|spacing|padding|margin|opacity|scheme|style|layout|desktop|mobile|enabled|show_|hide_|class|asset|file|src|target|rel|aria|tabindex|price|sku|vendor|variant)/i.test(name)) return false;
  if (/[<>{}%]/.test(text)) return false;
  return true;
}

function isVisibleCopy(value) {
  const text = String(value || "").trim();
  if (text.length < 2 || text.length > 2400) return false;
  if ((text.match(/[A-Za-z]/g) || []).length < 2) return false;
  if (/^(https?:\/\/|\/|#|mailto:|tel:|shopify:\/\/)/i.test(text)) return false;
  if (/^[a-z0-9_.-]+\.(png|jpe?g|gif|webp|svg|css|js|json|liquid)$/i.test(text)) return false;
  return true;
}

function inferRole(key, value) {
  const name = normalize(key);
  const text = String(value || "").trim();
  if (/(badge|kicker|eyebrow|tag|overline)/.test(name) && text.length <= 120) return "label";
  if (/(button|cta|label)/.test(name) && text.length <= 100) return "button";
  if (/(heading|headline|title)/.test(name) && !/(subtitle|subheading)/.test(name)) return "heading";
  if (/(subheading|subtitle|description|content|copy|body|text|message|caption|summary)/.test(name)) return "body";
  if (/^(explore|open|start|continue|view|browse|follow|meet|choose|learn|use|get)/i.test(text) && text.length <= 100) return "button";
  if (text.length <= 28 && text.split(/\s+/).length <= 5) return "label";
  if (text.length <= 85 && text.split(/\s+/).length <= 12) return "heading";
  return "body";
}

function inferSegmentRole(source, segment, key) {
  const before = String(source || "").slice(Math.max(0, segment.start - 300), segment.start).toLowerCase();
  const openTag = /<([a-z0-9-]+)(?:\s[^>]*)?>\s*$/.exec(before)?.[1] || "";
  const classValue = /class\s*=\s*["']([^"']+)["'][^>]*>\s*$/.exec(before)?.[1] || "";
  if (/(badge|kicker|tag|label|eyebrow|overline)/.test(classValue)) return "label";
  if (/^h[1-6]$/.test(openTag)) return "heading";
  if (["button", "a"].includes(openTag) && segment.text.length <= 120) return "button";
  if (["p", "li", "span", "div", "strong", "em", "small"].includes(openTag)) {
    if (segment.text.length <= 28 && segment.text.split(/\s+/).length <= 5) return "label";
    return segment.text.length <= 85 && segment.text.split(/\s+/).length <= 12 ? "heading" : "body";
  }
  return inferRole(key, segment.text);
}

function applySettingPath(document, item) {
  const section = document?.sections?.[item.sectionId];
  if (!section) throw httpError(409, "section_bound_section_missing", `Homepage section ${item.sectionId} is missing.`);
  if (item.scope === "section") return section.settings;
  const block = section?.blocks?.[item.blockId];
  if (!block) throw httpError(409, "section_bound_block_missing", `Homepage block ${item.sectionId}/${item.blockId} is missing.`);
  return block.settings;
}

function getSetting(document, item) {
  const settings = applySettingPath(document, item);
  if (!settings || typeof settings[item.key] !== "string") throw httpError(409, "section_bound_setting_missing", `Text setting ${item.id} is missing.`);
  return settings[item.key];
}

function setSetting(document, item, value) {
  const settings = applySettingPath(document, item);
  if (!settings || typeof settings[item.key] !== "string") throw httpError(409, "section_bound_setting_missing", `Text setting ${item.id} is missing.`);
  settings[item.key] = value;
}

function compactOperation(item) {
  return {
    id: item.id,
    kind: item.kind,
    filename: item.filename,
    scope: item.scope || "",
    sectionId: item.sectionId || "",
    blockId: item.blockId || "",
    key: item.key || "",
    segmentIndex: Number.isInteger(item.segmentIndex) ? item.segmentIndex : null,
    before: item.before,
    after: item.after,
    reason: item.reason || "",
    zone: item.identity || item.zone || "",
  };
}

function templateStructureSignature(document) {
  const structure = {
    order: Array.isArray(document?.order) ? document.order : [],
    sections: Object.fromEntries(Object.entries(document?.sections || {}).map(([sectionId, section]) => [sectionId, {
      type: section?.type || "",
      disabled: Boolean(section?.disabled),
      settingKeys: Object.keys(section?.settings || {}).sort(),
      blocks: Object.fromEntries(Object.entries(section?.blocks || {}).map(([blockId, block]) => [blockId, { type: block?.type || "", settingKeys: Object.keys(block?.settings || {}).sort() }])),
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
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") throw httpError(409, "section_bound_staging_required", "A verified non-live Kairos Staging theme is required.");
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN") throw httpError(409, "section_bound_main_verification_failed", "The live MAIN theme could not be verified.");
}

function safeReplacement(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 2400) return false;
  if (/<\/?(?:script|style|iframe|object|embed|form)\b/i.test(text)) return false;
  if (/{{|}}|{%|%}|javascript:|\bon[a-z]+\s*=/i.test(text)) return false;
  return true;
}

function assertUniqueIDs(inventory) {
  const seen = new Set();
  for (const item of inventory) {
    if (seen.has(item.id)) throw httpError(409, "section_bound_duplicate_identity", `Kairos found a duplicate homepage operation identity: ${item.id}.`);
    seen.add(item.id);
  }
}

async function storePlanJob(request, jobID, result, summary) {
  const now = new Date().toISOString();
  const envelope = { jobID, status: "completed", build: KAIROS_SECTION_BOUND_HOMEPAGE_PLANNER_BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary, result };
  const key = new Request(new URL(`/_kairos/autonomous-plan-jobs/${jobID}`, request.url).toString(), { method: "GET" });
  await caches.default.put(key, new Response(JSON.stringify(envelope), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}` } }));
}

function fileByName(files, filename) { return (Array.isArray(files) ? files : []).find(file => file?.filename === filename) || null; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function normalize(value) { return String(value || "").toLowerCase().replace(/[™®]/g, "").replace(/[_–—-]+/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
function verdict(identity, confidence, evidence) { return { identity, confidence, evidence }; }
function groupBy(values, keyFn) { const map = new Map(); for (const value of values) { const key = keyFn(value); if (!map.has(key)) map.set(key, []); map.get(key).push(value); } return map; }
function dedupe(values) { const seen = new Set(); return values.filter(value => { if (seen.has(value.id)) return false; seen.add(value.id); return true; }); }
function stableStringify(value) { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`; return JSON.stringify(value); }

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_SECTION_BOUND_HOMEPAGE_PLANNER_BUILD,
      "X-Kairos-Inner-HTML-Section-Boundaries": "true",
      "X-Kairos-Hero-Identity-Locked": "true",
      "X-Kairos-Generic-Zone-Assignment": "false",
      "X-Kairos-Section-Repurposing-Authorized": "false",
      "X-Kairos-Workers-AI-Used": "false",
      "X-Kairos-Neurons-Consumed": "0",
      "X-Kairos-Visual-Baseline": "tuesday-command-center-6f96b10d",
    },
  });
}
