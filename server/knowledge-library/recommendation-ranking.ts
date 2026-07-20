import type { MMGDeliveryWindowCandidate } from "./delivery-window-service.js";

export const MMG_RECOMMENDATION_RANKING_VERSION = "1.0.0" as const;

export type MMGLearningExperienceLevel =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "all_levels";

export interface MMGCustomerLearningProfile {
  customerId: string;
  roleCode: string | null;
  primaryGoal: string | null;
  secondaryGoals: string[];
  experienceLevel: MMGLearningExperienceLevel;
  primaryTopics: string[];
  secondaryTopics: string[];
  preferredFormats: string[];
  excludedTopics: string[];
  profileVersion: string;
  status: "active" | "incomplete" | "disabled";
}

export interface MMGCustomerAssetSignal {
  assetId: string;
  viewedCount: number;
  deliveredCount: number;
  completedCount: number;
  swappedOutCount: number;
  dismissedCount: number;
  likedCount: number;
  dislikedCount: number;
}

export interface MMGRecommendationHistory {
  recentDeliveredAssetIds: string[];
  recentDeliveredTopicCounts: Record<string, number>;
  ownedSeriesProgress: Record<string, number>;
  assetSignals: Record<string, MMGCustomerAssetSignal>;
}

export interface MMGRecommendationScoreComponents {
  editorialPriority: number;
  primaryTopic: number;
  secondaryTopic: number;
  goalFit: number;
  roleFit: number;
  experienceFit: number;
  formatFit: number;
  seriesProgression: number;
  complementaryFit: number;
  novelty: number;
  recentTopicFatigue: number;
  interactionSignal: number;
}

export interface MMGRankedRecommendation {
  candidate: MMGDeliveryWindowCandidate;
  score: number;
  components: MMGRecommendationScoreComponents;
  reasonCodes: string[];
  excluded: boolean;
  exclusionCodes: string[];
}

export interface MMGRecommendationPackage {
  assetIds: string[];
  totalUnits: number;
  score: number;
  diversityBonus: number;
  rationale: string;
  reasonCodes: string[];
}

export interface MMGRecommendationRankingResult {
  rankingVersion: typeof MMG_RECOMMENDATION_RANKING_VERSION;
  ranked: MMGRankedRecommendation[];
  package: MMGRecommendationPackage | null;
}

const normalized = (value: string | null | undefined): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const setOf = (values: readonly string[] | undefined): Set<string> =>
  new Set((values ?? []).map(normalized).filter(Boolean));

const integer = (value: number | undefined): number =>
  Number.isFinite(value) ? Math.trunc(value ?? 0) : 0;

const intersects = (left: Set<string>, right: Set<string>): boolean => {
  for (const value of left) if (right.has(value)) return true;
  return false;
};

const bounded = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const levelOrder: Record<MMGLearningExperienceLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  all_levels: 1,
};

const experienceScore = (
  profileLevel: MMGLearningExperienceLevel,
  candidateLevelInput: string,
): { score: number; code: string } => {
  const candidateLevel = normalized(candidateLevelInput) as MMGLearningExperienceLevel;
  if (candidateLevel === "all_levels") return { score: 8, code: "EXPERIENCE_ALL_LEVELS" };
  if (!(candidateLevel in levelOrder)) return { score: 0, code: "EXPERIENCE_UNSPECIFIED" };
  if (profileLevel === "all_levels" || profileLevel === candidateLevel) {
    return { score: 12, code: "EXPERIENCE_EXACT" };
  }

  const difference = levelOrder[candidateLevel] - levelOrder[profileLevel];
  if (Math.abs(difference) === 1) {
    return difference > 0
      ? { score: 2, code: "EXPERIENCE_STRETCH" }
      : { score: 4, code: "EXPERIENCE_REINFORCEMENT" };
  }
  return difference > 1
    ? { score: -18, code: "EXPERIENCE_TOO_ADVANCED" }
    : { score: -6, code: "EXPERIENCE_TOO_BASIC" };
};

const signalFor = (
  history: MMGRecommendationHistory,
  assetId: string,
): MMGCustomerAssetSignal =>
  history.assetSignals[assetId] ?? {
    assetId,
    viewedCount: 0,
    deliveredCount: 0,
    completedCount: 0,
    swappedOutCount: 0,
    dismissedCount: 0,
    likedCount: 0,
    dislikedCount: 0,
  };

export const scoreMMGRecommendationCandidate = (input: {
  candidate: MMGDeliveryWindowCandidate;
  profile: MMGCustomerLearningProfile | null;
  history: MMGRecommendationHistory;
}): MMGRankedRecommendation => {
  const candidate = input.candidate;
  const profile = input.profile?.status === "active" ? input.profile : null;
  const topic = normalized(candidate.topic);
  const candidateTopics = new Set([topic, ...setOf(candidate.secondaryTopics)]);
  const roleTags = setOf(candidate.roleTags);
  const goalTags = setOf(candidate.goalTags);
  const prerequisiteIds = setOf(candidate.prerequisiteAssetIds);
  const complementaryIds = setOf(candidate.complementaryAssetIds);
  const primaryTopics = setOf(profile?.primaryTopics);
  const secondaryTopics = setOf(profile?.secondaryTopics);
  const excludedTopics = setOf(profile?.excludedTopics);
  const goals = setOf([
    profile?.primaryGoal ?? "",
    ...(profile?.secondaryGoals ?? []),
  ]);
  const preferredFormats = setOf(profile?.preferredFormats);
  const role = normalized(profile?.roleCode);
  const signal = signalFor(input.history, candidate.assetId);
  const exclusionCodes: string[] = [];

  if (intersects(candidateTopics, excludedTopics)) {
    exclusionCodes.push("PROFILE_EXCLUDED_TOPIC");
  }
  if (signal.dislikedCount > 0) exclusionCodes.push("CUSTOMER_DISLIKED_ASSET");
  for (const prerequisite of prerequisiteIds) {
    if (!input.history.recentDeliveredAssetIds.includes(prerequisite)) {
      exclusionCodes.push("MISSING_PREREQUISITE");
      break;
    }
  }

  const components: MMGRecommendationScoreComponents = {
    editorialPriority: bounded(integer(candidate.recommendationPriority), -20, 20),
    primaryTopic: 0,
    secondaryTopic: 0,
    goalFit: 0,
    roleFit: 0,
    experienceFit: 0,
    formatFit: 0,
    seriesProgression: 0,
    complementaryFit: 0,
    novelty: 0,
    recentTopicFatigue: 0,
    interactionSignal: 0,
  };
  const reasonCodes: string[] = [];

  if (intersects(candidateTopics, primaryTopics)) {
    components.primaryTopic = 30;
    reasonCodes.push("PRIMARY_TOPIC_MATCH");
  } else if (intersects(candidateTopics, secondaryTopics)) {
    components.secondaryTopic = 14;
    reasonCodes.push("SECONDARY_TOPIC_MATCH");
  }

  const goalMatches = [...goalTags].filter((tag) => goals.has(tag)).length;
  if (goalMatches > 0) {
    components.goalFit = Math.min(24, goalMatches * 12);
    reasonCodes.push("GOAL_MATCH");
  }

  if (role && roleTags.has(role)) {
    components.roleFit = 16;
    reasonCodes.push("ROLE_MATCH");
  }

  const experience = experienceScore(
    profile?.experienceLevel ?? "beginner",
    candidate.experienceLevel,
  );
  components.experienceFit = experience.score;
  reasonCodes.push(experience.code);

  if (preferredFormats.has(normalized(candidate.format))) {
    components.formatFit = 8;
    reasonCodes.push("PREFERRED_FORMAT");
  }

  if (candidate.series && candidate.seriesOrder) {
    const progress = integer(input.history.ownedSeriesProgress[candidate.series]);
    if (candidate.seriesOrder === progress + 1) {
      components.seriesProgression = 20;
      reasonCodes.push("NEXT_SERIES_TITLE");
    } else if (candidate.seriesOrder > progress + 1) {
      components.seriesProgression = -12;
      reasonCodes.push("SERIES_GAP");
    } else if (candidate.seriesOrder <= progress) {
      components.seriesProgression = -8;
      reasonCodes.push("SERIES_ALREADY_PASSED");
    }
  }

  if (
    [...complementaryIds].some((assetId) =>
      input.history.recentDeliveredAssetIds.includes(assetId),
    )
  ) {
    components.complementaryFit = 10;
    reasonCodes.push("COMPLEMENTS_RECENT_ASSET");
  }

  const recentTopicCount = integer(input.history.recentDeliveredTopicCounts[topic]);
  if (recentTopicCount === 0) {
    components.novelty = 4;
    reasonCodes.push("TOPIC_NOVELTY");
  } else {
    components.recentTopicFatigue = -Math.min(18, recentTopicCount * 6);
    reasonCodes.push("RECENT_TOPIC_FATIGUE");
  }

  components.interactionSignal = bounded(
    signal.likedCount * 12 +
      signal.completedCount * 8 +
      Math.min(signal.viewedCount, 3) * 2 -
      signal.swappedOutCount * 12 -
      signal.dismissedCount * 20,
    -50,
    40,
  );
  if (signal.likedCount > 0) reasonCodes.push("PRIOR_POSITIVE_SIGNAL");
  if (signal.swappedOutCount > 0) reasonCodes.push("PRIOR_SWAP_PENALTY");
  if (signal.dismissedCount > 0) reasonCodes.push("PRIOR_DISMISSAL_PENALTY");

  const score = Object.values(components).reduce((sum, value) => sum + value, 0);
  return {
    candidate,
    score,
    components,
    reasonCodes: [...new Set(reasonCodes)],
    excluded: exclusionCodes.length > 0,
    exclusionCodes: [...new Set(exclusionCodes)],
  };
};

const packageDiversity = (input: {
  selected: MMGRankedRecommendation[];
  profile: MMGCustomerLearningProfile | null;
}): { bonus: number; codes: string[] } => {
  const selected = input.selected;
  const topics = new Set(selected.map((item) => normalized(item.candidate.topic)));
  const formats = new Set(selected.map((item) => normalized(item.candidate.format)));
  const groups = new Set(
    selected.map((item) => normalized(item.candidate.diversityGroup)).filter(Boolean),
  );
  const primaryTopics = setOf(input.profile?.primaryTopics);
  const secondaryTopics = setOf(input.profile?.secondaryTopics);
  const codes: string[] = [];
  let bonus = 0;

  if (topics.size === selected.length) {
    bonus += 12;
    codes.push("TOPIC_DIVERSITY");
  } else if (selected.length > 1) {
    bonus -= 10;
    codes.push("DUPLICATE_TOPIC_PENALTY");
  }
  if (groups.size === selected.length && groups.size > 1) {
    bonus += 8;
    codes.push("DIVERSITY_GROUP_COVERAGE");
  }
  if (formats.size > 1) {
    bonus += 4;
    codes.push("FORMAT_DIVERSITY");
  }
  if (
    selected.some((item) =>
      [...new Set([normalized(item.candidate.topic), ...setOf(item.candidate.secondaryTopics)])]
        .some((topic) => primaryTopics.has(topic)),
    )
  ) {
    bonus += 8;
    codes.push("PRIMARY_OBJECTIVE_COVERAGE");
  }
  if (
    selected.some((item) =>
      [...new Set([normalized(item.candidate.topic), ...setOf(item.candidate.secondaryTopics)])]
        .some((topic) => secondaryTopics.has(topic)),
    )
  ) {
    bonus += 6;
    codes.push("SECONDARY_INTEREST_EXPLORATION");
  }

  const sameSeries = selected.length > 1 && selected.every(
    (item) => item.candidate.series && item.candidate.series === selected[0].candidate.series,
  );
  if (sameSeries) {
    const orders = selected
      .map((item) => item.candidate.seriesOrder ?? Number.MAX_SAFE_INTEGER)
      .sort((left, right) => left - right);
    const sequential = orders.every((order, index) => index === 0 || order === orders[index - 1] + 1);
    bonus += sequential ? 4 : -8;
    codes.push(sequential ? "SEQUENTIAL_SERIES_PAIR" : "SERIES_CONCENTRATION_PENALTY");
  }

  return { bonus, codes };
};

const rationaleFor = (
  selected: MMGRankedRecommendation[],
  diversityCodes: string[],
): string => {
  const titles = selected.map((item) => item.candidate.title).join(" + ");
  const strongest = [...new Set(selected.flatMap((item) => item.reasonCodes))].slice(0, 5);
  const reasons = [...strongest, ...diversityCodes].slice(0, 7);
  return `Kairos selected ${titles} using server-eligible catalog gates and explainable ranking signals: ${reasons.join(", ") || "deterministic relevance and capacity fit"}.`;
};

export const rankMMGRecommendationPackage = (input: {
  candidates: MMGDeliveryWindowCandidate[];
  profile: MMGCustomerLearningProfile | null;
  history: MMGRecommendationHistory;
  targetAssetCount: number;
  totalUnits: number;
}): MMGRecommendationRankingResult => {
  const targetAssetCount = Math.max(1, Math.trunc(input.targetAssetCount));
  const totalUnits = Math.max(1, Math.trunc(input.totalUnits));
  const ranked = input.candidates
    .map((candidate) =>
      scoreMMGRecommendationCandidate({ candidate, profile: input.profile, history: input.history }),
    )
    .sort((left, right) =>
      right.score - left.score ||
      integer(right.candidate.recommendationPriority) - integer(left.candidate.recommendationPriority) ||
      left.candidate.title.localeCompare(right.candidate.title) ||
      left.candidate.assetId.localeCompare(right.candidate.assetId),
    );

  const eligible = ranked.filter((item) => !item.excluded);
  let best: MMGRecommendationPackage | null = null;
  const selected: MMGRankedRecommendation[] = [];

  const search = (start: number, unitsRemaining: number): void => {
    if (selected.length === targetAssetCount) {
      if (unitsRemaining !== 0) return;
      const diversity = packageDiversity({ selected, profile: input.profile });
      const score = selected.reduce((sum, item) => sum + item.score, 0) + diversity.bonus;
      const assetIds = selected.map((item) => item.candidate.assetId);
      const tieBreaker = assetIds.join("|");
      const bestTieBreaker = best?.assetIds.join("|") ?? "\uffff";
      if (!best || score > best.score || (score === best.score && tieBreaker < bestTieBreaker)) {
        best = {
          assetIds,
          totalUnits,
          score,
          diversityBonus: diversity.bonus,
          rationale: rationaleFor(selected, diversity.codes),
          reasonCodes: [...new Set([...selected.flatMap((item) => item.reasonCodes), ...diversity.codes])],
        };
      }
      return;
    }
    if (unitsRemaining <= 0) return;
    if (eligible.length - start < targetAssetCount - selected.length) return;

    for (let index = start; index < eligible.length; index += 1) {
      const item = eligible[index];
      const units = Math.max(1, Math.trunc(item.candidate.subscriptionValue));
      if (units > unitsRemaining) continue;
      selected.push(item);
      search(index + 1, unitsRemaining - units);
      selected.pop();
    }
  };

  search(0, totalUnits);
  return { rankingVersion: MMG_RECOMMENDATION_RANKING_VERSION, ranked, package: best };
};