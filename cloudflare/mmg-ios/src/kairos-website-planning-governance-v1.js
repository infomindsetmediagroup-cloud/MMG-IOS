import {
  KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD,
  resolveInternalDoctrine,
} from "./kairos-internal-doctrine-registry-v1.js";

export const KAIROS_WEBSITE_PLANNING_GOVERNANCE_BUILD = "kairos-website-planning-governance-20260717-1";

const PLAN_PATH = "/api/shopify/staging/plan/jobs";
const STATUS_PATH = "/api/website/governance/status";
const PLAN_CACHE_TTL_SECONDS = 60 * 60;

const PAGE_PROFILES = Object.freeze({
  homepage: Object.freeze({
    label: "Homepage",
    role: "Ecosystem orientation and routing layer",
    purpose: "Help visitors understand Mindset Media Group, identify what they want to accomplish, and move into the correct product, service, subscription, publishing, or Kairos-guided pathway.",
    requiredZones: Object.freeze([
      "hero",
      "guided-pathways",
      "products-and-resources",
      "services",
      "subscription",
      "kairos",
      "mission-and-trust",
      "final-next-step",
    ]),
    completionRule: "A homepage objective is not complete after hero-only work. Continue through sequential approved batches until every required journey zone has been reviewed, changed or intentionally preserved, and reported.",
  }),
  product: Object.freeze({
    label: "Product page",
    role: "Product education, fit assessment, conversion, and continued-journey layer",
    purpose: "Explain the product clearly, establish who it serves and what outcome it supports, preserve accurate product facts, and connect the customer to the next appropriate resource, service, subscription, or Kairos pathway.",
    requiredZones: Object.freeze([
      "product-value",
      "customer-fit",
      "contents-and-delivery",
      "use-and-outcome",
      "trust-and-policy",
      "related-resources",
      "learning-journey",
      "next-step",
    ]),
    completionRule: "A product page is not complete until product facts, customer fit, delivery expectations, related resources, and the next logical ecosystem step have been reviewed.",
  }),
  service: Object.freeze({
    label: "Service page",
    role: "Service qualification, expectation-setting, trust, and intake layer",
    purpose: "Explain the customer outcome, fit, scope, process, deliverables, tiers, policies, and next action without overstating results or obscuring production requirements.",
    requiredZones: Object.freeze([
      "service-outcome",
      "customer-fit",
      "scope-and-tiers",
      "process",
      "deliverables",
      "policies-and-trust",
      "related-resources",
      "intake-next-step",
    ]),
    completionRule: "A service page is not complete until scope, process, deliverables, customer responsibilities, policy boundaries, and intake routing have been reviewed.",
  }),
  subscription: Object.freeze({
    label: "Subscription page",
    role: "Recurring-value explanation, personalization, cadence, and onboarding layer",
    purpose: "Explain personalized recurring content, available cadences, package review and swap behavior, customer value, onboarding, and the relationship between subscriptions and the broader MMG ecosystem.",
    requiredZones: Object.freeze([
      "subscription-value",
      "personalization",
      "cadence",
      "package-review-and-swap",
      "included-resources",
      "customer-control",
      "ecosystem-connections",
      "onboarding-next-step",
    ]),
    completionRule: "A subscription page is not complete until personalization, cadence, package control, included value, and onboarding expectations have been reviewed.",
  }),
  landing: Object.freeze({
    label: "Landing page",
    role: "Focused objective-to-action journey",
    purpose: "Guide one defined audience from a specific need or campaign promise to one primary action while preserving truthful context and appropriate next steps.",
    requiredZones: Object.freeze([
      "audience-and-problem",
      "primary-outcome",
      "supporting-evidence",
      "offer-or-resource",
      "objections-and-trust",
      "primary-action",
      "continued-journey",
    ]),
    completionRule: "A landing page is not complete until the audience, outcome, offer, trust, primary action, and continued journey are coherent and verified.",
  }),
  collection: Object.freeze({
    label: "Collection page",
    role: "Catalog curation and pathway-selection layer",
    purpose: "Help visitors understand the collection, distinguish available resources, and select the product or next pathway that best fits their objective.",
    requiredZones: Object.freeze([
      "collection-purpose",
      "audience-fit",
      "resource-differentiation",
      "selection-guidance",
      "related-services",
      "subscription-pathway",
      "next-step",
    ]),
    completionRule: "A collection page is not complete until the collection purpose, selection guidance, resource relationships, and next pathway are clear.",
  }),
  page: Object.freeze({
    label: "Standard page",
    role: "Authoritative information and customer-routing layer",
    purpose: "Deliver clear, trustworthy information and connect the visitor to the appropriate next action within the MMG ecosystem.",
    requiredZones: Object.freeze([
      "page-purpose",
      "customer-context",
      "core-information",
      "trust-and-boundaries",
      "related-resources",
      "next-step",
    ]),
    completionRule: "A standard page is not complete until its purpose, authoritative information, related ecosystem connections, and next action have been reviewed.",
  }),
});

const CANONICAL_DOCTRINE_TITLES = Object.freeze([
  "MMG Website Experience Objective",
  "MMG/Kairos Experience-First Doctrine",
  "MMG Door Opener Doctrine",
]);

export async function governWebsitePlanningRequest(request) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== PLAN_PATH) {
    return { request, context: null, payload: null, originalObjective: "" };
  }

  const payload = await safeRequestJSON(request.clone());
  const originalObjective = clean(payload?.objective, 24000);
  const pageType = inferPageType(payload, originalObjective);
  const context = buildWebsiteGovernanceContext({
    pageType,
    objective: originalObjective,
    pageHandle: payload?.pageHandle || payload?.handle || payload?.resourceHandle,
    pageTitle: payload?.pageTitle || payload?.title || payload?.resourceTitle,
  });

  const governedPayload = {
    ...payload,
    requestType: pageType,
    governanceApplied: true,
    governanceContext: context,
    doctrineRefs: context.doctrineRefs,
  };

  return {
    request: rebuildJSONRequest(request, governedPayload),
    context,
    payload: governedPayload,
    originalObjective,
  };
}

export function buildPrivateGovernedPlanningRequest(request, governed) {
  if (!governed?.context || !governed?.payload) return request;
  const userObjective = governed.originalObjective || clean(governed.payload.objective, 24000);
  const objective = [
    "USER WEBSITE OBJECTIVE",
    userObjective,
    "",
    "CANONICAL MMG WEBSITE GOVERNANCE — INHERITED AUTOMATICALLY",
    governed.context.planningInstruction,
    "",
    "EXECUTION INTERPRETATION",
    "Use the canonical governance as decision context. Do not paste the doctrine into customer-facing copy. Do not invent products, services, subscriptions, URLs, claims, evidence, prices, or availability. Preserve the approved design and link destinations unless a separate exact link plan is explicitly approved.",
  ].join("\n");

  return rebuildJSONRequest(request, {
    ...governed.payload,
    objective,
    userObjective,
    governanceContext: governed.context,
  });
}

export async function applyWebsiteGovernanceToPlanResponse(request, response, context) {
  if (!context || !response) return response;
  const body = await safeResponseJSON(response.clone());
  if (!body?.result?.plan || !body?.jobID) return response;

  const result = structuredClone(body.result);
  const coverage = assessJourneyCoverage({ ...result, objective: context.objectiveDigest }, context);
  const existingCriteria = Array.isArray(result.plan.acceptanceCriteria) ? result.plan.acceptanceCriteria : [];

  result.governance = summarizeContext(context);
  result.plan.governanceContext = context;
  result.plan.doctrineRefs = context.doctrineRefs;
  result.plan.pageProfile = context.pageProfile;
  result.plan.customerPathways = context.customerPathways;
  result.plan.linkGovernance = context.linkGovernance;
  result.plan.learningContinuity = context.learningContinuity;
  result.plan.journeyCoverage = coverage;
  result.plan.wholePageCompletionRequired = context.pageType === "homepage";
  result.plan.completionRule = context.pageProfile.completionRule;
  result.plan.acceptanceCriteria = uniqueStrings([
    ...existingCriteria,
    "The canonical MMG Website Experience Objective is inherited and applied to planning decisions.",
    "The page operates as part of a connected customer journey rather than an isolated catalog or sales page.",
    "Products, services, subscriptions, publishing support, educational resources, and Kairos pathways are represented only when verified and relevant.",
    "Button labels and link destinations are governed separately; a text-only plan must not change any destination.",
    "Any journey zone not completed in this batch is explicitly preserved or carried into a subsequent approved batch.",
    context.pageProfile.completionRule,
  ]);

  result.evidence = {
    ...(result.evidence || {}),
    governanceApplied: true,
    governanceBuild: KAIROS_WEBSITE_PLANNING_GOVERNANCE_BUILD,
    doctrineRegistryBuild: KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD,
    doctrineIDs: context.doctrineRefs.map(item => item.id),
    pageType: context.pageType,
    pageRole: context.pageProfile.role,
    requiredJourneyZones: [...context.pageProfile.requiredZones],
    coveredJourneyZones: coverage.covered,
    remainingJourneyZones: coverage.remaining,
    wholePageComplete: coverage.complete,
    workersAIUsedForGovernance: false,
    neuronsConsumedForGovernance: 0,
  };

  body.result = result;
  body.summary = result.summary || body.summary;
  const now = new Date().toISOString();
  const envelope = {
    jobID: body.jobID,
    status: "completed",
    build: result.build || body.build || KAIROS_WEBSITE_PLANNING_GOVERNANCE_BUILD,
    submittedAt: now,
    updatedAt: now,
    completedAt: now,
    summary: body.summary || "Governed website plan prepared.",
    result,
  };
  await caches.default.put(planJobRequest(request, body.jobID), new Response(JSON.stringify(envelope), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${PLAN_CACHE_TTL_SECONDS}`,
    },
  }));

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Website-Governance", KAIROS_WEBSITE_PLANNING_GOVERNANCE_BUILD);
  headers.set("X-Kairos-Doctrine-Inherited", "true");
  headers.set("X-Kairos-Planning-Neurons", "0");
  return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers });
}

export function handleWebsiteGovernanceStatus(request) {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== STATUS_PATH) return null;
  return json({
    status: "operational",
    build: KAIROS_WEBSITE_PLANNING_GOVERNANCE_BUILD,
    doctrineRegistryBuild: KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD,
    inheritedAutomatically: true,
    supportedPageTypes: Object.keys(PAGE_PROFILES),
    workersAIUsed: false,
    neuronsConsumed: 0,
    linkDestinationsMutableByTextPlan: false,
    designMutationAuthorizedByCopyObjective: false,
    homepageCompletionPolicy: PAGE_PROFILES.homepage.completionRule,
  });
}

export function buildWebsiteGovernanceContext(input = {}) {
  const pageType = normalizePageType(input.pageType);
  const pageProfile = PAGE_PROFILES[pageType] || PAGE_PROFILES.page;
  const doctrines = CANONICAL_DOCTRINE_TITLES
    .map(title => resolveInternalDoctrine(title))
    .filter(Boolean);
  if (pageType === "homepage") {
    const homepageMap = resolveInternalDoctrine("MMG Homepage Journey Map");
    if (homepageMap) doctrines.splice(1, 0, homepageMap);
  }

  const doctrineRefs = doctrines.map(doctrine => ({
    id: doctrine.id,
    title: doctrine.title,
    version: doctrine.version,
    status: doctrine.status,
    owner: doctrine.owner,
    scope: [...doctrine.scope],
  }));

  const customerPathways = Object.freeze([
    "publish knowledge, expertise, or lived experience",
    "build or strengthen a brand",
    "learn and apply practical AI",
    "create and sell digital products",
    "improve creator content and audience growth",
    "access editorial, publishing, design, or production services",
    "join a personalized recurring learning subscription",
    "use Kairos to organize and execute an objective",
  ]);

  const linkGovernance = Object.freeze({
    labelsAndDestinationsGovernedSeparately: true,
    textOnlyMayChangeButtonLabels: true,
    textOnlyMayChangeDestinations: false,
    destinationChangesRequireSeparateExactApproval: true,
    reportCurrentDestinationBesideButtonLabelChange: true,
    mismatchAction: "flag-for-separate-journey-link-plan",
  });

  const learningContinuity = Object.freeze({
    preserveApprovedPagePurpose: true,
    preserveSectionRoles: true,
    preserveApprovedCopy: true,
    preserveCTALabelsAndDestinations: true,
    preserveEcosystemConnections: true,
    preserveVerificationEvidence: true,
    preserveRevisionHistory: true,
    consultApprovedRecordsBeforeFuturePlans: true,
  });

  const planningInstruction = [
    `PAGE TYPE: ${pageProfile.label}`,
    `PAGE ROLE: ${pageProfile.role}`,
    `PAGE PURPOSE: ${pageProfile.purpose}`,
    `REQUIRED JOURNEY ZONES: ${pageProfile.requiredZones.join(", ")}`,
    `COMPLETION RULE: ${pageProfile.completionRule}`,
    "CUSTOMER PATHWAYS:",
    ...customerPathways.map(item => `- ${item}`),
    "LINK GOVERNANCE:",
    "- Button wording and destinations are governed separately.",
    "- Text-only work may change verified visible labels but must not change destinations.",
    "- Destination changes require a separate exact journey-link plan and approval.",
    "DESIGN BOUNDARY:",
    "- Copy curation does not authorize layout, styling, typography, color, asset, spacing, section, block, template, Liquid, CSS, JavaScript, or responsive-behavior changes.",
    "CANONICAL DOCTRINES:",
    ...doctrines.map(doctrine => `\n--- ${doctrine.title} v${doctrine.version} ---\n${doctrine.content}`),
  ].join("\n");

  return Object.freeze({
    build: KAIROS_WEBSITE_PLANNING_GOVERNANCE_BUILD,
    doctrineRegistryBuild: KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD,
    applied: true,
    inheritedAutomatically: true,
    pageType,
    pageHandle: clean(input.pageHandle, 300),
    pageTitle: clean(input.pageTitle, 300),
    objectiveDigest: clean(input.objective, 800),
    pageProfile: Object.freeze({ ...pageProfile, requiredZones: [...pageProfile.requiredZones] }),
    doctrineRefs,
    customerPathways: [...customerPathways],
    linkGovernance,
    learningContinuity,
    designBoundary: Object.freeze({
      copyDoesNotAuthorizeDesignMutation: true,
      preserveLayout: true,
      preserveStyles: true,
      preserveTypography: true,
      preserveColors: true,
      preserveAssets: true,
      preserveSpacing: true,
      preserveSectionsAndBlocks: true,
      preserveTemplatesAndLiquid: true,
      preserveJavaScriptAndResponsiveBehavior: true,
    }),
    inference: Object.freeze({
      governanceRetrievalMode: "deterministic-internal",
      workersAIUsed: false,
      neuronsConsumed: 0,
      generativePlanningRuntime: "kairos-private-runtime-only-when-required",
    }),
    planningInstruction,
  });
}

function assessJourneyCoverage(result, context) {
  const objective = normalize(result?.objective || "");
  const reasons = (result?.plan?.textOnlyPackage?.operations || [])
    .map(item => normalize(`${item?.reason || ""} ${item?.key || ""} ${item?.filename || ""}`))
    .join(" ");
  const combined = `${objective} ${reasons}`;
  const covered = [];
  for (const zone of context.pageProfile.requiredZones) {
    if (zoneMatches(zone, combined)) covered.push(zone);
  }

  const remaining = context.pageProfile.requiredZones.filter(zone => !covered.includes(zone));
  return {
    required: [...context.pageProfile.requiredZones],
    covered,
    remaining,
    complete: remaining.length === 0,
    batchStatus: remaining.length ? "additional-approved-batches-required" : "whole-page-coverage-complete",
    completionRule: context.pageProfile.completionRule,
  };
}

function zoneMatches(zone, text) {
  const terms = {
    hero: ["hero"],
    "guided-pathways": ["pathway", "guided path", "choose what you want"],
    "products-and-resources": ["product", "resource"],
    services: ["service"],
    subscription: ["subscription", "cadence", "recurring"],
    kairos: ["kairos"],
    "mission-and-trust": ["mission", "trust", "door opener", "gatekeeper"],
    "final-next-step": ["final", "next step", "call to action", "cta"],
  }[zone] || zone.split("-");
  return terms.some(term => text.includes(normalize(term)));
}

function inferPageType(payload, objective) {
  const declared = payload?.requestType || payload?.pageType || payload?.resourceType;
  if (declared) return normalizePageType(declared);
  const descriptor = normalize(`${payload?.template || ""} ${payload?.pageTitle || ""} ${payload?.resourceTitle || ""}`);
  if (/\bproduct page\b/.test(descriptor)) return "product";
  if (/\bservice page\b/.test(descriptor)) return "service";
  if (/\bsubscription page\b/.test(descriptor)) return "subscription";
  if (/\blanding page\b|\bcampaign page\b/.test(descriptor)) return "landing";
  if (/\bcollection page\b|\bcatalog page\b/.test(descriptor)) return "collection";
  if (/\bstandard page\b/.test(descriptor)) return "page";
  return "homepage";
}

function normalizePageType(value) {
  const normalized = normalize(value);
  if (["home", "homepage", "home page", "index"].includes(normalized)) return "homepage";
  if (["product", "product page"].includes(normalized)) return "product";
  if (["service", "service page"].includes(normalized)) return "service";
  if (["subscription", "subscription page"].includes(normalized)) return "subscription";
  if (["landing", "landing page", "campaign", "campaign page"].includes(normalized)) return "landing";
  if (["collection", "collection page", "catalog"].includes(normalized)) return "collection";
  return "page";
}

function summarizeContext(context) {
  return {
    build: context.build,
    applied: true,
    inheritedAutomatically: true,
    pageType: context.pageType,
    pageRole: context.pageProfile.role,
    doctrineRefs: context.doctrineRefs,
    requiredJourneyZones: [...context.pageProfile.requiredZones],
    completionRule: context.pageProfile.completionRule,
    linksMutableByTextPlan: false,
    designMutationAuthorizedByCopyObjective: false,
    workersAIUsed: false,
    neuronsConsumed: 0,
  };
}

function planJobRequest(request, jobID) {
  return new Request(new URL(`/_kairos/autonomous-plan-jobs/${jobID}`, request.url).toString(), { method: "GET" });
}

function rebuildJSONRequest(request, payload) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(payload),
    redirect: request.redirect,
  });
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => clean(value, 2000)).filter(Boolean))];
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[™®]/g, "")
    .replace(/[_–—-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value, max = 12000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

async function safeRequestJSON(request) {
  try { return await request.json(); }
  catch { return {}; }
}

async function safeResponseJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Website-Governance": KAIROS_WEBSITE_PLANNING_GOVERNANCE_BUILD,
      "X-Kairos-Doctrine-Inherited": "true",
      "X-Kairos-Planning-Neurons": "0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
