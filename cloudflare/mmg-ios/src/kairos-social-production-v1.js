import {
  KAIROS_TIKTOK_CONTENT_FRAMEWORK_BUILD,
  SOCIAL_CARD_CAPABILITIES,
  TIKTOK_BRAND,
  TIKTOK_MODES,
  TIKTOK_PUBLISHING_CADENCE,
  buildTikTokCore,
  connectorContract,
  validateTikTokPackage,
} from "./kairos-tiktok-content-framework-v1.js";

const BUILD = "kairos-social-production-20260807-2-tiktok-framework";
const CACHE_SECONDS = 60 * 60 * 24 * 14;
const LEGACY_MODES = new Set(["cross-platform-caption", "social-asset-queue"]);
const MODES = new Set([...TIKTOK_MODES, ...LEGACY_MODES]);

export async function prepareSocialPackage(request, payload) {
  const mode = String(payload?.mode || "").trim();
  const objective = String(payload?.objective || "").trim();
  const audience = String(payload?.audience || "creators, entrepreneurs, authors, and small businesses").trim();
  const ctaMode = String(payload?.ctaMode || "follow").trim();
  const CTA = String(payload?.cta || "").trim();
  const sourceCard = String(payload?.sourceCard || "social-production").trim();
  const carouselCount = Number(payload?.carouselCount || 5);
  if (!MODES.has(mode)) throw new Error("Select a supported social production mode.");
  if (objective.length < 8) throw new Error("Describe the social content objective.");

  const packageID = `social-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const isTikTok = TIKTOK_MODES.includes(mode);
  const core = isTikTok
    ? buildTikTokCore({ mode, objective, audience, cta: CTA, ctaMode, carouselCount })
    : buildLegacyCore(mode, objective, audience, CTA || `Follow ${TIKTOK_BRAND.account} for practical creator systems.`);
  if (isTikTok) validateTikTokPackage(core);

  const socialPackage = {
    id: packageID,
    build: BUILD,
    frameworkBuild: isTikTok ? KAIROS_TIKTOK_CONTENT_FRAMEWORK_BUILD : "legacy-cross-platform-adapter",
    status: "awaiting-executive-approval",
    createdAt,
    platform: isTikTok ? "tiktok" : "multi-platform",
    account: isTikTok ? TIKTOK_BRAND.account : "",
    sourceCard,
    sourceCardCapability: SOCIAL_CARD_CAPABILITIES[sourceCard] || SOCIAL_CARD_CAPABILITIES["social-production"],
    mode,
    objective,
    audience,
    title: core.title,
    hook: core.hook,
    body: core.body,
    textPost: core.textPost || "",
    CTA: core.CTA || CTA,
    ctaMode: core.ctaMode || ctaMode,
    hashtags: core.hashtags,
    hashtagPyramid: core.hashtagPyramid || null,
    accessibilityText: core.accessibilityText,
    mediaRequirements: core.mediaRequirements,
    sequence: core.sequence,
    retentionRules: core.retentionRules || null,
    identityRules: core.identityRules || null,
    measurementPlan: core.measurementPlan || null,
    productionSlices: buildProductionSlices(core, isTikTok),
    platformVariants: core.platformVariants || [],
    scheduling: isTikTok ? TIKTOK_PUBLISHING_CADENCE : { connectorSchedulingEnabled: false },
    disclosure: {
      yourBrand: true,
      paidPartnership: false,
      brandPartner: false,
      approvalRequiredForChanges: true,
    },
    exportPackage: {
      manifest: `${packageID}-manifest.json`,
      captionFile: `${packageID}-caption.txt`,
      accessibilityFile: `${packageID}-accessibility.txt`,
      mediaChecklist: `${packageID}-media-checklist.txt`,
      connectorPayload: `${packageID}-connector-payload.json`,
    },
    publication: {
      connectorAvailable: false,
      externalPublishingPerformed: false,
      scheduleCreated: false,
      publicationStatus: "not-connected",
    },
    approval: {
      required: true,
      state: "pending",
      actions: ["approve", "fix", "deny"],
    },
    connectorReadyPayload: isTikTok
      ? connectorContract(core)
      : legacyConnectorPayload(mode, core, CTA),
    safeguards: {
      externalPublishingAutomatic: false,
      connectorClaimsForbidden: true,
      approvalBeforeHandoff: true,
      evidenceAndReceiptRequiredAfterFuturePublication: true,
      futureConnectorMustConsumeApprovedPackageWithoutRewriting: true,
    },
  };
  await persist(request, socialPackage);
  return socialPackage;
}

export async function decideSocialPackage(request, payload) {
  const packageID = String(payload?.packageID || "").trim();
  const decision = String(payload?.decision || "").trim().toLowerCase();
  const note = String(payload?.note || "").trim().slice(0, 2000);
  const actor = String(payload?.actor || "Executive").trim().slice(0, 120) || "Executive";
  if (!packageID) throw new Error("Select a social package.");
  if (!["approve", "fix", "deny"].includes(decision)) throw new Error("Use approve, fix, or deny.");
  if (decision === "fix" && !note) throw new Error("Fix requests require correction instructions.");
  const socialPackage = await readSocialPackage(request, packageID);
  if (!socialPackage) throw new Error("The social package could not be found.");
  const decidedAt = new Date().toISOString();
  const updated = {
    ...socialPackage,
    status: decision === "approve" ? "approved-for-connector-handoff" : decision === "fix" ? "needs-fix" : "denied",
    approval: {
      ...socialPackage.approval,
      state: decision === "approve" ? "approved" : decision === "fix" ? "needs-fix" : "denied",
      decision,
      note,
      actor,
      decidedAt,
    },
    publication: {
      ...socialPackage.publication,
      externalPublishingPerformed: false,
      publicationStatus: "not-connected",
    },
  };
  await persist(request, updated);
  return updated;
}

export async function readSocialPackage(request, packageID) {
  const response = await caches.default.match(packageRequest(request, packageID));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

export async function readLatestSocialPackage(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

function buildProductionSlices(core, isTikTok) {
  const slices = [
    { order: 1, id: "objective", name: "Objective", instruction: "Define the audience problem, useful outcome, and intended action before writing copy." },
    { order: 2, id: "format", name: "Format", instruction: isTikTok ? `Use the approved TikTok format: ${core.mode}.` : "Use the approved social format." },
    { order: 3, id: "hook", name: "Hook", instruction: isTikTok ? "Earn attention immediately. The first three seconds or first visual must lead with result, tension, proof, or curiosity." : "Lead with the strongest audience-relevant idea." },
    { order: 4, id: "copy", name: "Copy", instruction: "Create clean, copy-paste-ready public copy. Keep internal labels out of the published caption." },
    { order: 5, id: "hashtags", name: "Hashtag Pyramid", instruction: isTikTok ? "Use exactly five hashtags: 2 broad/reach + 2 niche/topic + 1 #MindsetMediaGroup brand hashtag." : "Use platform-appropriate tags only when required." },
    { order: 6, id: "media", name: "Media Brief", instruction: "Produce the approved single image, carousel sequence, native text post, or vertical video specification without changing approved messaging." },
    { order: 7, id: "qa", name: "QA & Approval", instruction: "Verify brand identity, accessibility, format constraints, CTA, disclosure, and package completeness before approval." },
    { order: 8, id: "connector", name: "Connector Handoff", instruction: "After approval, hand the immutable approved payload to the future platform connector. The connector publishes; it does not rewrite." },
  ];
  return slices;
}

function buildLegacyCore(mode, objective, audience, CTA) {
  const clean = sentence(objective);
  const title = clean.replace(/[.!?]+$/, "").split(/\s+/).slice(0, 8).join(" ");
  const hook = `Before you scroll: ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
  const body = `${clean} Built for ${audience}. ${CTA}`;
  const hashtags = ["#CreatorTips", "#ContentStrategy", "#CreatorEducation", "#SmallBusiness", "#MindsetMediaGroup"];
  const accessibilityText = `Social content about ${clean.toLowerCase()} for ${audience}. Key message: ${hook}`;
  if (mode === "cross-platform-caption") return { title, hook, body, CTA, hashtags, accessibilityText, mediaRequirements: [{ type: "existing-approved-media", count: 1, platformCroppingReviewRequired: true }], sequence: [], platformVariants: [{ platform: "TikTok", caption: body }, { platform: "Instagram", caption: body }, { platform: "Facebook", caption: `${body} ${CTA}` }, { platform: "LinkedIn", caption: `${hook}\n\n${body}` }] };
  return { title: "Social Asset Production Queue", hook, body, CTA, hashtags, accessibilityText, mediaRequirements: [{ type: "mixed", count: 1, productionBriefRequired: true }], sequence: [{ order: 1, role: "Intake", instruction: clean }, { order: 2, role: "Production", instruction: "Create the required approved media and copy assets." }, { order: 3, role: "Review", instruction: "Verify brand, accessibility, disclosure, and export readiness." }], platformVariants: [] };
}

function legacyConnectorPayload(mode, core, CTA) {
  return {
    schema: "kairos-social-connector-payload-v1",
    platform: "multi-platform",
    mode,
    title: core.title,
    caption: `${core.body}\n\n${core.hashtags.join(" ")}`,
    CTA,
    accessibilityText: core.accessibilityText,
    media: core.mediaRequirements,
    publish: false,
  };
}

function sentence(value) {
  const text = String(value).replace(/\s+/g, " ").trim();
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

async function persist(request, socialPackage) {
  const response = stored(socialPackage);
  await caches.default.put(packageRequest(request, socialPackage.id), response.clone());
  await caches.default.put(latestRequest(request), response);
}
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function packageRequest(request, packageID) { return new Request(new URL(`/_kairos/social-production/${encodeURIComponent(packageID)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/social-production/latest", request.url).toString(), { method: "GET" }); }
