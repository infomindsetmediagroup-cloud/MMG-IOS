import {
  hashText,
  httpError,
  parseShopifyJson,
  validateHomepageDocument,
} from "./kairos-compact-homepage-utils-v1.js";
import { handleWholeHomepagePlan } from "./kairos-whole-homepage-planner-v1.js";

export const KAIROS_CONSTITUTIONAL_IN_PLACE_HOMEPAGE_BUILD = "kairos-constitutional-in-place-homepage-20260717-1";

const TEMPLATE_FILE = "templates/index.json";
const WEBSITE_MODE = "autonomous-text-only-v1";
const JOB_TTL_SECONDS = 60 * 60;
const MAX_OPERATIONS = 160;

const DOCTRINE_IDS = Object.freeze([
  "mmg-website-experience-objective-v1",
  "mmg-homepage-journey-map-v1",
  "mmg-experience-first-doctrine-v1",
  "mmg-door-opener-doctrine-v1",
  "mmg-homepage-v6.6.0-kairos-operational-activation-green-candidate",
]);

const CANONICAL_COPY = Object.freeze({
  hero: {
    headings: [
      "Books. AI. Business. Creator Education.",
      "Discover. Learn. Create. Deliver.",
    ],
    bodies: [
      "Mindset Media Group™ helps creators, authors, builders, and entrepreneurs move from idea to finished digital asset through a guided path: learn the system, create with intention, publish through a professional production workflow, and receive completed deliverables inside a secure customer dashboard.",
      "MMG begins with education and moves into production when the project is ready. Kairos powers the customer dashboard, admin dashboard, project progress, approvals, notifications, and final digital delivery.",
    ],
    buttons: ["Start the Guided Path ↓", "Open Customer Portal"],
  },
  "guided-path": {
    headings: [
      "First, understand the journey.",
      "Find the idea worth building.",
      "Use education as a system.",
      "Turn action into finished work.",
    ],
    bodies: [
      "Before MMG asks you to choose a product, service, or tool, the ecosystem helps you understand the path. Discover what matters, learn the system, apply it through action, create something useful, and publish it through a structured digital production process when the work is ready.",
      "Clarify the topic, audience, message, and opportunity before jumping into a product, service, or publishing decision.",
      "Learn through books, guides, prompts, templates, and frameworks that help you organize knowledge into repeatable action.",
      "Create content, guides, books, products, or publishing assets—then use MMG Production Services when the work needs professional execution and dashboard-based delivery.",
    ],
    buttons: ["Continue the Journey", "Use the Free Toolkit"],
  },
  "build-options": {
    headings: [
      "Then choose how you want to build.",
      "Publish-Ready Book Build",
      "Professional Cover Design",
      "Digital Interior Formatting",
      "Editorial Enhancement",
      "Listing & Publishing Optimization",
    ],
    bodies: [
      "After the path is clear, MMG gives you options. You can keep learning through books and tools, open a finished digital product in your customer library, or bring a serious project into the production system where it moves through intake, approval, editorial, design, production, QA, and final dashboard delivery.",
      "For creators ready to turn an idea, notes, outline, or manuscript into a professional digital publishing project.",
      "For projects that need a stronger first impression, clearer visual direction, and polished image deliverables.",
      "For manuscripts and guides that need cleaner structure, spacing, hierarchy, and reader-friendly digital presentation.",
      "For improving clarity, flow, structure, tone, and reader value before a project moves deeper into production.",
      "For strengthening titles, descriptions, metadata, positioning, and product language before a digital launch or promotion.",
    ],
    buttons: ["Explore This Path →", "Explore Publishing Services →", "How the MMG Project Guide™ Works"],
  },
  "learning-resources": {
    headings: [
      "Now choose the resource that supports your stage.",
      "Build stronger content systems.",
      "Use AI with purpose.",
      "Move from learning to finished work.",
    ],
    bodies: [
      "Once you understand the journey, the MMG library gives you focused resources for creator strategy, AI skills, mindset, business growth, and long-term publishing execution. Finished digital products are fulfilled directly into your customer library after purchase.",
      "Learn audience growth, hooks, content strategy, publishing discipline, monetization, and repeatable creator workflows.",
      "Turn AI into a practical helper for writing, planning, ideation, research, creator workflows, and faster execution.",
      "When you are ready to turn your knowledge into a book, guide, cover, or publishing asset, MMG Production Services can help.",
    ],
    buttons: ["Explore the Knowledge Library", "View Product →", "Continue into Publishing Services →"],
  },
  "free-toolkit": {
    headings: [
      "Get a free system before you buy anything.",
      "Generate better ideas.",
      "Improve the first seconds.",
      "Create faster edits.",
      "Post with more clarity.",
    ],
    bodies: [
      "The Free Creator Toolkit gives you AI prompts, hook ideas, CapCut template direction, posting systems, caption frameworks, and a quick checklist for better publishing. It is a simple entry point into the same practical thinking behind the full MMG ecosystem.",
      "Use AI to create hooks, scripts, captions, content angles, and posting plans faster.",
      "Use direct, curiosity-driven opening lines that give people a reason to stop scrolling.",
      "Find practical CapCut template ideas for creator education, lifestyle posts, AI content, and short-form videos.",
      "Check the hook, cover, caption, purpose, and call to action before publishing.",
    ],
    buttons: ["Open the Free Creator Toolkit →", "Explore the Knowledge Library"],
  },
  "connected-ecosystem": {
    headings: [
      "Every path connects to the next one.",
      "Build stronger content systems.",
      "Use AI with purpose.",
      "Move from learning to finished work.",
    ],
    bodies: [
      "Books, AI guides, free tools, publishing services, customer dashboards, and creator education are not separate shelves. They are connected steps in one experience designed to help you keep moving from learning into finished work.",
      "Learn audience growth, hooks, content strategy, publishing discipline, monetization, and repeatable creator workflows.",
      "Turn AI into a practical helper for writing, planning, ideation, research, creator workflows, and faster execution.",
      "When the work is ready, continue into a governed production pathway with clear approvals, progress visibility, and professional digital delivery.",
    ],
    buttons: ["Start with The Creator’s Bible →", "Start with AI Prompting →", "Continue into Publishing Services →"],
  },
  "production-pathway": {
    headings: [
      "A clear production path from intake to delivery.",
      "Approve the work before manufacturing begins.",
      "Track progress inside your customer dashboard.",
      "Receive verified digital deliverables.",
    ],
    bodies: [
      "Serious projects move through a governed workflow: intake, Production Specification, approval, editorial, design, production, quality assurance, and final customer-dashboard delivery.",
      "Kairos prepares the project requirements and brings the Production Specification back for approval before manufacturing starts.",
      "Project status, approvals, notifications, files, and completed work remain connected inside the customer workspace.",
      "Finished work is verified, documented, and delivered as the approved digital package without changing the live storefront during staging review.",
    ],
    buttons: ["Explore Publishing Services", "Open Customer Portal", "Start a Project"],
  },
  subscription: {
    headings: ["Personalized learning that continues with you.", "Choose the cadence that fits your progress."],
    bodies: [
      "Choose a weekly, bi-weekly, or monthly cadence and receive curated digital resources aligned to your role, interests, and current objectives.",
      "Review and adjust the upcoming package before distribution so each delivery continues to match what you are building.",
    ],
    buttons: ["Explore Subscriptions", "Choose Your Cadence"],
  },
  kairos: {
    headings: ["Kairos turns objectives into guided execution.", "Context, coordination, and visible progress."],
    bodies: [
      "Kairos is the intelligence operating system inside Mindset Media Group. It organizes context, identifies the next action, coordinates the work, and moves ideas toward verified results.",
      "Describe the outcome. Kairos connects the relevant knowledge, products, services, subscriptions, project history, and governed workflows around the objective.",
    ],
    buttons: ["Meet Kairos", "Start With Kairos"],
  },
  "road-to-1m": {
    headings: ["Built in public, one post at a time.", "Post consistently.", "Study what works.", "Turn attention into value."],
    bodies: [
      "MMG is built through daily publishing, practical testing, visible learning, service development, and honest improvement. The journey itself becomes proof that consistent execution can compound.",
      "Create content that teaches, documents, tests ideas, or helps another creator move forward.",
      "Watch saves, shares, comments, follows, retention, and audience response.",
      "Use what you learn to create better books, tools, templates, services, and resources for the people you serve.",
    ],
    buttons: [],
  },
  social: {
    headings: ["Watch the system grow in real time.", "@mindset.media.group", "Knowledge Library", "Publishing Services"],
    bodies: [
      "Follow the MMG journey for creator education, books, AI tools, publishing services, product drops, TikTok Shop content, and daily lessons from the road to one million followers.",
      "Creator education, AI tools, books, practical business strategy, product launches, publishing services, and the Road to 1M journey.",
      "Browse practical books, digital downloads, creator resources, AI guides, mindset titles, and future MMG products.",
      "Explore professional support for digital book builds, covers, formatting, listing optimization, and editorial enhancement.",
    ],
    buttons: ["Follow on TikTok →", "Browse Resources →", "Continue Building →"],
  },
  founder: {
    headings: ["Built from the ground up.", "Practical work becomes practical education.", "Create resources and assets people can use.", "Clear systems over noise."],
    bodies: [
      "From professional Honda auto technician to digital creator, publisher, and builder, Mindset Media Group™ is built on discipline, recovery, execution, faith, and the belief that knowledge becomes powerful when it helps someone take action. The systems built for MMG now help other creators turn their own knowledge into professional digital assets.",
      "MMG is shaped by real work, lived experience, technical thinking, and the discipline to keep building.",
      "The goal is to help creators learn faster, act with more confidence, publish consistently, and turn knowledge into finished work.",
      "MMG products and services are designed around practical structure, repeatable workflows, dashboard visibility, quality gates, and finished digital deliverables.",
    ],
    buttons: [],
  },
  mission: {
    headings: ["We’re not gatekeepers. We’re door openers.", "Knowledge becomes powerful when it helps someone act."],
    bodies: [
      "Mindset Media Group exists to reduce unnecessary barriers to knowledge, publishing, technology, professional production, and opportunity while preserving professional standards, transparency, integrity, and customer-first service.",
      "The ecosystem helps creators, entrepreneurs, authors, educators, and small businesses understand the path forward and turn knowledge or lived experience into durable work.",
    ],
    buttons: ["Learn About Mindset Media Group", "Explore the Ecosystem"],
  },
  "final-next-step": {
    headings: ["Choose your next step."],
    bodies: [
      "Choose the path that fits where you are right now. Start with the guided library, use the free toolkit, learn AI, open your customer dashboard, or begin a digital publishing project when the work is ready for production.",
    ],
    buttons: ["Explore the Knowledge Library", "Start a Publishing Project"],
  },
});

export async function handleConstitutionalInPlaceHomepagePlan(request, env, continuation = null) {
  if (!continuation?.active) return null;

  const baseResponse = await handleWholeHomepagePlan(request, env, continuation);
  if (!baseResponse) return null;
  const payload = await responseJSON(baseResponse);
  if (!payload?.result?.plan?.textOnlyPackage) return baseResponse;

  const result = payload.result;
  const plan = result.plan;
  const packageResult = plan.textOnlyPackage;
  const templateFile = packageResult.files.find(file => file.filename === TEMPLATE_FILE);
  if (!templateFile?.beforeSource) throw httpError(409, "constitutional_template_snapshot_missing", "The homepage template snapshot is missing from the approval package.");

  const document = parseShopifyJson(templateFile.beforeSource, "Current managed Kairos Staging homepage");
  validateHomepageDocument(structuredClone(document), document);
  const order = Array.isArray(document.order) ? document.order : Object.keys(document.sections || {});
  const sectionIndex = new Map(order.map((id, index) => [id, index]));
  const operationsBySection = groupBy(packageResult.operations || [], operation => operation.sectionId || "");
  const sectionReviews = [];
  const rewrittenOperations = [];

  for (const sectionId of order) {
    const sectionOperations = operationsBySection.get(sectionId) || [];
    const section = document.sections?.[sectionId] || {};
    if (!sectionOperations.length) {
      sectionReviews.push({ sectionId, sectionType: section.type || "", sectionIndex: sectionIndex.get(sectionId) ?? 999, identity: "preserved", confidence: 0, textLocationsReviewed: 0, replacementsPrepared: 0 });
      continue;
    }

    const classification = classifySection({
      sectionId,
      sectionType: String(section.type || ""),
      sectionIndex: sectionIndex.get(sectionId) ?? 999,
      sectionCount: Math.max(order.length, 1),
      operations: sectionOperations,
    });

    const sectionCopy = classification.identity ? CANONICAL_COPY[classification.identity] : null;
    const selected = sectionCopy ? rewriteSectionOperations(sectionOperations, sectionCopy, classification.identity) : [];
    rewrittenOperations.push(...selected);
    sectionReviews.push({
      sectionId,
      sectionType: section.type || "",
      sectionIndex: sectionIndex.get(sectionId) ?? 999,
      identity: classification.identity || "preserved",
      confidence: classification.confidence,
      evidence: classification.evidence,
      textLocationsReviewed: sectionOperations.length,
      replacementsPrepared: selected.length,
    });
  }

  const sectionFileOperations = (packageResult.operations || []).filter(operation => operation.scope === "section-file" && !order.includes(operation.sectionId));
  for (const operation of sectionFileOperations) {
    const identity = classifyText(normalize(`${operation.id} ${operation.before}`));
    const copy = identity ? CANONICAL_COPY[identity] : null;
    if (!copy) continue;
    const role = inferOperationRole(operation);
    const replacement = copy[`${role}s`]?.[0];
    if (replacement && safeReplacement(replacement) && replacement !== operation.before) rewrittenOperations.push({ ...operation, after: replacement, zone: identity, reason: `Canonical in-place ${identity} ${role}` });
  }

  const finalOperations = dedupe(rewrittenOperations).slice(0, MAX_OPERATIONS);
  if (!finalOperations.length) throw httpError(409, "constitutional_in_place_no_safe_changes", "Kairos reviewed the homepage but found no safe constitutional text substitutions that preserve each section’s current purpose.");

  const rebuiltPackage = await rebuildPackage(packageResult, finalOperations);
  const changedIdentities = unique(finalOperations.map(operation => operation.zone));
  const preservedSections = sectionReviews.filter(review => review.replacementsPrepared === 0).map(review => review.sectionId);
  const summary = `Kairos prepared ${finalOperations.length} constitutional in-place text substitution${finalOperations.length === 1 ? "" : "s"} across ${changedIdentities.length} section purpose${changedIdentities.length === 1 ? "" : "s"}. No section was reassigned to a different customer journey role.`;

  result.build = KAIROS_CONSTITUTIONAL_IN_PLACE_HOMEPAGE_BUILD;
  result.summary = summary;
  result.plan.summary = summary;
  result.plan.strategy = "Inspect the current managed staging homepage, preserve each section’s existing purpose, consult the canonical MMG website doctrines and v6.6 homepage source, and substitute only visible text at the same verified source paths. Never assign generic publishing, subscription, service, product, or Kairos copy to a section with a different identity.";
  result.plan.textOnlyPackage = rebuiltPackage;
  result.plan.sourceHashes = rebuiltPackage.sourceHashes;
  result.plan.changes = rebuiltPackage.files.map(file => ({
    filename: file.filename,
    changeType: "replace-visible-text-in-place",
    purpose: `${file.operations.length} section-preserving text substitution${file.operations.length === 1 ? "" : "s"}.`,
    expectedOutcome: "The same page, same sections, same links, same design, and same behavior with constitutionally aligned wording in the existing text locations.",
  }));
  result.plan.constitutionalAuthority = DOCTRINE_IDS;
  result.plan.sectionIdentityPreserved = true;
  result.plan.genericJourneyZoneAssignmentUsed = false;
  result.plan.sectionRepurposingAuthorized = false;
  result.plan.copySource = "MMG-HOMEPAGE-v6.6.0-KAIROS-OPERATIONAL-ACTIVATION-GREEN-CANDIDATE";
  result.plan.sectionReview = sectionReviews;
  result.plan.preservedSectionIDs = preservedSections;
  result.plan.journeyCoverage = {
    reviewed: unique(sectionReviews.map(review => review.identity).filter(identity => identity !== "preserved")),
    coveredByChanges: changedIdentities,
    preservedBecauseIdentityWasUncertain: preservedSections,
    complete: sectionReviews.every(review => review.textLocationsReviewed === 0 || review.replacementsPrepared > 0 || review.identity === "preserved"),
  };
  result.evidence = {
    ...(result.evidence || {}),
    plannerMode: "constitutional-section-preserving-in-place-copy",
    constitutionalAuthority: DOCTRINE_IDS,
    canonicalCopySource: "MMG-HOMEPAGE-v6.6.0-KAIROS-OPERATIONAL-ACTIVATION-GREEN-CANDIDATE",
    sectionIdentityPreserved: true,
    genericJourneyZoneAssignmentUsed: false,
    sectionRepurposingAuthorized: false,
    unknownSectionsPreserved: preservedSections.length,
    replacementCount: finalOperations.length,
    filesChanged: rebuiltPackage.files.length,
    urlsChanged: false,
    designChanged: false,
    structureChanged: false,
    workersAIUsed: false,
    privateRuntimeUsed: false,
    neuronsConsumed: 0,
  };

  payload.build = KAIROS_CONSTITUTIONAL_IN_PLACE_HOMEPAGE_BUILD;
  payload.summary = summary;
  payload.result = result;
  await storePlanJob(request, payload.jobID, result, summary);
  return json(payload, baseResponse.status || 202);
}

function classifySection(section) {
  const text = normalize(`${section.sectionType} ${section.sectionId} ${section.operations.map(operation => `${operation.key || ""} ${operation.before || ""}`).join(" ")}`);
  if (section.sectionIndex === 0 || (section.sectionIndex <= 1 && /(hero|image banner|slideshow)/.test(text))) return verdict("hero", 100, "first homepage section / hero type");
  const identity = classifyText(text);
  if (identity) return verdict(identity, 90, "existing section type and visible text");
  if (section.sectionIndex === section.sectionCount - 1 && /(start|choose|next|continue|cta)/.test(text)) return verdict("final-next-step", 80, "last section with existing next-step language");
  return verdict(null, 0, "identity uncertain; preserve section");
}

function classifyText(text) {
  if (/(founder|built from the ground|honda|our story)/.test(text)) return "founder";
  if (/(road to 1m|road to one million|one million followers|post consistently|study what works)/.test(text)) return "road-to-1m";
  if (/(social channels|follow the build|tiktok|instagram|facebook|mindset media group social)/.test(text)) return "social";
  if (/(free creator toolkit|creator toolkit|prompts hooks templates checklist|get a free system)/.test(text)) return "free-toolkit";
  if (/(connected ecosystem|every path connects|product series|not separate shelves)/.test(text)) return "connected-ecosystem";
  if (/(production specification|customer dashboard|intake approval|project progress|quality assurance|final delivery|production pathway)/.test(text)) return "production-pathway";
  if (/(subscription|weekly|bi weekly|bi-weekly|monthly cadence|recurring learning)/.test(text)) return "subscription";
  if (/(kairos|intelligence operating system|guided execution)/.test(text)) return "kairos";
  if (/(featured products|learning resources|knowledge library|creator s bible|ai prompting|resource that supports)/.test(text)) return "learning-resources";
  if (/(continue building|choose how you want to build|book build|cover design|interior formatting|editorial enhancement|listing publishing optimization)/.test(text)) return "build-options";
  if (/(guided path|understand the journey|discover learn apply|knowledge system|find the idea worth building)/.test(text)) return "guided-path";
  if (/(door opener|not gatekeepers|mission|integrity|customer first|customer-first|faith|recovery)/.test(text)) return "mission";
  if (/(final cta|choose your next step|next step that fits)/.test(text)) return "final-next-step";
  return null;
}

function rewriteSectionOperations(operations, copy, identity) {
  const output = [];
  const cursors = { heading: 0, body: 0, button: 0 };
  for (const operation of operations) {
    const role = inferOperationRole(operation);
    const values = copy[`${role}s`] || [];
    if (cursors[role] >= values.length) continue;
    const after = values[cursors[role]++];
    if (!safeReplacement(after) || after === operation.before) continue;
    output.push({ ...operation, after, zone: identity, reason: `Canonical in-place ${identity} ${role} ${cursors[role]}` });
  }
  return output;
}

function inferOperationRole(operation) {
  const key = normalize(operation.key || operation.id || "");
  const text = String(operation.before || "").trim();
  if (/(button|cta|label|link text)/.test(key) && text.length <= 120) return "button";
  if (/(heading|headline|title)/.test(key) && !/(subtitle|subheading)/.test(key)) return "heading";
  if (/(subheading|subtitle|description|content|copy|body|text|message|caption|summary)/.test(key)) return "body";
  if (/^(explore|open|start|continue|view|browse|follow|meet|choose|learn|use|get)/i.test(text) && text.length <= 100) return "button";
  if (text.length <= 85 && text.split(/\s+/).length <= 12) return "heading";
  return "body";
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
      if (sourceSkeleton(candidateSource) !== sourceSkeleton(originalFile.beforeSource)) throw httpError(409, "constitutional_section_structure_changed", `${originalFile.filename} changed outside visible text nodes.`);
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
  if (!files.length) throw httpError(409, "constitutional_package_unchanged", "The constitutional in-place planner produced no source changes.");
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
  for (const operation of operations.filter(item => item.kind === "json-text")) setSetting(candidate, operation, operation.after);
  const groups = groupBy(operations.filter(item => item.kind === "json-markup-text"), item => `${item.scope}:${item.sectionId}:${item.blockId}:${item.key}`);
  for (const items of groups.values()) {
    const before = getSetting(candidate, items[0]);
    const after = applyVisibleOperations(before, items);
    if (sourceSkeleton(before) !== sourceSkeleton(after)) throw httpError(409, "constitutional_markup_structure_changed", "A markup-backed setting changed outside visible text nodes.");
    setSetting(candidate, items[0], after);
  }
  const unsupported = operations.filter(item => !["json-text", "json-markup-text"].includes(item.kind));
  if (unsupported.length) throw httpError(409, "constitutional_template_operation_invalid", "The constitutional template plan contains an unsupported operation type.");
  return candidate;
}

function applyVisibleOperations(source, operations) {
  let candidate = String(source || "");
  const segments = visibleTextSegments(candidate);
  const replacements = operations.map(operation => {
    const segment = Number.isInteger(operation.segmentIndex) ? segments[operation.segmentIndex] : null;
    if (!segment) throw httpError(409, "constitutional_visible_segment_missing", `The visible text segment is missing for ${operation.id}.`);
    return { start: segment.start, end: segment.end, after: operation.after };
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

function applySettingPath(document, operation) {
  const section = document.sections?.[operation.sectionId];
  if (!section) throw httpError(409, "constitutional_section_missing", `Homepage section ${operation.sectionId} is missing.`);
  if (operation.scope === "section") return section.settings;
  const block = section.blocks?.[operation.blockId];
  if (!block) throw httpError(409, "constitutional_block_missing", `Homepage block ${operation.sectionId}/${operation.blockId} is missing.`);
  return block.settings;
}

function getSetting(document, operation) {
  const settings = applySettingPath(document, operation);
  if (!settings || typeof settings[operation.key] !== "string") throw httpError(409, "constitutional_text_setting_missing", `Text setting ${operation.id} is missing.`);
  return settings[operation.key];
}

function setSetting(document, operation, value) {
  const settings = applySettingPath(document, operation);
  if (!settings || typeof settings[operation.key] !== "string") throw httpError(409, "constitutional_text_setting_missing", `Text setting ${operation.id} is missing.`);
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

function safeReplacement(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 2400) return false;
  if (/<\/?(?:script|style|iframe|object|embed|form)\b/i.test(text)) return false;
  if (/{{|}}|{%|%}|javascript:|\bon[a-z]+\s*=/i.test(text)) return false;
  return true;
}

function isVisibleCopy(value) {
  const text = String(value || "").trim();
  if (text.length < 2 || text.length > 2400) return false;
  if ((text.match(/[A-Za-z]/g) || []).length < 2) return false;
  if (/^(https?:\/\/|\/|#|mailto:|tel:|shopify:\/\/)/i.test(text)) return false;
  return true;
}

function verdict(identity, confidence, evidence) { return { identity, confidence, evidence }; }
function normalize(value) { return String(value || "").toLowerCase().replace(/[™®]/g, "").replace(/[_–—-]+/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
function groupBy(values, keyFn) { const map = new Map(); for (const value of values) { const key = keyFn(value); if (!map.has(key)) map.set(key, []); map.get(key).push(value); } return map; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function dedupe(operations) { const seen = new Set(); return operations.filter(operation => { if (seen.has(operation.id)) return false; seen.add(operation.id); return true; }); }
async function responseJSON(response) { try { return await response.clone().json(); } catch { return null; } }

async function storePlanJob(request, jobID, result, summary) {
  const now = new Date().toISOString();
  const envelope = { jobID, status: "completed", build: KAIROS_CONSTITUTIONAL_IN_PLACE_HOMEPAGE_BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary, result };
  const key = new Request(new URL(`/_kairos/autonomous-plan-jobs/${jobID}`, request.url).toString(), { method: "GET" });
  await caches.default.put(key, new Response(JSON.stringify(envelope), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}` } }));
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_CONSTITUTIONAL_IN_PLACE_HOMEPAGE_BUILD,
      "X-Kairos-Section-Identity-Preserved": "true",
      "X-Kairos-Generic-Zone-Assignment": "false",
      "X-Kairos-Section-Repurposing-Authorized": "false",
      "X-Kairos-Workers-AI-Used": "false",
      "X-Kairos-Neurons-Consumed": "0",
      "X-Kairos-Visual-Baseline": "tuesday-command-center-6f96b10d",
    },
  });
}
