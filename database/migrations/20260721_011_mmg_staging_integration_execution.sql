BEGIN;

CREATE TABLE IF NOT EXISTS mmg_schema_migrations (
  migration_id text PRIMARY KEY,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL,
  CHECK (char_length(migration_id) BETWEEN 8 AND 160)
);

CREATE TABLE IF NOT EXISTS mmg_staging_runtime_controls (
  environment text NOT NULL DEFAULT 'staging' CHECK (environment = 'staging'),
  control_code text NOT NULL CHECK (control_code IN (
    'product_publication', 'subscription_checkout', 'webhook_ingestion',
    'delivery_scheduler', 'delivery_dispatcher', 'recommendation_automation',
    'signed_library_access', 'thank_you_handoff'
  )),
  mode text NOT NULL CHECK (mode IN ('enabled', 'disabled', 'observe_only', 'drain_only')),
  release_id text,
  reason_code text NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (environment, control_code),
  CHECK (NOT (control_code = 'webhook_ingestion' AND mode = 'disabled')),
  CHECK (NOT (control_code = 'product_publication' AND mode = 'enabled'))
);

CREATE TABLE IF NOT EXISTS mmg_staging_runtime_rollout (
  environment text PRIMARY KEY DEFAULT 'staging' CHECK (environment = 'staging'),
  release_id text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('paused', 'internal', 'pilot', 'limited', 'expanded', 'full')),
  cohort_percentage numeric(5,2) NOT NULL CHECK (cohort_percentage >= 0 AND cohort_percentage <= 100),
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (
    (stage = 'paused' AND cohort_percentage = 0) OR
    (stage = 'internal' AND cohort_percentage = 0) OR
    (stage = 'pilot' AND cohort_percentage = 5) OR
    (stage = 'limited' AND cohort_percentage = 25) OR
    (stage = 'expanded' AND cohort_percentage = 50) OR
    (stage = 'full' AND cohort_percentage = 100)
  )
);

CREATE TABLE IF NOT EXISTS mmg_commerce_staging_fixture_state (
  run_id text PRIMARY KEY REFERENCES mmg_commerce_rehearsal_runs(run_id) ON DELETE CASCADE,
  release_id text NOT NULL,
  environment text NOT NULL DEFAULT 'staging' CHECK (environment = 'staging'),
  scenario text CHECK (scenario IS NULL OR scenario IN (
    'database_connectivity_sev1', 'webhook_failure_sev2'
  )),
  virtual_clock timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'completed', 'failed', 'torn_down')),
  fixture_namespace text NOT NULL,
  publication_allowed boolean NOT NULL DEFAULT FALSE CHECK (publication_allowed = FALSE),
  live_customer_data_allowed boolean NOT NULL DEFAULT FALSE CHECK (live_customer_data_allowed = FALSE),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK (char_length(run_id) BETWEEN 8 AND 128),
  CHECK (char_length(fixture_namespace) BETWEEN 8 AND 128)
);

CREATE UNIQUE INDEX IF NOT EXISTS mmg_commerce_staging_fixture_one_active_idx
  ON mmg_commerce_staging_fixture_state (environment)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS mmg_commerce_staging_fixture_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id text NOT NULL REFERENCES mmg_commerce_staging_fixture_state(run_id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS mmg_commerce_staging_fixture_events_run_idx
  ON mmg_commerce_staging_fixture_events (run_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_staging_integration_runs (
  integration_run_id text PRIMARY KEY,
  release_id text NOT NULL,
  release_commit_sha text NOT NULL CHECK (release_commit_sha ~ '^[a-f0-9]{40}$'),
  environment text NOT NULL DEFAULT 'staging' CHECK (environment = 'staging'),
  status text NOT NULL CHECK (status IN ('planned', 'running', 'verified', 'rehearsed', 'failed', 'canceled')),
  migration_count integer NOT NULL DEFAULT 0 CHECK (migration_count >= 0),
  route_count integer NOT NULL DEFAULT 0 CHECK (route_count >= 0),
  provider_count integer NOT NULL DEFAULT 0 CHECK (provider_count >= 0),
  rehearsal_run_id text REFERENCES mmg_commerce_rehearsal_runs(run_id) ON DELETE SET NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL,
  CHECK (char_length(integration_run_id) BETWEEN 8 AND 128),
  CHECK (jsonb_typeof(evidence) = 'object'),
  CHECK (status <> 'failed' OR error_code IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mmg_commerce_staging_integration_release_idx
  ON mmg_commerce_staging_integration_runs (release_id, started_at DESC);

COMMIT;
