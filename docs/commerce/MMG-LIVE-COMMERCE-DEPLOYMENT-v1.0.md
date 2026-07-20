# MMG Live Shopify Provisioning and End-to-End Deployment v1.0

## Purpose

This component converts the completed MMG subscription-commerce architecture into an approval-gated release system. It prepares product provisioning, application scopes, database migrations, runtime routes, Customer Portal modules, webhooks, scheduling, delivery, verification, publication, and rollback as independently auditable phases.

The build does not treat “deploy” as one opaque command. It separates planning, execution, verification, publication, and rollback so a product cannot become customer-visible before the complete system is operational.

## Canonical release sequence

1. Validate the immutable release ID, exact commit SHA, target environment, canonical Shopify domain, and API version.
2. Obtain the required app scopes and protected subscription API access.
3. Apply commerce migrations 001–007 in order.
4. Route every private and public commerce endpoint through the deployed Kairos runtime.
5. Provision `MMG Knowledge Subscription™` as a draft product.
6. Configure Monthly, Bi-weekly, and Weekly variants at $14.95, $24.95, and $39.95.
7. Create one shared monthly selling plan and associate all three variants.
8. Persist and verify the runtime product, variant, selling-plan, and Online Store publication GIDs.
9. Verify at least two subscription-selectable assets with complete media, delivery packages, secure files, and recommendation metadata.
10. Insert the Subscription Dashboard, My Library, and learning-profile modules additively into the Customer Portal.
11. Release app-specific subscription webhooks on Shopify API version `2026-07`.
12. Activate the delivery scheduler, idempotent dispatcher, acknowledgement path, storage signer, and monitoring.
13. Run the complete checkout-to-My-Library verification suite under the release's verification approval.
14. Obtain a separate publication approval bound to the exact release commit.
15. Activate the product and publish it only to the verified Online Store publication while the matching verification evidence is still fresh.

## Shopify provisioning boundary

The product remains `DRAFT` during provisioning. Product creation, variant configuration, selling-plan creation, metafield writes, runtime mapping, and inspection are not permission to publish.

The provisioning plan uses the official Admin GraphQL product and purchase-option surfaces:

- `productCreate`
- `productVariantsBulkUpdate`
- `productVariantsBulkCreate`
- `sellingPlanGroupCreate`
- `metafieldsSet`
- `productUpdate`
- `publishablePublish`

The deployed app requires product, publication, theme, and protected subscription scopes. Scope changes and app-specific webhook changes are released through the Shopify app configuration process.

## Release actions

### `plan`

Read-only. Produces the current release plan and blockers. It does not require a mutation approval.

### `execute`

Applies non-publication phases. Production execution requires a valid release approval tied to the environment, action, commit SHA, and approval window.

### `verify`

Runs the independent end-to-end suite. Production verification requires an action-bound approval because the suite may create a controlled test order and entitlement state. Verification cannot grant publication by itself.

### `publish`

Activates and publishes the product only after all end-to-end checks pass. Publication always requires a separate approval. Evidence must match the same release ID and environment and must be no more than 24 hours old.

### `rollback`

Runs phase-specific compensating actions. It may unpublish or return the product to draft, but it cannot delete delivered customer ownership, subscription history, webhook inbox records, or audit history.

## Idempotency and concurrency

Every command requires a unique `requestId`. Replaying a completed request returns the stored result. Reusing a request ID with another payload is rejected.

Every release has a monotonically increasing version. Mutations can provide `expectedReleaseVersion`; stale requests are rejected before a phase begins.

Shopify runtime mapping is stored by canonical shop domain and product mapping key. The mapping contains only Shopify GIDs and verification timestamps—not Admin API tokens.

## End-to-end verification

The release verifier covers:

- Exact draft product and three-variant structure
- Shared monthly selling plan
- Explicit cart plan selection and recurring consent
- Controlled test checkout
- Verified subscription webhook processing
- Single entitlement creation
- Correct 1/2/4-package and 2/4/8-asset capacity
- First-package customer selection
- Future-package recommendation ranking
- Review-window swaps
- Atomic confirmation and grants
- Idempotent delivery dispatch
- My Library visibility
- Short-lived read or download access
- Customer Portal status
- Privacy boundary
- Pause, cancellation, and billing-failure behavior

Only hashes of test order and test customer references may be persisted. Publication accepts only a complete successful run for the same release ID and environment completed within the preceding 24 hours.

## GitHub release workflow

`.github/workflows/mmg-commerce-release.yml` provides an explicit workflow-dispatch control plane. It checks out the exact requested commit, runs the repository contract validation, enters the selected GitHub Environment, and sends one authenticated action to the internal deployment endpoint.

Production `execute`, `verify`, `publish`, and `rollback` actions require the production GitHub Environment and the matching durable release approval. Shopify, database, storage, and dispatcher secrets stay in the runtime that owns those integrations.

## Rollback doctrine

- Prefer unpublish or return-to-draft over product deletion.
- Preserve Shopify contracts and billing history.
- Preserve confirmed delivery and ownership grants.
- Preserve webhook deliveries and reconciliation records.
- Use forward database repair migrations after production application unless a migration-specific rollback is reviewed and approved.
- Stop schedulers and dispatchers before repairing a state-corruption incident.
- Never infer that a deployment rollback authorizes removal of customer access already granted legitimately.

## Production boundary

The repository now contains the deployment control plane, but no live Shopify mutation, database migration, app-scope expansion, webhook release, portal installation, scheduler activation, checkout, or product publication occurs merely because this source is merged. Those actions require connected production adapters, encrypted secrets, GitHub Environment approval, durable action-bound release approval, and an explicit controlled release command.
