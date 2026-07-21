BEGIN;

CREATE TABLE IF NOT EXISTS mmg_commerce_adapter_heartbeats (
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  adapter_code text NOT NULL CHECK (adapter_code IN (
    'database', 'runtime_routes', 'runtime_controls', 'alerts',
    'scheduler', 'dispatcher', 'storage_signer', 'admin_auth'
  )),
  release_id text,
  status text NOT NULL CHECK (status IN ('healthy', 'degraded', 'unavailable', 'unknown')),
  observed_at timestamptz NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (environment, adapter_code),
  CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS mmg_commerce_adapter_heartbeats_status_idx
  ON mmg_commerce_adapter_heartbeats (environment, status, observed_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_rehearsal_runs (
  run_id text PRIMARY KEY,
  release_id text NOT NULL,
  environment text NOT NULL CHECK (environment = 'staging'),
  status text NOT NULL CHECK (status IN ('running', 'passed', 'failed', 'canceled')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  publication_attempted boolean NOT NULL DEFAULT FALSE CHECK (publication_attempted = FALSE),
  live_customer_data_used boolean NOT NULL DEFAULT FALSE CHECK (live_customer_data_used = FALSE),
  delivered_ownership_revocation_allowed boolean NOT NULL DEFAULT FALSE
    CHECK (delivered_ownership_revocation_allowed = FALSE),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL,
  CHECK (char_length(run_id) BETWEEN 8 AND 128),
  CHECK (status = 'running' OR completed_at IS NOT NULL),
  CHECK (status <> 'failed' OR error_code IS NOT NULL),
  CHECK (jsonb_typeof(evidence) = 'object')
);

ALTER TABLE mmg_commerce_rehearsal_runs
  DROP CONSTRAINT IF EXISTS mmg_commerce_rehearsal_runs_release_fk;
ALTER TABLE mmg_commerce_rehearsal_runs
  ADD CONSTRAINT mmg_commerce_rehearsal_runs_release_fk
  FOREIGN KEY (release_id)
  REFERENCES mmg_commerce_releases(release_id)
  ON DELETE RESTRICT
  NOT VALID;

CREATE INDEX IF NOT EXISTS mmg_commerce_rehearsal_runs_release_idx
  ON mmg_commerce_rehearsal_runs (release_id, started_at DESC);
CREATE INDEX IF NOT EXISTS mmg_commerce_rehearsal_runs_status_idx
  ON mmg_commerce_rehearsal_runs (status, started_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_rehearsal_checks (
  run_id text NOT NULL REFERENCES mmg_commerce_rehearsal_runs(run_id) ON DELETE CASCADE,
  check_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('passed', 'failed')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, check_code),
  CHECK (char_length(check_code) BETWEEN 3 AND 128),
  CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE INDEX IF NOT EXISTS mmg_commerce_rehearsal_checks_status_idx
  ON mmg_commerce_rehearsal_checks (status, occurred_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_rehearsal_fixture_leases (
  environment text PRIMARY KEY CHECK (environment = 'staging'),
  run_id text NOT NULL REFERENCES mmg_commerce_rehearsal_runs(run_id) ON DELETE CASCADE,
  fixture_namespace text NOT NULL,
  acquired_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  updated_at timestamptz NOT NULL,
  CHECK (expires_at > acquired_at),
  CHECK (char_length(fixture_namespace) BETWEEN 8 AND 128)
);

CREATE INDEX IF NOT EXISTS mmg_commerce_rehearsal_fixture_leases_expiry_idx
  ON mmg_commerce_rehearsal_fixture_leases (expires_at)
  WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS mmg_commerce_runtime_control_receipts (
  receipt_id text PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  release_id text,
  control_code text NOT NULL,
  requested_mode text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('applied', 'rejected', 'failed')),
  provider_reference_hash text,
  error_code text,
  requested_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(receipt_id) BETWEEN 8 AND 128),
  CHECK (provider_reference_hash IS NULL OR provider_reference_hash ~ '^[a-f0-9]{64}$'),
  CHECK (outcome <> 'failed' OR error_code IS NOT NULL),
  CHECK (completed_at >= requested_at)
);

CREATE INDEX IF NOT EXISTS mmg_commerce_runtime_control_receipts_lookup_idx
  ON mmg_commerce_runtime_control_receipts
    (environment, control_code, completed_at DESC);

COMMIT;
