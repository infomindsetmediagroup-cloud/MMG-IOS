import type { MMGDeliveryWindowCandidate } from "./delivery-window-service.js";
import type { MMGSQLExecutor } from "./persistence.js";

export interface MMGRecommendationCandidateRepository {
  enrichCandidates(
    candidates: MMGDeliveryWindowCandidate[],
  ): Promise<MMGDeliveryWindowCandidate[]>;
}

interface CandidateMetadataRow extends Record<string, unknown> {
  asset_id: string;
  secondary_topics: string[] | null;
  role_tags: string[] | null;
  goal_tags: string[] | null;
  prerequisite_asset_ids: string[] | null;
  complementary_asset_ids: string[] | null;
  diversity_group: string | null;
  recommendation_priority: number | string;
  estimated_minutes: number | string | null;
}

const integer = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
};

const array = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];

export class MMGPostgresRecommendationCandidateRepository
  implements MMGRecommendationCandidateRepository
{
  readonly #database: MMGSQLExecutor;

  constructor(database: MMGSQLExecutor) {
    this.#database = database;
  }

  async enrichCandidates(
    candidates: MMGDeliveryWindowCandidate[],
  ): Promise<MMGDeliveryWindowCandidate[]> {
    const assetIds = [...new Set(candidates.map((candidate) => candidate.assetId))];
    if (assetIds.length === 0) return [];

    const result = await this.#database.query<CandidateMetadataRow>(
      `
        SELECT
          asset_id,
          secondary_topics,
          role_tags,
          goal_tags,
          prerequisite_asset_ids,
          complementary_asset_ids,
          diversity_group,
          recommendation_priority,
          estimated_minutes
        FROM mmg_knowledge_assets
        WHERE asset_id = ANY($1::text[])
      `,
      [assetIds],
    );
    const metadata = new Map(result.rows.map((row) => [row.asset_id, row]));

    return candidates.map((candidate) => {
      const row = metadata.get(candidate.assetId);
      if (!row) return candidate;
      return {
        ...candidate,
        secondaryTopics: array(row.secondary_topics),
        roleTags: array(row.role_tags),
        goalTags: array(row.goal_tags),
        prerequisiteAssetIds: array(row.prerequisite_asset_ids),
        complementaryAssetIds: array(row.complementary_asset_ids),
        diversityGroup: row.diversity_group,
        recommendationPriority: integer(row.recommendation_priority),
        estimatedMinutes:
          row.estimated_minutes === null ? null : integer(row.estimated_minutes),
      };
    });
  }
}