import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTikTokAuthorizeURL,
  buildTikTokPublishRequest,
  connectorConfiguration,
  validateHandoff,
} from "../src/kairos-tiktok-connector-v1.js";

const mediaOrigin = "https://media.themindsetmediagroup.com";
const config = Object.freeze({
  enabled: true,
  clientKey: "test-client-key",
  clientSecret: "test-client-secret",
  redirectUri: "https://example.com/api/social-connectors/tiktok/callback",
  scopes: ["user.info.basic", "video.list", "video.upload", "video.publish"],
  mediaOrigins: [mediaOrigin],
  expectedUsername: "mindset.media.group",
  directPostAudited: true,
  vaultBound: true,
});
const creator = Object.freeze({
  creator_username: "mindset.media.group",
  creator_nickname: "Mindset Media Group",
  privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
  comment_disabled: false,
  duet_disabled: false,
  stitch_disabled: false,
  max_video_post_duration_sec: 600,
});

function socialPackage(mode, count = 1) {
  return {
    id: `social-${mode}`,
    platform: "tiktok",
    status: "approved-for-connector-handoff",
    approval: { state: "approved" },
    mode,
    title: "Creator systems that improve retention",
    body: "Creator systems that improve retention. Built for creators.",
    connectorReadyPayload: {
      schema: "kairos-social-connector-payload-v1",
      caption: "Creator systems that improve retention.\n\n#TikTokTips #CreatorTips #AudienceRetention #ContentStrategy #MindsetMediaGroup",
      publish: false,
    },
    mediaRequirements: [{ count }],
  };
}

function handoff(overrides = {}) {
  return {
    handoffMode: "upload",
    mediaUrls: [`${mediaOrigin}/tiktok/asset.mp4`],
    privacyLevel: "SELF_ONLY",
    disableComment: false,
    disableDuet: false,
    disableStitch: false,
    autoAddMusic: false,
    isAigc: false,
    brandOrganic: true,
    photoCoverIndex: 0,
    explicitConsent: true,
    mediaGuidelinesConfirmed: true,
    ...overrides,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code, `Expected ${code}`);
}

test("connector configuration is disabled from publication until credentials and media origins are provisioned", () => {
  const value = connectorConfiguration({
    KAIROS_TIKTOK_CONNECTOR_ENABLED: "true",
    KAIROS_TIKTOK_REDIRECT_URI: "https://example.com/callback",
    KAIROS_TIKTOK_EXPECTED_USERNAME: "@mindset.media.group",
    KAIROS_TIKTOK_DIRECT_POST_AUDITED: "false",
    KAIROS_TIKTOK_VERIFIED_MEDIA_ORIGINS: "",
  });
  assert.equal(value.enabled, true);
  assert.equal(value.clientKey, "");
  assert.equal(value.clientSecret, "");
  assert.equal(value.expectedUsername, "mindset.media.group");
  assert.equal(value.directPostAudited, false);
  assert.deepEqual(value.mediaOrigins, []);
});

test("OAuth authorization uses TikTok v2 with state and the governed scopes", () => {
  const url = new URL(buildTikTokAuthorizeURL(config, "csrf-state-123"));
  assert.equal(url.origin + url.pathname, "https://www.tiktok.com/v2/auth/authorize/");
  assert.equal(url.searchParams.get("client_key"), config.clientKey);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
  assert.equal(url.searchParams.get("state"), "csrf-state-123");
  assert.equal(url.searchParams.get("disable_auto_auth"), "1");
  for (const scope of config.scopes) assert.ok(url.searchParams.get("scope").split(",").includes(scope));
});

test("connector refuses unapproved or rewritten packages", () => {
  const unapproved = socialPackage("tiktok-video");
  unapproved.approval.state = "pending";
  expectCode(() => validateHandoff(unapproved, handoff(), creator, config), "TIKTOK_PACKAGE_APPROVAL_REQUIRED");
  const rewritten = socialPackage("tiktok-video");
  rewritten.connectorReadyPayload.publish = true;
  expectCode(() => validateHandoff(rewritten, handoff(), creator, config), "TIKTOK_PACKAGE_CONNECTOR_GUARD_INVALID");
});

test("native TikTok text packages remain an explicit manual handoff", () => {
  expectCode(() => validateHandoff(socialPackage("tiktok-text"), handoff(), creator, config), "TIKTOK_TEXT_POST_API_UNAVAILABLE");
  expectCode(() => buildTikTokPublishRequest(socialPackage("tiktok-text"), handoff(), creator, config), "TIKTOK_TEXT_POST_API_UNAVAILABLE");
});

test("connector requires immediate export consent and content-sharing confirmation", () => {
  expectCode(() => validateHandoff(socialPackage("tiktok-video"), handoff({ explicitConsent: false }), creator, config), "TIKTOK_EXPORT_CONSENT_REQUIRED");
  expectCode(() => validateHandoff(socialPackage("tiktok-video"), handoff({ mediaGuidelinesConfirmed: false }), creator, config), "TIKTOK_MEDIA_GUIDELINES_CONFIRMATION_REQUIRED");
});

test("connector hard-blocks the wrong TikTok account", () => {
  expectCode(() => validateHandoff(socialPackage("tiktok-video"), handoff(), { ...creator, creator_username: "other.account" }, config), "TIKTOK_ACCOUNT_MISMATCH");
});

test("connector permits only configured TikTok-verified media origins", () => {
  expectCode(() => validateHandoff(socialPackage("tiktok-video"), handoff({ mediaUrls: ["https://unverified.example/video.mp4"] }), creator, config), "TIKTOK_MEDIA_ORIGIN_NOT_VERIFIED");
  expectCode(() => validateHandoff(socialPackage("tiktok-video"), handoff({ mediaUrls: [] }), creator, config), "TIKTOK_MEDIA_COUNT_MISMATCH");
});

test("Direct Post remains blocked until TikTok client audit is marked complete", () => {
  const unaudited = { ...config, directPostAudited: false };
  expectCode(() => validateHandoff(socialPackage("tiktok-video"), handoff({ handoffMode: "direct" }), creator, unaudited), "TIKTOK_DIRECT_POST_AUDIT_REQUIRED");
});

test("single-image Direct Post uses the current photo content-init contract", () => {
  const pkg = socialPackage("tiktok-single-image");
  const plan = buildTikTokPublishRequest(pkg, handoff({
    handoffMode: "direct",
    mediaUrls: [`${mediaOrigin}/tiktok/image-1.jpg`],
    privacyLevel: "SELF_ONLY",
  }), creator, config);
  assert.equal(plan.endpoint, "https://open.tiktokapis.com/v2/post/publish/content/init/");
  assert.equal(plan.body.media_type, "PHOTO");
  assert.equal(plan.body.post_mode, "DIRECT_POST");
  assert.equal(plan.body.source_info.source, "PULL_FROM_URL");
  assert.deepEqual(plan.body.source_info.photo_images, [`${mediaOrigin}/tiktok/image-1.jpg`]);
  assert.equal(plan.body.post_info.privacy_level, "SELF_ONLY");
  assert.equal(plan.body.post_info.brand_organic_toggle, true);
  assert.equal(plan.captionForwarded, true);
});

test("carousel upload uses MEDIA_UPLOAD without rewriting the approved package", () => {
  const pkg = socialPackage("tiktok-carousel", 3);
  const urls = [1, 2, 3].map((n) => `${mediaOrigin}/tiktok/card-${n}.jpg`);
  const plan = buildTikTokPublishRequest(pkg, handoff({ handoffMode: "upload", mediaUrls: urls }), creator, config);
  assert.equal(plan.endpoint, "https://open.tiktokapis.com/v2/post/publish/content/init/");
  assert.equal(plan.body.post_mode, "MEDIA_UPLOAD");
  assert.deepEqual(plan.body.source_info.photo_images, urls);
  assert.equal(plan.captionForwarded, true);
});

test("video Direct Post uses PULL_FROM_URL, creator privacy and AI disclosure", () => {
  const pkg = socialPackage("tiktok-video");
  const plan = buildTikTokPublishRequest(pkg, handoff({
    handoffMode: "direct",
    mediaUrls: [`${mediaOrigin}/tiktok/video.mp4`],
    privacyLevel: "SELF_ONLY",
    isAigc: true,
    disableComment: true,
  }), creator, config);
  assert.equal(plan.endpoint, "https://open.tiktokapis.com/v2/post/publish/video/init/");
  assert.equal(plan.body.source_info.source, "PULL_FROM_URL");
  assert.equal(plan.body.source_info.video_url, `${mediaOrigin}/tiktok/video.mp4`);
  assert.equal(plan.body.post_info.privacy_level, "SELF_ONLY");
  assert.equal(plan.body.post_info.is_aigc, true);
  assert.equal(plan.body.post_info.disable_comment, true);
  assert.equal(plan.captionForwarded, true);
});

test("video upload sends media to TikTok inbox and records manual caption transfer", () => {
  const pkg = socialPackage("tiktok-video");
  const plan = buildTikTokPublishRequest(pkg, handoff({ handoffMode: "upload" }), creator, config);
  assert.equal(plan.endpoint, "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/");
  assert.deepEqual(plan.body, {
    source_info: {
      source: "PULL_FROM_URL",
      video_url: `${mediaOrigin}/tiktok/asset.mp4`,
    },
  });
  assert.equal(plan.captionForwarded, false);
});
