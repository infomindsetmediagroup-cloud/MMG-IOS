# MMG Commerce Incident Response Runbook v1.0

## First principles

1. Protect customer rights and billing integrity before restoring growth or automation.
2. Preserve Shopify webhook evidence, contract snapshots, ownership grants, delivery history, and audit records.
3. Use reversible containment before irreversible changes.
4. Never delete customer records or revoke legitimate delivered ownership to make an incident disappear.
5. Keep publication and unpublication under the approved deployment control plane.

## SEV1 response

Examples include database unavailability, broad route failure, entitlement overdraft, duplicate active ownership conflicts, orphaned delivery grants, or delivered packages without ownership.

### Immediate actions

1. Acknowledge within 15 minutes.
2. Pause rollout.
3. Disable new subscription checkout entry.
4. Stop the delivery scheduler when entitlement or ownership integrity is uncertain.
5. Put the dispatcher into drain-only mode.
6. Put recommendation automation into observe-only mode.
7. Preserve webhook ingestion.
8. Capture the current release ID, runtime mapping, health snapshot, consistency audit, and open incident state.
9. Notify the on-call responder, operations channel, operations email, and executive briefing channel.

### Diagnosis

- Confirm whether the fault is infrastructure, application, data consistency, Shopify state, or storage access.
- Compare the latest healthy snapshot with the first failing snapshot.
- Check recent release phases, runtime routes, webhook delivery outcomes, controller runs, dispatcher activity, and signed-access events.
- Run the consistency audit before changing entitlement or ownership records.
- Do not execute ad hoc SQL updates without a reviewed forward-repair plan.

### Recovery

- Repair the underlying cause.
- Apply a reviewed forward migration or reconciliation command when data repair is required.
- Re-run the consistency audit.
- Re-run end-to-end verification.
- Move the incident to `monitoring` only after health has recovered.
- Observe for at least one full monitor interval plus the incident-specific validation window.
- Resolve and close only after customer impact and repair completeness are confirmed.

## SEV2 response

Examples include elevated webhook failures, reconciliation lag, scheduler staleness, dispatcher backlog, recovery-required spikes, or signed-access failure rates.

1. Acknowledge within 30 minutes.
2. Pause rollout and disable new checkout entry when the customer journey can create additional affected work.
3. Isolate the degraded subsystem.
4. Keep webhook ingestion active.
5. Drain safe confirmed deliveries when the dispatcher remains trustworthy; otherwise stop it.
6. Re-run targeted verification before restoring the subsystem.
7. Advance rollout only after the observation window and all formal gates pass.

## Signed-access incident

When secure read or download issuance fails or behaves unexpectedly:

- Disable signed library access.
- Preserve ownership and delivery grants.
- Do not expose permanent object URLs as a fallback.
- Verify signing-key configuration, clock skew, HTTPS enforcement, TTL, object existence, and authorization checks.
- Restore only after an authenticated owned asset can receive a valid short-lived URL and an unauthorized request remains denied.

## Webhook incident

- Never disable raw verified webhook ingestion.
- Preserve the durable inbox even when downstream reconciliation is paused.
- Verify HMAC, shop domain, API version, webhook ID deduplication, payload hash, Admin API reload, contract revision ordering, and retryability.
- Replay only through the governed reconciliation path.
- Never synthesize entitlement capacity from a failed or challenged billing attempt.

## Ownership or entitlement incident

- Disable checkout, scheduler, and new dispatcher intake.
- Run the full consistency audit.
- Compare cycles, windows, selections, delivery grants, and ownership grants by canonical asset ID.
- Do not remove an active ownership grant unless a reviewed customer-rights determination proves it invalid.
- Prefer additive repair records and compensating grants over destructive history edits.

## Required incident evidence

- Incident ID and severity
- First and last observed timestamps
- Release ID and environment
- Health signal and threshold
- Applied controls
- Rollout stage before and after containment
- Consistency audit ID
- Root cause
- Repair command or migration reference
- Verification evidence
- Customer-impact summary without customer identifiers
- Final resolution and prevention actions
