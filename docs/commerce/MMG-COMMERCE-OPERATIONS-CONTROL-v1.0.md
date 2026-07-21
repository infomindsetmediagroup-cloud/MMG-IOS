# MMG Commerce Operations Control v1.1

## Purpose

This layer governs the subscription-commerce system after deployment source exists but before broad customer release. It converts operational health, entitlement integrity, delivery reliability, and customer-access telemetry into explicit incidents, customer-safe containment, staged rollout decisions, and auditable recovery actions.

It does not authorize publication, delete customer data, cancel Shopify contracts, revoke delivered ownership, or replace the deployment control plane.

## Protected operations boundary

The logical endpoint is:

```text
POST /api/internal/commerce/operations
```

Supported actions are:

- `inspect`
- `evaluate`
- `run_consistency_audit`
- `acknowledge_incident`
- `apply_mitigation`
- `resolve_incident`
- `close_incident`
- `set_control`
- `advance_rollout`
- `pause_rollout`

All requests require a unique request ID. Mutations may also provide an expected version. Request collisions and stale versions are rejected. Rollout commands use a dedicated service that requires an explicit target stage, checks the current release ID, and refuses to use health, consistency, or end-to-end evidence belonging to another release.

## Health model

The monitor evaluates database connectivity, route availability, Shopify webhook processing, subscription reconciliation lag, scheduler freshness, dispatcher backlog and failures, recovery-required rates, signed-access failures, entitlement integrity, ownership uniqueness, and end-to-end verification freshness.

Signals resolve to:

- `healthy`
- `degraded`
- `critical`
- `unknown`

A signal with insufficient evidence is not treated as healthy. It becomes `unknown` and creates a low-severity investigation record when persisted through the monitor.

## Incident severity

### SEV1

Immediate risk to customer rights, billing integrity, ownership, entitlement capacity, database availability, or broad runtime integrity.

- Acknowledge within 15 minutes.
- Begin mitigation within 30 minutes.
- Repeat alerts every 5 minutes.
- Suppression is forbidden.

### SEV2

Material degradation of checkout, webhooks, scheduling, delivery, reconciliation, or secure access.

- Acknowledge within 30 minutes.
- Begin mitigation within 2 hours.
- Repeat alerts every 15 minutes.
- Suppression is forbidden.

### SEV3

Limited or recoverable degradation with bounded customer impact.

### SEV4

Incomplete, low-confidence, or informational telemetry requiring investigation.

Incident lifecycle:

```text
detected → acknowledged → mitigating → monitoring → resolved → closed
```

A resolved or closed incident can reopen when the same governed signal breaches policy again. An active incident cannot be downgraded to a lower severity merely because a later observation is less severe; migration 009 preserves the highest active severity until the incident reaches a terminal state.

## Customer-safe containment

Automatic containment is restricted to preapproved reversible controls:

- Pause rollout.
- Disable new subscription checkout entry.
- Put recommendation automation into observe-only mode.
- Stop the delivery scheduler for integrity-sensitive failures.
- Put the dispatcher into drain-only mode for delivery or integrity failures.
- Disable signed access only when the secure-access subsystem is failing.
- Put the Thank-you handoff into observe-only mode when runtime routes are unavailable.

Automatic containment cannot:

- Unpublish the product.
- Disable durable webhook evidence ingestion.
- Delete customer or billing records.
- Revoke delivered ownership.
- Reverse legitimate deliveries.

Manual control actions may move a subsystem into a safer mode. Re-enabling customer-affecting controls is owned by the staged rollout adapter rather than an isolated control command. Publication remains owned by the separate deployment control plane.

## Safe initial state

Before the first controlled rollout, production is initialized as paused:

| Control | Initial mode |
|---|---|
| Product publication control | Disabled |
| Subscription checkout | Disabled |
| Webhook ingestion | Enabled |
| Delivery scheduler | Disabled |
| Delivery dispatcher | Disabled |
| Recommendation automation | Observe only |
| Signed library access | Disabled |
| Thank-you handoff | Observe only |

This state allows inspection and verified event capture without exposing an incomplete customer journey.

## Staged rollout

| Stage | Cohort | Minimum observation | Approval |
|---|---:|---:|---|
| Internal | Allowlist only | 24 hours | Operator |
| Pilot | 5% | 24 hours | Operator |
| Limited | 25% | 48 hours | Operator |
| Expanded | 50% | 72 hours | Executive stage approval |
| Full | 100% | 72 hours | Executive stage approval |
| Paused | 0% | N/A | Incident commander or monitor containment |

Customers are assigned through a deterministic SHA-256 bucket derived from a private customer reference and release-specific salt. The raw customer reference is not persisted in rollout records.

Stage advancement requires:

1. The current observation window has completed.
2. No open SEV1 incident exists.
3. No open SEV2 incident exists.
4. Current health is neither critical nor unknown and belongs to the active release.
5. The latest consistency audit passed and belongs to the active release.
6. End-to-end evidence is fresh, complete, and belongs to the active release and environment.
7. A stage-specific approval exists for Expanded and Full.

Stage skipping is prohibited. A paused rollout never resumes automatically. Internal resume requires an explicit target and complete release-bound evidence; direct resume to Pilot or higher also requires a matching stage approval.

## Consistency audits

The audit checks:

- Billing-cycle capacity never exceeds the locked plan.
- Package-window capacity never overdrafts.
- Active ownership remains unique by customer and canonical asset ID.
- Delivery grants reference valid cycles, windows, customers, and assets.
- Delivered windows have complete ownership grants.
- Ownership grants reference valid assets.
- Delivery windows are progressing rather than remaining stuck.
- Failed webhook reconciliation is accounted for and repairable.

Repairs are forward-only or manually reconciled. The audit never authorizes destructive automated repair. A failed SEV1 consistency check opens a governed incident and can apply the same reversible containment used by critical health signals.

## Persistence

Migration `20260720_008_mmg_commerce_operations_control.sql` adds durable records for:

- Idempotent operations requests
- Monitoring runs and health snapshots
- Incidents and incident events
- Kill-switch state
- Rollout state, history, and approvals
- Consistency audits
- Alert delivery evidence
- Operations audit events

Migration `20260720_009_mmg_commerce_operations_integrity.sql` adds:

- Active-incident severity preservation
- A release-and-environment index for passed end-to-end evidence
- Release foreign-key boundaries for health snapshots and consistency audits

Alert destinations and provider references are represented only by cryptographic hashes. Customer identifiers, tokens, raw webhook bodies, storage keys, and raw provider payloads are excluded.

## Production activation sequence

1. Apply migrations 008 and 009 after migrations 001–007.
2. Route the operations endpoint behind a server-to-server credential.
3. Connect every telemetry adapter to its authoritative runtime and database source.
4. Connect the release-bound end-to-end evidence adapter.
5. Connect every kill switch to the real runtime boundary.
6. Configure alert destinations outside source control.
7. Bootstrap the safe paused state.
8. Run a staging SEV1/SEV2 incident drill.
9. Verify containment, alerting, recovery, and audit preservation.
10. Rehearse Internal → Pilot → Limited → Expanded → Full in staging.
11. Begin the first production release only after the deployment and operations gates both pass.

## Next dependency

The next implementation step is production adapter wiring, the staging incident drill, and the first controlled release rehearsal. The control plane is not considered operational until the abstract metrics, control, alert, consistency, rollout-evidence, and authentication adapters are connected to deployed infrastructure.
