import test from "node:test";
import assert from "node:assert/strict";
import {
  KAIROS_TIKTOK_CONTENT_FRAMEWORK_BUILD,
  SOCIAL_CARD_CAPABILITIES,
  TIKTOK_BRAND,
  TIKTOK_MODES,
  TIKTOK_PUBLISHING_CADENCE,
  buildTikTokCore,
  connectorContract,
  validateTikTokPackage,
} from "../src/kairos-tiktok-content-framework-v1.js";

test("TikTok framework exposes the four canonical production formats", () => {
  assert.equal(KAIROS_TIKTOK_CONTENT_FRAMEWORK_BUILD, "kairos-tiktok-content-framework-20260807-1");
  assert.deepEqual(TIKTOK_MODES, ["tiktok-text", "tiktok-single-image", "tiktok-carousel", "tiktok-video"]);
  assert.equal(TIKTOK_BRAND.account, "@mindset.media.group");
  assert.equal(TIKTOK_BRAND.publicAbbreviationForbidden, true);
});

test("native TikTok text posts stay within 250 characters", () => {
  const core = buildTikTokCore({
    mode: "tiktok-text",
    objective: "Explain why the first three seconds determine whether viewers stay long enough to receive the useful part of a creator video and give them one practical change they can test immediately on their next post",
    ctaMode: "follow",
  });
  assert.equal(core.mode, "tiktok-text");
  assert.ok(core.textPost.length <= 250, `Expected <=250 characters, received ${core.textPost.length}`);
  assert.equal(core.mediaRequirements[0].type, "native-text-post");
  assert.equal(core.mediaRequirements[0].automaticVisualAndAudioExpected, true);
  assert.equal(validateTikTokPackage(core), true);
});

test("every TikTok package uses the exact 2+2+1 hashtag pyramid", () => {
  for (const mode of TIKTOK_MODES) {
    const core = buildTikTokCore({ mode, objective: "Teach creators how to improve hook retention without relying on misleading engagement tricks" });
    assert.equal(core.hashtags.length, 5);
    assert.equal(core.hashtagPyramid.broad.length, 2);
    assert.equal(core.hashtagPyramid.niche.length, 2);
    assert.equal(core.hashtagPyramid.brand, "#MindsetMediaGroup");
    assert.deepEqual(core.hashtags, [...core.hashtagPyramid.broad, ...core.hashtagPyramid.niche, core.hashtagPyramid.brand]);
    assert.equal(validateTikTokPackage(core), true);
  }
});

test("single image, carousel, and video media contracts remain distinct", () => {
  const image = buildTikTokCore({ mode: "tiktok-single-image", objective: "Show creators one practical audience retention principle they can apply today" });
  assert.equal(image.mediaRequirements[0].type, "image");
  assert.equal(image.mediaRequirements[0].count, 1);
  assert.equal(image.mediaRequirements[0].aspectRatio, "9:16");

  const carousel = buildTikTokCore({ mode: "tiktok-carousel", objective: "Break a strong creator hook into a repeatable five-card teaching sequence", carouselCount: 5 });
  assert.equal(carousel.mediaRequirements[0].type, "image");
  assert.equal(carousel.mediaRequirements[0].count, 5);
  assert.equal(carousel.sequence.length, 5);
  assert.equal(carousel.sequence[0].role, "Hook");
  assert.equal(carousel.sequence.at(-1).role, "CTA");

  const video = buildTikTokCore({ mode: "tiktok-video", objective: "Teach a practical video retention workflow using proof, captions, and fast pattern interrupts" });
  assert.equal(video.mediaRequirements[0].type, "video");
  assert.equal(video.mediaRequirements[0].captionsRequired, true);
  assert.equal(video.mediaRequirements[0].patternInterruptCadence, "every 3-5 seconds");
  assert.equal(video.sequence[0].role, "0-3s Hook");
});

test("TikTok strategy optimizes retention and qualified actions before likes", () => {
  const core = buildTikTokCore({ mode: "tiktok-video", objective: "Explain how creators should measure whether a post actually held attention" });
  assert.deepEqual(core.retentionRules.optimizationPriority.slice(0, 3), ["retention", "shares", "saves"]);
  assert.equal(core.measurementPlan.learningLoop, "Post. Learn. Improve.");
  assert.match(core.measurementPlan.audit, /TAKO/);
});

test("applicable Kairos cards route into one canonical TikTok production framework", () => {
  assert.equal(SOCIAL_CARD_CAPABILITIES["social-production"].center, "content");
  assert.equal(SOCIAL_CARD_CAPABILITIES["social-production"].role, "primary-production");
  assert.equal(SOCIAL_CARD_CAPABILITIES["creative-studio"].role, "media-production");
  assert.equal(SOCIAL_CARD_CAPABILITIES["product-launch"].role, "launch-source");
  assert.equal(SOCIAL_CARD_CAPABILITIES["campaign-operations"].role, "campaign-orchestration");
  assert.equal(SOCIAL_CARD_CAPABILITIES["growth-plan"].role, "measurement-strategy");
});

test("future connector payload is immutable handoff data and never publishes by itself", () => {
  const core = buildTikTokCore({ mode: "tiktok-single-image", objective: "Give creators a clear one-image reminder to fix the first three seconds of their next post", ctaMode: "link-in-bio" });
  const payload = connectorContract(core);
  assert.equal(payload.schema, "kairos-social-connector-payload-v1");
  assert.equal(payload.platform, "tiktok");
  assert.equal(payload.account, "@mindset.media.group");
  assert.equal(payload.publish, false);
  assert.equal(payload.scheduling.connectorSchedulingEnabled, false);
  assert.deepEqual(TIKTOK_PUBLISHING_CADENCE.defaultSlots, ["06:00", "12:00", "20:00"]);
  assert.equal(TIKTOK_PUBLISHING_CADENCE.timezone, "America/Los_Angeles");
});
