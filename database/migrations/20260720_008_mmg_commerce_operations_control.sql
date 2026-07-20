BEGIN;

CREATE TABLE IF NOT EXISTS mmg_commerce_operations_requests (
  request_id text PRIMARY KEY,
  action text NOT NULL CHECK (action IN (
    'inspect', 'evaluate', 'run_consistency_audit', 'acknowledge_incident',
    'apply_mitigation', 'resolve_incident', 'close_incident', 'set_control',
    'advance_rollout', 'pause_rollout'
  )),
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  first_received_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK (char_length(request_id) BETWEEN 8 AND 128),
  CHECK (status <> 'failed' OR error_code IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mmg_commerce_operations_requests_environment_idx
  ON mmg_commerce_operations_requests (environment, updated_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_monitor_runs (
  run_id text PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  release_id text,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  overall_status text CHECK (overall_status IN ('healthy', 'degraded', 'critical', 'unknown')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(run_id) BETWEEN 8 AND 200),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (status <> 'failed' OR error_code IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mmg_commerce_monitor_runs_environment_idx
  ON mmg_commerce_monitor_runs (environment, started_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_health_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id text NOT NULL UNIQUE REFERENCES mmg_commerce_monitor_runs(run_id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  release_id text,
  schema_version text NOT NULL,
  overall_status text NOT NULL CHECK (overall_status IN ('healthy', 'degraded', 'critical', 'unknown')),
  signals jsonb NOT NULL,
  evaluated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(signals) = 'array')
);

CREATE INDEX IF NOT EXISTS mmg_commerce_health_snapshots_environment_idx
  ON mmg_commerce_health_snapshots (environment, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_incidents (
  incident_id text PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  signal_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('SEV1', 'SEV2', 'SEV3', 'SEV4')),
  state text NOT NULL CHECK (state IN (
    'detected', 'acknowledged', 'mitigating', 'monitoring', 'resolved', 'closed'
  )),
  title text NOT NULL,
  summary text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  assigned_to text,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  current_mitigation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, signal_code),
  CHECK (char_length(incident_id) BETWEEN 8 AND 200)
);

CREATE INDEX IF NOT EXISTS mmg_commerce_incidents_open_idx
  ON mmg_commerce_incidents (environment, severity, last_seen_at DESC)
  WHERE state NOT IN ('resolved', 'closed');

CREATE TABLE IF NOT EXISTS mmg_commerce_incident_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id text NOT NULL REFERENCES mmg_commerce_incidents(incident_id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id text,
  from_state text,
  to_state text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mmg_commerce_incident_events_incident_idx
  ON mmg_commerce_incident_events (incident_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_controls (
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  control_code text NOT NULL CHECK (control_code IN (
    'product_publication', 'subscription_checkout', 'webhook_ingestion',
    'delivery_scheduler', 'delivery_dispatcher', 'recommendation_automation',
    'signed_library_access', 'thank_you_handoff'
  )),
  mode text NOT NULL CHECK (mode IN ('enabled', 'disabled', 'observe_only', 'drain_only')),
  reason text NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (environment, control_code)
);

CREATE TABLE IF NOT EXISTS mmg_commerce_rollout_state (
  environment text PRIMARY KEY CHECK (environment IN ('staging', 'production')),
  release_id text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('internal', 'pilot', 'limited', 'expanded', 'full', 'paused')),
  cohort_percentage numeric(5,2) NOT NULL CHECK (cohort_percentage >= 0 AND cohort_percentage <= 100),
  status text NOT NULL CHECK (status IN ('active', 'paused', 'rolled_back')),
  entered_at timestamptz NOT NULL,
  observation_until timestamptz,
  changed_by text NOT NULL,
  reason text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS mmg_commerce_rollout_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  release_id text NOT NULL,
  from_stage text,
  to_stage text NOT NULL,
  cohort_percentage numeric(5,2) NOT NULL,
  status text NOT NULL,
  changed_by text NOT NULL,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mmg_commerce_rollout_history_environment_idx
  ON mmg_commerce_rollout_history (environment, occurred_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_rollout_approvals (
  approval_id text PRIMARY KEY,
  release_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  from_stage text NOT NULL CHECK (from_stage IN ('internal', 'pilot', 'limited', 'expanded', 'full', 'paused')),
  to_stage text NOT NULL CHECK (to_stage IN ('internal', 'pilot', 'limited', 'expanded', 'full', 'paused')),
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'revoked', 'expired', 'consumed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(approval_id) BETWEEN 8 AND 128),
  CHECK (expires_at > approved_at)
);

CREATE INDEX IF NOT EXISTS mmg_commerce_rollout_approvals_lookup_idx
  ON mmg_commerce_rollout_approvals
    (release_id, environment, from_stage, to_stage, approved_at DESC)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS mmg_commerce_consistency_audits (
  audit_id text PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  release_id text,
  schema_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('passed', 'failed')),
  checks jsonb NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(audit_id) BETWEEN 8 AND 200),
  CHECK (jsonb_typeof(checks) = 'array'),
  CHECK (completed_at >= started_at)
);

CREATE INDEX IF NOT EXISTS mmg_commerce_consistency_audits_environment_idx
  ON mmg_commerce_consistency_audits (environment, completed_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_alert_deliveries (
  alert_id text PRIMARY KEY,
  incident_id text NOT NULL REFERENCES mmg_commerce_incidents(incident_id) ON DELETE CASCADE,
  channel text NOT NULL,
  destination_hash text NOT NULL CHECK (destination_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('pending', 'delivered', 'failed', 'suppressed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  provider_reference_hash text,
  last_error_code text,
  first_attempted_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz NOT NULL,
  CHECK (provider_reference_hash IS NULL OR provider_reference_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS mmg_commerce_alert_deliveries_status_idx
  ON mmg_commerce_alert_deliveries (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_operations_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  event_type text NOT NULL,
  actor_id text,
  incident_id text REFERENCES mmg_commerce_incidents(incident_id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mmg_commerce_operations_events_environment_idx
  ON mmg_commerce_operations_events (environment, occurred_at DESC);

COMMIT;
