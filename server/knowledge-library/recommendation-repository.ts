import type {
  MMGCustomerAssetSignal,
  MMGCustomerLearningProfile,
  MMGRankedRecommendation,
  MMGRecommendationHistory,
  MMGRecommendationPackage,
} from "./recommendation-ranking.js";
import type {
  MMGSQLExecutor,
  MMGTransactionalDatabase,
} from "./persistence.js";

export interface MMGRecommendationRunRecord {
  runId: string;
  customerId: string;
  cycleId: string;
  windowId: string;
  windowVersion: number;
  rankingVersion: string;
  profileVersion: string | null;
  candidateCount: number;
  source: "kairos_ranker" | "deterministic_fallback";
  package: MMGRecommendationPackage | null;
  ranked: MMGRankedRecommendation[];
  occurredAt: Date;
  failureCode?: string | null;
}

export interface MMGRecommendationRepository {
  loadLearningProfile(
    customerId: string,
  ): Promise<MMGCustomerLearningProfile | null>;
  loadRecommendationHistory(
    customerId: string,
    asOf: Date,
  ): Promise<MMGRecommendationHistory>;
  recordRecommendationRun(
    record: MMGRecommendationRunRecord,
  ): Promise<"recorded" | "duplicate">;
}

interface ProfileRow extends Record<string, unknown> {
  customer_id: string;
  role_code: string | null;
  primary_goal: string | null;
  secondary_goals: string[] | null;
  experience_level: string;
  primary_topics: string[] | null;
  secondary_topics: string[] | null;
  preferred_formats: string[] | null;
  excluded_topics: string[] | null;
  onboarding_version: string;
  profile_status: string;
}

interface OwnedAssetRow extends Record<string, unknown> {
  asset_id: string;
  topic: string;
  series: string | null;
  series_order: number | string | null;
  granted_at: Date | string;
}

interface InteractionRow extends Record<string, unknown> {
  asset_id: string;
  interaction_type: string;
  interaction_count: number | string;
}

const integer = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const timestamp = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];

const mapProfile = (row: ProfileRow): MMGCustomerLearningProfile => ({
  customerId: row.customer_id,
  roleCode: row.role_code,
  primaryGoal: row.primary_goal,
  secondaryGoals: stringArray(row.secondary_goals),
  experienceLevel:
    row.experience_level as MMGCustomerLearningProfile["experienceLevel"],
  primaryTopics: stringArray(row.primary_topics),
  secondaryTopics: stringArray(row.secondary_topics),
  preferredFormats: stringArray(row.preferred_formats),
  excludedTopics: stringArray(row.excluded_topics),
  profileVersion: row.onboarding_version,
  status: row.profile_status as MMGCustomerLearningProfile["status"],
});

const emptySignal = (assetId: string): MMGCustomerAssetSignal => ({
  assetId,
  viewedCount: 0,
  deliveredCount: 0,
  completedCount: 0,
  swappedOutCount: 0,
  dismissedCount: 0,
  likedCount: 0,
  dislikedCount: 0,
});

const applyInteraction = (
  signal: MMGCustomerAssetSignal,
  type: string,
  count: number,
): void => {
  switch (type) {
    case "viewed":
      signal.viewedCount += count;
      break;
    case "delivered":
      signal.deliveredCount += count;
      break;
    case "completed":
      signal.completedCount += count;
      break;
    case "swapped_out":
      signal.swappedOutCount += count;
      break;
    case "dismissed":
      signal.dismissedCount += count;
      break;
    case "liked":
      signal.likedCount += count;
      break;
    case "disliked":
      signal.dislikedCount += count;
      break;
  }
};

export class MMGPostgresRecommendationRepository
  implements MMGRecommendationRepository
{
  readonly #database: MMGTransactionalDatabase;

  constructor(database: MMGTransactionalDatabase) {
    this.#database = database;
  }

  async loadLearningProfile(
    customerId: string,
  ): Promise<MMGCustomerLearningProfile | null> {
    const result = await this.#database.query<ProfileRow>(
      `
        SELECT
          customer_id,
          role_code,
          primary_goal,
          secondary_goals,
          experience_level,
          primary_topics,
          secondary_topics,
          preferred_formats,
          excluded_topics,
          onboarding_version,
          profile_status
        FROM mmg_customer_learning_profiles
        WHERE customer_id = $1
        LIMIT 1
      `,
      [customerId],
    );
    return result.rows[0] ? mapProfile(result.rows[0]) : null;
  }

  async loadRecommendationHistory(
    customerId: string,
    asOf: Date,
  ): Promise<MMGRecommendationHistory> {
    return this.#database.transaction(async (transaction) => {
      const historyStart = new Date(asOf.getTime() - 180 * 86_400_000);
      const ownership = await transaction.query<OwnedAssetRow>(
        `
          SELECT DISTINCT ON (asset.asset_id)
            asset.asset_id,
            asset.topic,
            asset.series,
            asset.series_order,
            ownership.granted_at
          FROM mmg_ownership_grants ownership
          JOIN mmg_knowledge_assets asset ON asset.asset_id = ownership.asset_id
          WHERE ownership.customer_id = $1
            AND ownership.status = 'active'
            AND ownership.granted_at <= $2
            AND (ownership.revoked_at IS NULL OR ownership.revoked_at > $2)
          ORDER BY asset.asset_id, ownership.granted_at DESC
        `,
        [customerId, asOf],
      );
      const interactions = await transaction.query<InteractionRow>(
        `
          SELECT asset_id, interaction_type, COUNT(*)::integer AS interaction_count
          FROM mmg_customer_asset_interactions
          WHERE customer_id = $1
            AND occurred_at <= $2
            AND occurred_at >= $3
          GROUP BY asset_id, interaction_type
        `,
        [customerId, asOf, historyStart],
      );

      const recentDeliveredAssetIds: string[] = [];
      const recentDeliveredTopicCounts: Record<string, number> = {};
      const ownedSeriesProgress: Record<string, number> = {};
      for (const row of ownership.rows) {
        // This list intentionally represents all currently owned assets. The existing
        // name is retained for compatibility with the v1 ranker contract and is used
        // for prerequisite and complementary-asset checks.
        recentDeliveredAssetIds.push(row.asset_id);
        if (timestamp(row.granted_at) >= historyStart.getTime()) {
          recentDeliveredTopicCounts[row.topic] =
            integer(recentDeliveredTopicCounts[row.topic]) + 1;
        }
        if (row.series && row.series_order !== null) {
          ownedSeriesProgress[row.series] = Math.max(
            integer(ownedSeriesProgress[row.series]),
            integer(row.series_order),
          );
        }
      }

      const assetSignals: Record<string, MMGCustomerAssetSignal> = {};
      for (const row of interactions.rows) {
        const signal = assetSignals[row.asset_id] ?? emptySignal(row.asset_id);
        applyInteraction(
          signal,
          row.interaction_type,
          integer(row.interaction_count),
        );
        assetSignals[row.asset_id] = signal;
      }

      return {
        recentDeliveredAssetIds,
        recentDeliveredTopicCounts,
        ownedSeriesProgress,
        assetSignals,
      };
    });
  }

  async recordRecommendationRun(
    record: MMGRecommendationRunRecord,
  ): Promise<"recorded" | "duplicate"> {
    return this.#database.transaction(async (transaction) => {
      const status = record.failureCode
        ? "failed"
        : record.package
          ? "completed"
          : "no_package";
      const inserted = await transaction.query(
        `
          INSERT INTO mmg_recommendation_runs (
            run_id,
            customer_id,
            cycle_id,
            window_id,
            window_version,
            ranking_version,
            profile_version,
            candidate_count,
            selected_asset_ids,
            selected_total_units,
            package_score,
            source,
            rationale,
            status,
            failure_code,
            created_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11,
            $12, $13, $14, $15, $16
          )
          ON CONFLICT (window_id, window_version) DO NOTHING
          RETURNING run_id
        `,
        [
          record.runId,
          record.customerId,
          record.cycleId,
          record.windowId,
          record.windowVersion,
          record.rankingVersion,
          record.profileVersion,
          record.candidateCount,
          record.package?.assetIds ?? [],
          record.package?.totalUnits ?? 0,
          record.package?.score ?? null,
          record.source,
          record.package?.rationale ??
            "No complete eligible package could be ranked.",
          status,
          record.failureCode ?? null,
          record.occurredAt,
        ],
      );
      if (inserted.rowCount !== 1) return "duplicate";

      const selected = new Set(record.package?.assetIds ?? []);
      const visibleRanking = record.ranked.slice(0, 250);
      for (const [index, item] of visibleRanking.entries()) {
        await transaction.query(
          `
            INSERT INTO mmg_recommendation_scores (
              run_id,
              asset_id,
              rank_position,
              total_score,
              score_components,
              reason_codes,
              selected,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::text[], $7, $8)
          `,
          [
            record.runId,
            item.candidate.assetId,
            index + 1,
            item.score,
            JSON.stringify({
              ...item.components,
              excluded: item.excluded,
              exclusionCodes: item.exclusionCodes,
            }),
            [...new Set([...item.reasonCodes, ...item.exclusionCodes])],
            selected.has(item.candidate.assetId),
            record.occurredAt,
          ],
        );
      }
      return "recorded";
    });
  }
}

export const loadMMGRecommendationContext = async (input: {
  repository: MMGRecommendationRepository;
  customerId: string;
  asOf: Date;
}): Promise<{
  profile: MMGCustomerLearningProfile | null;
  history: MMGRecommendationHistory;
}> => {
  const [profile, history] = await Promise.all([
    input.repository.loadLearningProfile(input.customerId),
    input.repository.loadRecommendationHistory(input.customerId, input.asOf),
  ]);
  return { profile, history };
};