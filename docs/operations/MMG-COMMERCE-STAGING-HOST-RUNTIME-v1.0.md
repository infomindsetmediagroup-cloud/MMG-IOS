# MMG Commerce Staging Host Runtime v1.0

## Purpose

This component provides the isolated Cloudflare Worker that hosts the MMG commerce operations, staging-readiness, staging-integration, rehearsal, runtime-control, and Admin operations surfaces. It connects to the isolated PostgreSQL database through Hyperdrive and forwards the remaining governed commerce API routes to a staging-only upstream Worker through a Cloudflare service binding.

It does not replace the existing production Worker and does not authorize Shopify publication, subscription checkout, production data, or live customer traffic.

## Runtime topology

```text
GitHub Environment: mmg-commerce-staging
        |
        v
MMG Commerce Staging Runtime Deploy
        |
        +--> Cloudflare Worker: mmg-commerce-staging
        |       |
        |       +--> HYPERDRIVE --> isolated staging PostgreSQL
        |       |
        |       +--> MMG_COMMERCE_UPSTREAM --> staging-only commerce API Worker
        |       |
        |       +--> nonproduction alert/provider health endpoints
        |
        +--> exact-release health verification
```

The upstream service name must end in `-staging`. Upload and deployment are blocked when this service binding is absent. This prevents the host from silently forwarding commerce traffic to a production Worker.

## Host-owned routes

The host directly owns:

- `/healthz`
- `/api/internal/healthz`
- `/api/internal/commerce/operations`
- `/api/admin/commerce/operations`
- `/api/internal/commerce/staging-readiness`
- `/api/internal/commerce/staging-integration`
- `/api/internal/commerce/provider-heartbeats/refresh`
- `/api/internal/commerce/rehearsal`
- `/api/internal/commerce/rehearsal/adapter`
- `/api/internal/runtime-controls/control`
- `/api/internal/runtime-controls/rollout`

The staging upstream must mount the governed Knowledge Library, entitlement, Customer Portal, My Library, learning-profile, Thank-you, webhook, delivery-window, and deployment handlers. Placeholder routes are not an acceptable upstream implementation.

## PostgreSQL through Hyperdrive

`MMGCloudflareHyperdriveDatabase` implements the canonical transactional database interface using `node-postgres` and the Cloudflare Hyperdrive `connectionString` binding.

Each operation:

- creates one short-lived PostgreSQL client;
- applies connection and statement timeouts;
- sets a release-identifiable application name;
- closes the client after completion; and
- uses one client for `BEGIN`, work, `COMMIT`, or `ROLLBACK`.

The raw database URL is never placed in Worker variables. Migration workflows continue to use the protected staging database URL; the deployed Worker receives only the Hyperdrive binding.

## Credential boundaries

The Worker requires encrypted secrets for:

1. Operations
2. Staging integration
3. Rehearsal operator
4. Rehearsal adapter
5. Runtime control
6. Admin dashboard authentication
7. Provider health
8. Alert destinations

The first five are validated by the staging integration runtime. Admin authentication is a separate bearer boundary. Provider health uses a separate credential for the remote health surfaces. Real values are uploaded from the protected GitHub Environment with `--secrets-file`, stored only as Worker secrets, removed from the runner after deployment, and never included in artifacts.

## Provider heartbeat refresh

```text
POST /api/internal/commerce/provider-heartbeats/refresh
```

The endpoint requires:

- the internal request marker;
- the staging integration credential; and
- same-origin validation whenever an Origin header is present.

It records eight durable exact-release health signals:

- database
- runtime routes
- runtime controls
- alerts
- scheduler
- dispatcher
- storage signer
- Admin authentication

Remote provider health is accepted only when the response is successful and identifies the same release through JSON `releaseId` or `X-MMG-Release-Id`. A release mismatch is degraded. A missing or unreachable provider is unavailable.

## Scheduled monitor

A 15-minute cron trigger is declared, but the monitor is disabled by default. The deploy workflow must receive `monitor_enabled=true` before scheduled heartbeat refresh and operations evaluation execute.

This avoids enabling autonomous monitoring before the staging providers and database are connected.

## Deployment workflow

`.github/workflows/mmg-commerce-staging-runtime-deploy.yml` supports:

- `validate`: compile and dry-run the Worker bundle;
- `upload`: create an immutable Worker version without serving it; and
- `deploy`: deploy the isolated Worker and verify its exact release identity.

Every action checks out the exact 40-character release commit. Upload and deployment require the Hyperdrive ID, the staging-only upstream service binding, Cloudflare credentials, all Worker secrets, and the protected `mmg-commerce-staging` GitHub Environment.

The deployment evidence contains no secret values. It records only release identity, configured binding names, provider-presence booleans, monitor state, and safe-boundary flags.

## Integration sequence

The corrected staging integration sequence is:

1. Deploy the staging upstream Worker.
2. Deploy the staging host Worker.
3. Run the local protected-environment preflight.
4. Apply migrations 001–011.
5. Register the exact staging release.
6. Bootstrap canonical safe controls and Paused 0% rollout.
7. Refresh all eight exact-release provider heartbeats.
8. Run protected runtime readiness.
9. Execute the isolated SEV1/SEV2 and rollout rehearsal.
10. Verify exact-release integration evidence.
11. Return to Paused 0%.

The prior ordering required post-bootstrap database and control evidence before the bootstrap step itself. The workflow now removes that circular dependency while retaining the fail-closed local preflight before any migration.

## Safety boundary

The host always reports:

```json
{
  "publicationAllowed": false,
  "liveCustomerDataAllowed": false
}
```

It does not:

- mutate Shopify;
- enable checkout;
- publish the subscription product;
- connect to a production database;
- bind to a production upstream;
- expose a live customer cohort;
- revoke delivered ownership; or
- deploy itself without the protected workflow action.

## Infrastructure still required

Merging this source does not create:

- a Cloudflare Hyperdrive configuration;
- an isolated PostgreSQL database;
- the staging upstream Worker;
- provider health endpoints;
- Worker secrets;
- GitHub Environment secrets or variables; or
- a Cloudflare deployment.

Those resources must be configured before running `validate`, `upload`, or `deploy`.
