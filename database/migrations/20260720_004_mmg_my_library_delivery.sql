BEGIN;

CREATE TABLE IF NOT EXISTS mmg_asset_delivery_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES mmg_knowledge_assets(asset_id) ON DELETE CASCADE,
  access_kind text NOT NULL CHECK (access_kind IN ('read', 'download', 'instructions')),
  display_name text NOT NULL,
  download_name text NOT NULL,
  media_type text NOT NULL,
  storage_provider text NOT NULL,
  storage_object_key text NOT NULL,
  file_size_bytes bigint CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  checksum_sha256 text,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, access_kind, storage_provider, storage_object_key),
  CHECK (char_length(display_name) BETWEEN 1 AND 255),
  CHECK (char_length(download_name) BETWEEN 1 AND 255),
  CHECK (char_length(media_type) BETWEEN 3 AND 255),
  CHECK (char_length(storage_provider) BETWEEN 2 AND 64),
  CHECK (char_length(storage_object_key) BETWEEN 1 AND 2048),
  CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS mmg_asset_delivery_files_primary_active_idx
  ON mmg_asset_delivery_files (asset_id, access_kind)
  WHERE status = 'active' AND is_primary = TRUE;

CREATE INDEX IF NOT EXISTS mmg_asset_delivery_files_asset_idx
  ON mmg_asset_delivery_files (asset_id, status, access_kind, sort_order);

CREATE TABLE IF NOT EXISTS mmg_library_access_requests (
  request_id text PRIMARY KEY,
  customer_id text NOT NULL,
  asset_id text NOT NULL REFERENCES mmg_knowledge_assets(asset_id) ON DELETE RESTRICT,
  access_kind text NOT NULL CHECK (access_kind IN ('read', 'download')),
  file_id uuid REFERENCES mmg_asset_delivery_files(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'granted', 'denied', 'failed')),
  signed_url_expires_at timestamptz,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(request_id) BETWEEN 8 AND 128),
  CHECK (status <> 'granted' OR (file_id IS NOT NULL AND signed_url_expires_at IS NOT NULL)),
  CHECK (status NOT IN ('denied', 'failed') OR failure_code IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mmg_library_access_requests_customer_idx
  ON mmg_library_access_requests (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mmg_library_access_requests_asset_idx
  ON mmg_library_access_requests (asset_id, access_kind, created_at DESC);

CREATE TABLE IF NOT EXISTS mmg_library_access_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id text NOT NULL REFERENCES mmg_library_access_requests(request_id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  asset_id text NOT NULL REFERENCES mmg_knowledge_assets(asset_id) ON DELETE RESTRICT,
  access_kind text NOT NULL CHECK (access_kind IN ('read', 'download')),
  event_type text NOT NULL CHECK (event_type IN ('access_requested', 'access_granted', 'access_denied', 'access_failed')),
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mmg_library_access_events_customer_idx
  ON mmg_library_access_events (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mmg_library_access_events_asset_idx
  ON mmg_library_access_events (asset_id, access_kind, created_at DESC);

COMMIT;
