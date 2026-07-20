BEGIN;

ALTER TABLE mmg_knowledge_assets
  ADD COLUMN IF NOT EXISTS secondary_topics text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS role_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS goal_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS prerequisite_asset_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS complementary_asset_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS diversity_group text,
  ADD COLUMN IF NOT EXISTS recommendation_priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_minutes integer;

ALTER TABLE mmg_knowledge_assets
  DROP CONSTRAINT IF EXISTS mmg_knowledge_assets_recommendation_priority_check;
ALTER TABLE mmg_knowledge_assets
  ADD CONSTRAINT mmg_knowledge_assets_recommendation_priority_check
  CHECK (recommendation_priority BETWEEN -100 AND 100);

ALTER TABLE mmg_knowledge_assets
  DROP CONSTRAINT IF EXISTS mmg_knowledge_assets_estimated_minutes_check;
ALTER TABLE mmg_knowledge_assets
  ADD CONSTRAINT mmg_knowledge_assets_estimated_minutes_check
  CHECK (estimated_minutes IS NULL OR estimated_minutes BETWEEN 1 AND 100000);

CREATE INDEX IF NOT EXISTS mmg_knowledge_assets_recommendation_idx
  ON mmg_knowledge_assets (subscription_eligible, asset_status, recommendation_priority DESC, topic);
CREATE INDEX IF NOT EXISTS mmg_knowledge_assets_role_tags_idx
  ON mmg_knowledge_assets USING gin (role_tags);
CREATE INDEX IF NOT EXISTS mmg_knowledge_assets_goal_tags_idx
  ON mmg_knowledge_assets USING gin (goal_tags);
CREATE INDEX IF NOT EXISTS mmg_knowledge_assets_secondary_topics_idx
  ON mmg_knowledge_assets USING gin (secondary_topics);

CREATE TABLE IF NOT EXISTS mmg_customer_learning_profiles (
  customer_id text PRIMARY KEY,
  role_code text,
  primary_goal text,
  secondary_goals text[] NOT NULL DEFAULT ARRAY[]::text[],
  experience_level text NOT NULL DEFAULT 'beginner'
    CHECK (experience_level IN ('beginner', 'intermediate', 'advanced', 'all_levels')),
  primary_topics text[] NOT NULL DEFAULT ARRAY[]::text[],
  secondary_topics text[] NOT NULL DEFAULT ARRAY[]::text[],
  preferred_formats text[] NOT NULL DEFAULT ARRAY[]::text[],
  excluded_topics text[] NOT NULL DEFAULT ARRAY[]::text[],
  onboarding_version text NOT NULL DEFAULT '1.0.0',
  profile_status text NOT NULL DEFAULT 'active'
    CHECK (profile_status IN ('active', 'incomplete', 'disabled')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role_code IS NULL OR char_length(role_code) BETWEEN 1 AND 100),
  CHECK (primary_goal IS NULL OR char_length(primary_goal) BETWEEN 1 AND 150)
);

CREATE INDEX IF NOT EXISTS mmg_customer_learning_profiles_status_idx
  ON mmg_customer_learning_profiles (profile_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS mmg_customer_learning_profiles_topics_idx
  ON mmg_customer_learning_profiles USING gin (primary_topics);

CREATE TABLE IF NOT EXISTS mmg_customer_asset_interactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id text NOT NULL,
  asset_id text NOT NULL REFERENCES mmg_knowledge_assets(asset_id) ON DELETE RESTRICT,
  interaction_type text NOT NULL CHECK (
    interaction_type IN (
      'viewed',
      'selected',
      'reserved',
      'confirmed',
      'delivered',
      'completed',
      'swapped_out',
      'dismissed',
      'liked',
      'disliked'
    )
  ),
  window_id uuid REFERENCES mmg_entitlement_windows(id) ON DELETE SET NULL,
  interaction_weight integer NOT NULL DEFAULT 1 CHECK (interaction_weight BETWEEN 1 AND 100),
  occurred_at timestamptz NOT NULL,
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, asset_id, interaction_type, occurred_at, source_reference)
);

CREATE INDEX IF NOT EXISTS mmg_customer_asset_interactions_customer_idx
  ON mmg_customer_asset_interactions (customer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS mmg_customer_asset_interactions_asset_idx
  ON mmg_customer_asset_interactions (asset_id, interaction_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS mmg_recommendation_runs (
  run_id text PRIMARY KEY,
  customer_id text NOT NULL,
  cycle_id uuid NOT NULL REFERENCES mmg_entitlement_cycles(id) ON DELETE CASCADE,
  window_id uuid NOT NULL REFERENCES mmg_entitlement_windows(id) ON DELETE CASCADE,
  window_version integer NOT NULL CHECK (window_version >= 1),
  ranking_version text NOT NULL,
  profile_version text,
  candidate_count integer NOT NULL CHECK (candidate_count >= 0),
  selected_asset_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  selected_total_units integer NOT NULL DEFAULT 0 CHECK (selected_total_units >= 0),
  package_score integer,
  source text NOT NULL CHECK (source IN ('kairos_ranker', 'deterministic_fallback')),
  rationale text NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'no_package', 'failed')),
  failure_code text,
  created_at timestamptz NOT NULL,
  UNIQUE (window_id, window_version),
  CHECK (char_length(run_id) BETWEEN 8 AND 128),
  CHECK (status <> 'failed' OR failure_code IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mmg_recommendation_runs_customer_idx
  ON mmg_recommendation_runs (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mmg_recommendation_runs_window_idx
  ON mmg_recommendation_runs (window_id, window_version DESC);

CREATE TABLE IF NOT EXISTS mmg_recommendation_scores (
  run_id text NOT NULL REFERENCES mmg_recommendation_runs(run_id) ON DELETE CASCADE,
  asset_id text NOT NULL REFERENCES mmg_knowledge_assets(asset_id) ON DELETE RESTRICT,
  rank_position integer NOT NULL CHECK (rank_position >= 1),
  total_score integer NOT NULL,
  score_components jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, asset_id)
);

CREATE INDEX IF NOT EXISTS mmg_recommendation_scores_selected_idx
  ON mmg_recommendation_scores (run_id, selected, rank_position);

COMMIT;