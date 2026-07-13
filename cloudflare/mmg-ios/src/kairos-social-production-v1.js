const BUILD = "kairos-social-production-20260713-1";
const CACHE_SECONDS = 60 * 60 * 24 * 14;
const MODES = new Set(["tiktok-single-image", "tiktok-carousel", "tiktok-video", "cross-platform-caption", "social-asset-queue"]);

export async function prepareSocialPackage(request, payload) {
  const mode = String(payload?.mode || "").trim();
  const objective = String(payload?.objective || "").trim();
  const audience = String(payload?.audience || "creators, entrepreneurs, authors, and small businesses").trim();
  const CTA = String(payload?.cta || "Follow for practical creator systems.").trim();
  if (!MODES.has(mode)) throw new Error("Select a supported social production mode.");
  if (objective.length < 8) throw new Error("Describe the social content objective.");

  const packageID = `social-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const core = buildCore(mode, objective, audience, CTA);
  const socialPackage = {
    id: packageID,
    build: BUILD,
    status: "awaiting-executive-approval",
    createdAt,
    mode,
    objective,
    audience,
    title: core.title,
    hook: core.hook,
    body: core.body,
    CTA,
    hashtags: core.hashtags,
    accessibilityText: core.accessibilityText,
    mediaRequirements: core.mediaRequirements,
    sequence: core.sequence,
    platformVariants: core.platformVariants,
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
    connectorReadyPayload: {
      platform: mode.startsWith("tiktok") ? "tiktok" : "multi-platform",
      mode,
      title: core.title,
      caption: `${core.body}\n\n${core.hashtags.join(" ")}`,
      CTA,
      accessibilityText: core.accessibilityText,
      disclosure: { yourBrand: true, paidPartnership: false, brandPartner: false },
      media: core.mediaRequirements,
      publish: false,
    },
    safeguards: {
      externalPublishingAutomatic: false,
      connectorClaimsForbidden: true,
      approvalBeforeHandoff: true,
      evidenceAndReceiptRequiredAfterFuturePublication: true,
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

function buildCore(mode, objective, audience, CTA) {
  const clean = sentence(objective);
  const title = titleFor(clean);
  const hook = hookFor(clean);
  const body = captionFor(clean, audience, CTA);
  const hashtags = hashtagsFor(mode);
  const accessibilityText = `Social content about ${clean.toLowerCase()} for ${audience}. Key message: ${hook}`;
  if (mode === "tiktok-single-image") return { title, hook, body, hashtags, accessibilityText, mediaRequirements: [{ type: "image", count: 1, aspectRatio: "9:16", minimumResolution: "1080x1920", textSafeAreaRequired: true }], sequence: [{ order: 1, role: "hero", instruction: "Use one high-clarity image with the title as the visual priority." }], platformVariants: [] };
  if (mode === "tiktok-carousel") return { title, hook, body, hashtags, accessibilityText, mediaRequirements: [{ type: "image", count: 5, aspectRatio: "9:16", minimumResolution: "1080x1920", sequenceRequired: true }], sequence: ["Hook", "Problem", "Insight", "Action", "CTA"].map((role, index) => ({ order: index + 1, role, instruction: `${role} slide supporting ${clean}` })), platformVariants: [] };
  if (mode === "tiktok-video") return { title, hook, body, hashtags, accessibilityText, mediaRequirements: [{ type: "video", count: 1, aspectRatio: "9:16", recommendedDuration: "20-35 seconds", captionsRequired: true, coverRequired: true }], sequence: [{ order: 1, role: "0-3s Hook", instruction: hook }, { order: 2, role: "3-10s Promise", instruction: `State the problem and outcome for ${clean}.` }, { order: 3, role: "10-20s Value", instruction: "Demonstrate the practical method or proof." }, { order: 4, role: "Final 3s CTA", instruction: CTA }], platformVariants: [] };
  if (mode === "cross-platform-caption") return { title, hook, body, hashtags, accessibilityText, mediaRequirements: [{ type: "existing-approved-media", count: 1, platformCroppingReviewRequired: true }], sequence: [], platformVariants: [{ platform: "TikTok", caption: body }, { platform: "Instagram", caption: body }, { platform: "Facebook", caption: `${body} ${CTA}` }, { platform: "LinkedIn", caption: `${hook}\n\n${body}` }] };
  return { title: "Social Asset Production Queue", hook, body, hashtags, accessibilityText, mediaRequirements: [{ type: "mixed", count: 1, productionBriefRequired: true }], sequence: [{ order: 1, role: "Intake", instruction: clean }, { order: 2, role: "Production", instruction: "Create the required approved media and copy assets." }, { order: 3, role: "Review", instruction: "Verify brand, accessibility, disclosure, and export readiness." }], platformVariants: [] };
}

function sentence(value) { const text = String(value).replace(/\s+/g, " ").trim(); return /[.!?]$/.test(text) ? text : `${text}.`; }
function titleFor(objective) { const base = objective.replace(/[.!?]+$/, "").split(/\s+/).slice(0, 8).join(" "); return `${base} 🚀`; }
function hookFor(objective) { return `Stop scrolling—${objective.charAt(0).toLowerCase()}${objective.slice(1)}`; }
function captionFor(objective, audience, CTA) { return `${objective} Built for ${audience}. ${CTA}`; }
function hashtagsFor(mode) { const niche = mode.includes("video") ? "#creatorvideo" : mode.includes("carousel") ? "#contentcarousel" : mode.includes("single") ? "#creatorgraphics" : "#contentstrategy"; return [niche, "#creatortips", "#contentcreation", "#smallbusiness", "#mindsetmediagroup"]; }

async function persist(request, socialPackage) {
  const response = stored(socialPackage);
  await caches.default.put(packageRequest(request, socialPackage.id), response.clone());
  await caches.default.put(latestRequest(request), response);
}
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function packageRequest(request, packageID) { return new Request(new URL(`/_kairos/social-production/${encodeURIComponent(packageID)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/social-production/latest", request.url).toString(), { method: "GET" }); }
