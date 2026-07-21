# MMG Commerce Staging Integration v1.0

## Purpose

This build converts the existing operations and rehearsal framework into an executable staging integration boundary. It applies the commerce schemas through a hash-verified ledger, mounts protected staging control routes, uses distinct credentials per authority, provides durable runtime controls, and executes the isolated SEV1/SEV2 rehearsal without authorizing Shopify publication or live customer traffic.

## Execution sequence

1. Check out the exact release commit.
2. Run TypeScript, test, Shopify-governance, and canonical service-product validation.
3. Reconcile migrations 001–011 against the staging PostgreSQL database.
4. Register the exact staging release ID and commit SHA for release-bound rehearsal evidence.
5. Deploy and mount the staging integration runtime.
6. Configure five distinct server credentials and separate Admin Portal authentication.
7. Configure nonproduction alert destinations and all host adapters.
8. Record exact-release healthy heartbeats for database, routes, controls, alerts, scheduler, dispatcher, storage signer, and Admin authentication.
9. Bootstrap the canonical safe controls and Paused 0% rollout state.
10. Run the database-connectivity SEV1 and webhook-failure SEV2 drills.
11. Run the consistency audit and Paused → Internal → Pilot → Limited → Expanded → Full rehearsal using the isolated virtual clock.
12. Compare customer-rights digests before and after the rehearsal.
13. Verify the exact release and archive sanitized evidence.

## Migration discipline

`scripts/mmg-commerce-apply-migrations.sh` is staging-only. It requires the database URL, exact release ID, exact 40-character commit SHA, and migration actor. The runner:

- acquires one PostgreSQL session advisory lock;
- creates the migration ledger before applying the historical migrations;
- calculates SHA-256 for every migration file;
- fails if an applied migration has another hash;
- applies each missing migration in canonical order;
- records the hash and actor only after the migration succeeds;
- never echoes the database URL; and
- never performs an automatic down migration.

After migration reconciliation, `scripts/mmg-commerce-register-staging-release.sh` records the exact staging release identity in the deployment ledger. It fails closed when an existing release ID belongs to another environment or commit SHA. Registration authorizes rehearsal evidence storage only; it does not execute deployment phases or authorize publication.

## Runtime authorities

The staging composition root separates:

- commerce operations;
- staging integration control;
- rehearsal operator;
- rehearsal fixture adapter;
- runtime control; and
- Admin Portal authentication.

All five server credentials must be at least 32 characters and mutually distinct. The Admin Portal continues to use an authenticated operator session rather than a server credential.

## Safe state

The safe staging baseline is:

| Control | Mode |
|---|---|
| Product publication | Disabled |
| Subscription checkout | Disabled |
| Webhook ingestion | Enabled |
| Delivery scheduler | Disabled |
| Delivery dispatcher | Disabled |
| Recommendation automation | Observe only |
| Signed library access | Disabled |
| Thank-you handoff | Observe only |
| Rollout | Paused, 0% |

Webhook evidence ingestion cannot be disabled. Product publication cannot be enabled through this control plane.

## Cohort policy

Internal access uses a configured allowlist of SHA-256 customer-reference hashes. Pilot, Limited, Expanded, and Full use a deterministic release-bound SHA-256 bucket against hashed customer references. Raw customer identifiers are rejected and are never stored by the policy evaluator.

## Rehearsal fixture

The fixture executor stores an isolated staging fixture namespace and virtual clock. It may override only the approved incident signals and isolated healthy recovery baseline. Route availability, entitlement consistency, and ownership uniqueness continue to use real staging evidence.

The customer-rights digest is calculated in PostgreSQL with `pgcrypto` across active ownership, active delivery grants, delivered windows, and active entitlements. Any count or digest difference fails the rehearsal.

## Verification

The staging integration endpoint supports `inspect`, `bootstrap`, and `verify`. Verification requires:

- all 11 migration ledger entries;
- every configured route probe successful;
- eight exact-release healthy adapter heartbeats no more than 15 minutes old;
- exact safe controls;
- Paused 0% rollout for the exact release;
- complete release-bound rehearsal evidence;
- no publication capability; and
- no live-customer capability.

## Workflow

`.github/workflows/mmg-commerce-staging-integration.yml` supports `plan`, `execute`, `verify`, and `rehearse`. It uses the `mmg-commerce-staging` GitHub Environment, checks out the exact commit, installs dependencies without assuming a lockfile, reconciles and registers the staging release for execution actions, calls protected endpoints with environment secrets, and uploads sanitized JSON evidence for 30 days.

## Non-actions

Merging this source does not:

- connect a staging database;
- apply any migration;
- register a staging release;
- deploy a runtime;
- configure secrets or alert destinations;
- register heartbeats;
- execute the rehearsal;
- mutate Shopify;
- enable checkout;
- expose a customer cohort; or
- publish the subscription product.

Those actions require the staging environment and its protected providers.
