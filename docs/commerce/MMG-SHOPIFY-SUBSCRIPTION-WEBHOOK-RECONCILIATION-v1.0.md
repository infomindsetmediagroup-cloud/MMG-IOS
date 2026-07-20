# MMG Shopify Subscription Webhook Reconciliation v1.0

**Status:** Approved for staging  
**Endpoint:** `POST /api/shopify/webhooks/subscriptions`  
**Shopify API version:** `2026-07`  
**Required scope:** `read_own_subscription_contracts`  
**Authority:** `registry/shopify/mmg-subscription-webhook-reconciliation-contract-v1.json`

## Objective

Connect Shopify's authoritative subscription-contract and billing events to the MMG entitlement system. This component converts a verified Shopify subscription into durable customer membership state, exact billing-cycle capacity, delivery windows, Thank-you order linkage, and Customer Portal visibility.

The webhook payload is a trigger and correlation envelope. It is not the final source of truth. After HMAC verification, Kairos reloads the complete `SubscriptionContract` through the Shopify Admin GraphQL API and validates the canonical product, variant, selling plan, customer, billing policy, delivery policy, currency, quantity, and current period before mutating entitlements.

## Accepted topics

- `subscription_contracts/create`
- `subscription_contracts/update`
- `subscription_billing_attempts/success`
- `subscription_billing_attempts/failure`
- `subscription_billing_attempts/challenged`

All five topics use one app-specific webhook subscription and one reconciliation endpoint.

## Request trust boundary

The HTTP handler performs this sequence:

1. Accept `POST` only and enforce a 64 KiB body limit.
2. Read the exact raw request body.
3. Verify `X-Shopify-Hmac-Sha256` with HMAC-SHA256 and constant-time comparison.
4. Validate the webhook ID, shop domain, topic, API version, and triggered-at headers.
5. Restrict the request to the configured canonical `myshopify.com` domain.
6. Claim the webhook ID in the durable inbox using the payload SHA-256 hash.
7. Load the authoritative subscription contract through Admin GraphQL.
8. Validate the contract against the provisioned MMG runtime mapping.
9. Reconcile all dependent records in one PostgreSQL transaction.
10. Mark the delivery processed, ignored, or retryable-failed.

A processed duplicate returns HTTP 200 without another mutation. The same webhook ID with a different payload hash is treated as a collision and rejected.

## Canonical contract validation

The authoritative contract must contain exactly one nonshipping line with:

- The provisioned `MMG Knowledge Subscription™` product GID.
- One of the three provisioned variant GIDs.
- The provisioned shared monthly selling-plan GID.
- Quantity `1`.
- Currency `USD`.
- Monthly billing and monthly Shopify delivery policies.

The variant maps to the locked MMG plan:

| Plan | Monthly price | Packages | Assets | Package offsets |
|---|---:|---:|---:|---|
| Monthly | $14.95 | 1 | 2 | Day 0 |
| Bi-weekly | $24.95 | 2 | 4 | Days 0 and 14 |
| Weekly | $39.95 | 4 | 8 | Days 0, 7, 14, and 21 |

Every package consumes exactly two asset units. Weekly remains four packages even when the calendar month contains five weekly dates.

## Status mapping

| Shopify contract status | MMG entitlement status |
|---|---|
| `ACTIVE` | `active` |
| `PAUSED` | `paused` |
| `FAILED` | `failed` |
| `CANCELLED` | `canceled` |
| `EXPIRED` | `expired` |

Paused and terminal contracts cancel future scheduled cycles. Already delivered ownership grants remain durable.

## Cycle and window creation

A cycle is keyed by `subscription_entitlement_id + current_period_start`. Repeated contract and billing webhooks therefore converge on the same period instead of duplicating capacity.

The first package of the first-ever cycle is a customer-selected `first_package`. It uses manual recovery fallback and can open immediately for a 48-hour selection window. Later package windows are `scheduled_package_review` windows governed by the existing delivery-window controller.

No cycle is created unless:

- The authoritative contract is active.
- Both current-period boundaries are available and valid.
- The product, variant, selling plan, policy, and currency checks pass.

## Thank-you handoff linkage

The initial Thank-you extension records a verified pending order link. Reconciliation links that row to the durable entitlement only when the shop domain, origin order ID, and plan code match. Once linked and the first window exists, the Thank-you handoff can progress from activation pending to **Choose Your First Two Titles**.

A missing Thank-you link does not block entitlement creation because subscription webhooks may arrive independently or after retries. The link can be repaired later without duplicating the entitlement.

## Billing attempt behavior

Billing attempts are idempotent by `shop_domain + idempotency_key`.

- **Success:** records the billing result and permits idempotent cycle creation from the authoritative period.
- **Failure:** records failure metadata but does not fabricate paid capacity.
- **Challenged:** records the challenged state without granting a new cycle.
- **Terminal precedence:** a succeeded attempt cannot be downgraded by a duplicate failure or challenge.

## Persistence

Migration `20260720_005_mmg_shopify_subscription_reconciliation.sql` adds:

- `mmg_shopify_webhook_deliveries`
- `mmg_shopify_subscription_contracts`
- `mmg_shopify_subscription_billing_attempts`
- Shopify reconciliation fields on `mmg_subscription_entitlements`

The raw webhook body, app secret, Admin API token, and signed customer file URLs are never persisted.

## Failure semantics

Permanent noncanonical events return HTTP 200 with an ignored outcome so Shopify does not retry an event that can never become valid. Examples include an unrelated product, unrecognized variant, wrong selling plan, wrong currency, or incompatible contract policy.

Temporary failures return a non-2xx response and remain retryable. Examples include PostgreSQL unavailability, missing contract propagation, Admin API failure, or temporary token-provider failure.

## Publication boundary

This repository implementation is staging source. Production activation requires:

1. Protected subscription API access.
2. `read_own_subscription_contracts` on the deployed app.
3. Provisioned product, variant, and selling-plan GIDs.
4. A deployed app-specific webhook manifest.
5. The endpoint routed through the live Kairos runtime.
6. A secure Shopify Admin token provider.
7. Production PostgreSQL migrations 001–005.
8. End-to-end HMAC, replay, stale-event, billing, cycle, Customer Portal, and Thank-you QA.

No live registration or subscription mutation is authorized by this source merge alone.
