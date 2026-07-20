import { describe, expect, it, vi } from "vitest";
import { MMGKairosRecommendationCurator } from "../server/knowledge-library/recommendation-curator.js";
import type { MMGRecommendationCandidateRepository } from "../server/knowledge-library/recommendation-candidate-repository.js";
import type { MMGRecommendationRepository } from "../server/knowledge-library/recommendation-repository.js";
import type { MMGDeliveryWindowCandidate } from "../server/knowledge-library/delivery-window-service.js";
import type { MMGDeliveryWindowRuntimeState } from "../server/knowledge-library/delivery-windows.js";

const window: MMGDeliveryWindowRuntimeState = {
  id: "window-123",
  customerId: "customer-1",
  cycleId: "cycle-1",
  packageSequence: 2,
  type: "scheduled_package_review",
  status: "scheduled",
  totalUnits: 2,
  targetAssetCount: 2,
  selectedUnits: 0,
  selectedAssetCount: 0,
  version: 3,
  opensAt: "2026-07-20T22:00:00.000Z",
  closesAt: "2026-07-22T22:00:00.000Z",
  fallbackPolicy: "auto_confirm_current_selection",
  deliveryDispatchId: null,
};

const candidates: MMGDeliveryWindowCandidate[] = [
  {
    assetId: "asset-ai",
    title: "AI Images",
    topic: "ai_image_generation",
    experienceLevel: "beginner",
    format: "guide",
    series: null,
    seriesOrder: null,
    subscriptionValue: 1,
  },
  {
    assetId: "asset-publishing",
    title: "Publishing",
    topic: "publishing",
    experienceLevel: "beginner",
    format: "workbook",
    series: null,
    seriesOrder: null,
    subscriptionValue: 1,
  },
];

const build = () => {
  const repository: MMGRecommendationRepository = {
    loadLearningProfile: vi.fn().mockResolvedValue({
      customerId: "customer-1",
      roleCode: "creator",
      primaryGoal: "publish_book",
      secondaryGoals: [],
      experienceLevel: "beginner",
      primaryTopics: ["ai_image_generation"],
      secondaryTopics: ["publishing"],
      preferredFormats: ["guide", "workbook"],
      excludedTopics: [],
      profileVersion: "1.0.0",
      status: "active",
    }),
    loadRecommendationHistory: vi.fn().mockResolvedValue({
      recentDeliveredAssetIds: [],
      recentDeliveredTopicCounts: {},
      ownedSeriesProgress: {},
      assetSignals: {},
    }),
    recordRecommendationRun: vi.fn().mockResolvedValue("recorded"),
  };
  const candidateRepository: MMGRecommendationCandidateRepository = {
    enrichCandidates: vi.fn().mockImplementation(
      async (values: MMGDeliveryWindowCandidate[]) =>
        values.map((value) => ({
          ...value,
          roleTags: ["creator"],
          goalTags: ["publish_book"],
          secondaryTopics: [],
          prerequisiteAssetIds: [],
          complementaryAssetIds: [],
          diversityGroup: value.topic,
          recommendationPriority: 0,
        })),
    ),
  };
  return {
    repository,
    candidateRepository,
    curator: new MMGKairosRecommendationCurator({
      repository,
      candidateRepository,
      now: () => new Date("2026-07-20T22:00:00.000Z"),
    }),
  };
};

describe("MMG Kairos recommendation curator", () => {
  it("returns an exact explainable package for a future window", async () => {
    const { curator, repository, candidateRepository } = build();
    const proposal = await curator.curate({ window, candidates });

    expect(proposal?.source).toBe("kairos");
    expect(proposal?.assetIds).toEqual(["asset-ai", "asset-publishing"]);
    expect(proposal?.rationale).toContain("Kairos selected");
    expect(candidateRepository.enrichCandidates).toHaveBeenCalledWith(candidates);
    expect(repository.recordRecommendationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "recommendation:window-123:3",
        windowId: "window-123",
        windowVersion: 3,
        candidateCount: 2,
        source: "kairos_ranker",
      }),
    );
  });

  it("records and returns null when no exact package is possible", async () => {
    const { curator, repository } = build();
    const proposal = await curator.curate({
      window,
      candidates: [{ ...candidates[0], subscriptionValue: 2 }],
    });

    expect(proposal).toBeNull();
    expect(repository.recordRecommendationRun).toHaveBeenCalledWith(
      expect.objectContaining({ package: null }),
    );
  });
});