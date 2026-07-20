# MMG Entitlement Counter and Ownership Persistence v1.0

**Status:** Approved for staging  
**Authority:** `registry/knowledge-library/mmg-entitlement-ownership-persistence-contract-v1.json`  
**Migration:** `database/migrations/20260720_001_mmg_knowledge_entitlements.sql`

## Purpose

This build turns the Knowledge Library picker from an in-memory domain workflow into a durable commerce subsystem. It establishes persistent subscription contracts, billing cycles, package windows, title selections, idempotency keys, delivery grants, ownership grants, and audit events.

The same build supplies the reusable MMG Entitlement Counter for the Knowledge Library and future Customer Portal surfaces.

## Locked Plan Accounting

| Plan | Monthly price | Packages per billing cycle | Assets per package | Assets per billing cycle |
|---|---:|---:|---:|---:|
| Monthly | $14.95 | 1 | 2 | 2 |
| Bi-weekly | $24.95 | 2 | 2 | 4 |
| Weekly | $39.95 | 4 | 2 | 8 |

Every plan bills monthly. Package cadence is controlled by Kairos inside the monthly billing cycle.

## Durable Data Model

### `mmg_knowledge_assets`

A server-side projection of verified Shopify and Kairos asset metadata. It carries the canonical asset ID, product identity, discovery fields, media readiness, subscription value, delivery-package reference, and release state.

### `mmg_subscription_entitlements`

One durable record per Shopify subscription contract. It maps the authenticated customer to the locked plan and current subscription status.

### `mmg_entitlement_cycles`

One record per monthly billing cycle. It stores total packages, confirmed packages, total units, consumed units, and an independent version.

### `mmg_entitlement_windows`

One record per scheduled package. It stores package sequence, window type, open/close state, target title count, unit capacity, timestamps, and optimistic-concurrency version.

### `mmg_entitlement_selections`

The selected, reserved, or confirmed assets inside one package window. The primary key prevents the same asset from appearing twice in one window.

### `mmg_picker_requests`

Persistent request IDs used for idempotent select, remove, and confirm commands. The repository retains the most recent 100 IDs per window.

### `mmg_delivery_grants`

The transactional record that authorizes delivery of a verified package for a confirmed subscription selection.

### `mmg_ownership_grants`

The durable source of truth for My Library and subscription exclusion. Active ownership is keyed by customer ID and canonical asset ID.

### `mmg_entitlement_events`

Append-only operational audit events for picker state saves and package confirmation.

## Ownership Resolution

A customer owns an asset when an active, non-revoked grant exists for:

```text
customer_id + asset_id
```

Supported grant sources are:

- One-time purchase
- Subscription delivery
- Bonus
- Administrative grant

The database preserves grant history, while the customer-facing library displays one entry per canonical asset ID.

An already-owned asset is excluded from the picker and does not consume additional subscription units.

## Entitlement Counter

The reusable counter displays:

- Current plan
- Billing-cycle dates
- Assets remaining
- Packages completed
- Current package progress
- Total owned digital assets
- Monthly entitlement progress

Cycle remaining capacity is calculated as:

```text
remaining units = total units - selected units - reserved units - confirmed units
```

Overdraft is prohibited.

## Picker Repository

`MMGPostgresEntitlementOwnershipRepository` implements the existing `MMGPickerStateRepository` boundary.

### Load

The repository resolves the authenticated customer's:

- Active subscription entitlement
- Current open, scheduled, or recently confirmed package window
- Catalog projection
- Active ownership grants
- Current selections
- Recent idempotency keys

### Save

The repository:

1. Locks the entitlement window row.
2. Verifies `expectedPreviousVersion`.
3. Updates the window and selections.
4. Persists recent request IDs.
5. Finalizes grants when the state transitions to confirmed.
6. Writes an audit event.
7. Commits or rolls back the complete transaction.

A stale version returns `version_conflict` without partial writes.

## Confirmation Transaction

Confirmation revalidates every selected title while holding the authoritative database transaction.

The transaction rejects confirmation when:

- The title count is incorrect.
- Unit consumption is incomplete or excessive.
- A title is missing or no longer active.
- A title is not a digital download.
- Subscription eligibility has been removed.
- Required portrait or square media is missing.
- The delivery package is missing or unverified.
- The customer already owns a selected title.
- The cycle lacks package or asset capacity.
- A delivery or ownership grant conflicts.

On success, the same transaction:

- Confirms the window.
- Persists confirmed selections and request IDs.
- Creates one delivery grant per title.
- Creates one active ownership grant per title.
- Increments cycle package and unit counters.
- Writes the entitlement event.

## Entitlement Endpoint

Logical endpoint:

```text
GET /api/knowledge-library/entitlement
```

Requirements:

- Customer identity comes from the authenticated server session.
- Responses are private and non-cacheable.
- Browser-supplied customer or entitlement identifiers are ignored.
- The endpoint returns the counter and owned-asset total only after authorization.

## Shopify Component

Files:

```text
shopify/snippets/mmg-entitlement-counter.liquid
shopify/assets/mmg-entitlement-counter.js
shopify/assets/mmg-entitlement-counter.css
shopify/knowledge-library/mmg-entitlement-counter-integration.liquid
```

The component refreshes after picker-ready, selection-updated, and package-confirmed events. It never treats its displayed totals as the source of truth.

## Runtime Adapter

The repository does not import a specific PostgreSQL vendor package. `MMGPostgresDatabase` accepts a pool compatible with the standard `query`, `connect`, `BEGIN`, `COMMIT`, `ROLLBACK`, and `release` pattern.

This keeps the domain layer portable across approved PostgreSQL providers while ensuring the concrete connection remains server-only.

## Release Sequence

1. Review and back up the production database.
2. Apply the migration in staging.
3. Connect the server-only PostgreSQL pool.
4. Reconcile Shopify subscription contracts into entitlement records.
5. Synchronize verified digital assets into the asset projection.
6. Create the first billing cycle and first-package window.
7. Connect picker and entitlement handlers to authenticated API routes.
8. Test concurrent select, remove, confirm, and retry behavior against real PostgreSQL.
9. Confirm transactional delivery and ownership grants.
10. Integrate the counter and picker into the captured Knowledge Library source.
11. Complete authorization, accessibility, mobile, backup, and rollback QA.

## Next Build

**MMG Delivery Window Controller**

It will create and advance the first package and recurring package windows, enforce the 24–48-hour review period, schedule Monthly/Bi-weekly/Weekly package cadence, handle expiration and recovery, and trigger Kairos curation for future deliveries.
