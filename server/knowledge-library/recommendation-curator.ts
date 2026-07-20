import type {
  MMGDeliveryWindowCurator,
  MMGDeliveryWindowCandidate,
  MMGDeliveryWindowProposal,
} from "./delivery-window-service.js";
import type { MMGDeliveryWindowRuntimeState } from "./delivery-windows.js";
import {
  MMG_RECOMMENDATION_RANKING_VERSION,
  rankMMGRecommendationPackage,
} from "./recommendation-ranking.js";
import {
  loadMMGRecommendationContext,
  type MMGRecommendationRepository,
} from "./recommendation-repository.js";

export interface MMGKairosRecommendationCuratorDependencies {
  repository: MMGRecommendationRepository;
  now(): Date;
}

const runIdFor = (window: MMGDeliveryWindowRuntimeState): string =>
  `recommendation:${window.id}:${window.version}`;

export class MMGKairosRecommendationCurator
  implements MMGDeliveryWindowCurator
{
  readonly #dependencies: MMGKairosRecommendationCuratorDependencies;

  constructor(dependencies: MMGKairosRecommendationCuratorDependencies) {
    this.#dependencies = dependencies;
  }

  async curate(input: {
    window: MMGDeliveryWindowRuntimeState;
    candidates: MMGDeliveryWindowCandidate[];
  }): Promise<MMGDeliveryWindowProposal | null> {
    const occurredAt = this.#dependencies.now();
    const context = await loadMMGRecommendationContext({
      repository: this.#dependencies.repository,
      customerId: input.window.customerId,
      asOf: occurredAt,
    });

    const result = rankMMGRecommendationPackage({
      candidates: input.candidates,
      profile: context.profile,
      history: context.history,
      targetAssetCount: input.window.targetAssetCount,
      totalUnits: input.window.totalUnits,
    });

    await this.#dependencies.repository.recordRecommendationRun({
      runId: runIdFor(input.window),
      customerId: input.window.customerId,
      cycleId: input.window.cycleId,
      windowId: input.window.id,
      windowVersion: input.window.version,
      rankingVersion: MMG_RECOMMENDATION_RANKING_VERSION,
      profileVersion: context.profile?.profileVersion ?? null,
      candidateCount: input.candidates.length,
      source: "kairos_ranker",
      package: result.package,
      ranked: result.ranked,
      occurredAt,
    });

    if (!result.package) return null;
    return {
      assetIds: result.package.assetIds,
      source: "kairos",
      rationale: result.package.rationale,
    };
  }
}

export const buildMMGRecommendationPreview = async (input: {
  repository: MMGRecommendationRepository;
  customerId: string;
  candidates: MMGDeliveryWindowCandidate[];
  targetAssetCount: number;
  totalUnits: number;
  asOf: Date;
}) => {
  const context = await loadMMGRecommendationContext({
    repository: input.repository,
    customerId: input.customerId,
    asOf: input.asOf,
  });
  return rankMMGRecommendationPackage({
    candidates: input.candidates,
    profile: context.profile,
    history: context.history,
    targetAssetCount: input.targetAssetCount,
    totalUnits: input.totalUnits,
  });
};