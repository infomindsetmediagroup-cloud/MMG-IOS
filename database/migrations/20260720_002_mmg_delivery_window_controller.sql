BEGIN;

ALTER TABLE mmg_entitlement_windows
  DROP CONSTRAINT IF EXISTS mmg_entitlement_windows_status_check;

ALTER TABLE mmg_entitlement_windows
  ADD CONSTRAINT mmg_entitlement_windows_status_check
  CHECK (
    status IN (
      'scheduled',
      'open',
      'confirmed',
      'delivery_ready',
      'delivered',
      'closed',
      'expired',
      'canceled',
      'recovery_required'
    )
  );

ALTER TABLE mmg_entitlement_windows
  ADD COLUMN IF NOT EXISTS fallback_policy text NOT NULL DEFAULT 'manual_recovery',
  ADD COLUMN IF NOT EXISTS proposal_source text,
  ADD COLUMN IF NOT EXISTS proposal_rationale text,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_reason text,
  ADD COLUMN IF NOT EXISTS delivery_dispatch_id text,
  ADD COLUMN IF NOT EXISTS delivery_reference text,
  ADD COLUMN IF NOT EXISTS delivery_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

ALTER TABLE mmg_entitlement_windows
  DROP CONSTRAINT IF EXISTS mmg_entitlement_windows_fallback_policy_check;

ALTER TABLE mmg_entitlement_windows
  ADD CONSTRAINT mmg_entitlement_windows_fallback_policy_check
  CHECK (
    fallback_policy IN (
      'manual_recovery',
      'auto_confirm_current_selection'
    )
  );

ALTER TABLE mmg_entitlement_windows
  DROP CONSTRAINT IF EXISTS mmg_entitlement_windows_delivery_state_check;

ALTER TABLE mmg_entitlement_windows
  ADD CONSTRAINT mmg_entitlement_windows_delivery_state_check
  CHECK (
    (status <> 'delivery_ready' OR (delivery_dispatch_id IS NOT NULL AND delivery_ready_at IS NOT NULL))
    AND
    (status <> 'delivered' OR (delivery_dispatch_id IS NOT NULL AND delivery_reference IS NOT NULL AND delivered_at IS NOT NULL))
    AND
    (status <> 'recovery_required' OR recovery_reason IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS mmg_entitlement_windows_delivery_dispatch_idx
  ON mmg_entitlement_windows (delivery_dispatch_id)
  WHERE delivery_dispatch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mmg_entitlement_windows_controller_action_idx
  ON mmg_entitlement_windows (status, opens_at, closes_at, package_sequence);

CREATE TABLE IF NOT EXISTS mmg_delivery_controller_runs (
  run_id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(run_id) BETWEEN 8 AND 128),
  CHECK (status = 'running' OR finished_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mmg_delivery_controller_runs_status_idx
  ON mmg_delivery_controller_runs (status, started_at DESC);

COMMIT;
