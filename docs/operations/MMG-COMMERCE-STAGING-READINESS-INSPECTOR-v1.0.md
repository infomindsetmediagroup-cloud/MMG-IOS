# MMG Commerce Staging Readiness Inspector v1.0

## Purpose

The readiness inspector is the mandatory read-only gate before any staging `execute` or `rehearse` action. It identifies missing infrastructure, credentials, routes, provider evidence, tooling, and safe-state controls without applying migrations, registering a release, mutating Shopify, or enabling customer traffic.

## Surfaces

- Local inspector: `scripts/mmg-commerce-staging-readiness.mjs`
- Runtime endpoint: `POST /api/internal/commerce/staging-readiness`
- Workflow: `.github/workflows/mmg-commerce-staging-readiness.yml`
- Governing contract: `registry/deployment/mmg-commerce-staging-readiness-contract-v1.json`

The local inspection validates the protected GitHub Environment and repository execution surface. The runtime inspection validates the deployed staging environment. Both must return `ready` with zero blockers.

## Local checks

The local CLI verifies:

- staging-only environment;
- exact release ID and 40-character commit SHA;
- checked-out commit identity;
- required repository scripts, workflow, and contracts;
- Node.js 22 or newer;
- `psql` and `sha256sum` availability;
- required protected values;
- five distinct server credentials of at least 32 characters;
- PostgreSQL URL syntax;
- HTTPS runtime and endpoint origins;
- staging-specific HTTPS alert destinations;
- explicit Admin authentication, scheduler, dispatcher, and storage-signer declarations.

It writes only sanitized evidence. Credential values, database URLs, alert URLs, and customer identifiers are excluded.

## Runtime checks

The authenticated runtime inspector verifies:

- configured release ID and commit match the requested release;
- staging PostgreSQL connectivity and server version;
- `pgcrypto` availability;
- migration-ledger availability and applied migration IDs;
- credential-aware route reachability;
- fresh, healthy, exact-release adapter heartbeats;
- required alert channels;
- canonical safe controls;
- Paused rollout at 0%;
- publication and live-customer capability remain false.

A private route is considered mounted when it returns a `2xx`, `3xx`, `401`, `403`, or `405`. A `404`, `5xx`, timeout, or network failure blocks readiness.

## Required adapters

The following adapters must report a healthy heartbeat for the exact release no more than 15 minutes before inspection:

1. Database
2. Runtime routes
3. Runtime controls
4. Alerts
5. Scheduler
6. Dispatcher
7. Storage signer
8. Admin authentication

Missing heartbeat evidence is `unknown` and blocks readiness.

## Canonical safe state

| Control | Required mode |
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

## Database staging nuance

Before the first controlled `execute`, the migration ledger and migrations may be absent. Those conditions are reported as warnings rather than blockers so the inspector can authorize the controlled migration step. PostgreSQL connectivity and `pgcrypto` remain mandatory blockers.

After `execute`, the existing integration verification continues to require all migrations `001–011` through the SHA-256 ledger.

## Workflow behavior

The readiness workflow:

1. Checks out the exact requested commit.
2. Installs Node.js 22 and PostgreSQL client tooling.
3. Runs the local inspector against the protected `mmg-commerce-staging` environment.
4. Calls the protected runtime endpoint only when local inspection passes.
5. Uploads sanitized local and runtime reports for 30 days.
6. Fails unless both reports are ready with zero blockers and both safety flags remain false.

The workflow does not trigger the execute or rehearsal workflows automatically.

## Non-actions

The inspector does not:

- apply migrations;
- register a release;
- bootstrap or change runtime controls;
- inject an incident;
- run a rollout rehearsal;
- mutate Shopify;
- enable checkout;
- expose a customer cohort;
- publish the subscription product.
