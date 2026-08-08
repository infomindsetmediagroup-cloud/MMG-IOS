export const KAIROS_TIKTOK_CONTENT_FRAMEWORK_BUILD = "kairos-tiktok-content-framework-20260807-1";

export const TIKTOK_BRAND = Object.freeze({
  account: "@mindset.media.group",
  brandName: "Mindset Media Group",
  brandHashtag: "#MindsetMediaGroup",
  publicAbbreviationForbidden: true,
  positioning: "creator education ecosystem for AI, TikTok growth, creator business, content systems, publishing, and practical digital-product execution",
  voice: "premium, simple, human, outcome-first, practical, confident",
});

export const TIKTOK_PUBLISHING_CADENCE = Object.freeze({
  timezone: "America/Los_Angeles",
  defaultSlots: Object.freeze(["06:00", "12:00", "20:00"]),
  connectorSchedulingEnabled: false,
});

export const TIKTOK_MODES = Object.freeze([
  "tiktok-text",
  "tiktok-single-image",
  "tiktok-carousel",
  "tiktok-video",
]);

export const SOCIAL_CARD_CAPABILITIES = Object.freeze({
  "social-production": Object.freeze({
    center: "content",
    role: "primary-production",
    instruction: "Create complete TikTok-ready content packages using the canonical framework. This is the permanent home for TikTok copy, media instructions, hashtags, approval, and future connector handoff.",
  }),
  "creative-studio": Object.freeze({
    center: "content",
    role: "media-production",
    instruction: "Use the TikTok package media brief to create or refine the single-image, carousel, cover, or video asset. Do not change approved copy or hashtags without returning the package for revision.",
  }),
  "product-launch": Object.freeze({
    center: "business",
    role: "launch-source",
    instruction: "Convert an approved product launch into a TikTok content objective, then hand the objective to Social Production. Product publishing and TikTok publishing remain separate approvals.",
  }),
  "campaign-operations": Object.freeze({
    center: "business",
    role: "campaign-orchestration",
    instruction: "Coordinate TikTok packages as campaign assets, including objective, sequence, timing slot, CTA intent, and measurement plan. External posting remains connector-gated.",
  }),
  "growth-plan": Object.freeze({
    center: "business",
    role: "measurement-strategy",
    instruction: "Use TikTok retention, shares, saves, profile actions, and conversion signals to define growth experiments. Do not optimize to likes alone.",
  }),
});

export function buildTikTokCore(input = {}) {
  const mode = normalizeMode(input.mode);
  const objective = sentence(input.objective);
  const audience = clean(input.audience) || "creators, entrepreneurs, authors, and small businesses";
  const ctaMode = normalizeCtaMode(input.ctaMode);
  const CTA = clean(input.cta) || defaultCTA(ctaMode);
  const title = titleFor(objective);
  const hook = hookFor(objective);
  const body = captionFor(objective, audience, CTA);
  const hashtagPyramid = hashtagsFor(objective, mode);
  const hashtags = [...hashtagPyramid.broad, ...hashtagPyramid.niche, hashtagPyramid.brand];
  const accessibilityText = `TikTok content from ${TIKTOK_BRAND.account} about ${objective.toLowerCase()} for ${audience}. Key message: ${hook}`;
  const common = {
    mode,
    title,
    hook,
    body,
    CTA,
    ctaMode,
    hashtags,
    hashtagPyramid,
    accessibilityText,
    retentionRules: retentionRules(),
    identityRules: identityRules(),
    measurementPlan: measurementPlan(),
  };

  if (mode === "tiktok-text") {
    const textPost = fitTextPost(`${hook} ${objective} ${CTA}`);
    return {
      ...common,
      textPost,
      mediaRequirements: [{ type: "native-text-post", count: 1, characterLimit: 250, automaticVisualAndAudioExpected: true }],
      sequence: [{ order: 1, role: "native-text", instruction: "Use the textPost field exactly as the TikTok native text-post creative prompt. Keep it at or below 250 characters." }],
    };
  }

  if (mode === "tiktok-single-image") {
    return {
      ...common,
      mediaRequirements: [{ type: "image", count: 1, aspectRatio: "9:16", minimumResolution: "1080x1920", textSafeAreaRequired: true, visualPriority: "one clear hook, one focal image, minimal supporting copy" }],
      sequence: [{ order: 1, role: "hero", instruction: `Create one vertical image. Lead with: ${title}. Preserve generous negative space and immediate mobile readability.` }],
    };
  }

  if (mode === "tiktok-carousel") {
    const count = clampCarouselCount(input.carouselCount);
    return {
      ...common,
      mediaRequirements: [{ type: "image", count, aspectRatio: "9:16", minimumResolution: "1080x1920", sequenceRequired: true, continuityRequired: true }],
      sequence: carouselSequence(count, objective, hook, CTA),
    };
  }

  return {
    ...common,
    mediaRequirements: [{ type: "video", count: 1, aspectRatio: "9:16", recommendedDuration: "20-35 seconds", captionsRequired: true, coverRequired: true, patternInterruptCadence: "every 3-5 seconds" }],
    sequence: [
      { order: 1, role: "0-3s Hook", instruction: hook },
      { order: 2, role: "3-8s Promise", instruction: `State the specific result or tension behind ${objective}` },
      { order: 3, role: "8-20s Value", instruction: "Deliver the practical method, demonstration, or proof. Keep cuts tight and captions readable." },
      { order: 4, role: "20-30s Reinforcement", instruction: "Restate the useful takeaway with a visual or verbal pattern interrupt." },
      { order: 5, role: "Final CTA", instruction: CTA },
    ],
  };
}

export function connectorContract(core) {
  return Object.freeze({
    schema: "kairos-social-connector-payload-v1",
    platform: "tiktok",
    account: TIKTOK_BRAND.account,
    mode: core.mode,
    title: core.title,
    textPost: core.textPost || "",
    caption: `${core.body}\n\n${core.hashtags.join(" ")}`,
    hook: core.hook,
    CTA: core.CTA,
    hashtags: core.hashtags,
    hashtagPyramid: core.hashtagPyramid,
    accessibilityText: core.accessibilityText,
    media: core.mediaRequirements,
    sequence: core.sequence,
    measurementPlan: core.measurementPlan,
    scheduling: TIKTOK_PUBLISHING_CADENCE,
    publish: false,
  });
}

export function validateTikTokPackage(core) {
  if (!TIKTOK_MODES.includes(core?.mode)) throw new Error("Select a supported TikTok production mode.");
  if (!Array.isArray(core?.hashtags) || core.hashtags.length !== 5) throw new Error("TikTok packages must contain exactly five hashtags.");
  if (core?.hashtagPyramid?.broad?.length !== 2 || core?.hashtagPyramid?.niche?.length !== 2 || core?.hashtagPyramid?.brand !== TIKTOK_BRAND.brandHashtag) {
    throw new Error("TikTok hashtags must follow the 2 broad + 2 niche + 1 brand pyramid.");
  }
  if (core.mode === "tiktok-text" && String(core.textPost || "").length > 250) throw new Error("TikTok native text posts must stay at or below 250 characters.");
  if (String(core?.body || "").includes(" MMG ") || String(core?.body || "").startsWith("MMG ")) throw new Error("TikTok-facing copy must not abbreviate Mindset Media Group as MMG.");
  return true;
}

function retentionRules() {
  return Object.freeze({
    firstThreeSeconds: "Lead with the result, tension, surprising fact, or useful promise before context.",
    proofEarly: "Show proof, example, demonstration, or specificity as early as the format permits.",
    patternInterrupts: "For video, change visual, framing, caption treatment, object, cut, or emphasis every 3-5 seconds when useful.",
    captions: "Video captions are required and must be readable without audio.",
    optimizationPriority: Object.freeze(["retention", "shares", "saves", "profile-actions", "qualified-comments", "likes"]),
  });
}

function identityRules() {
  return Object.freeze({
    account: TIKTOK_BRAND.account,
    useFullHandle: true,
    publicMMGAbbreviationForbidden: true,
    copyPasteReady: true,
    noHashtagLabelInPublishedCaption: true,
    noTitleLabelInPublishedCaption: true,
  });
}

function measurementPlan() {
  return Object.freeze({
    primary: Object.freeze(["average-watch-time", "completion-rate", "shares", "saves"]),
    secondary: Object.freeze(["profile-views", "follows", "link-in-bio-actions", "qualified-comments"]),
    learningLoop: "Post. Learn. Improve.",
    audit: "Use the TAKO review loop after sufficient post-publication evidence exists; compare observed positioning with intended creator-education positioning and feed gaps into the next package.",
  });
}

function hashtagsFor(objective, mode) {
  const text = objective.toLowerCase();
  const broad = ["#TikTokTips", "#CreatorTips"];
  let niche = ["#ContentStrategy", "#CreatorEducation"];
  if (/hook|retention|watch|scroll|viewer/.test(text)) niche = ["#AudienceRetention", "#ContentStrategy"];
  else if (/moneti|income|revenue|business|offer/.test(text)) niche = ["#CreatorMonetization", "#CreatorBusiness"];
  else if (/\bai\b|artificial intelligence|prompt|automation/.test(text)) niche = ["#AITools", "#CreatorAI"];
  else if (/publish|book|author|kdp/.test(text)) niche = ["#CreatorPublishing", "#AuthorTips"];
  else if (mode === "tiktok-video") niche = ["#VideoStrategy", "#AudienceRetention"];
  else if (mode === "tiktok-carousel") niche = ["#ContentStrategy", "#CarouselTips"];
  return Object.freeze({ broad: Object.freeze(broad), niche: Object.freeze(niche), brand: TIKTOK_BRAND.brandHashtag, structure: "2 broad + 2 niche + 1 brand" });
}

function carouselSequence(count, objective, hook, CTA) {
  const sequence = [];
  for (let i = 0; i < count; i += 1) {
    if (i === 0) sequence.push({ order: 1, role: "Hook", instruction: hook });
    else if (i === count - 1) sequence.push({ order: count, role: "CTA", instruction: CTA });
    else if (i === 1) sequence.push({ order: 2, role: "Problem", instruction: `Define the audience problem or misconception behind ${objective}` });
    else if (i === count - 2) sequence.push({ order: i + 1, role: "Action", instruction: "Give the reader one concrete action to take now." });
    else sequence.push({ order: i + 1, role: "Value", instruction: `Deliver one distinct proof point, step, or insight supporting ${objective}` });
  }
  return sequence;
}

function titleFor(objective) {
  const words = objective.replace(/[.!?]+$/, "").split(/\s+/).filter(Boolean).slice(0, 9).join(" ");
  return words.length <= 72 ? words : `${words.slice(0, 69)}…`;
}

function hookFor(objective) {
  const base = objective.replace(/[.!?]+$/, "");
  return `Before you scroll: ${base.charAt(0).toLowerCase()}${base.slice(1)}.`;
}

function captionFor(objective, audience, CTA) {
  return `${objective} Built for ${audience}. ${CTA}`.replace(/\s+/g, " ").trim();
}

function defaultCTA(mode) {
  if (mode === "link-in-bio") return `Tap the link in bio to learn more from ${TIKTOK_BRAND.account}.`;
  if (mode === "save") return "Save this and test it on your next post.";
  if (mode === "comment") return "Comment with the part you want broken down next.";
  return `Follow ${TIKTOK_BRAND.account} for practical creator tools, systems, and strategy.`;
}

function fitTextPost(value) {
  const text = clean(value);
  if (text.length <= 250) return text;
  return `${text.slice(0, 247).trimEnd()}…`;
}

function normalizeMode(value) {
  const mode = clean(value) || "tiktok-single-image";
  if (!TIKTOK_MODES.includes(mode)) throw new Error("Select text, single-image, carousel, or video TikTok production.");
  return mode;
}

function normalizeCtaMode(value) {
  const mode = clean(value).toLowerCase();
  return ["follow", "save", "comment", "link-in-bio"].includes(mode) ? mode : "follow";
}

function clampCarouselCount(value) {
  const count = Number(value || 5);
  if (!Number.isFinite(count)) return 5;
  return Math.max(3, Math.min(10, Math.round(count)));
}

function sentence(value) {
  const text = clean(value);
  if (text.length < 8) throw new Error("Describe the TikTok content objective in enough detail to produce the package.");
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
