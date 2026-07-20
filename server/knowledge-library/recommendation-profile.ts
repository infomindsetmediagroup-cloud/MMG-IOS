import type { MMGCustomerLearningProfile } from "./recommendation-ranking.js";
import type { MMGSQLExecutor } from "./persistence.js";

export interface MMGLearningProfilePrincipal {
  customerId: string;
  sessionId: string;
}

export interface MMGLearningProfileInput {
  roleCode: string | null;
  primaryGoal: string | null;
  secondaryGoals: string[];
  experienceLevel: MMGCustomerLearningProfile["experienceLevel"];
  primaryTopics: string[];
  secondaryTopics: string[];
  preferredFormats: string[];
  excludedTopics: string[];
  onboardingVersion: string;
}

export interface MMGLearningProfileRepository {
  load(customerId: string): Promise<MMGCustomerLearningProfile | null>;
  save(input: {
    principal: MMGLearningProfilePrincipal;
    profile: MMGLearningProfileInput;
    occurredAt: Date;
  }): Promise<MMGCustomerLearningProfile>;
}

const identifier = (value: unknown, maximum = 100): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized || normalized.length > maximum) {
    throw new Error("MMG_LEARNING_PROFILE_IDENTIFIER_INVALID");
  }
  return normalized;
};

const list = (value: unknown, maximumItems: number): string[] => {
  if (!Array.isArray(value)) throw new Error("MMG_LEARNING_PROFILE_LIST_INVALID");
  const values = value.map((item) => identifier(item)).filter((item): item is string => Boolean(item));
  const unique = [...new Set(values)];
  if (unique.length > maximumItems) throw new Error("MMG_LEARNING_PROFILE_LIST_TOO_LARGE");
  return unique;
};

export const validateMMGLearningProfileInput = (
  input: Record<string, unknown>,
): MMGLearningProfileInput => {
  const experienceLevel = identifier(input.experienceLevel) ?? "beginner";
  if (!["beginner", "intermediate", "advanced", "all_levels"].includes(experienceLevel)) {
    throw new Error("MMG_LEARNING_PROFILE_EXPERIENCE_INVALID");
  }
  const onboardingVersion = String(input.onboardingVersion ?? "1.0.0").trim();
  if (!/^\d+\.\d+\.\d+$/.test(onboardingVersion)) {
    throw new Error("MMG_LEARNING_PROFILE_VERSION_INVALID");
  }

  return {
    roleCode: identifier(input.roleCode),
    primaryGoal: identifier(input.primaryGoal, 150),
    secondaryGoals: list(input.secondaryGoals ?? [], 8),
    experienceLevel: experienceLevel as MMGLearningProfileInput["experienceLevel"],
    primaryTopics: list(input.primaryTopics ?? [], 12),
    secondaryTopics: list(input.secondaryTopics ?? [], 20),
    preferredFormats: list(input.preferredFormats ?? [], 12),
    excludedTopics: list(input.excludedTopics ?? [], 20),
    onboardingVersion,
  };
};

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

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String).filter(Boolean) : [];

const map = (row: ProfileRow): MMGCustomerLearningProfile => ({
  customerId: row.customer_id,
  roleCode: row.role_code,
  primaryGoal: row.primary_goal,
  secondaryGoals: strings(row.secondary_goals),
  experienceLevel: row.experience_level as MMGCustomerLearningProfile["experienceLevel"],
  primaryTopics: strings(row.primary_topics),
  secondaryTopics: strings(row.secondary_topics),
  preferredFormats: strings(row.preferred_formats),
  excludedTopics: strings(row.excluded_topics),
  profileVersion: row.onboarding_version,
  status: row.profile_status as MMGCustomerLearningProfile["status"],
});

export class MMGPostgresLearningProfileRepository
  implements MMGLearningProfileRepository
{
  readonly #database: MMGSQLExecutor;

  constructor(database: MMGSQLExecutor) {
    this.#database = database;
  }

  async load(customerId: string): Promise<MMGCustomerLearningProfile | null> {
    const result = await this.#database.query<ProfileRow>(
      `
        SELECT customer_id, role_code, primary_goal, secondary_goals,
          experience_level, primary_topics, secondary_topics, preferred_formats,
          excluded_topics, onboarding_version, profile_status
        FROM mmg_customer_learning_profiles
        WHERE customer_id = $1
        LIMIT 1
      `,
      [customerId],
    );
    return result.rows[0] ? map(result.rows[0]) : null;
  }

  async save(input: {
    principal: MMGLearningProfilePrincipal;
    profile: MMGLearningProfileInput;
    occurredAt: Date;
  }): Promise<MMGCustomerLearningProfile> {
    const completed = Boolean(
      input.profile.roleCode &&
      input.profile.primaryGoal &&
      input.profile.primaryTopics.length > 0,
    );
    const result = await this.#database.query<ProfileRow>(
      `
        INSERT INTO mmg_customer_learning_profiles (
          customer_id, role_code, primary_goal, secondary_goals, experience_level,
          primary_topics, secondary_topics, preferred_formats, excluded_topics,
          onboarding_version, profile_status, completed_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4::text[], $5, $6::text[], $7::text[], $8::text[],
          $9::text[], $10, $11, $12, $13, $13)
        ON CONFLICT (customer_id)
        DO UPDATE SET
          role_code = EXCLUDED.role_code,
          primary_goal = EXCLUDED.primary_goal,
          secondary_goals = EXCLUDED.secondary_goals,
          experience_level = EXCLUDED.experience_level,
          primary_topics = EXCLUDED.primary_topics,
          secondary_topics = EXCLUDED.secondary_topics,
          preferred_formats = EXCLUDED.preferred_formats,
          excluded_topics = EXCLUDED.excluded_topics,
          onboarding_version = EXCLUDED.onboarding_version,
          profile_status = EXCLUDED.profile_status,
          completed_at = COALESCE(mmg_customer_learning_profiles.completed_at, EXCLUDED.completed_at),
          updated_at = EXCLUDED.updated_at
        RETURNING customer_id, role_code, primary_goal, secondary_goals,
          experience_level, primary_topics, secondary_topics, preferred_formats,
          excluded_topics, onboarding_version, profile_status
      `,
      [
        input.principal.customerId,
        input.profile.roleCode,
        input.profile.primaryGoal,
        input.profile.secondaryGoals,
        input.profile.experienceLevel,
        input.profile.primaryTopics,
        input.profile.secondaryTopics,
        input.profile.preferredFormats,
        input.profile.excludedTopics,
        input.profile.onboardingVersion,
        completed ? "active" : "incomplete",
        completed ? input.occurredAt : null,
        input.occurredAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("MMG_LEARNING_PROFILE_SAVE_FAILED");
    return map(row);
  }
}

export const getMMGLearningProfile = async (input: {
  repository: MMGLearningProfileRepository;
  principal: MMGLearningProfilePrincipal;
}) => ({
  status: 200,
  body: {
    ok: true,
    profile: await input.repository.load(input.principal.customerId),
  },
});

export const saveMMGLearningProfile = async (input: {
  repository: MMGLearningProfileRepository;
  principal: MMGLearningProfilePrincipal;
  payload: Record<string, unknown>;
  occurredAt: Date;
}) => ({
  status: 200,
  body: {
    ok: true,
    profile: await input.repository.save({
      principal: input.principal,
      profile: validateMMGLearningProfileInput(input.payload),
      occurredAt: input.occurredAt,
    }),
  },
});