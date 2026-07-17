import {
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  validateHomepageDocument,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD = "kairos-whole-homepage-planner-20260717-2";

const PLAN_PATH = "/api/shopify/staging/plan/jobs";
const TEMPLATE_FILE = "templates/index.json";
const WEBSITE_MODE = "autonomous-text-only-v1";
const JOB_TTL_SECONDS = 60 * 60;
const MAX_OPERATIONS = 96;
const MAX_SECTION_FILES = 40;

const ZONE_ORDER = Object.freeze([
  "hero",
  "guided-pathways",
  "products-and-resources",
  "services",
  "subscription",
  "kairos",
  "mission-and-trust",
  "final-next-step",
]);

const ZONE_COPY = Object.freeze({
  hero: Object.freeze({
    headings: [
      "Your Knowledge Has Value.",
      "Turn Knowledge Into Work That Lasts",
    ],
    bodies: [
      "Turn what you know, what you have lived, and what you are building into books, digital products, brands, and lasting intellectual property.",
      "Mindset Media Group connects practical education, professional services, digital resources, personalized subscriptions, and Kairos-guided execution in one curated ecosystem.",
    ],
    buttons: ["Explore the Ecosystem", "Meet Kairos"],
  }),
  "guided-pathways": Object.freeze({
    headings: [
      "Choose What You Want to Build",
      "Publish Your Knowledge",
      "Build Your Brand",
      "Grow With AI",
      "Create Digital Products",
      "Access Professional Services",
      "Join a Personalized Subscription",
      "Work With Kairos",
    ],
    bodies: [
      "Choose the path that fits your objective and move from knowledge to completed work.",
      "Turn expertise, experience, and ideas into professional books, guides, and publishing assets.",
      "Create a clear and consistent presence supported by practical content, design, and business systems.",
      "Use practical AI to improve creativity, productivity, communication, and execution.",
      "Transform useful knowledge into resources that educate customers and create long-term value.",
      "Get publishing, editorial, creator, design, and business support aligned to the work you are building.",
      "Receive personalized educational resources on a weekly, bi-weekly, or monthly cadence.",
      "Let Kairos organize the objective, coordinate the next action, and move the work toward a verified result.",
    ],
    buttons: [
      "Explore Publishing",
      "Explore Branding",
      "Explore AI Resources",
      "Explore Digital Products",
      "Explore Services",
      "Explore Subscriptions",
      "Start With Kairos",
    ],
  }),
  "products-and-resources": Object.freeze({
    headings: [
      "Products and Resources Built for Progress",
      "Practical Knowledge You Can Use",
      "Continue Your Learning Journey",
      "Resources Connected to Your Next Step",
    ],
    bodies: [
      "Explore practical guides, creator resources, publishing tools, and digital products designed to move knowledge toward completed work.",
      "Each resource is built to help you understand the next action, apply what you learn, and create durable value from your knowledge.",
      "Move from one useful resource to the next through a connected learning journey instead of an isolated purchase.",
      "Choose the product or educational resource that best matches what you are trying to build now.",
    ],
    buttons: ["Explore Products", "View Resources", "Continue Learning", "Find Your Next Resource"],
  }),
  services: Object.freeze({
    headings: [
      "Professional Support for the Work You’re Building",
      "Publishing and Editorial Services",
      "Creator and Business Services",
      "Design and Production Support",
      "Move From Draft to Deliverable",
    ],
    bodies: [
      "Access focused support for publishing, editorial development, creator growth, brand development, design, production, and business execution.",
      "Move manuscripts, guides, and publishing projects toward professional, release-ready deliverables.",
      "Strengthen content systems, customer communication, offers, and operational momentum.",
      "Prepare visual, digital, and production assets that support the complete customer journey.",
      "Choose the level of support that fits the project, then move through a clear production workflow with visible progress.",
    ],
    buttons: ["Explore Services", "View Publishing Support", "View Creator Services", "View Design Support", "Start a Project"],
  }),
  subscription: Object.freeze({
    headings: [
      "Personalized Learning That Continues With You",
      "Choose Your Learning Cadence",
      "Resources Selected Around Your Objectives",
      "Stay in Control of Every Delivery",
    ],
    bodies: [
      "Choose a weekly, bi-weekly, or monthly cadence and receive curated digital resources aligned to your role, interests, and current objectives.",
      "Select the rhythm that fits how you learn and how quickly you want to move.",
      "Your profile and current goals guide the resources prepared for each subscription cycle.",
      "Review and adjust the upcoming package before distribution so the subscription continues to match your priorities.",
    ],
    buttons: ["Explore Subscriptions", "See How It Works", "Choose a Cadence", "Start Your Subscription"],
  }),
  kairos: Object.freeze({
    headings: [
      "Kairos Turns Objectives Into Guided Execution",
      "One Objective. A Clearer Path Forward.",
      "Context, Coordination, and Verified Progress",
    ],
    bodies: [
      "Kairos is the intelligence operating system inside Mindset Media Group. It organizes context, identifies the next action, coordinates the work, and moves ideas toward verified results.",
      "Describe what you want to accomplish. Kairos connects the relevant knowledge, tools, services, and workflows around that objective.",
      "Every approved action becomes part of a visible project history so future work can continue from what has already been learned and completed.",
    ],
    buttons: ["Meet Kairos", "Start With Kairos", "Explore Guided Execution"],
  }),
  "mission-and-trust": Object.freeze({
    headings: [
      "We’re Not Gatekeepers. We’re Door Openers.",
      "Knowledge, Opportunity, and Professional Support",
      "Built Around Progress, Integrity, and Service",
    ],
    bodies: [
      "Mindset Media Group makes professional knowledge, publishing, technology, and opportunity more accessible without unnecessary complexity or barriers.",
      "The ecosystem is designed to help creators, entrepreneurs, authors, educators, and small businesses move forward with clearer pathways and practical support.",
      "Every experience should preserve professional standards, transparency, integrity, and customer-first service.",
    ],
    buttons: ["Learn About Mindset Media Group", "Explore Our Mission", "See How the Ecosystem Works"],
  }),
  "final-next-step": Object.freeze({
    headings: [
      "Start With What You Know",
      "Choose the Next Step That Fits",
      "Keep Building From Here",
    ],
    bodies: [
      "Choose a path, explore available products and services, join a personalized subscription, or let Kairos guide your next step.",
      "Begin with the objective in front of you and move into the resource, service, subscription, or guided workflow designed to support it.",
      "Your next action should connect to the work you have already completed and the value you are building over time.",
    ],
    buttons: ["Explore Mindset Media Group", "Start With Kairos", "Choose Your Path"],
  }),
});

const GENERIC_SHARED_SECTION_TYPES = new Set([
  "announcement-bar",
  "apps",
  "blog-posts",
  "collage",
  "collection-list",
  "contact-form",
  "custom-liquid",
  "email-signup-banner",
  "featured-blog",
  "featured-collection",
  "featured-product",
  "footer",
  "header",
  "image-banner",
  "image-with-text",
  "main-blog",
  "main-cart-footer",
  "main-cart-items",
  "main-collection-banner",
  "main-collection-product-grid",
  "main-list-collections",
  "main-page",
  "main-product",
  "multicolumn",
  "newsletter",
  "page",
  "password-footer",
  "password-header",
  "predictive-search",
  "related-products",
  "rich-text",
  "slideshow",
]);

export async function handleWholeHomepagePlan(request, env, continuation = null) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== PLAN_PATH || !continuation?.active) return null;

  const source = await inspectHomepageSource(request, env);
  const inventory = buildHomepageInventory(source);
  if (!inventory.length) {
    throw httpError(409, "homepage_all_text_inventory_empty", "Kairos could not locate safe editable homepage text in the template, rich-text settings, custom-Liquid settings, or page-bound homepage section files.");
  }

  const sections = groupInventoryBySection(source.document, inventory);
  const assignments = assignJourneyZones(sections);
  const operations = buildWholePageOperations(assignments).slice(0, MAX_OPERATIONS);
  if (!operations.length) {
    throw httpError(409, "whole_homepage_no_remaining_changes", "Every safely matched homepage text location already contains the approved ecosystem copy or no additional safe text locations remain.");
  }

  const packageResult = await buildTextPackage(source, operations);
  const coveredZones = unique(operations.map(operation => operation.zone));
  const reviewedZones = unique(assignments.map(assignment => assignment.zone));
  const remainingZones = ZONE_ORDER.filter(zone => !reviewedZones.includes(zone));
  const now = new Date().toISOString();
  const summary = `Kairos prepared ${operations.length} source-bound text replacement${operations.length === 1 ? "" : "s"} across ${coveredZones.length} homepage journey zone${coveredZones.length === 1 ? "" : "s"}, inspecting template text, markup-backed text, and safe page-bound section text with zero inference.`;

  const result = {
    actionID: crypto.randomUUID(),
    planID: crypto.randomUUID(),
    actionType: "shopify.staging.plan",
    status: "ready-for-approval",
    readOnly: true,
    build: KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD,
    kernel: "direct-homepage-plan-v1",
    startedAt: now,
    completedAt: now,
    objective: continuation.originalObjective || "Continue curating the entire homepage.",
    summary,
    plan: {
      summary,
      strategy: "Review the managed staging homepage section-by-section across every safe text source and replace only existing visible wording while preserving prior approved text and every non-text value.",
      changes: packageResult.files.map(file => ({
        filename: file.filename,
        changeType: "replace-visible-text",
        purpose: `${file.operations.length} whole-page source-bound text replacement${file.operations.length === 1 ? "" : "s"}.`,
        expectedOutcome: "A curated homepage narrative with identical URLs, section structure, blocks, Liquid logic, HTML structure, styling, assets, layout, and behavior.",
      })),
      risks: [
        "Longer approved wording may wrap differently inside the unchanged design.",
        "Page-bound section source changes are permitted only when the section type is unique on the homepage and contains strong MMG/Kairos homepage-specific signals.",
      ],
      acceptanceCriteria: [
        "Every safe editable homepage section is reviewed in source order.",
        "Only existing visible customer-facing text changes.",
        "Rich-text and custom-Liquid setting markup preserves the exact non-text skeleton.",
        "Any changed section Liquid file preserves every tag, attribute, Liquid token, schema block, script, stylesheet, URL, class, ID, asset reference, and non-text byte.",
        "Every URL, link destination, product reference, collection reference, section, block, CSS rule, JavaScript behavior, asset, color, typography rule, spacing value, layout instruction, animation, and responsive rule remains unchanged.",
        "Prior approved staging text remains the source of truth for continuation.",
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
      structuralMutationAuthorized: false,
      styleMutationAuthorized: false,
      visualMutationAuthorized: false,
      liquidStructureMutationAuthorized: false,
      cssMutationAuthorized: false,
      assetMutationAuthorized: false,
      linkMutationAuthorized: false,
      liveThemeMutationAuthorized: false,
      productionPublishAuthorized: false,
      journeyCoverage: {
        reviewed: reviewedZones,
        coveredByChanges: coveredZones,
        remaining: remainingZones,
        complete: remainingZones.length === 0,
      },
      sectionReview: assignments.map(assignment => ({
        sectionId: assignment.sectionId,
        sectionType: assignment.sectionType,
        sectionIndex: assignment.sectionIndex,
        zone: assignment.zone,
        textLocationsReviewed: assignment.items.length,
        templateTextLocations: assignment.items.filter(item => item.filename === TEMPLATE_FILE).length,
        sectionFileTextLocations: assignment.items.filter(item => item.filename !== TEMPLATE_FILE).length,
      })),
    },
    evidence: {
      sourceInspectionActionID: source.actionID,
      sourceAdapter: "shopify-graphql-theme-files",
      templateAndSectionSourceCoverage: true,
      templateFileInspected: true,
      sectionFilesRequested: source.sectionFiles.length,
      sectionFilesReadable: source.sectionFiles.filter(filename => source.files.has(filename)).length,
      sectionLiquidFilesWritten: packageResult.files.filter(file => file.filename.startsWith("sections/")).length,
      markupBackedSettingsSupported: true,
      inventoryCount: inventory.length,
      templateInventoryCount: inventory.filter(item => item.filename === TEMPLATE_FILE).length,
      sectionFileInventoryCount: inventory.filter(item => item.filename !== TEMPLATE_FILE).length,
      sectionCount: sections.length,
      reviewedSectionCount: assignments.length,
      replacementCount: operations.length,
      filesChanged: packageResult.files.length,
      plannerMode: "deterministic-whole-homepage-all-text-sources",
      currentManagedStagingReused: true,
      freshMainDuplicateRequired: false,
      priorApprovedTextPreserved: true,
      workersAIUsed: false,
      privateRuntimeUsed: false,
      neuronsConsumed: 0,
      secondBindingPassUsed: false,
      visualBaseline: "tuesday-command-center-6f96b10d",
      browserSurfaceChanged: false,
    },
  };

  const jobID = crypto.randomUUID();
  await storePlanJob(request, jobID, result, summary);
  return json({
    jobID,
    status: "completed",
    build: KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD,
    pollURL: `/api/shopify/staging/plan/jobs/${jobID}`,
    summary,
    result,
  }, 202);
}

async function inspectHomepageSource(request, env) {
  const firstInspection = await inspectStagingSource(null, request, env, KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD, [TEMPLATE_FILE]);
  const firstEvidence = firstInspection?.evidence || {};
  validateThemeBoundary(firstEvidence.stagingTheme, firstEvidence.mainTheme);
  const firstTemplate = fileByName(firstEvidence.files, TEMPLATE_FILE);
  if (!firstTemplate?.content) throw httpError(409, "homepage_template_unavailable", "Kairos could not read templates/index.json from the current managed staging theme.");
  const firstDocument = parseShopifyJson(firstTemplate.content, "Current managed Kairos Staging homepage");
  validateHomepageDocument(structuredClone(firstDocument), firstDocument);

  const sectionFiles = deriveSectionFiles(firstDocument).slice(0, MAX_SECTION_FILES);
  const inspection = sectionFiles.length
    ? await inspectStagingSource(null, request, env, KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD, [TEMPLATE_FILE, ...sectionFiles])
    : firstInspection;
  const evidence = inspection?.evidence || {};
  validateThemeBoundary(evidence.stagingTheme, evidence.mainTheme);
  const templateFile = fileByName(evidence.files, TEMPLATE_FILE);
  if (!templateFile?.content) throw httpError(409, "homepage_template_unavailable", "Kairos could not read templates/index.json from the current managed staging theme.");
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

function buildHomepageInventory(source) {
  const templateInventory = buildTemplateInventory(source.document);
  const liquidInventory = buildSafeSectionLiquidInventory(source);
  return [...templateInventory, ...liquidInventory]
    .sort((left, right) => left.sectionIndex - right.sectionIndex || left.sourceOrder - right.sourceOrder || left.filename.localeCompare(right.filename));
}

function buildTemplateInventory(document) {
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
    collectSettings(inventory, "section", context, "", "", section?.settings || {});
    for (const [blockId, block] of Object.entries(section?.blocks || {})) {
      collectSettings(inventory, "block", context, blockId, String(block?.type || ""), block?.settings || {});
    }
  }
  return inventory;
}

function collectSettings(inventory, scope, context, blockId, blockType, settings) {
  let sourceOrder = 0;
  for (const [key, value] of Object.entries(settings || {})) {
    sourceOrder += 1;
    if (typeof value !== "string" || !value.trim()) continue;
    if (isPlainEditableText(key, value)) {
      inventory.push({
        id: `json:${scope}:${context.sectionId}:${blockId || "section"}:${key}`,
        kind: "json-text",
        filename: TEMPLATE_FILE,
        scope,
        sectionId: context.sectionId,
        blockId,
        key,
        before: value,
        role: inferRole(key, value),
        sectionType: context.sectionType,
        blockType,
        sectionIndex: context.sectionIndex,
        sectionCount: context.sectionCount,
        sourceOrder: sourceOrder * 100,
      });
      continue;
    }
    if (!isMarkupSetting(key, value)) continue;
    const segments = visibleTextSegments(value);
    segments.forEach((segment, segmentIndex) => {
      inventory.push({
        id: `json:${scope}:${context.sectionId}:${blockId || "section"}:${key}:segment:${segmentIndex}`,
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
        sourceOrder: sourceOrder * 100 + segmentIndex,
      });
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
    const segments = visibleTextSegments(file.content);
    segments.forEach((segment, segmentIndex) => {
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
        sourceOrder: 9000 + segmentIndex,
      });
    });
  }
  return inventory;
}

function isPageBoundSectionSource(type, content) {
  const normalizedType = normalize(type);
  const normalizedSource = normalize(String(content || "").slice(0, 20000));
  const strongSignal = /(mindset media group|kairos|door opener|knowledge ecosystem|personalized subscription|publishing service|editorial service|creator service|guided execution|homepage journey|mmg)/.test(normalizedSource);
  const typeSignal = /(mmg|mindset|kairos|homepage|home ecosystem|journey|door opener|subscription|publishing|services|mission|pathway)/.test(normalizedType);
  if (GENERIC_SHARED_SECTION_TYPES.has(String(type || "").toLowerCase()) && !strongSignal) return false;
  return strongSignal || typeSignal;
}

function groupInventoryBySection(document, inventory) {
  const order = Array.isArray(document?.order) ? document.order : Object.keys(document?.sections || {});
  return order.map((sectionId, index) => {
    const section = document?.sections?.[sectionId] || {};
    const items = inventory.filter(item => item.sectionId === sectionId);
    const searchable = normalize(`${section?.type || ""} ${items.map(item => `${item.key || ""} ${item.before}`).join(" ")}`);
    return {
      sectionId,
      sectionType: String(section?.type || ""),
      sectionIndex: index,
      sectionCount: Math.max(order.length, 1),
      searchable,
      items,
    };
  }).filter(section => section.items.length > 0);
}

function assignJourneyZones(sections) {
  const claimed = new Set();
  const assignments = [];
  for (const zone of ZONE_ORDER) {
    const candidate = selectSectionForZone(zone, sections, claimed);
    if (!candidate) continue;
    claimed.add(candidate.sectionId);
    assignments.push({ ...candidate, zone });
  }
  for (const section of sections) {
    if (claimed.has(section.sectionId)) continue;
    assignments.push({ ...section, zone: fallbackZone(section, sections.length) });
  }
  return assignments.sort((left, right) => left.sectionIndex - right.sectionIndex);
}

function selectSectionForZone(zone, sections, claimed) {
  const candidates = sections
    .filter(section => !claimed.has(section.sectionId))
    .map(section => ({ section, score: zoneScore(zone, section) }))
    .sort((left, right) => right.score - left.score || left.section.sectionIndex - right.section.sectionIndex);
  const best = candidates[0];
  if (!best || best.score < 15) return null;
  return best.section;
}

function zoneScore(zone, section) {
  const text = section.searchable;
  const position = section.sectionCount > 1 ? section.sectionIndex / (section.sectionCount - 1) : 0;
  let score = 0;
  if (zone === "hero") {
    if (/(hero|banner|slideshow|image banner)/.test(text)) score += 100;
    if (section.sectionIndex === 0) score += 80;
  } else if (zone === "guided-pathways") {
    if (/(multicolumn|grid|cards|path|journey|choose|build your|what you want)/.test(text)) score += 90;
    if (position > 0.08 && position < 0.45) score += 35;
  } else if (zone === "products-and-resources") {
    if (/(product|collection|guide|resource|digital product|shop|learning)/.test(text)) score += 95;
    if (position > 0.2 && position < 0.75) score += 25;
  } else if (zone === "services") {
    if (/(service|publishing|editorial|design|production|creator support|business support)/.test(text)) score += 100;
    if (position > 0.3 && position < 0.8) score += 25;
  } else if (zone === "subscription") {
    if (/(subscription|weekly|bi weekly|monthly|personalized|recurring|cadence)/.test(text)) score += 110;
    if (position > 0.35 && position < 0.85) score += 20;
  } else if (zone === "kairos") {
    if (/(kairos|intelligence operating system|guided execution)/.test(text)) score += 120;
    if (position > 0.25 && position < 0.9) score += 15;
  } else if (zone === "mission-and-trust") {
    if (/(gatekeeper|door opener|mission|about|trust|integrity|customer first)/.test(text)) score += 110;
    if (position > 0.45) score += 20;
  } else if (zone === "final-next-step") {
    if (/(final|call to action|cta|newsletter|start with|next step|continue)/.test(text)) score += 90;
    if (position >= 0.75) score += 70;
  }
  return score;
}

function fallbackZone(section, total) {
  const ratio = total > 1 ? section.sectionIndex / (total - 1) : 0;
  if (ratio <= 0.12) return "hero";
  if (ratio <= 0.3) return "guided-pathways";
  if (ratio <= 0.46) return "products-and-resources";
  if (ratio <= 0.6) return "services";
  if (ratio <= 0.7) return "subscription";
  if (ratio <= 0.8) return "kairos";
  if (ratio <= 0.92) return "mission-and-trust";
  return "final-next-step";
}

function buildWholePageOperations(assignments) {
  const operations = [];
  const cursors = new Map();
  for (const assignment of assignments) {
    const copy = ZONE_COPY[assignment.zone];
    if (!copy) continue;
    const buckets = {
      heading: assignment.items.filter(item => item.role === "heading"),
      body: assignment.items.filter(item => item.role === "body"),
      button: assignment.items.filter(item => item.role === "button"),
    };
    addRoleOperations(operations, cursors, assignment.zone, buckets.heading, copy.headings || [], "heading");
    addRoleOperations(operations, cursors, assignment.zone, buckets.body, copy.bodies || [], "body");
    addRoleOperations(operations, cursors, assignment.zone, buckets.button, copy.buttons || [], "button");
  }
  return operations.filter(operation => operation.before !== operation.after);
}

function addRoleOperations(target, cursors, zone, items, values, role) {
  const cursorKey = `${zone}:${role}`;
  let cursor = cursors.get(cursorKey) || 0;
  for (const item of items) {
    if (cursor >= values.length) break;
    const after = values[cursor];
    cursor += 1;
    if (!safeReplacement(after) || after === item.before) continue;
    target.push({ ...item, after, zone, reason: `Whole-page ${zone} ${role} ${cursor}` });
  }
  cursors.set(cursorKey, cursor);
}

async function buildTextPackage(source, operations) {
  const grouped = new Map();
  for (const operation of operations) {
    if (!grouped.has(operation.filename)) grouped.set(operation.filename, []);
    grouped.get(operation.filename).push(operation);
  }

  const files = [];
  const sourceHashes = {};
  for (const [filename, fileOperations] of grouped) {
    const sourceFile = source.files.get(filename);
    if (!sourceFile?.content || !sourceFile?.sha256) throw httpError(409, "whole_homepage_source_file_missing", `${filename} is no longer readable from Kairos Staging.`);
    let candidateSource;
    let structureSignature;

    if (filename === TEMPLATE_FILE) {
      const original = parseShopifyJson(sourceFile.content, "Current managed Kairos Staging homepage");
      const candidate = applyTemplateOperations(original, fileOperations);
      validateHomepageDocument(candidate, original);
      structureSignature = templateStructureSignature(original);
      if (templateStructureSignature(candidate) !== structureSignature) throw httpError(409, "whole_homepage_structure_changed", "The whole-page text plan changed the Shopify homepage structure.");
      candidateSource = serializeLikeSource(sourceFile.content, candidate);
    } else {
      candidateSource = applyVisibleOperations(sourceFile.content, fileOperations);
      structureSignature = sourceSkeleton(sourceFile.content);
      if (sourceSkeleton(candidateSource) !== structureSignature) throw httpError(409, "whole_homepage_liquid_structure_changed", `${filename} changed outside approved visible text nodes.`);
    }

    const afterSha256 = await hashText(candidateSource);
    if (afterSha256 === sourceFile.sha256) continue;
    const compact = fileOperations.map(compactOperation);
    sourceHashes[filename] = sourceFile.sha256;
    files.push({
      filename,
      beforeSha256: sourceFile.sha256,
      afterSha256,
      beforeSource: sourceFile.content,
      candidateSource,
      structureSignature,
      operations: compact,
    });
  }

  if (!files.length) throw httpError(409, "whole_homepage_text_unchanged", "The whole-page planner produced no source change.");
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
  for (const item of operations.filter(operation => operation.kind === "json-text")) {
    const current = getSetting(candidate, item);
    if (current !== item.before) throw httpError(409, "whole_homepage_source_changed", `The source text changed for ${item.id}.`);
    setSetting(candidate, item, item.after);
  }

  const groups = new Map();
  for (const item of operations.filter(operation => operation.kind === "json-markup-text")) {
    const key = `${item.scope}:${item.sectionId}:${item.blockId}:${item.key}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const items of groups.values()) {
    const before = getSetting(candidate, items[0]);
    const after = applyVisibleOperations(before, items);
    if (sourceSkeleton(before) !== sourceSkeleton(after)) throw httpError(409, "whole_homepage_markup_structure_changed", "A markup-backed text setting changed outside visible text nodes.");
    setSetting(candidate, items[0], after);
  }

  const unsupported = operations.filter(operation => !["json-text", "json-markup-text"].includes(operation.kind));
  if (unsupported.length) throw httpError(409, "whole_homepage_template_operation_invalid", "The template plan contains an unsupported operation type.");
  return candidate;
}

function applyVisibleOperations(source, operations) {
  let candidate = String(source || "");
  const segments = visibleTextSegments(candidate);
  const replacements = operations.map(item => {
    const segment = Number.isInteger(item.segmentIndex) ? segments[item.segmentIndex] : null;
    if (!segment || segment.text !== item.before) throw httpError(409, "whole_homepage_visible_text_changed", `The source text changed for ${item.id}.`);
    return { start: segment.start, end: segment.end, after: item.after };
  }).sort((left, right) => right.start - left.start);
  for (const replacement of replacements) candidate = `${candidate.slice(0, replacement.start)}${replacement.after}${candidate.slice(replacement.end)}`;
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
  for (const segment of [...segments].sort((left, right) => right.start - left.start)) result = `${result.slice(0, segment.start)}§TEXT§${result.slice(segment.end)}`;
  return result;
}

function isPlainEditableText(key, value) {
  const name = String(key || "").toLowerCase();
  const text = String(value || "").trim();
  if (!isVisibleCopy(text)) return false;
  if (/(url|link(?!.*label)|href|image|video|color|colour|font|size|width|height|alignment|position|id$|handle|product|collection|menu|icon|animation|spacing|padding|margin|opacity|scheme|style|layout|desktop|mobile|enabled|show_|hide_|class|asset|file|src|target|rel|aria|tabindex|price|sku|vendor|variant)/i.test(name)) return false;
  if (/[<>{}%]/.test(text)) return false;
  return true;
}

function isMarkupSetting(key, value) {
  const name = String(key || "").toLowerCase();
  const text = String(value || "");
  if (/(url|href|link_url|image|video|style|css|javascript|script|schema|settings_json)/i.test(name)) return false;
  return /(custom_liquid|richtext|rich_text|markup|html|content|text|body|description)/.test(name)
    && /[<{]/.test(text)
    && visibleTextSegments(text).length > 0;
}

function isVisibleCopy(value) {
  const text = String(value || "").trim();
  if (text.length < 2 || text.length > 1800) return false;
  if ((text.match(/[A-Za-z]/g) || []).length < 2) return false;
  if (/^(https?:\/\/|\/|#|mailto:|tel:|shopify:\/\/)/i.test(text)) return false;
  if (/^[a-z0-9_.-]+\.(png|jpe?g|gif|webp|svg|css|js|json|liquid)$/i.test(text)) return false;
  return true;
}

function inferRole(key, value) {
  const name = normalize(key);
  const text = String(value || "").trim();
  if (/(button|cta|label)/.test(name) && text.length <= 90) return "button";
  if (/(heading|headline|title)/.test(name) && !/(subtitle|subheading)/.test(name)) return "heading";
  if (/(subheading|subtitle|description|content|copy|body|text|message|caption|summary)/.test(name)) return "body";
  if (text.length <= 80 && text.split(/\s+/).length <= 12) return "heading";
  return "body";
}

function inferSegmentRole(source, segment, key) {
  const keyRole = inferRole(key, segment.text);
  const before = String(source || "").slice(Math.max(0, segment.start - 240), segment.start).toLowerCase();
  const openTag = /<([a-z0-9-]+)(?:\s[^>]*)?>\s*$/.exec(before)?.[1] || "";
  if (/^h[1-6]$/.test(openTag)) return "heading";
  if (["button", "a"].includes(openTag) && segment.text.length <= 100) return "button";
  if (["p", "li", "span", "div", "strong", "em"].includes(openTag)) return segment.text.length <= 70 && segment.text.split(/\s+/).length <= 10 ? "heading" : "body";
  return keyRole;
}

function applySettingPath(document, item) {
  const section = document?.sections?.[item.sectionId];
  if (!section) throw httpError(409, "section_missing", `Homepage section ${item.sectionId} is missing.`);
  if (item.scope === "section") return section.settings;
  const block = section?.blocks?.[item.blockId];
  if (!block) throw httpError(409, "block_missing", `Homepage block ${item.sectionId}/${item.blockId} is missing.`);
  return block.settings;
}

function getSetting(document, item) {
  const settings = applySettingPath(document, item);
  if (!settings || typeof settings[item.key] !== "string") throw httpError(409, "text_setting_missing", `Text setting ${item.id} is missing.`);
  return settings[item.key];
}

function setSetting(document, item, value) {
  const settings = applySettingPath(document, item);
  if (!settings || typeof settings[item.key] !== "string") throw httpError(409, "text_setting_missing", `Text setting ${item.id} is missing.`);
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
    zone: item.zone || "",
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
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The live MAIN theme could not be verified.");
}

function safeReplacement(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 2400) return false;
  if (/<\/?(?:script|style|iframe|object|embed|form)\b/i.test(text)) return false;
  if (/{{|}}|{%|%}|javascript:|\bon[a-z]+\s*=/i.test(text)) return false;
  return true;
}

async function storePlanJob(request, jobID, result, summary) {
  const now = new Date().toISOString();
  const envelope = { jobID, status: "completed", build: KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary, result };
  const key = new Request(new URL(`/_kairos/autonomous-plan-jobs/${jobID}`, request.url).toString(), { method: "GET" });
  await caches.default.put(key, new Response(JSON.stringify(envelope), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}` } }));
}

function fileByName(files, filename) { return (Array.isArray(files) ? files : []).find(file => file?.filename === filename) || null; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function normalize(value) { return String(value || "").toLowerCase().replace(/[™®]/g, "").replace(/[_–—-]+/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
function stableStringify(value) { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD, "X-Kairos-Homepage-Planner-Mode": "deterministic-whole-homepage-all-text-sources", "X-Kairos-Template-And-Section-Coverage": "true", "X-Kairos-Workers-AI-Used": "false", "X-Kairos-Private-Runtime-Used": "false", "X-Kairos-Neurons-Consumed": "0", "X-Kairos-Visual-Baseline": "tuesday-command-center-6f96b10d", "X-Content-Type-Options": "nosniff" } }); }
