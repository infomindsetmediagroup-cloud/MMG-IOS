# MMG Commerce Staging Integration QA

## Source validation

- [ ] The exact release commit is checked out.
- [ ] TypeScript validation passes.
- [ ] Automated tests pass.
- [ ] Shopify governance validation passes.
- [ ] Canonical service-product validation passes.
- [ ] No secret, token, database URL, alert endpoint, customer identifier, or signed URL is committed.

## Migration execution

- [ ] `MMG_COMMERCE_ENVIRONMENT` is exactly `staging`.
- [ ] The release ID and 40-character commit SHA are valid and immutable.
- [ ] Migrations 001–011 exist and run in canonical order.
- [ ] The migration runner holds the PostgreSQL session advisory lock.
- [ ] The SHA-256 migration ledger is created before historical reconciliation.
- [ ] Re-running an unchanged migration is a no-op.
- [ ] A ledger/file hash mismatch fails closed.
- [ ] A failed migration is not recorded as applied.
- [ ] The database URL does not appear in workflow output.
- [ ] No automatic down migration is available.

## Authentication

- [ ] Operations, integration, rehearsal, rehearsal-adapter, and runtime-control credentials are distinct.
- [ ] Every server credential is at least 32 characters.
- [ ] Admin Portal authentication uses a separate operator session.
- [ ] Missing credentials fail startup.
- [ ] Invalid bearer credentials return a private non-cacheable rejection.
- [ ] Disallowed origins are rejected.
- [ ] Protected routes require the internal request marker.

## Safe runtime state

- [ ] Product publication is `observe_only`.
- [ ] Subscription checkout is `disabled`.
- [ ] Webhook ingestion is `enabled`.
- [ ] Delivery scheduler and dispatcher are `disabled`.
- [ ] Recommendation automation is `observe_only`.
- [ ] Signed library access and Thank-you handoff are `disabled`.
- [ ] Rollout is `paused` at 0% for the exact release.
- [ ] Webhook ingestion cannot be disabled.
- [ ] Publication cannot be enabled from the operations or runtime-control route.
- [ ] Every applied or rejected runtime control has a durable receipt.

## Route and adapter readiness

- [ ] The staging integration endpoint is mounted.
- [ ] Operations, Admin operations, rehearsal, rehearsal adapter, and runtime-control routes are mounted.
- [ ] Knowledge Library, entitlement, delivery-window, Customer Portal, My Library, learning-profile, Thank-you, webhook, and deployment routes are mounted.
- [ ] Database, routes, controls, alerts, scheduler, dispatcher, storage signer, and Admin authentication report exact-release healthy heartbeats.
- [ ] Missing or stale heartbeat evidence blocks verification.
- [ ] Any route `404`, `5xx`, timeout, or network error blocks verification.

## Cohort safety

- [ ] Raw customer identifiers are never accepted by the staging policy.
- [ ] Internal access uses only a SHA-256 allowlist.
- [ ] Pilot is exactly 5%.
- [ ] Limited is exactly 25%.
- [ ] Expanded is exactly 50%.
- [ ] Full is exactly 100%.
- [ ] Cohort assignment is deterministic for the same release and customer-reference hash.
- [ ] Paused state permits no customer-affecting subsystem.

## Incident rehearsal

- [ ] Only one active staging fixture lease exists.
- [ ] Production, publication, and live-customer flags are rejected.
- [ ] Database-connectivity injection creates a SEV1 incident.
- [ ] SEV1 containment keeps rollout paused and checkout/scheduler disabled.
- [ ] Webhook-failure injection creates a SEV2 incident.
- [ ] Webhook evidence ingestion remains enabled throughout the SEV2 drill.
- [ ] Scenario recovery is explicit and reviewed.
- [ ] Real route, entitlement-consistency, and ownership-uniqueness evidence remains in force.
- [ ] The consistency audit passes before rollout rehearsal.

## Rollout rehearsal

- [ ] Sequence is Paused → Internal → Pilot → Limited → Expanded → Full.
- [ ] No stage is skipped.
- [ ] Observation windows are 24, 24, 48, 72, and 72 hours.
- [ ] Pilot, Limited, Expanded, and Full transitions have fixture-scoped approvals.
- [ ] Fixture approvals cannot authorize production or Shopify publication.
- [ ] The fixture virtual clock is version-consistent and staging-only.

## Customer-rights preservation

- [ ] The baseline digest covers active ownership, active delivery grants, delivered windows, and active entitlements.
- [ ] The final digest covers the same records.
- [ ] Any count or digest change fails the rehearsal.
- [ ] Teardown restores the safe paused state.
- [ ] Teardown does not delete customer records.
- [ ] Teardown does not revoke delivered ownership.

## Final verification

- [ ] The migration ledger contains exactly the required 11 migration IDs.
- [ ] All route probes pass.
- [ ] All eight adapter heartbeats are healthy and release-bound.
- [ ] Safe controls match the canonical baseline.
- [ ] Rollout remains paused at 0% after teardown.
- [ ] Rehearsal evidence belongs to the exact release and is no more than 24 hours old.
- [ ] Sanitized integration and rehearsal evidence is retained for 30 days.
- [ ] Shopify remains unchanged and the subscription product remains unpublished.
