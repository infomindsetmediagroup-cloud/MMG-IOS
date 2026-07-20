# MMG Commerce Operations Control v1.0

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

All requests require a unique request ID. Mutations may also provide an expected version. Request collisions and stale versions are rejected.

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

A resolved or closed incident can reopen when the same governed signal breaches policy again.

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

Publication remains owned by the separate deployment control plane.

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
4. Current health is neither critical nor unknown.
5. The latest consistency audit passed.
6. End-to-end evidence is fresh and complete.
7. A stage-specific approval exists for Expanded and Full.

Stage skipping is prohibited.

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

Repairs are forward-only or manually reconciled. The audit never authorizes destructive automated repair.

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

Alert destinations and provider references are represented only by cryptographic hashes. Customer identifiers, tokens, raw webhook bodies, storage keys, and raw provider payloads are excluded.

## Production activation sequence

1. Apply migration 008 after migrations 001–007.
2. Route the operations endpoint behind a server-to-server credential.
3. Connect every telemetry adapter to its authoritative runtime and database source.
4. Connect every kill switch to the real runtime boundary.
5. Configure alert destinations outside source control.
6. Bootstrap the safe paused state.
7. Run a staging SEV1/SEV2 incident drill.
8. Verify containment, alerting, recovery, and audit preservation.
9. Rehearse Internal → Pilot → Limited → Expanded → Full in staging.
10. Begin the first production release only after the deployment and operations gates both pass.

## Next dependency

The next implementation step is production adapter wiring, the staging incident drill, and the first controlled release rehearsal. The control plane is not considered operational until the abstract metrics, control, alert, consistency, and authentication adapters are connected to deployed infrastructure.
