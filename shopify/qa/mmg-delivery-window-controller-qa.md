# MMG Delivery Window Controller — QA Contract

**Contract:** `registry/knowledge-library/mmg-delivery-window-controller-contract-v1.json`  
**Status:** Production activation blocked pending runtime integration

## Plan Scheduling

- Monthly creates exactly one package and two assets per billing cycle.
- Bi-weekly creates exactly two packages and four assets per billing cycle.
- Weekly creates exactly four packages and eight assets per billing cycle.
- Weekly package openings occur at days 0, 7, 14, and 21 from the reconciled period start.
- Five-week calendar months do not create a fifth Weekly package.
- Every package contains exactly two units and targets exactly two titles.
- A cycle whose package or unit totals do not match the locked plan is rejected.

## First Package

- The first subscription cycle creates Package 1 as `first_package`.
- The first package opens without a curated proposal.
- The customer is directed to Choose Your First Two Titles.
- The first package is never auto-confirmed.
- An expired first package moves to `recovery_required`.
- Reopening recovery requires internal authorization and a 24–48-hour duration.
- Reopening fails when another package is already open in the same cycle.

## Future Package Curation

- Every later package is `scheduled_package_review`.
- Exactly two titles and two units are proposed.
- Owned titles are excluded.
- Inactive, unpublished, unavailable, retired, non-digital, or non-subscription titles are excluded.
- Missing portrait media, square media, or delivery-package references block curation.
- Duplicate titles are rejected.
- Proposal unit totals must equal the package unit total.
- The repository revalidates the complete proposal inside the open-window transaction.
- No valid complete proposal moves the package to `recovery_required`.

## Review Window

- Review duration is at least 24 hours and at most 48 hours.
- The default duration is 48 hours.
- The customer may remove and replace unconfirmed proposed titles.
- Early customer confirmation uses the existing picker confirmation transaction.
- A complete future package may auto-confirm at expiry.
- Auto-confirmation revalidates ownership, eligibility, title count, units, and window version.
- Failed auto-confirmation moves the package to recovery rather than partially consuming entitlement.

## Lifecycle

Validate these transitions:

```text
scheduled → open
open → confirmed
confirmed → delivery_ready
delivery_ready → delivered
scheduled/open/confirmed/delivery_ready → recovery_required where allowed
recovery_required → open through authorized recovery
```

Reject direct or invalid transitions such as:

```text
scheduled → delivered
open → delivery_ready
delivered → open
canceled → open
```

## Cycle Reconciliation

- Customer and subscription identity come from server-side Shopify reconciliation.
- Period start, period end, and plan code are present before cycle creation.
- Cycle identity is idempotent by subscription entitlement and period start.
- Repeated reconciliation creates no duplicate cycle or package windows.
- Previous cycles ending before the new period are completed.
- Historical cycles are not rewritten after a plan change.

## Controller Runs

- Every tick requires an 8–128-character run ID.
- A repeated run ID performs no duplicate work.
- Run status and summary are persisted.
- Batch size is constrained to 1–500.
- A single window action failure is recorded with an audit event.
- Conflicts are counted and do not silently overwrite a newer window version.
- Controller failures trigger operational alerts.

## Delivery

- Confirmed packages are queued by an idempotent dispatcher keyed by window ID.
- A returned dispatch ID is unique and persisted.
- The window moves to `delivery_ready` only after queue acceptance.
- Delivery acknowledgement requires an internal delivery reference.
- Acknowledgement moves `delivery_ready` to `delivered`.
- Repeated acknowledgement is an idempotent no-op.
- Queue failures do not mark a package delivered.
- Delivery and ownership grants remain traceable to the confirmed window.

## Security

- The internal endpoint is not accessible without server-to-server authorization.
- Only POST is accepted.
- Request bodies larger than 16 KB are rejected.
- Invalid JSON is rejected.
- Customer, subscription, cycle, capacity, and entitlement identity are not accepted from browser input.
- SQL values are parameterized.
- State-changing transactions use `FOR UPDATE` and expected versions.
- Internal responses use `Cache-Control: no-store, private`.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer` are present.

## Database Migration

- Back up the target database before applying the migration.
- Confirm the existing entitlement migration is applied first.
- Confirm the expanded status check accepts all canonical lifecycle states.
- Confirm the delivery-state constraint prevents incomplete delivery metadata.
- Confirm the unique open-window index remains valid.
- Confirm the dispatch ID partial unique index is created.
- Confirm the controller-run table rejects duplicate run IDs.
- Test rollback on migration failure.

## Real-Database Concurrency

Run against production-equivalent PostgreSQL:

1. Two workers attempt to open the same scheduled window.
2. Two workers attempt expiry auto-confirmation.
3. Customer confirmation races with expiry auto-confirmation.
4. Delivery queue retry races with another controller tick.
5. Recovery reopening races with a newly opened scheduled window.
6. A Shopify plan change arrives during cycle reconciliation.
7. A title becomes owned between curation and open-window commit.
8. A title becomes ineligible between review and auto-confirmation.

Exactly one valid transition must commit in every case.

## Publication Gate

Do not activate live scheduling until:

- Both database migrations are applied and verified.
- Shopify subscription reconciliation is operational.
- The protected scheduler invokes the internal endpoint.
- The delivery dispatcher is idempotent.
- Delivery acknowledgement is operational.
- At least two verified eligible assets are available.
- Real-database concurrency and rollback tests pass.
- Recovery and grant-repair procedures are documented.
- Monitoring and alerts are active.
