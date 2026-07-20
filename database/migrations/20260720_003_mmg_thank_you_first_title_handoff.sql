BEGIN;

CREATE TABLE IF NOT EXISTS mmg_subscription_order_links (
  shop_domain text NOT NULL,
  order_id text NOT NULL,
  checkout_token_hash text NOT NULL,
  customer_id text,
  subscription_entitlement_id uuid REFERENCES mmg_subscription_entitlements(id) ON DELETE SET NULL,
  plan_code text NOT NULL CHECK (plan_code IN ('monthly', 'biweekly', 'weekly')),
  link_status text NOT NULL DEFAULT 'pending' CHECK (link_status IN ('pending', 'linked', 'failed')),
  verified_at timestamptz NOT NULL,
  linked_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_domain, order_id),
  CHECK (char_length(shop_domain) BETWEEN 3 AND 255),
  CHECK (char_length(order_id) BETWEEN 8 AND 255),
  CHECK (checkout_token_hash ~ '^[a-f0-9]{64}$'),
  CHECK (link_status <> 'linked' OR (subscription_entitlement_id IS NOT NULL AND customer_id IS NOT NULL AND linked_at IS NOT NULL)),
  CHECK (link_status <> 'failed' OR failure_reason IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS mmg_subscription_order_links_entitlement_idx
  ON mmg_subscription_order_links (subscription_entitlement_id)
  WHERE subscription_entitlement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mmg_subscription_order_links_customer_idx
  ON mmg_subscription_order_links (customer_id, link_status, verified_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mmg_subscription_order_links_pending_idx
  ON mmg_subscription_order_links (link_status, verified_at)
  WHERE link_status = 'pending';

CREATE TABLE IF NOT EXISTS mmg_thank_you_handoff_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shop_domain text NOT NULL,
  order_id text NOT NULL,
  customer_id text,
  handoff_state text NOT NULL CHECK (
    handoff_state IN (
      'not_applicable',
      'sign_in_required',
      'activation_pending',
      'ready',
      'selection_in_progress',
      'recovery_required',
      'completed',
      'error'
    )
  ),
  session_token_id_hash text,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (shop_domain, order_id)
    REFERENCES mmg_subscription_order_links(shop_domain, order_id)
    ON DELETE CASCADE,
  CHECK (session_token_id_hash IS NULL OR session_token_id_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS mmg_thank_you_handoff_events_order_idx
  ON mmg_thank_you_handoff_events (shop_domain, order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mmg_thank_you_handoff_events_customer_idx
  ON mmg_thank_you_handoff_events (customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

COMMIT;
