import { describe, expect, it } from "vitest";
import type { MMGDeliveryWindowCandidate } from "../server/knowledge-library/delivery-window-service.js";
import {
  rankMMGRecommendationPackage,
  scoreMMGRecommendationCandidate,
  type MMGCustomerLearningProfile,
  type MMGRecommendationHistory,
} from "../server/knowledge-library/recommendation-ranking.js";

const profile: MMGCustomerLearningProfile = {
  customerId: "customer-1",
  roleCode: "creator",
  primaryGoal: "publish_book",
  secondaryGoals: ["grow_audience"],
  experienceLevel: "beginner",
  primaryTopics: ["ai_image_generation"],
  secondaryTopics: ["publishing", "content_strategy"],
  preferredFormats: ["guide", "workbook"],
  excludedTopics: ["crypto"],
  profileVersion: "1.0.0",
  status: "active",
};

const history: MMGRecommendationHistory = {
  recentDeliveredAssetIds: ["owned-intro"],
  recentDeliveredTopicCounts: { ai_image_generation: 1 },
  ownedSeriesProgress: { "AI Mastery Series": 1 },
  assetSignals: {},
};

const candidate = (
  overrides: Partial<MMGDeliveryWindowCandidate> & Pick<MMGDeliveryWindowCandidate, "assetId" | "title">,
): MMGDeliveryWindowCandidate => ({
  assetId: overrides.assetId,
  title: overrides.title,
  topic: "publishing",
  experienceLevel: "beginner",
  format: "guide",
  series: null,
  seriesOrder: null,
  subscriptionValue: 1,
  secondaryTopics: [],
  roleTags: ["creator"],
  goalTags: ["publish_book"],
  prerequisiteAssetIds: [],
  complementaryAssetIds: [],
  diversityGroup: "publishing",
  recommendationPriority: 0,
  estimatedMinutes: 60,
  ...overrides,
});

describe("MMG recommendation ranking", () => {
  it("rewards primary topics, goals, roles, format, and next-series progression", () => {
    const result = scoreMMGRecommendationCandidate({
      candidate: candidate({
        assetId: "ai-2",
        title: "AI Image Systems",
        topic: "ai_image_generation",
        series: "AI Mastery Series",
        seriesOrder: 2,
      }),
      profile,
      history,
    });

    expect(result.excluded).toBe(false);
    expect(result.components.primaryTopic).toBe(30);
    expect(result.components.goalFit).toBe(12);
    expect(result.components.roleFit).toBe(16);
    expect(result.components.formatFit).toBe(8);
    expect(result.components.seriesProgression).toBe(20);
    expect(result.reasonCodes).toContain("NEXT_SERIES_TITLE");
  });

  it("hard-excludes profile topics and disliked assets", () => {
    const crypto = scoreMMGRecommendationCandidate({
      candidate: candidate({ assetId: "crypto-1", title: "Crypto", topic: "crypto" }),
      profile,
      history,
    });
    expect(crypto.excluded).toBe(true);
    expect(crypto.exclusionCodes).toContain("PROFILE_EXCLUDED_TOPIC");

    const disliked = scoreMMGRecommendationCandidate({
      candidate: candidate({ assetId: "disliked-1", title: "Disliked" }),
      profile,
      history: {
        ...history,
        assetSignals: {
          "disliked-1": {
            assetId: "disliked-1",
            viewedCount: 0,
            deliveredCount: 0,
            completedCount: 0,
            swappedOutCount: 0,
            dismissedCount: 0,
            likedCount: 0,
            dislikedCount: 1,
          },
        },
      },
    });
    expect(disliked.excluded).toBe(true);
    expect(disliked.exclusionCodes).toContain("CUSTOMER_DISLIKED_ASSET");
  });

  it("selects an exact two-unit package and favors useful diversity", () => {
    const result = rankMMGRecommendationPackage({
      candidates: [
        candidate({
          assetId: "ai-2",
          title: "AI Image Systems",
          topic: "ai_image_generation",
          series: "AI Mastery Series",
          seriesOrder: 2,
          diversityGroup: "ai",
        }),
        candidate({
          assetId: "publishing-1",
          title: "Publish Ready",
          topic: "publishing",
          format: "workbook",
          diversityGroup: "publishing",
        }),
        candidate({
          assetId: "ai-duplicate",
          title: "More AI Images",
          topic: "ai_image_generation",
          diversityGroup: "ai",
          recommendationPriority: 1,
        }),
      ],
      profile,
      history,
      targetAssetCount: 2,
      totalUnits: 2,
    });

    expect(result.package).not.toBeNull();
    expect(result.package?.assetIds).toEqual(["ai-2", "publishing-1"]);
    expect(result.package?.totalUnits).toBe(2);
    expect(result.package?.reasonCodes).toContain("TOPIC_DIVERSITY");
    expect(result.package?.reasonCodes).toContain("PRIMARY_OBJECTIVE_COVERAGE");
  });

  it("returns no package when exact count and unit capacity cannot be satisfied", () => {
    const result = rankMMGRecommendationPackage({
      candidates: [
        candidate({ assetId: "expensive", title: "Expensive", subscriptionValue: 2 }),
      ],
      profile,
      history,
      targetAssetCount: 2,
      totalUnits: 2,
    });
    expect(result.package).toBeNull();
  });

  it("uses a deterministic asset-ID tie break", () => {
    const result = rankMMGRecommendationPackage({
      candidates: [
        candidate({ assetId: "b", title: "Same" }),
        candidate({ assetId: "a", title: "Same" }),
      ],
      profile: null,
      history: { recentDeliveredAssetIds: [], recentDeliveredTopicCounts: {}, ownedSeriesProgress: {}, assetSignals: {} },
      targetAssetCount: 1,
      totalUnits: 1,
    });
    expect(result.package?.assetIds).toEqual(["a"]);
  });
});