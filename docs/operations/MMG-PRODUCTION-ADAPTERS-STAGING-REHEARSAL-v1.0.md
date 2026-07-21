# MMG Production Adapters and Staging Rehearsal v1.0

## Purpose

This build connects the previously abstract MMG commerce operations control plane to concrete production-shaped adapters while preserving the staging-first release boundary. It provides source-controlled wiring for PostgreSQL telemetry, authenticated runtime probes, reversible kill switches, hashed alert delivery evidence, release-bound verification, internal authentication, Admin Portal authentication, and a deterministic staging incident-and-rollout rehearsal.

It does not apply migrations, deploy routes, configure credentials, mutate Shopify, use live customer data, activate checkout, or publish the subscription product.

## Production composition root

`server/operations/production-operations-runtime.ts` assembles:

- `MMGPostgresCommerceOperationsRepository`
- `MMGCompositeCommerceMetricsAdapter`
- `MMGPostgresCommerceProductionTelemetry`
- `MMGHTTPCommerceRouteProbe`
- `MMGHTTPCommerceControlAdapter`
- `MMGWebhookCommerceAlertAdapter`
- `MMGPostgresCommerceAlertDeliveryStore`
- `MMGPostgresRolloutEvidenceAdapter`
- the protected operations HTTP handler
- the authenticated read-only Admin Portal operations handler

The composition root exposes only redacted configuration. The internal bearer credential is never returned.

## Required runtime configuration

| Variable | Purpose |
|---|---|
| `MMG_COMMERCE_ENVIRONMENT` | `staging` or `production` |
| `MMG_COMMERCE_RELEASE_ID` | Active immutable commerce release |
| `MMG_COMMERCE_RUNTIME_ORIGIN` | HTTPS runtime origin |
| `MMG_COMMERCE_INTERNAL_TOKEN` | Server-to-server credential, minimum 32 characters |
| `MMG_COMMERCE_REQUEST_TIMEOUT_MS` | Bounded outbound timeout, 1–30 seconds |
| `MMG_COMMERCE_ROUTE_PROBE_PATHS` | Optional comma-separated route override |
| `MMG_COMMERCE_ALERT_DESTINATIONS` | Comma-separated `channel=https://...` mappings |

Credentials, database URLs, Shopify tokens, storage signing keys, alert secrets, and destination URLs remain environment-managed secrets and must not be committed.

## Telemetry wiring

The PostgreSQL adapter reads the durable commerce tables created by migrations 001–009. It measures:

1. Database connectivity.
2. Authenticated route availability.
3. Webhook failure rate and oldest processing age.
4. Subscription reconciliation lag.
5. Scheduler freshness.
6. Delivery dispatcher backlog and delivery-related recovery rate.
7. Secure My Library access failures.
8. Entitlement overdraw and referential-integrity failures.
9. Duplicate active ownership.
10. Release-bound end-to-end evidence age.

Missing evidence remains unknown rather than healthy.

## Route probing

The route probe uses the internal bearer credential and bounded timeouts. The following statuses prove that a route exists:

- 2xx
- 3xx
- 401
- 403
- 405

A 404, server error, timeout, or network failure marks the route unavailable. An authorization rejection still proves the route is deployed without treating private data as accessible.

## Runtime controls

The control adapter posts to:

```text
POST /api/internal/runtime-controls/control
POST /api/internal/runtime-controls/rollout
```

It can disable checkout, stop scheduling, drain dispatch, put recommendations or Thank-you handling into observe-only mode, and move rollout to a governed stage. It cannot disable webhook evidence ingestion or enable product publication.

Every provider implementation must persist a runtime-control receipt without storing credentials or raw provider responses.

## Alert delivery

The alert adapter sends sanitized incident and signal payloads to configured HTTPS destinations. It persists only:

- destination SHA-256 hash
- provider-reference SHA-256 hash
- channel
- delivery status
- bounded error code
- timestamps and attempt count

SEV1 and SEV2 destinations cannot be silently omitted or suppressed. Missing or failed mandatory delivery causes the monitor operation to fail visibly after the incident and containment records have been persisted.

## Staging rehearsal

The protected logical endpoint is:

```text
POST /api/internal/commerce/rehearsal
```

The runner talks to an isolated staging-fixture adapter at:

```text
POST /api/internal/commerce/rehearsal/adapter
```

The adapter must reject production, publication, and live-customer flags.

### Required drill sequence

1. Capture the pre-drill customer-rights digest.
2. Bootstrap the safe paused state.
3. Inject a database-connectivity SEV1 condition.
4. Verify SEV1 creation, checkout disablement, scheduler shutdown, dispatcher drain-only mode, and rollout pause.
5. Clear and review recovery.
6. Inject a webhook-failure SEV2 condition.
7. Verify SEV2 creation and continued webhook-ingestion evidence.
8. Clear and review recovery.
9. Run the full consistency audit.
10. Rehearse Paused → Internal → Pilot → Limited → Expanded → Full.
11. Enforce 24/24/48/72/72-hour observation requirements in the isolated rehearsal clock.
12. Verify the post-drill customer-rights digest exactly matches the baseline.
13. Persist release-bound evidence and tear down fixtures.

### Safety invariants

- Staging only.
- No production Shopify resources.
- No live customer data.
- No publication action.
- No delivered-ownership revocation.
- One fixture lease at a time.
- Fixture approvals are not production approvals.
- Teardown removes only rehearsal fixtures.

## Persistence

Migration `20260721_010_mmg_production_adapters_staging_rehearsal.sql` adds:

- adapter heartbeats
- rehearsal runs
- rehearsal checks
- exclusive fixture leases
- runtime-control receipts

Rehearsal evidence is keyed to the exact release ID. Each check is unique by run and check code.

## Activation sequence

1. Apply migrations 001–010 in staging.
2. Deploy the operations, Admin Portal operations, rehearsal, rehearsal-adapter, and runtime-control routes.
3. Connect the PostgreSQL pool.
4. Configure the internal credential through the staging secret manager.
5. Connect real runtime-control boundaries.
6. Configure nonproduction alert destinations.
7. Connect the Admin Portal operator-session authenticator.
8. Verify all adapter heartbeats.
9. Run the complete staging rehearsal for the exact release.
10. Review evidence, incidents, controls, alert receipts, consistency results, and rights digest.
11. Keep production paused until a separate approved release action begins.

## Current boundary

This repository build provides the adapters, contracts, persistence, workflow, and rehearsal runner. The first real staging rehearsal cannot be claimed complete until the staging database, routes, secrets, alert providers, fixture namespace, runtime controls, and Admin authentication are deployed and connected.
