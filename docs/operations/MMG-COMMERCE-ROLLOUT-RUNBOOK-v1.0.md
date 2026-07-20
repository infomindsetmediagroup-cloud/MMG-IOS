# MMG Commerce Controlled Rollout Runbook v1.0

## Objective

Release the canonical MMG subscription-commerce system in measurable stages without compromising billing correctness, entitlement capacity, customer ownership, delivery reliability, or secure access.

## Preconditions

Before rollout begins:

- The release is bound to an exact commit SHA.
- Migrations 001–008 are applied in order.
- The subscription product exists as DRAFT with exact variants and selling plan.
- Runtime mappings are verified.
- Required endpoints are routed and protected.
- At least two subscription-selectable assets are delivery-ready.
- Customer Portal modules are installed additively.
- Webhooks, scheduler, dispatcher, acknowledgement, and storage signer are connected.
- The latest consistency audit passed.
- End-to-end evidence is complete and no more than 24 hours old.
- Operations controls are initialized in the safe paused state.

## Paused

- Customer cohort: 0%.
- New subscription checkout: disabled.
- Scheduler and dispatcher: disabled unless used by a reviewed repair.
- Recommendations: observe only.
- Webhook ingestion: enabled.

Use Paused for initial setup, incidents, repair, and controlled rollback.

## Internal

- Customer cohort: allowlist only.
- Minimum observation: 24 hours.

Validate checkout consent, Thank-you handoff, webhook reconciliation, exact entitlement creation, first-title selection, future curation, swaps, dispatch, ownership, My Library, signed access, and subscription lifecycle behavior.

## Pilot

- Customer cohort: 5%.
- Minimum observation: 24 hours.

Entry requires a completed Internal observation period, eligible health, a passed consistency audit, fresh end-to-end evidence, and no open SEV1 or SEV2 incidents.

## Limited

- Customer cohort: 25%.
- Minimum observation: 48 hours.

The complete observation interval must finish before advancement unless rollout is paused or reduced.

## Expanded

- Customer cohort: 50%.
- Minimum observation: 72 hours.
- Stage-specific executive approval required.

## Full

- Customer cohort: 100%.
- Minimum observation after entry: 72 hours.
- Stage-specific executive approval required.

Full rollout does not disable monitoring or containment controls.

## Cohort assignment

The runtime uses a stable SHA-256 bucket derived from a private customer reference and release-specific private salt. The raw customer reference and salt are not stored in rollout history.

## Advancement checklist

- [ ] Current observation window complete
- [ ] No open SEV1 incident
- [ ] No open SEV2 incident
- [ ] Health is not critical or unknown
- [ ] Latest consistency audit passed
- [ ] End-to-end evidence is fresh and complete
- [ ] Required stage approval exists
- [ ] Runtime controls match the target stage
- [ ] Change is recorded with actor, reason, version, and timestamp

## Immediate pause conditions

Pause rollout when a critical threshold is reached for database connectivity, route availability, entitlement consistency, ownership uniqueness, webhook failure, scheduler freshness, dispatcher backlog or failure, recovery-required rate, secure access, or end-to-end evidence freshness.

Containment may disable new checkout and automation. It may not delete contracts, history, grants, or delivered ownership.

## Resume procedure

A paused rollout never resumes automatically.

1. Resolve or stabilize the incident.
2. Run a consistency audit.
3. Run end-to-end verification.
4. Confirm eligible health.
5. Select an explicit resume stage.
6. Obtain any required stage approval.
7. Begin a new observation window.
