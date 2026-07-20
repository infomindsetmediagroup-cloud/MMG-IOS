BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS mmg_knowledge_assets (
  asset_id text PRIMARY KEY,
  shopify_product_id text NOT NULL UNIQUE,
  handle text NOT NULL UNIQUE,
  title text NOT NULL,
  product_url text NOT NULL,
  topic text NOT NULL,
  experience_level text NOT NULL CHECK (experience_level IN ('beginner', 'intermediate', 'advanced', 'all_levels')),
  digital_format text NOT NULL CHECK (digital_format IN ('book', 'guide', 'template', 'workbook', 'toolkit', 'prompt_pack', 'resource_pack')),
  series text,
  series_order integer CHECK (series_order IS NULL OR series_order >= 1),
  portrait_cover_url text NOT NULL DEFAULT '',
  square_thumbnail_url text NOT NULL DEFAULT '',
  summary text,
  product_type text NOT NULL CHECK (product_type IN ('digital_download', 'service', 'subscription')),
  asset_status text NOT NULL CHECK (asset_status IN ('draft', 'approved', 'active', 'retired')),
  published boolean NOT NULL DEFAULT false,
  available boolean NOT NULL DEFAULT false,
  catalog_visible boolean NOT NULL DEFAULT false,
  subscription_eligible boolean NOT NULL DEFAULT false,
  subscription_value integer NOT NULL DEFAULT 1 CHECK (subscription_value >= 1),
  portrait_cover_present boolean NOT NULL DEFAULT false,
  square_thumbnail_present boolean NOT NULL DEFAULT false,
  delivery_package_verified boolean NOT NULL DEFAULT false,
  delivery_package_reference text,
  customer_destination text NOT NULL CHECK (customer_destination IN ('my_library', 'my_projects', 'subscription_dashboard')),
  metadata_version integer NOT NULL DEFAULT 1 CHECK (metadata_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT subscription_eligible OR product_type = 'digital_download'),
  CHECK (NOT delivery_package_verified OR delivery_package_reference IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mmg_knowledge_assets_catalog_idx
  ON mmg_knowledge_assets (catalog_visible, subscription_eligible, asset_status);
CREATE INDEX IF NOT EXISTS mmg_knowledge_assets_discovery_idx
  ON mmg_knowledge_assets (topic, experience_level, digital_format);

CREATE TABLE IF NOT EXISTS mmg_subscription_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  provider text NOT NULL DEFAULT 'shopify',
  provider_contract_id text NOT NULL UNIQUE,
  plan_code text NOT NULL CHECK (plan_code IN ('monthly', 'biweekly', 'weekly')),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'paused', 'canceled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mmg_subscription_entitlements_one_active_customer_idx
  ON mmg_subscription_entitlements (customer_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS mmg_subscription_entitlements_customer_idx
  ON mmg_subscription_entitlements (customer_id, status);

CREATE TABLE IF NOT EXISTS mmg_entitlement_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_entitlement_id uuid NOT NULL REFERENCES mmg_subscription_entitlements(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('scheduled', 'active', 'completed', 'canceled')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  total_packages integer NOT NULL CHECK (total_packages >= 1),
  confirmed_packages integer NOT NULL DEFAULT 0 CHECK (confirmed_packages >= 0),
  total_units integer NOT NULL CHECK (total_units >= 1),
  consumed_units integer NOT NULL DEFAULT 0 CHECK (consumed_units >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_entitlement_id, starts_at),
  CHECK (ends_at > starts_at),
  CHECK (confirmed_packages <= total_packages),
  CHECK (consumed_units <= total_units)
);

CREATE INDEX IF NOT EXISTS mmg_entitlement_cycles_subscription_idx
  ON mmg_entitlement_cycles (subscription_entitlement_id, status, starts_at DESC);

CREATE TABLE IF NOT EXISTS mmg_entitlement_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES mmg_entitlement_cycles(id) ON DELETE CASCADE,
  package_sequence integer NOT NULL CHECK (package_sequence >= 1),
  window_type text NOT NULL CHECK (window_type IN ('first_package', 'scheduled_package_review', 'manual_recovery_window')),
  status text NOT NULL CHECK (status IN ('scheduled', 'open', 'confirmed', 'closed', 'expired', 'canceled')),
  total_units integer NOT NULL CHECK (total_units >= 1),
  target_asset_count integer NOT NULL CHECK (target_asset_count >= 1),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  opens_at timestamptz,
  closes_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, package_sequence),
  CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at),
  CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mmg_entitlement_windows_cycle_idx
  ON mmg_entitlement_windows (cycle_id, status, package_sequence);
CREATE UNIQUE INDEX IF NOT EXISTS mmg_entitlement_windows_one_open_cycle_idx
  ON mmg_entitlement_windows (cycle_id)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS mmg_entitlement_selections (
  window_id uuid NOT NULL REFERENCES mmg_entitlement_windows(id) ON DELETE CASCADE,
  asset_id text NOT NULL REFERENCES mmg_knowledge_assets(asset_id) ON DELETE RESTRICT,
  units integer NOT NULL CHECK (units >= 1),
  state text NOT NULL CHECK (state IN ('selected', 'reserved', 'confirmed')),
  selected_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (window_id, asset_id)
);

CREATE INDEX IF NOT EXISTS mmg_entitlement_selections_asset_idx
  ON mmg_entitlement_selections (asset_id, state);

CREATE TABLE IF NOT EXISTS mmg_picker_requests (
  window_id uuid NOT NULL REFERENCES mmg_entitlement_windows(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (window_id, request_id),
  CHECK (char_length(request_id) BETWEEN 8 AND 128)
);

CREATE INDEX IF NOT EXISTS mmg_picker_requests_recent_idx
  ON mmg_picker_requests (window_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mmg_delivery_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES mmg_entitlement_cycles(id) ON DELETE RESTRICT,
  window_id uuid NOT NULL REFERENCES mmg_entitlement_windows(id) ON DELETE RESTRICT,
  customer_id text NOT NULL,
  asset_id text NOT NULL REFERENCES mmg_knowledge_assets(asset_id) ON DELETE RESTRICT,
  units integer NOT NULL CHECK (units >= 1),
  delivery_package_reference text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
  granted_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (window_id, asset_id),
  CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mmg_delivery_grants_customer_idx
  ON mmg_delivery_grants (customer_id, status, granted_at DESC);
CREATE INDEX IF NOT EXISTS mmg_delivery_grants_cycle_idx
  ON mmg_delivery_grants (cycle_id, status);

CREATE TABLE IF NOT EXISTS mmg_ownership_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  asset_id text NOT NULL REFERENCES mmg_knowledge_assets(asset_id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('one_time_purchase', 'subscription_delivery', 'bonus', 'administrative')),
  source_reference text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
  granted_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, asset_id, source, source_reference),
  CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS mmg_ownership_grants_one_active_asset_idx
  ON mmg_ownership_grants (customer_id, asset_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS mmg_ownership_grants_customer_idx
  ON mmg_ownership_grants (customer_id, status, granted_at DESC);
CREATE INDEX IF NOT EXISTS mmg_ownership_grants_asset_idx
  ON mmg_ownership_grants (asset_id, status);

CREATE TABLE IF NOT EXISTS mmg_entitlement_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id text NOT NULL,
  cycle_id uuid REFERENCES mmg_entitlement_cycles(id) ON DELETE SET NULL,
  window_id uuid REFERENCES mmg_entitlement_windows(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mmg_entitlement_events_customer_idx
  ON mmg_entitlement_events (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mmg_entitlement_events_window_idx
  ON mmg_entitlement_events (window_id, created_at DESC);

COMMIT;
