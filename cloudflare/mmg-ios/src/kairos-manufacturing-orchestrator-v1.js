export const KAIROS_MANUFACTURING_ORCHESTRATOR_BUILD = "kairos-manufacturing-orchestrator-20260723-1";

const PUBLISHER = "Mindset Media Group™";
const PRODUCT_TYPES = new Set(["digital-asset", "workbook", "prompt-library", "course-guide", "service-package", "subscription-resource"]);
const REQUIRED_CUSTOMER_DELIVERABLES = [
  "customer-spec-sheet.pdf",
  "kdp-interior-6x9.pdf",
  "digital-asset-edition-v2.pdf",
  "cover-portrait-2048x3072.png",
  "cover-thumbnail-2048x2048.png",
  "README.txt",
];

export async function handleManufacturingOrchestrator(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/kairos/manufacturing")) return null;

  if (request.method === "GET" && url.pathname === "/api/kairos/manufacturing/status") {
    return json(buildStatus(env));
  }

  if (request.method === "POST" && url.pathname === "/api/kairos/manufacturing/plan") {
    const input = await safeJSON(request);
    return json(buildManufacturingPlan(input, env), 201);
  }

  if (request.method === "POST" && url.pathname === "/api/kairos/manufacturing/release-decision") {
    const input = await safeJSON(request);
    return json(buildReleaseDecision(input), 201);
  }

  return json({ status: "not-found", error: { code: "manufacturing_route_not_found", message: "Kairos manufacturing route not found." } }, 404);
}

export function buildManufacturingPlan(input = {}, env = {}) {
  const title = clean(input.title || input.publicationTitle || "Untitled Product", 240);
  const objective = clean(input.objective || input.brief || "", 12_000);
  const sourceText = clean(input?.manuscript?.text || input.sourceText || "", 2_000_000);
  const requestedType = clean(input.productType || "", 80).toLowerCase();
  const productType = PRODUCT_TYPES.has(requestedType) ? requestedType : classifyProduct({ title, objective, sourceText });
  const sourceProfile = analyzeSource(sourceText);
  const research = assessResearchNeeds({ title, objective, sourceText, productType, input });
  const cover = buildCoverPlan(input, productType);
  const storefront = buildStorefrontPlan({ title, objective, productType, input });
  const social = buildSocialPlan({ title, objective, productType });
  const seo = buildSEOPlan({ title, objective, productType });
  const publication = buildPublicationPlan(input);

  return {
    status: "planned",
    build: KAIROS_MANUFACTURING_ORCHESTRATOR_BUILD,
    planId: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    identity: {
      publisher: PUBLISHER,
      creator: PUBLISHER,
      individualAttributionAllowed: false,
    },
    product: {
      title,
      productType,
      objective,
      customerFacingOnly: true,
      digitalAssetEdition: productType === "digital-asset" ? "2.0" : null,
    },
    source: sourceProfile,
    research,
    manuscript: {
      action: sourceProfile.estimatedPages >= 100 ? "edit-and-manufacture" : "rewrite-expand-and-manufacture",
      minimumFinishedPages: productType === "digital-asset" ? 100 : null,
      masterSource: "Master Production DOCX",
      requiredArchitecture: ["parts", "chapters", "frameworks", "workflows", "templates", "worksheets", "checklists", "decision-rules", "labs", "action-steps"],
      fillerAllowed: false,
      duplicationAllowed: false,
    },
    cover,
    deliverables: {
      customerRelease: REQUIRED_CUSTOMER_DELIVERABLES,
      exactCustomerFileCount: REQUIRED_CUSTOMER_DELIVERABLES.length,
      internalProductionArtifacts: ["master-production.docx", "research-record.json", "quality-report.json", "storefront-package.json", "release-manifest.json"],
    },
    storefront,
    seo,
    social,
    publication,
    execution: buildExecutionGraph({ sourceProfile, research, cover, publication }),
    safeguards: {
      customerFilesContainInternalNotes: false,
      shopifyMutationRequiresApproval: true,
      livePublicationRequiresApproval: true,
      priceMutationRequiresApproval: true,
      inventoryMutationRequiresApproval: true,
      themeMutationAuthorized: false,
      navigationMutationAuthorized: false,
    },
    readiness: buildReadiness({ env, sourceProfile, cover, research }),
  };
}

export function buildReleaseDecision(input = {}) {
  const confirmation = clean(input.confirmation || "", 160);
  const target = clean(input.target || "draft", 40).toLowerCase();
  const quality = input.quality || {};
  const customerFiles = Array.isArray(input.customerFiles) ? input.customerFiles : [];
  const failures = [];

  if (Number(quality.finishedPages || 0) < 100) failures.push("minimum_finished_pages_not_met");
  if (quality.prohibitedIdentityFound === true) failures.push("prohibited_identity_found");
  if (quality.internalContentFound === true) failures.push("internal_content_found");
  if (quality.coverDimensionsValid !== true) failures.push("cover_dimensions_invalid");
  if (quality.customerFileCount !== 6 || customerFiles.length !== 6) failures.push("customer_package_count_invalid");
  if (!REQUIRED_CUSTOMER_DELIVERABLES.every((name) => customerFiles.includes(name))) failures.push("required_customer_file_missing");

  const expected = target === "live" ? "PUBLISH PRODUCT LIVE" : "CREATE SHOPIFY PRODUCT DRAFT";
  if (confirmation !== expected) failures.push("explicit_confirmation_required");

  return {
    status: failures.length ? "blocked" : "approved",
    build: KAIROS_MANUFACTURING_ORCHESTRATOR_BUILD,
    target,
    expectedConfirmation: expected,
    failures,
    nextAction: failures.length
      ? "Resolve every release-gate failure and submit a new release decision."
      : target === "live"
        ? "Use the governed manuscript Shopify publication endpoint."
        : "Use the governed manuscript Shopify draft endpoint.",
  };
}

function buildStatus(env) {
  const checks = {
    durableStorage: Boolean(env?.KAIROS_PROJECTS),
    aiWriting: Boolean(env?.AI),
    imageProcessing: Boolean(env?.IMAGES),
    assetDelivery: Boolean(env?.ASSETS && typeof env.ASSETS.fetch === "function"),
    v2Required: String(env?.KAIROS_DIGITAL_ASSET_V2_REQUIRED || "false").toLowerCase() === "true",
    shopifyDraftEnabled: String(env?.KAIROS_SHOPIFY_WRITES_ENABLED || "false").toLowerCase() === "true",
    livePublicationEnabled: String(env?.KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED || "false").toLowerCase() === "true",
  };
  const required = ["durableStorage", "aiWriting", "imageProcessing", "assetDelivery", "v2Required"];
  const missing = required.filter((key) => !checks[key]);
  return {
    status: missing.length ? "not-ready" : "operational",
    ready: missing.length === 0,
    build: KAIROS_MANUFACTURING_ORCHESTRATOR_BUILD,
    checks,
    missing,
    capabilities: {
      sourceAnalysis: true,
      productTypeClassification: true,
      researchGapPlanning: true,
      manuscriptWritingAndExpansion: true,
      coverNormalizationAndDerivativeGeneration: true,
      customerDeliverableManufacturing: true,
      storefrontCopyPackage: true,
      seoMetadataPackage: true,
      socialAssetPlan: true,
      approvalGatedShopifyDraft: true,
      approvalGatedLivePublication: true,
    },
  };
}

function classifyProduct({ title, objective, sourceText }) {
  const text = `${title} ${objective} ${sourceText.slice(0, 6000)}`.toLowerCase();
  if (/subscription|membership|weekly|bi-weekly|monthly/.test(text)) return "subscription-resource";
  if (/service|client intake|deliverable|consulting|done-for-you/.test(text)) return "service-package";
  if (/course|lesson|module|curriculum|training/.test(text)) return "course-guide";
  if (/prompt library|prompt pack|prompts collection|prompt vault/.test(text)) return "prompt-library";
  if (/workbook|worksheet|journal|exercise book|planner/.test(text)) return "workbook";
  return "digital-asset";
}

function analyzeSource(sourceText) {
  const wordCount = countWords(sourceText);
  const estimatedPages = Math.ceil(wordCount / 250);
  const headings = (sourceText.match(/^(?:#{1,3}\s+|Chapter\s+\d+|Part\s+\d+)/gim) || []).length;
  return {
    provided: sourceText.length > 0,
    wordCount,
    estimatedPages,
    detectedSections: headings,
    substantive: wordCount >= 12_000 && headings >= 8,
    requiresExpansion: estimatedPages < 100,
    authoritativeSourcePreservationRequired: true,
  };
}

function assessResearchNeeds({ title, objective, sourceText, productType, input }) {
  const text = `${title} ${objective} ${sourceText}`.toLowerCase();
  const currentClaimsLikely = /latest|current|today|2026|price|law|policy|platform rule|algorithm|statistics|market/.test(text);
  const factualDomain = /medical|legal|financial|scientific|technical|software|platform|policy/.test(text);
  const userDisabled = input.researchAllowed === false;
  const required = !userDisabled && (currentClaimsLikely || factualDomain || countWords(sourceText) < 8_000);
  return {
    required,
    mode: required ? "primary-and-authoritative-sources" : "source-grounded-only",
    preserveCitations: required,
    currentVerificationRequired: currentClaimsLikely,
    claimsWithoutEvidenceAllowed: false,
    suggestedQueries: required ? [title, `${title} authoritative guidance`, `${title} current standards`] : [],
    productType,
  };
}

function buildCoverPlan(input, productType) {
  const approved = Boolean(input?.cover?.dataBase64 || input?.cover?.bytes || input?.coverApproved);
  return {
    mode: approved ? "normalize-approved-cover" : "generate-cover-concept-and-require-approval",
    approvedCoverAvailable: approved,
    portrait: { width: 2048, height: 3072, format: "png", fit: "contain", croppingAllowed: false, redrawingAllowed: false },
    thumbnail: { width: 2048, height: 2048, format: "png", fit: "contain", croppingAllowed: false, redrawingAllowed: false },
    productType,
    approvalRequiredBeforeRelease: true,
  };
}

function buildStorefrontPlan({ title, objective, productType, input }) {
  return {
    productTitle: title,
    handle: slug(title),
    productType,
    status: "draft-until-approved",
    copy: ["short-description", "long-description", "benefits", "what-is-included", "audience", "usage-instructions", "faq"],
    media: ["portrait-cover", "square-thumbnail", "book-mockup", "what-you-will-learn", "inside-the-book", "social-square", "social-portrait", "social-story"],
    price: input.price == null ? null : Number(input.price),
    pricingApprovalRequired: true,
    sourceObjective: objective,
  };
}

function buildSEOPlan({ title, objective, productType }) {
  const core = clean(objective, 280) || `${title} practical guide`;
  return {
    seoTitle: truncate(`${title} | Mindset Media Group`, 60),
    metaDescription: truncate(core, 155),
    canonicalHandle: slug(title),
    schema: ["Product", "Book", "Organization", "BreadcrumbList"],
    openGraph: true,
    socialMetadata: true,
    productType,
  };
}

function buildSocialPlan({ title, objective, productType }) {
  return {
    assets: [
      { id: "social-square", size: "1080x1080", purpose: "Instagram and Facebook feed" },
      { id: "social-portrait", size: "1080x1350", purpose: "portrait feed presentation" },
      { id: "social-story", size: "1080x1920", purpose: "stories and vertical promotion" },
      { id: "store-thumbnail", size: "2048x2048", purpose: "storefront and library thumbnail" },
    ],
    copy: ["launch-caption", "short-caption", "benefit-led-caption", "email-announcement", "product-summary"],
    title,
    objective,
    productType,
  };
}

function buildPublicationPlan(input) {
  const requested = clean(input.publicationTarget || "draft", 40).toLowerCase();
  return {
    target: requested === "live" ? "live" : "draft",
    draftConfirmation: "CREATE SHOPIFY PRODUCT DRAFT",
    liveConfirmation: "PUBLISH PRODUCT LIVE",
    automaticLivePublication: false,
    approvalRequired: true,
    preconditions: ["quality-gate-passed", "customer-package-complete", "cover-approved", "pricing-approved", "metadata-approved"],
  };
}

function buildExecutionGraph({ sourceProfile, research, cover, publication }) {
  return [
    stage("intake", "Analyze source and classify product", true),
    stage("research", research.required ? "Retrieve and reconcile authoritative evidence" : "Preserve source-grounded evidence", true),
    stage("manuscript", sourceProfile.requiresExpansion ? "Rewrite and expand manuscript" : "Edit and structure manuscript", true),
    stage("master-docx", "Create authoritative Master Production DOCX", true),
    stage("cover", cover.approvedCoverAvailable ? "Normalize approved cover" : "Generate cover concept and request approval", true),
    stage("deliverables", "Generate customer and internal production artifacts", true),
    stage("storefront", "Generate product page, SEO, metadata, and social assets", true),
    stage("quality", "Run release gates and prohibited-content scans", true),
    stage("shopify-draft", "Create governed Shopify draft", publication.target === "draft"),
    stage("live-publication", "Publish only after explicit live approval", publication.target === "live"),
  ];
}

function buildReadiness({ env, sourceProfile, cover, research }) {
  const blockers = [];
  if (!env?.KAIROS_PROJECTS) blockers.push("durable-storage-unavailable");
  if (sourceProfile.requiresExpansion && !env?.AI) blockers.push("ai-writing-binding-unavailable");
  if (!cover.approvedCoverAvailable) blockers.push("cover-approval-required");
  if (research.required && !env?.AI) blockers.push("research-synthesis-binding-unavailable");
  return { readyToExecute: blockers.length === 0, blockers };
}

function stage(id, action, enabled) { return { id, action, enabled, status: enabled ? "pending" : "not-requested" }; }
function slug(value) { return String(value || "product").toLowerCase().normalize("NFKD").replace(/[™®©]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || "product"; }
function truncate(value, max) { const text = clean(value, max * 4); return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`; }
function countWords(value) { return (String(value || "").match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length; }
function clean(value, max = 1000) { return String(value == null ? "" : value).replace(/Michael\s+King/gi, PUBLISHER).replace(/\s+/g, " ").trim().slice(0, max); }
async function safeJSON(request) { try { return await request.json(); } catch { return {}; } }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Manufacturing-Orchestrator": KAIROS_MANUFACTURING_ORCHESTRATOR_BUILD } }); }
