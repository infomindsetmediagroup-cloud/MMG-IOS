# MMG Commerce Operations Control QA

## Authentication and request safety

- [ ] Operations endpoint accepts POST only.
- [ ] Server-to-server authentication is required.
- [ ] `X-MMG-Internal-Request` is required.
- [ ] Production mutations require `mmg-incident-commander`.
- [ ] Production rollout advancement also requires `mmg-production-release-manager`.
- [ ] Automated containment requires `mmg-commerce-monitor`.
- [ ] Request bodies larger than 32 KiB are rejected.
- [ ] Responses are private and non-cacheable.
- [ ] Duplicate completed request IDs are idempotent.
- [ ] Request-ID payload collisions are rejected.
- [ ] Stale incident, control, and rollout versions are rejected.

## Health signal validation

- [ ] Every configured signal returns a bounded numeric value, sample count, window, unit, and timestamp.
- [ ] Duplicate signal codes in one monitor run are rejected.
- [ ] Invalid values become `unknown`, not healthy.
- [ ] Insufficient samples become `unknown`.
- [ ] Warning and critical thresholds match the governing contract.
- [ ] Any critical signal makes the overall snapshot critical.
- [ ] Degraded or unknown signals prevent the snapshot from being healthy.
- [ ] Health snapshots contain no customer, contract, entitlement, storage, or token identifiers.

## Incident response

- [ ] SEV1, SEV2, SEV3, and SEV4 routing matches policy.
- [ ] SEV1 alerts cannot be suppressed.
- [ ] SEV2 alerts cannot be suppressed.
- [ ] Alert destination references are persisted only as SHA-256 hashes.
- [ ] Incident state transitions follow the approved graph.
- [ ] Resolved incidents reopen when the same signal breaches again.
- [ ] Healthy signals move active incidents into monitoring rather than silently closing them.
- [ ] Every incident transition records actor, reason, time, and version.

## Kill switches and containment

- [ ] Safe bootstrap starts rollout paused.
- [ ] Subscription checkout starts disabled.
- [ ] Webhook ingestion starts enabled.
- [ ] Scheduler and dispatcher start disabled.
- [ ] Recommendations and Thank-you handoff start observe-only.
- [ ] Signed access starts disabled.
- [ ] The operations endpoint cannot enable or publish the product.
- [ ] Webhook ingestion cannot be disabled.
- [ ] Critical containment pauses rollout.
- [ ] Critical entitlement or ownership faults stop the scheduler and drain the dispatcher.
- [ ] Secure-access faults disable signed access without removing ownership.
- [ ] No containment action deletes customers, contracts, grants, history, or delivered ownership.

## Consistency audit

- [ ] Billing-cycle overdraw is detected.
- [ ] Package-window overdraw is detected.
- [ ] Duplicate active ownership is detected.
- [ ] Orphan delivery grants are detected.
- [ ] Delivered windows without ownership are detected.
- [ ] Ownership grants without assets are detected.
- [ ] Stuck delivery windows are detected.
- [ ] Unresolved webhook failures are detected.
- [ ] Failed audits block rollout advancement.
- [ ] Repair policy is forward repair or reviewed manual reconciliation.

## Rollout control

- [ ] Internal uses allowlist-only access.
- [ ] Pilot assigns 5% of deterministic buckets.
- [ ] Limited assigns 25%.
- [ ] Expanded assigns 50%.
- [ ] Full assigns 100%.
- [ ] Raw customer references and release salts are not persisted.
- [ ] Stage skipping is rejected.
- [ ] Observation windows are enforced.
- [ ] Open SEV1 or SEV2 incidents block advancement.
- [ ] Critical or unknown health blocks advancement.
- [ ] A passed consistency audit is required.
- [ ] Fresh end-to-end evidence is required.
- [ ] Expanded and Full require stage-specific approval.
- [ ] Paused rollout cannot resume without an explicit target stage.

## Persistence and privacy

- [ ] Migration 008 applies after migrations 001–007.
- [ ] Reapplying migration 008 is safe.
- [ ] Monitoring, incident, control, rollout, audit, alert, and request tables are created.
- [ ] Operations records contain no Shopify tokens, application secrets, storage signing keys, database credentials, or raw provider payloads.
- [ ] Raw customer identifiers do not appear in monitoring or rollout tables.
- [ ] Audit events remain immutable and queryable.

## Staging drills

- [ ] Simulated database critical signal opens SEV1 and applies safe containment.
- [ ] Simulated webhook failure spike opens SEV2 and pauses rollout.
- [ ] Simulated signed-access failure disables only signed access and checkout entry.
- [ ] Recovery requires healthy telemetry, passed consistency, and fresh verification.
- [ ] Internal → Pilot → Limited → Expanded → Full rehearsal passes all gates.
- [ ] A forced pause preserves webhook evidence, billing history, grants, and customer ownership.
