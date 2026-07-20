# MMG Live Commerce Deployment QA

## Release identity and approval

- [ ] Release ID is immutable and unique.
- [ ] Exact 40-character commit SHA matches the checked-out source.
- [ ] Production actions use the `mmg-commerce-production` GitHub Environment.
- [ ] Production `execute`, `verify`, `publish`, and `rollback` actions have an active approval bound to the exact environment, action, SHA, and approval window.
- [ ] `publish` approval is distinct from general provisioning approval.
- [ ] Duplicate request IDs return the completed outcome.
- [ ] Request-ID payload collisions are rejected.
- [ ] Stale expected release versions are rejected.

## Shopify app and scope validation

- [ ] Protected subscription API access is approved.
- [ ] `read_products` and `write_products` are granted.
- [ ] `read_publications` and `write_publications` are granted.
- [ ] `read_themes` and `write_themes` are granted.
- [ ] `read_own_subscription_contracts` and `write_own_subscription_contracts` are granted.
- [ ] App configuration uses API version `2026-07`.
- [ ] No secret or Admin access token exists in source control.

## Product provisioning

- [ ] Exactly one product uses handle `mmg-knowledge-subscription`.
- [ ] Product title is `MMG Knowledge Subscription™`.
- [ ] Product remains `DRAFT` during provisioning.
- [ ] `requiresSellingPlan` is true.
- [ ] Delivery cadence option contains Monthly, Bi-weekly, and Weekly.
- [ ] Monthly SKU is `MMG-KS-MONTHLY` at $14.95.
- [ ] Bi-weekly SKU is `MMG-KS-BIWEEKLY` at $24.95.
- [ ] Weekly SKU is `MMG-KS-WEEKLY` at $39.95.
- [ ] All variants are nonshipping, non-taxable by default, and not inventory tracked.
- [ ] Variant MMG metafields exactly match 1/2/4 packages and 2/4/8 assets.
- [ ] One shared monthly selling-plan group is attached to all three variants.
- [ ] Runtime mapping stores unique valid product, variant, group, plan, and Online Store publication GIDs.
- [ ] Runtime mapping stores no token or secret.

## Database and runtime

- [ ] Migrations 001–007 apply cleanly in order.
- [ ] Reapplying migration 007 is idempotent.
- [ ] Every required API route is deployed.
- [ ] Customer Portal and picker routes require authenticated sessions.
- [ ] Profile and file-access writes enforce same-origin and CSRF validation.
- [ ] Webhook route verifies raw-body HMAC before parsing.
- [ ] Deployment route requires internal authorization and release roles.
- [ ] Private responses are non-cacheable.

## Customer Portal installation

- [ ] Subscription Dashboard is inserted without replacing existing modules.
- [ ] My Library is inserted at the canonical anchor.
- [ ] Learning profile is inserted at the canonical anchor.
- [ ] Existing projects, uploads, support, authentication, and navigation remain operational.
- [ ] Mobile layout, keyboard operation, focus visibility, reduced motion, loading, authentication, empty, and error states pass.

## Webhooks and operations

- [ ] All five subscription topics are released through the app configuration.
- [ ] Webhook API version header equals `2026-07`.
- [ ] Duplicate, stale, wrong-shop, wrong-version, invalid-HMAC, and retry cases pass.
- [ ] Delivery-window scheduler is protected and active.
- [ ] Dispatcher is idempotent by window ID.
- [ ] Delivery acknowledgement is active.
- [ ] Secure storage signer issues HTTPS links with approved TTL.
- [ ] Alerts cover webhook failures, scheduler failures, dispatcher failures, recovery-required spikes, and signed-access failures.

## End-to-end verification

- [ ] A controlled test subscription order completes.
- [ ] Contract webhook creates one entitlement.
- [ ] Exact plan capacity is created.
- [ ] First package opens and requires customer choice.
- [ ] First package never auto-confirms.
- [ ] Future package uses Kairos ranking.
- [ ] Customer can swap proposed titles during the review window.
- [ ] Confirmation creates selections, delivery grants, ownership grants, and counters atomically.
- [ ] Delivery dispatch occurs once.
- [ ] Delivered assets appear once per canonical asset ID in My Library.
- [ ] Read/download access revalidates ownership and returns only short-lived signed URLs.
- [ ] Customer Portal status matches Shopify and Kairos state.
- [ ] Raw test order/customer references are not persisted.
- [ ] Pause, billing failure, cancellation, and expiration do not create unearned capacity or revoke delivered ownership.

## Publication

- [ ] At least two verified subscription-selectable assets exist.
- [ ] All end-to-end checks are passed, not skipped.
- [ ] Verification evidence belongs to the same release ID and environment and is no more than 24 hours old.
- [ ] Publication approval matches the exact release commit.
- [ ] Product status changes to `ACTIVE` only during `publish`.
- [ ] Product is published only to the verified Online Store publication.
- [ ] Cart, checkout, Thank-you handoff, Customer Portal, and My Library are rechecked immediately after publication.

## Rollback

- [ ] Product can be unpublished or returned to draft.
- [ ] Scheduler and dispatcher can be stopped without deleting data.
- [ ] Prior app configuration can be released.
- [ ] Forward database repair procedure is documented.
- [ ] Delivered ownership and customer file access remain intact.
- [ ] Webhook inbox, contract snapshots, billing attempts, release events, and E2E evidence remain auditable.
