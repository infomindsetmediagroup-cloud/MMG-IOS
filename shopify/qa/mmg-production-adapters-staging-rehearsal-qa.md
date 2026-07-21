# MMG Production Adapters and Staging Rehearsal QA

## Configuration and secrets

- [ ] Production runtime origin uses HTTPS.
- [ ] Alert destinations use HTTPS.
- [ ] Internal operations and rehearsal credentials are stored only in the deployment secret manager.
- [ ] Redacted configuration responses never contain credentials or destination URLs.
- [ ] Database, Shopify, storage, Admin-session, and alert-provider secrets are absent from source control.
- [ ] Request timeouts remain between 1 and 30 seconds.

## PostgreSQL telemetry

- [ ] Database connectivity reports one successful bounded sample.
- [ ] Database failures report an unhealthy connectivity sample without leaking an error payload.
- [ ] Webhook failure rate uses the configured measurement window.
- [ ] Processing and reconciliation lag return unknown when evidence is unavailable.
- [ ] Scheduler freshness uses the latest completed controller run.
- [ ] Dispatcher backlog counts delivery-ready windows.
- [ ] Delivery-related recovery and secure-access failure rates use durable request records.
- [ ] Entitlement overdraw, ownership duplication, orphan grants, missing ownership, missing assets, stuck windows, and unresolved webhook failures are detected.
- [ ] End-to-end age is bound to the exact release and environment.

## Route probes

- [ ] Every canonical private commerce route is probed.
- [ ] 2xx, 3xx, 401, 403, and 405 prove route deployment.
- [ ] 404, 5xx, timeout, and network failure mark a route unavailable.
- [ ] Probe requests use the internal marker and credential.
- [ ] Probe responses are never rendered to customers.

## Runtime controls

- [ ] Checkout disablement reaches the actual cart/subscription entry boundary.
- [ ] Scheduler disablement stops new window transitions.
- [ ] Dispatcher drain-only mode finishes safe confirmed work but accepts no unsafe new work.
- [ ] Recommendation and Thank-you observe-only modes reach their production boundaries.
- [ ] Signed-access disablement blocks URL issuance without deleting ownership.
- [ ] Webhook ingestion cannot be disabled.
- [ ] Product publication cannot be enabled through operations controls.
- [ ] Every control request creates a bounded audit receipt.

## Alerts

- [ ] SEV1 reaches pager, email, operations chat, and executive briefing destinations.
- [ ] SEV2 reaches pager, email, and operations chat.
- [ ] Missing or failed SEV1/SEV2 delivery fails visibly.
- [ ] Alert bodies contain no customer, contract, entitlement, ownership, token, storage, or raw provider fields.
- [ ] Only destination and provider-reference hashes are persisted.
- [ ] Deduplication keys suppress duplicate provider delivery without suppressing the incident record.

## Authentication

- [ ] Internal operations requests require the dedicated bearer credential.
- [ ] The rehearsal endpoint requires `mmg-commerce-rehearsal-operator`.
- [ ] Admin Portal operations visibility requires an authenticated `mmg-commerce-operator` session.
- [ ] Internal and Admin credentials are separate.
- [ ] Cross-origin and missing-marker requests are rejected.
- [ ] Responses remain private and non-cacheable.

## Rehearsal fixture isolation

- [ ] Rehearsal requests are rejected outside staging.
- [ ] Publication and live-customer flags are rejected.
- [ ] Only one fixture lease can be active.
- [ ] Synthetic telemetry is namespaced to the rehearsal run.
- [ ] Fixture approvals cannot affect production rollout approvals.
- [ ] Fixture clock advancement cannot change production time or billing records.
- [ ] Teardown removes only synthetic fixtures.

## SEV1 drill

- [ ] Database-connectivity fixture creates a SEV1 incident.
- [ ] Rollout moves to Paused.
- [ ] Subscription checkout is disabled.
- [ ] Delivery scheduler is disabled.
- [ ] Dispatcher moves to drain-only.
- [ ] Recommendation automation moves to observe-only.
- [ ] Required alerts are delivered and hashed receipts are persisted.
- [ ] Recovery requires reviewed telemetry and explicit incident transitions.

## SEV2 drill

- [ ] Webhook-failure fixture creates a SEV2 incident.
- [ ] Rollout moves to Paused.
- [ ] Subscription checkout is disabled.
- [ ] Webhook ingestion remains enabled.
- [ ] Durable webhook evidence remains queryable.
- [ ] Required alerts are delivered.
- [ ] Recovery does not automatically resume rollout.

## Consistency and rights

- [ ] Full consistency audit passes after fixture recovery.
- [ ] Baseline ownership, delivery-grant, delivered-window, and entitlement counts are captured.
- [ ] The final counts exactly match baseline.
- [ ] The final cryptographic rights digest exactly matches baseline.
- [ ] No ownership or delivery record is revoked or deleted.

## Staged rollout rehearsal

- [ ] Paused → Internal succeeds only after healthy release-bound evidence.
- [ ] Internal observation advances 24 hours.
- [ ] Pilot uses 5% and advances 24 hours.
- [ ] Limited uses 25% and advances 48 hours.
- [ ] Expanded uses 50%, requires approval, and advances 72 hours.
- [ ] Full uses 100%, requires approval, and advances 72 hours.
- [ ] Stage skipping is rejected.
- [ ] No open SEV1 or SEV2 exists during advancement.
- [ ] No publication call occurs.

## Evidence

- [ ] Rehearsal evidence is bound to the exact release ID and commit.
- [ ] Every required check is persisted once per run.
- [ ] Failed runs contain a bounded error code and completed timestamp.
- [ ] Evidence artifacts contain no secrets or customer identifiers.
- [ ] The first real staging rehearsal is not marked complete until deployed infrastructure executes it successfully.
