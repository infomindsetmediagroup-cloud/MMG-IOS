BEGIN;

ALTER TABLE mmg_subscription_entitlements
  DROP CONSTRAINT IF EXISTS mmg_subscription_entitlements_status_check;

ALTER TABLE mmg_subscription_entitlements
  ADD CONSTRAINT mmg_subscription_entitlements_status_check
  CHECK (status IN ('pending', 'active', 'paused', 'failed', 'canceled', 'expired'));

ALTER TABLE mmg_subscription_entitlements
  ADD COLUMN IF NOT EXISTS shop_domain text,
  ADD COLUMN IF NOT EXISTS origin_order_id text,
  ADD COLUMN IF NOT EXISTS shopify_variant_id text,
  ADD COLUMN IF NOT EXISTS shopify_selling_plan_id text,
  ADD COLUMN IF NOT EXISTS contract_status_raw text,
  ADD COLUMN IF NOT EXISTS last_shopify_revision_id numeric(20, 0),
  ADD COLUMN IF NOT EXISTS last_shopify_triggered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_shopify_webhook_id text,
  ADD COLUMN IF NOT EXISTS last_billing_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_billing_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_billing_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_failure_code text;

ALTER TABLE mmg_subscription_entitlements
  DROP CONSTRAINT IF EXISTS mmg_subscription_entitlements_shop_domain_check;
ALTER TABLE mmg_subscription_entitlements
  ADD CONSTRAINT mmg_subscription_entitlements_shop_domain_check
  CHECK (shop_domain IS NULL OR shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$');

ALTER TABLE mmg_subscription_entitlements
  DROP CONSTRAINT IF EXISTS mmg_subscription_entitlements_contract_status_raw_check;
ALTER TABLE mmg_subscription_entitlements
  ADD CONSTRAINT mmg_subscription_entitlements_contract_status_raw_check
  CHECK (
    contract_status_raw IS NULL OR
    contract_status_raw IN ('ACTIVE', 'PAUSED', 'FAILED', 'CANCELLED', 'EXPIRED')
  );

CREATE INDEX IF NOT EXISTS mmg_subscription_entitlements_shop_contract_idx
  ON mmg_subscription_entitlements (shop_domain, provider_contract_id)
  WHERE shop_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS mmg_subscription_entitlements_webhook_state_idx
  ON mmg_subscription_entitlements (status, last_shopify_triggered_at DESC);

CREATE TABLE IF NOT EXISTS mmg_shopify_webhook_deliveries (
  webhook_id text PRIMARY KEY,
  event_id text,
  shop_domain text NOT NULL,
  topic text NOT NULL CHECK (
    topic IN (
      'subscription_contracts/create',
      'subscription_contracts/update',
      'subscription_billing_attempts/success',
      'subscription_billing_attempts/failure',
      'subscription_billing_attempts/challenged'
    )
  ),
  api_version text NOT NULL,
  triggered_at timestamptz NOT NULL,
  subscription_name text,
  payload_sha256 text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'processed', 'ignored', 'failed')),
  delivery_attempts integer NOT NULL DEFAULT 1 CHECK (delivery_attempts >= 1),
  processing_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_code text,
  retryable boolean,
  first_received_at timestamptz NOT NULL,
  last_received_at timestamptz NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(webhook_id) BETWEEN 8 AND 128),
  CHECK (event_id IS NULL OR char_length(event_id) BETWEEN 1 AND 128),
  CHECK (shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  CHECK (api_version ~ '^20[0-9]{2}-(01|04|07|10)$'),
  CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (subscription_name IS NULL OR char_length(subscription_name) <= 50),
  CHECK (status <> 'processed' OR processed_at IS NOT NULL),
  CHECK (status <> 'failed' OR failure_code IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mmg_shopify_webhook_deliveries_status_idx
  ON mmg_shopify_webhook_deliveries (status, last_received_at);
CREATE INDEX IF NOT EXISTS mmg_shopify_webhook_deliveries_contract_topics_idx
  ON mmg_shopify_webhook_deliveries (shop_domain, topic, triggered_at DESC);
CREATE INDEX IF NOT EXISTS mmg_shopify_webhook_deliveries_event_idx
  ON mmg_shopify_webhook_deliveries (event_id)
  WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mmg_shopify_subscription_contracts (
  shop_domain text NOT NULL,
  contract_id text NOT NULL,
  customer_id text NOT NULL,
  origin_order_id text NOT NULL,
  revision_id numeric(20, 0) NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED', 'FAILED', 'CANCELLED', 'EXPIRED')),
  plan_code text NOT NULL CHECK (plan_code IN ('monthly', 'biweekly', 'weekly')),
  product_id text NOT NULL,
  variant_id text NOT NULL,
  selling_plan_id text NOT NULL,
  currency_code text NOT NULL CHECK (currency_code = 'USD'),
  next_billing_date timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  contract_updated_at timestamptz NOT NULL,
  last_webhook_id text NOT NULL REFERENCES mmg_shopify_webhook_deliveries(webhook_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_domain, contract_id),
  CHECK (shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  CHECK (contract_id LIKE 'gid://shopify/SubscriptionContract/%'),
  CHECK (customer_id LIKE 'gid://shopify/Customer/%'),
  CHECK (origin_order_id LIKE 'gid://shopify/Order/%'),
  CHECK (product_id LIKE 'gid://shopify/Product/%'),
  CHECK (variant_id LIKE 'gid://shopify/ProductVariant/%'),
  CHECK (selling_plan_id LIKE 'gid://shopify/SellingPlan/%'),
  CHECK (
    current_period_start IS NULL OR
    current_period_end IS NULL OR
    current_period_end > current_period_start
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS mmg_shopify_subscription_contracts_contract_idx
  ON mmg_shopify_subscription_contracts (contract_id);
CREATE INDEX IF NOT EXISTS mmg_shopify_subscription_contracts_customer_idx
  ON mmg_shopify_subscription_contracts (customer_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS mmg_shopify_subscription_contracts_origin_order_idx
  ON mmg_shopify_subscription_contracts (shop_domain, origin_order_id);

CREATE TABLE IF NOT EXISTS mmg_shopify_subscription_billing_attempts (
  shop_domain text NOT NULL,
  idempotency_key text NOT NULL,
  contract_id text NOT NULL,
  entitlement_id uuid NOT NULL REFERENCES mmg_subscription_entitlements(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('challenged', 'succeeded', 'failed')),
  order_id text,
  ready boolean NOT NULL,
  error_code text,
  error_message text,
  webhook_id text NOT NULL REFERENCES mmg_shopify_webhook_deliveries(webhook_id) ON DELETE RESTRICT,
  triggered_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (shop_domain, idempotency_key),
  FOREIGN KEY (shop_domain, contract_id)
    REFERENCES mmg_shopify_subscription_contracts(shop_domain, contract_id)
    ON DELETE CASCADE,
  CHECK (shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  CHECK (char_length(idempotency_key) BETWEEN 8 AND 255),
  CHECK (contract_id LIKE 'gid://shopify/SubscriptionContract/%'),
  CHECK (order_id IS NULL OR order_id LIKE 'gid://shopify/Order/%'),
  CHECK (state <> 'succeeded' OR (ready = TRUE AND order_id IS NOT NULL)),
  CHECK (state <> 'failed' OR error_code IS NOT NULL OR error_message IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mmg_shopify_subscription_billing_attempts_contract_idx
  ON mmg_shopify_subscription_billing_attempts (shop_domain, contract_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS mmg_shopify_subscription_billing_attempts_entitlement_idx
  ON mmg_shopify_subscription_billing_attempts (entitlement_id, triggered_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS mmg_shopify_subscription_billing_attempts_order_idx
  ON mmg_shopify_subscription_billing_attempts (shop_domain, order_id)
  WHERE order_id IS NOT NULL AND state = 'succeeded';

COMMIT;
