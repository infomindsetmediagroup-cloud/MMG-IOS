# MMG Commerce Staging Readiness Inspector QA

## Release identity

- [ ] Environment is exactly `staging`.
- [ ] Release ID passes the canonical identifier rule.
- [ ] Release commit is a lowercase 40-character SHA.
- [ ] Checked-out source commit matches the requested release commit.
- [ ] Configured runtime release ID matches the requested release.
- [ ] Configured runtime commit matches the requested release commit.

## Protected environment

- [ ] Workflow runs through `mmg-commerce-staging`.
- [ ] Required protected values are present.
- [ ] Operations, integration, rehearsal, rehearsal-adapter, and runtime-control credentials are each at least 32 characters.
- [ ] The five credentials are mutually distinct.
- [ ] Admin Portal operator authentication is separately configured.
- [ ] No credential value appears in logs, artifacts, or responses.
- [ ] No database URL or alert destination URL appears in evidence.

## Database and tooling

- [ ] Dedicated staging PostgreSQL is reachable.
- [ ] `pgcrypto` is available.
- [ ] Missing migration ledger before first execute is a warning, not a false pass.
- [ ] Missing migrations before first execute are warnings.
- [ ] Node.js 22 or newer is available.
- [ ] `psql` is available.
- [ ] `sha256sum` is available.
- [ ] Migration runner, release-registration script, and staging workflow are present.

## Runtime routes

- [ ] Staging readiness route is mounted.
- [ ] Staging integration, operations, Admin operations, rehearsal, rehearsal-adapter, and runtime-control routes are mounted.
- [ ] Knowledge Library, Customer Portal, Thank-you, webhook, and deployment routes are mounted.
- [ ] `2xx`, `3xx`, `401`, `403`, and `405` are accepted as route presence.
- [ ] `404`, `5xx`, timeout, and network failure block readiness.
- [ ] Route probes use the credential assigned to each authority boundary.

## Providers and alerts

- [ ] Database heartbeat is healthy, fresh, and release-bound.
- [ ] Runtime-routes heartbeat is healthy, fresh, and release-bound.
- [ ] Runtime-controls heartbeat is healthy, fresh, and release-bound.
- [ ] Alerts heartbeat is healthy, fresh, and release-bound.
- [ ] Scheduler heartbeat is healthy, fresh, and release-bound.
- [ ] Dispatcher heartbeat is healthy, fresh, and release-bound.
- [ ] Storage-signer heartbeat is healthy, fresh, and release-bound.
- [ ] Admin-auth heartbeat is healthy, fresh, and release-bound.
- [ ] Heartbeats older than 15 minutes block readiness.
- [ ] Missing heartbeat evidence is unknown and blocking.
- [ ] Pager, operations email, and operations chat channels are configured.
- [ ] Alert destinations use HTTPS and are explicitly staging.

## Safe state

- [ ] Product publication is disabled.
- [ ] Subscription checkout is disabled.
- [ ] Webhook ingestion is enabled.
- [ ] Delivery scheduler is disabled.
- [ ] Delivery dispatcher is disabled.
- [ ] Recommendation automation is observe-only.
- [ ] Signed library access is disabled.
- [ ] Thank-you handoff is observe-only.
- [ ] Rollout is paused at 0% for the exact release.
- [ ] Readiness response always reports `publicationAllowed=false`.
- [ ] Readiness response always reports `liveCustomerDataAllowed=false`.

## Workflow and evidence

- [ ] Local inspection runs before runtime inspection.
- [ ] Runtime inspection does not run when local blockers exist.
- [ ] Both reports are uploaded even when the final gate fails.
- [ ] Artifacts contain sanitized evidence only.
- [ ] Artifacts are retained for 30 days.
- [ ] Any critical failed or unknown check blocks readiness.
- [ ] Warnings do not authorize execute or rehearse by themselves.
- [ ] Workflow does not apply migrations, register a release, or trigger rehearsal.
- [ ] Workflow does not mutate Shopify, enable checkout, expose a cohort, or publish the subscription product.
