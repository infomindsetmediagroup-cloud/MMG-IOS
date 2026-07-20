BEGIN;

CREATE TABLE IF NOT EXISTS mmg_commerce_release_approvals (
  approval_id text PRIMARY KEY,
  release_id text NOT NULL,
  approved_environment text NOT NULL CHECK (approved_environment IN ('staging', 'production')),
  approved_actions text[] NOT NULL,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  release_commit_sha text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired', 'consumed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(approval_id) BETWEEN 8 AND 128),
  CHECK (char_length(release_id) BETWEEN 8 AND 128),
  CHECK (release_commit_sha ~ '^[a-f0-9]{40}$'),
  CHECK (expires_at > approved_at),
  CHECK (cardinality(approved_actions) >= 1),
  CHECK (approved_actions <@ ARRAY['execute', 'publish', 'rollback']::text[])
);

CREATE INDEX IF NOT EXISTS mmg_commerce_release_approvals_active_idx
  ON mmg_commerce_release_approvals
    (release_id, approved_environment, release_commit_sha, approved_at DESC)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS mmg_commerce_releases (
  release_id text PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  release_commit_sha text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('planned', 'running', 'verified', 'published', 'failed', 'rolling_back', 'rolled_back')
  ),
  current_phase text,
  release_version integer NOT NULL DEFAULT 1 CHECK (release_version >= 1),
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  verified_at timestamptz,
  published_at timestamptz,
  rolled_back_at timestamptz,
  CHECK (char_length(release_id) BETWEEN 8 AND 128),
  CHECK (release_commit_sha ~ '^[a-f0-9]{40}$')
);

CREATE INDEX IF NOT EXISTS mmg_commerce_releases_environment_idx
  ON mmg_commerce_releases (environment, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_release_steps (
  release_id text NOT NULL REFERENCES mmg_commerce_releases(release_id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (
    phase IN (
      'preflight',
      'application_scopes',
      'database_migrations',
      'runtime_routes',
      'shopify_product',
      'selling_plan',
      'asset_registry',
      'storefront_components',
      'webhook_release',
      'scheduler_and_dispatcher',
      'end_to_end_verification',
      'publication'
    )
  ),
  status text NOT NULL CHECK (
    status IN ('pending', 'blocked', 'ready', 'running', 'completed', 'failed', 'rolled_back', 'not_applicable')
  ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, phase)
);

CREATE INDEX IF NOT EXISTS mmg_commerce_release_steps_status_idx
  ON mmg_commerce_release_steps (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_deployment_requests (
  request_id text PRIMARY KEY,
  release_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('plan', 'execute', 'verify', 'publish', 'rollback')),
  payload_sha256 text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  first_received_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK (char_length(request_id) BETWEEN 8 AND 128),
  CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (status <> 'failed' OR error_code IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mmg_commerce_deployment_requests_release_idx
  ON mmg_commerce_deployment_requests (release_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS mmg_shopify_runtime_mappings (
  shop_domain text NOT NULL,
  mapping_key text NOT NULL DEFAULT 'mmg-knowledge-subscription',
  api_version text NOT NULL,
  product_gid text,
  monthly_variant_gid text,
  biweekly_variant_gid text,
  weekly_variant_gid text,
  selling_plan_group_gid text,
  selling_plan_gid text,
  online_store_publication_gid text,
  product_status text CHECK (product_status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  source_release_id text REFERENCES mmg_commerce_releases(release_id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_domain, mapping_key),
  CHECK (shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  CHECK (api_version ~ '^20[0-9]{2}-(01|04|07|10)$'),
  CHECK (product_gid IS NULL OR product_gid LIKE 'gid://shopify/Product/%'),
  CHECK (monthly_variant_gid IS NULL OR monthly_variant_gid LIKE 'gid://shopify/ProductVariant/%'),
  CHECK (biweekly_variant_gid IS NULL OR biweekly_variant_gid LIKE 'gid://shopify/ProductVariant/%'),
  CHECK (weekly_variant_gid IS NULL OR weekly_variant_gid LIKE 'gid://shopify/ProductVariant/%'),
  CHECK (selling_plan_group_gid IS NULL OR selling_plan_group_gid LIKE 'gid://shopify/SellingPlanGroup/%'),
  CHECK (selling_plan_gid IS NULL OR selling_plan_gid LIKE 'gid://shopify/SellingPlan/%'),
  CHECK (online_store_publication_gid IS NULL OR online_store_publication_gid LIKE 'gid://shopify/Publication/%')
);

CREATE TABLE IF NOT EXISTS mmg_commerce_e2e_runs (
  run_id text PRIMARY KEY,
  release_id text NOT NULL REFERENCES mmg_commerce_releases(release_id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  status text NOT NULL CHECK (status IN ('running', 'passed', 'failed')),
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  test_order_id_sha256 text,
  test_customer_reference_sha256 text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(run_id) BETWEEN 8 AND 128),
  CHECK (test_order_id_sha256 IS NULL OR test_order_id_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (test_customer_reference_sha256 IS NULL OR test_customer_reference_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (status <> 'passed' OR completed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mmg_commerce_e2e_runs_release_idx
  ON mmg_commerce_e2e_runs (release_id, started_at DESC);

CREATE TABLE IF NOT EXISTS mmg_commerce_release_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  release_id text NOT NULL,
  event_type text NOT NULL,
  actor_id text,
  phase text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mmg_commerce_release_events_release_idx
  ON mmg_commerce_release_events (release_id, occurred_at DESC);

COMMIT;
