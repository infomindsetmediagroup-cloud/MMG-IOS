# MMG Shopify Subscription Webhook Reconciliation QA

**Status:** Staging checklist  
**Endpoint:** `/api/shopify/webhooks/subscriptions`  
**API version:** `2026-07`

## App and access gates

- [ ] Protected subscription API access is approved for the deployed Shopify app.
- [ ] `read_own_subscription_contracts` is present in the granted scopes.
- [ ] The app-specific webhook manifest is merged into the deployed `shopify.app.toml`.
- [ ] All five canonical topics are registered against the same endpoint.
- [ ] The canonical product, three variants, and shared selling plan have verified runtime GIDs.
- [ ] The production app secret and Admin token provider are server-only.

## Request verification

- [ ] A valid raw-body HMAC passes.
- [ ] A modified body with the original HMAC returns 401.
- [ ] A missing or malformed HMAC returns 401.
- [ ] The handler reads the raw body before JSON parsing.
- [ ] Non-POST methods return 405 with `Allow: POST`.
- [ ] Bodies above 64 KiB return 413.
- [ ] Malformed JSON returns 400 only after valid HMAC verification.
- [ ] An unsupported topic returns 400.
- [ ] A different shop domain returns 403.
- [ ] An unexpected Shopify API version returns a retryable 409.
- [ ] Responses are private and non-cacheable.

## Inbox and idempotency

- [ ] The first webhook ID is claimed once.
- [ ] A processed duplicate returns 200 and performs no mutation.
- [ ] A retryable failed delivery can reclaim its inbox record.
- [ ] The same webhook ID with a different payload SHA-256 is rejected.
- [ ] The raw webhook body is not stored.
- [ ] Billing attempts are unique by shop domain and idempotency key.
- [ ] A succeeded billing attempt cannot be downgraded by a duplicate failure or challenge.

## Authoritative contract reload

- [ ] Contract-create payload reloads the contract by GraphQL ID.
- [ ] Contract-update payload reloads the current contract revision.
- [ ] Billing-attempt payload reloads the associated contract.
- [ ] Missing contract propagation returns a retryable failure.
- [ ] Admin API outage returns a retryable failure.
- [ ] Missing shop token returns a retryable failure.
- [ ] A payload customer, origin order, or revision mismatch is rejected.
- [ ] Exactly one contract line is required.
- [ ] The line must be nonshipping and quantity one.
- [ ] Product, variant, and selling-plan GIDs must match the provisioned runtime mapping.
- [ ] Currency must be USD.
- [ ] Billing and Shopify delivery policies must both be monthly.

## Status reconciliation

- [ ] `ACTIVE` maps to `active`.
- [ ] `PAUSED` maps to `paused`.
- [ ] `FAILED` maps to `failed`.
- [ ] `CANCELLED` maps to `canceled`.
- [ ] `EXPIRED` maps to `expired`.
- [ ] A provider contract cannot move to another customer ID.
- [ ] A newer revision supersedes an older revision.
- [ ] An older revision is ignored without rolling back customer state.
- [ ] Equal revisions use Shopify triggered-at ordering.
- [ ] A valid canonical plan change updates future authoritative capacity without rewriting historical cycles.

## Entitlement cycles and windows

- [ ] Monthly creates one package window and two asset units.
- [ ] Bi-weekly creates two package windows at days 0 and 14 and four asset units.
- [ ] Weekly creates four package windows at days 0, 7, 14, and 21 and eight asset units.
- [ ] Every package window has exactly two asset units and a target count of two.
- [ ] A five-week calendar month never creates a fifth Weekly package.
- [ ] Repeated webhooks for the same period do not duplicate the cycle.
- [ ] The first package of the first cycle is `first_package` with manual recovery fallback.
- [ ] The first package may open immediately for 48 hours.
- [ ] Later packages are `scheduled_package_review` windows.
- [ ] Paused, failed, canceled, and expired contracts cancel future scheduled cycles.
- [ ] Existing delivered ownership grants are not revoked.

## Billing attempts

- [ ] A success event records order and ready state.
- [ ] A success event can create the authoritative current-period cycle idempotently.
- [ ] A failure event records error code/message and does not fabricate paid capacity.
- [ ] A challenged event records the challenge and does not fabricate paid capacity.
- [ ] Billing timestamps and latest failure metadata appear on the entitlement record.

## Thank-you and portal integration

- [ ] A matching pending order link becomes linked to the entitlement.
- [ ] Linking requires the exact shop domain, origin order ID, and plan code.
- [ ] A missing pending order link does not block entitlement creation.
- [ ] The Thank-you handoff progresses from activation pending after entitlement and first-window creation.
- [ ] Customer Portal shows active, paused, failed, canceled, and expired states safely.
- [ ] Provider contract IDs, webhook IDs, payload hashes, billing-attempt IDs, and tokens never appear in storefront responses.

## Database and recovery

- [ ] Migrations 001–005 apply in order on a clean PostgreSQL database.
- [ ] Reconciliation mutations commit atomically.
- [ ] A forced SQL failure rolls back entitlement, contract, link, billing attempt, cycle, windows, and audit event.
- [ ] Failed inbox rows retain a retryable error code without storing secrets.
- [ ] Operational logs can correlate by webhook ID without logging the raw body or access token.

## Production release

- [ ] Staging receives verified test deliveries for all five topics.
- [ ] Replay and out-of-order tests pass.
- [ ] Customer Portal and Thank-you end-to-end tests pass for all three plans.
- [ ] Executive approval is recorded before live webhook registration and production entitlement mutation.
