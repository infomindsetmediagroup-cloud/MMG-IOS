# MMG Entitlement Counter and Ownership Persistence — QA Contract

**Version:** 1.0.0  
**Status:** Staging required before publication

## Database Migration

- Migration runs successfully on an empty PostgreSQL staging database.
- Migration runs without destructive changes when the schema already exists.
- Every foreign key, check constraint, unique index, and partial unique index is present.
- One active subscription entitlement is allowed per customer.
- One open package window is allowed per billing cycle.
- One active ownership grant is allowed per customer and asset.
- One delivery grant is allowed per window and asset.
- One request ID is allowed per window.
- Database backup and rollback procedures are validated before production migration.

## Locked Plan Accounting

- Monthly cycle stores 1 package and 2 units.
- Bi-weekly cycle stores 2 packages and 4 units.
- Weekly cycle stores 4 packages and 8 units.
- Every package targets 2 titles and 2 units.
- A cycle whose totals do not match its locked plan is rejected by the counter domain.
- Five-week calendar months do not increase Weekly entitlement beyond 8 assets.

## Ownership Resolution

- Active one-time purchase grants create ownership.
- Active subscription-delivery grants create ownership.
- Active bonus and administrative grants create ownership.
- Pending grants do not create ownership.
- Revoked grants do not create ownership.
- Future-dated grants do not create ownership before their grant time.
- Multiple historical grants resolve to one customer-facing asset.
- Owned assets are excluded from subscription selection.
- Ownership joins on canonical `asset_id`, never title or handle.

## Picker Repository Load

- Customer identity is derived from the authenticated principal.
- The active subscription entitlement is resolved server-side.
- The correct current window is selected using open, scheduled, then confirmed priority.
- Catalog rows map into picker assets with complete canonical metadata.
- Active ownership grants populate `ownedAssetIds`.
- Selections load with exact units, state, and timestamp.
- The most recent 100 request IDs load for idempotency.
- Missing active entitlement or package window returns no picker state.

## Versioned Save

- The window row is locked before mutation.
- The current version must equal `expectedPreviousVersion`.
- A stale version returns `version_conflict`.
- No selection or grant writes survive a version conflict.
- Window version increments exactly once per changed picker command.
- Selections removed by the state machine are deleted from persistence.
- Existing selections update without creating duplicates.
- Request IDs are inserted idempotently and trimmed to 100 per window.

## Confirmation Transaction

- Exact target title count is required.
- Exact total unit consumption is required.
- Duplicate title IDs are rejected.
- Missing catalog records are rejected.
- Non-digital products are rejected.
- Inactive, unpublished, unavailable, or retired assets are rejected.
- Assets without subscription eligibility are rejected.
- Missing portrait or square media is rejected.
- Missing or unverified delivery packages are rejected.
- Subscription-value changes are revalidated.
- Assets becoming owned during review are rejected.
- Cycle package and unit capacity is locked and revalidated.
- One delivery grant is created per confirmed title.
- One active ownership grant is created per confirmed title.
- Cycle counters increment once.
- Confirmation audit event is written.
- Any grant or capacity conflict rolls back the complete transaction.
- Retrying a committed request ID is an idempotent no-op.

## Entitlement Counter

- Counter shows exact plan name and monthly entitlement.
- Remaining cycle units equal total minus selected, reserved, and confirmed units.
- Delivered units never display above total cycle units.
- Confirmed package count never exceeds total packages.
- Current-window priority is open, scheduled, confirmed, closed, expired, canceled.
- Current window shows selected title count, target count, units remaining, and version.
- No active cycle returns the authorized empty-entitlement response.

## Entitlement API

- Only GET is accepted.
- Unauthenticated requests return 401.
- Missing active entitlement returns 404.
- Successful responses are private and `no-store`.
- Response includes `X-Content-Type-Options: nosniff`.
- Response varies by authenticated cookie.
- Browser-supplied customer, cycle, subscription, or window identity is not used.
- Unexpected repository errors return a generic retryable 500 response without internal details.

## Shopify Counter Component

- Loading state is announced through the live region.
- Authenticated active subscribers see plan, cycle, packages, assets, window, and owned total.
- Unauthenticated customers receive the Customer Portal handoff.
- Customers without an entitlement receive the Membership handoff.
- Picker-ready, selection-updated, and package-confirmed events refresh the counter.
- All dynamic content uses `textContent` rather than HTML injection.
- Progressbar `aria-valuenow` and `aria-valuetext` update accurately.
- Focus-visible states are present.
- Mobile layout is single-column at 640 px and below.
- Reduced-motion mode removes nonessential animation.
- No `100vw`, negative-margin breakout, global body mutation, or `#MainContent` override is introduced.

## Real PostgreSQL Concurrency Tests

- Two selects using the same expected window version result in one success and one conflict.
- Two confirmation attempts result in one committed grant set.
- A purchase grant arriving before confirmation causes confirmation rollback.
- A cycle-capacity update racing with confirmation causes rollback or version conflict, not overdraw.
- A lost HTTP response followed by request replay returns the committed state without duplicate grants.
- Transaction rollback leaves window, cycle, selections, grants, and audit events mutually consistent.

## Publication Gate

Do not activate the picker or entitlement counter for live subscribers until the migration is applied, the production SQL pool and authenticated API adapters are connected, Shopify contracts are reconciled, at least two verified assets are selectable, transactional concurrency tests pass, and backup plus grant-repair procedures are approved.
