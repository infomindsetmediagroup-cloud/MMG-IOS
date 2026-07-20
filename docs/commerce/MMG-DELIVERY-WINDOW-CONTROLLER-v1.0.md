# MMG Delivery Window Controller v1.0

**Status:** Approved for staging  
**Authority:** `registry/knowledge-library/mmg-delivery-window-controller-contract-v1.json`  
**Previous dependency:** MMG Entitlement Counter and Ownership-Resolution Persistence  
**Next dependency:** Customer Portal subscription dashboard

## Purpose

The MMG Delivery Window Controller turns an active Shopify subscription period into a deterministic sequence of two-asset package windows. It controls cycle creation, package scheduling, first-package onboarding, future-package curation, customer review windows, expiry behavior, recovery, delivery dispatch, and delivery acknowledgement.

Shopify remains authoritative for recurring billing. Kairos remains authoritative for package scheduling, eligibility, curation, entitlement consumption, ownership, delivery, and customer progress.

## Locked Plans

| Plan | Monthly price | Packages per billing cycle | Assets per package | Assets per billing cycle | Open offsets |
|---|---:|---:|---:|---:|---|
| Monthly | $14.95 | 1 | 2 | 2 | Day 0 |
| Bi-weekly | $24.95 | 2 | 2 | 4 | Days 0 and 14 |
| Weekly | $39.95 | 4 | 2 | 8 | Days 0, 7, 14, and 21 |

The Weekly plan always creates four packages. A five-week calendar month does not create a fifth package or increase the eight-asset entitlement.

## First Package

The first package is different from all later packages:

1. It opens immediately after subscription activation and cycle reconciliation.
2. It contains two entitlement units.
3. The customer chooses both titles in the Knowledge Library.
4. Kairos does not auto-confirm this package.
5. If the customer does not finish within the review window, the package moves to `recovery_required`.
6. An authorized Kairos or support operation may reopen it for another 24–48 hours.

This protects explicit customer choice during onboarding.

## Future Packages

Every later package is a `scheduled_package_review` window:

1. The controller opens it at the locked plan offset.
2. Kairos proposes exactly two current eligible titles.
3. Owned assets, incomplete delivery packages, and ineligible titles are excluded.
4. The customer may accept, remove, replace, or confirm the titles.
5. The default review period is 48 hours, with an allowed range of 24–48 hours.
6. At expiry, the exact current two-title package is auto-confirmed only after full eligibility, ownership, capacity, and version revalidation.
7. Incomplete or invalid packages move to `recovery_required` rather than consuming entitlement incorrectly.

## Temporary Deterministic Curator

The controller includes a deterministic fallback curator so the lifecycle can be tested before the full Kairos recommendation-ranking system exists.

It chooses an exact title-and-unit combination using:

1. Series ascending.
2. Series order ascending.
3. Title ascending.

The fallback does not weaken eligibility. It receives only current server-eligible candidates and the repository revalidates the complete proposal before opening the window.

## Lifecycle

Primary path:

```text
scheduled
→ open
→ confirmed
→ delivery_ready
→ delivered
```

Exception and recovery states:

```text
closed
expired
canceled
recovery_required
```

A `recovery_required` window may be reopened as a `manual_recovery_window` by an authorized internal operation.

## Controller Tick

The logical internal endpoint is:

```text
POST /api/internal/knowledge-library/delivery-windows/run
```

The controller is server-to-server only. It is not a public customer endpoint.

A `tick` performs this sequence:

1. Claim the unique run ID.
2. Load active subscription entitlements with reconciled Shopify period dates.
3. Create or resolve the current billing cycle.
4. Create the exact package windows for the plan.
5. Open due first-package windows without curation.
6. Curate and open due future-package windows.
7. Apply expiry policy to overdue open windows.
8. Queue confirmed packages for delivery.
9. Record conflicts, recovery requirements, failures, and lifecycle events.
10. Finish the run with a persisted summary.

Repeated run IDs are idempotent no-ops.

## Delivery Dispatch

Confirmation remains an atomic entitlement transaction. It creates confirmed selections, delivery grants, ownership grants, cycle accounting, and audit history.

The delivery controller then:

1. Sends the confirmed window to an idempotent dispatcher keyed by window ID.
2. Stores the returned dispatch ID.
3. Moves the window to `delivery_ready`.
4. Accepts an internal delivery acknowledgement with a customer-visible delivery reference.
5. Moves the window to `delivered`.

A delivery dispatcher must be idempotent because a worker may retry after an uncertain network result.

## Cycle Rollover

A billing cycle is identified by:

```text
subscription_entitlement_id + current_period_start
```

The period dates and plan code come from Shopify subscription reconciliation. Cycle creation and package-window creation are idempotent.

When a new period is reconciled:

- Prior active or scheduled cycles ending at or before the new period start are completed.
- The new cycle receives the exact package and asset capacity of the reconciled plan.
- A plan change affects the new period; it does not rewrite historical cycles.

## Persistence

Migration:

```text
database/migrations/20260720_002_mmg_delivery_window_controller.sql
```

The migration adds:

- `delivery_ready`, `delivered`, and `recovery_required` statuses.
- Fallback-policy metadata.
- Proposal source and rationale.
- Open, expiry, recovery, dispatch, readiness, and delivery timestamps.
- Delivery dispatch and delivery references.
- The idempotent `mmg_delivery_controller_runs` table.
- Actionable-window and dispatch indexes.

## Security

- Require internal server authorization for all controller actions.
- Never accept customer, subscription, cycle, plan capacity, or entitlement totals from the browser.
- Use parameterized SQL.
- Lock window and entitlement rows during state changes.
- Use window versions for concurrent writes.
- Use run IDs, picker request IDs, window IDs, and dispatch IDs for idempotency.
- Return `no-store, private` responses.
- Write audit events for every recovery, dispatch, delivery, and controller failure.

## Deployment Boundary

The controller is implemented in source control but is not live. Activation requires:

1. Applying both entitlement database migrations.
2. Connecting the production PostgreSQL pool.
3. Reconciling live Shopify subscription contracts and period dates.
4. Connecting the internal handler to a protected scheduled runtime.
5. Implementing an idempotent delivery dispatcher and delivery acknowledgement adapter.
6. Verifying at least two selectable digital assets for each package.
7. Running real PostgreSQL concurrency, expiry, rollback, and retry tests.
8. Enabling alerts for stale windows, recovery-required states, queue failures, and controller-run failures.

## Next Build

The Customer Portal subscription dashboard will consume the entitlement counter and delivery-window state to show:

- Current plan and billing period.
- Next package date.
- Current review-window countdown.
- Package progress and title selections.
- Delivery-ready and delivered packages.
- Recovery-required actions.
- My Library and membership-management pathways.
