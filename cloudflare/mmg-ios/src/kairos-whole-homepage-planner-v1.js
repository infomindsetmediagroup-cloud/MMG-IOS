import {
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  validateHomepageDocument,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD = "kairos-whole-homepage-planner-20260717-1";

const PLAN_PATH = "/api/shopify/staging/plan/jobs";
const TEMPLATE_FILE = "templates/index.json";
const WEBSITE_MODE = "autonomous-text-only-v1";
const JOB_TTL_SECONDS = 60 * 60;
const MAX_OPERATIONS = 64;

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
    headings: ["Your Knowledge Has Value."],
    bodies: ["Turn what you know, what you have lived, and what you are building into books, digital products, brands, and lasting intellectual property."],
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
    ],
    bodies: [
      "Choose the path that fits your objective and move from knowledge to completed work.",
      "Turn expertise, experience, and ideas into professional books, guides, and publishing assets.",
      "Create a clear and consistent presence supported by practical content, design, and business systems.",
      "Use practical AI to improve creativity, productivity, communication, and execution.",
      "Transform useful knowledge into resources that educate customers and create long-term value.",
      "Get publishing, editorial, creator, design, and business support aligned to the work you are building.",
      "Receive personalized educational resources on a weekly, bi-weekly, or monthly cadence.",
    ],
    buttons: ["Explore Publishing", "Explore Branding", "Explore AI Resources", "Explore Digital Products", "Explore Services", "Explore Subscriptions"],
  }),
  "products-and-resources": Object.freeze({
    headings: ["Products and Resources Built for Progress"],
    bodies: ["Explore practical guides, creator resources, publishing tools, and digital products designed to move knowledge toward completed work."],
    buttons: ["Explore Products", "View Resources"],
  }),
  services: Object.freeze({
    headings: [
      "Professional Support for the Work You’re Building",
      "Publishing and Editorial Services",
      "Creator and Business Services",
      "Design and Production Support",
    ],
    bodies: [
      "Access focused support for publishing, editorial development, creator growth, brand development, design, production, and business execution.",
      "Move manuscripts, guides, and publishing projects toward professional, release-ready deliverables.",
      "Strengthen content systems, customer communication, offers, and operational momentum.",
      "Prepare visual, digital, and production assets that support the complete customer journey.",
    ],
    buttons: ["Explore Services", "View Publishing Support", "View Creator Services", "View Design Support"],
  }),
  subscription: Object.freeze({
    headings: ["Personalized Learning That Continues With You"],
    bodies: ["Choose a weekly, bi-weekly, or monthly cadence and receive curated digital resources aligned to your role, interests, and current objectives."],
    buttons: ["Explore Subscriptions", "See How It Works"],
  }),
  kairos: Object.freeze({
    headings: ["Kairos Turns Objectives Into Guided Execution"],
    bodies: ["Kairos is the intelligence operating system inside Mindset Media Group. It organizes context, identifies the next action, coordinates the work, and moves ideas toward verified results."],
    buttons: ["Meet Kairos", "Start With Kairos"],
  }),
  "mission-and-trust": Object.freeze({
    headings: ["We’re Not Gatekeepers. We’re Door Openers."],
    bodies: ["Mindset Media Group makes professional knowledge, publishing, technology, and opportunity more accessible without unnecessary complexity or barriers."],
    buttons: ["Learn About Mindset Media Group"],
  }),
  "final-next-step": Object.freeze({
    headings: ["Start With What You Know"],
    bodies: ["Choose a path, explore available products and services, join a personalized subscription, or let Kairos guide your next step."],
    buttons: ["Explore Mindset Media Group", "Start With Kairos"],
  }),
});

export async function handleWholeHomepagePlan(request, env, continuation = null) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== PLAN_PATH || !continuation?.active) return null;

  const source = await inspectHomepageSource(request, env);
  const inventory = buildTemplateInventory(source.document);
  if (!inventory.length) {
    throw httpError(409, "homepage_template_text_inventory_empty", "Kairos could not locate editable homepage text settings in the current managed staging template.");
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
  const summary = `Kairos prepared ${operations.length} source-bound text replacement${operations.length === 1 ? "" : "s"} across ${coveredZones.length} homepage journey zone${coveredZones.length === 1 ? "" : "s"}, using the current managed staging theme and zero inference.`;

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
      strategy: "Review the current managed staging homepage section-by-section and replace only existing text settings across all matched journey zones while preserving every prior approved change and every non-text value.",
      changes: packageResult.files.map(file => ({
        filename: file.filename,
        changeType: "replace-visible-text",
        purpose: `${file.operations.length} whole-page source-bound text replacement${file.operations.length === 1 ? "" : "s"}.`,
        expectedOutcome: "A fully curated homepage narrative with identical section structure, blocks, links, styling, assets, layout, and behavior.",
      })),
      risks: ["Longer approved wording may wrap differently inside the unchanged design."],
      acceptanceCriteria: [
        "Every editable homepage section is reviewed in source order.",
        "Only existing text setting values change.",
        "Every URL, link destination, product reference, collection reference, section, block, Liquid token, HTML element, CSS rule, JavaScript behavior, asset, color, typography rule, spacing value, layout instruction, animation, and responsive rule remains unchanged.",
        "Prior approved staging text remains the source of truth for continuation.",
        "All writes target Kairos Staging only and every changed file is read back exactly.",
        "Shopify MAIN remains unchanged.",
      ],
      rollbackPlan: ["Restore the exact pre-execution templates/index.json bytes from this approval package."],
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
      })),
    },
    evidence: {
      sourceInspectionActionID: source.actionID,
      sourceAdapter: "shopify-graphql-theme-files",
      templateOnlyMutation: true,
      sectionLiquidFilesWritten: 0,
      inventoryCount: inventory.length,
      sectionCount: sections.length,
      reviewedSectionCount: assignments.length,
      replacementCount: operations.length,
      filesChanged: packageResult.files.length,
      plannerMode: "deterministic-whole-homepage-source-plan",
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
  const inspection = await inspectStagingSource(null, request, env, KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD, [TEMPLATE_FILE]);
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
  };
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
  return inventory.sort((left, right) => left.sectionIndex - right.sectionIndex || left.sourceOrder - right.sourceOrder);
}

function collectSettings(inventory, scope, context, blockId, blockType, settings) {
  let sourceOrder = 0;
  for (const [key, value] of Object.entries(settings || {})) {
    sourceOrder += 1;
    if (typeof value !== "string" || !isPlainEditableText(key, value)) continue;
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
      sourceOrder,
    });
  }
}

function groupInventoryBySection(document, inventory) {
  const order = Array.isArray(document?.order) ? document.order : Object.keys(document?.sections || {});
  return order.map((sectionId, index) => {
    const section = document?.sections?.[sectionId] || {};
    const items = inventory.filter(item => item.sectionId === sectionId);
    const searchable = normalize(`${section?.type || ""} ${items.map(item => `${item.key} ${item.before}`).join(" ")}`);
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
    if (/(product|collection|guide|resource|digital product|shop)/.test(text)) score += 95;
    if (position > 0.2 && position < 0.75) score += 25;
  } else if (zone === "services") {
    if (/(service|publishing|editorial|design|production|creator support|business support)/.test(text)) score += 100;
    if (position > 0.3 && position < 0.8) score += 25;
  } else if (zone === "subscription") {
    if (/(subscription|weekly|bi weekly|monthly|personalized|recurring)/.test(text)) score += 110;
    if (position > 0.35 && position < 0.85) score += 20;
  } else if (zone === "kairos") {
    if (/(kairos|intelligence operating system|guided execution)/.test(text)) score += 120;
    if (position > 0.25 && position < 0.9) score += 15;
  } else if (zone === "mission-and-trust") {
    if (/(gatekeeper|door opener|mission|about|trust|integrity|customer first)/.test(text)) score += 110;
    if (position > 0.45) score += 20;
  } else if (zone === "final-next-step") {
    if (/(final|call to action|cta|newsletter|start with|next step)/.test(text)) score += 90;
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
  for (const assignment of assignments) {
    const copy = ZONE_COPY[assignment.zone];
    if (!copy) continue;
    const buckets = {
      heading: assignment.items.filter(item => item.role === "heading"),
      body: assignment.items.filter(item => item.role === "body"),
      button: assignment.items.filter(item => item.role === "button"),
    };
    addRoleOperations(operations, assignment.zone, buckets.heading, copy.headings || [], "heading");
    addRoleOperations(operations, assignment.zone, buckets.body, copy.bodies || [], "body");
    addRoleOperations(operations, assignment.zone, buckets.button, copy.buttons || [], "button");
  }
  return operations.filter(operation => operation.before !== operation.after);
}

function addRoleOperations(target, zone, items, values, role) {
  const count = Math.min(items.length, values.length);
  for (let index = 0; index < count; index += 1) {
    const item = items[index];
    const after = values[index];
    if (!safeReplacement(after) || after === item.before) continue;
    target.push({ ...item, after, zone, reason: `Whole-page ${zone} ${role} ${index + 1}` });
  }
}

async function buildTextPackage(source, operations) {
  const original = parseShopifyJson(source.templateFile.content, "Current managed Kairos Staging homepage");
  const candidate = structuredClone(original);
  for (const operation of operations) {
    const current = getSetting(candidate, operation);
    if (current !== operation.before) throw httpError(409, "whole_homepage_source_changed", `The source text changed for ${operation.id}.`);
    setSetting(candidate, operation, operation.after);
  }
  validateHomepageDocument(candidate, original);
  const structureSignature = templateStructureSignature(original);
  if (templateStructureSignature(candidate) !== structureSignature) throw httpError(409, "whole_homepage_structure_changed", "The whole-page text plan changed the Shopify homepage structure.");
  const candidateSource = serializeLikeSource(source.templateFile.content, candidate);
  const afterSha256 = await hashText(candidateSource);
  if (afterSha256 === source.templateFile.sha256) throw httpError(409, "whole_homepage_text_unchanged", "The whole-page planner produced no source change.");
  const compact = operations.map(compactOperation);
  return {
    version: WEBSITE_MODE,
    operations: compact,
    files: [{ filename: TEMPLATE_FILE, beforeSha256: source.templateFile.sha256, afterSha256, beforeSource: source.templateFile.content, candidateSource, structureSignature, operations: compact }],
    sourceHashes: { [TEMPLATE_FILE]: source.templateFile.sha256 },
    sectionFiles: [],
  };
}

function isPlainEditableText(key, value) {
  const name = String(key || "").toLowerCase();
  const text = String(value || "").trim();
  if (!isVisibleCopy(text)) return false;
  if (/(url|link(?!.*label)|href|image|video|color|colour|font|size|width|height|alignment|position|id$|handle|product|collection|menu|icon|animation|spacing|padding|margin|opacity|scheme|style|layout|desktop|mobile|enabled|show_|hide_|class|asset|file|src|target|rel|aria|tabindex|price|sku|vendor|variant)/i.test(name)) return false;
  if (/[<>{}%]/.test(text)) return false;
  return true;
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
  return { id: item.id, kind: item.kind, filename: item.filename, scope: item.scope || "", sectionId: item.sectionId || "", blockId: item.blockId || "", key: item.key || "", segmentIndex: null, before: item.before, after: item.after, reason: item.reason || "", zone: item.zone || "" };
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
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD, "X-Kairos-Homepage-Planner-Mode": "deterministic-whole-homepage-source-plan", "X-Kairos-Template-Only-Mutation": "true", "X-Kairos-Workers-AI-Used": "false", "X-Kairos-Private-Runtime-Used": "false", "X-Kairos-Neurons-Consumed": "0", "X-Kairos-Visual-Baseline": "tuesday-command-center-6f96b10d", "X-Content-Type-Options": "nosniff" } }); }
