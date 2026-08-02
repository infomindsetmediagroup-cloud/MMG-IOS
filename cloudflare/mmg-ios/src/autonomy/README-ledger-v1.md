# Kairos Autonomy Ledger v1

This slice installs the internal durable persistence boundary for Kairos autonomous operations.

It intentionally does not expose `/api/autonomy/*`, dispatch workflows, schedule autonomous execution, mutate Shopify, send customer communications, merge GitHub changes, or deploy Cloudflare production changes.

The SQLite-backed `KairosAutonomyLedger` Durable Object provides:

- tenant-scoped event idempotency
- explicit event-state transitions
- bounded execution leases
- expired-lease recovery
- stale-executor fencing through lease tokens
- atomic attempt increments
- terminal-state enforcement
- bounded recent-event retrieval
- sanitized result, error, and policy-decision persistence

The next implementation slice may call the Durable Object through its internal operations only after this slice is merged and deployed successfully.
