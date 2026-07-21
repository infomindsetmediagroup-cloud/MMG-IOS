# MMG Shopify Change Control

## Purpose

This policy governs every Shopify change initiated by Kairos, Codex, ChatGPT, an app, a script, a CI workflow, or a human operator acting through the MMG engineering pipeline.

## Control Levels

| Level | Activity | Default authority |
|---|---|---|
| 0 | Documentation search, code generation, schema inspection | Automatic |
| 1 | Static validation, GraphQL validation, linting, link analysis | Automatic |
| 2 | Read-only connected-store inspection | Governed automatic |
| 3 | Draft or unpublished resource creation in a controlled workflow | Explicit approval required |
| 4 | Live product, price, inventory, collection, media, content, subscription, publication, theme, customer, order, discount, or configuration mutation | Explicit executive approval or pre-approved governed workflow |
| 5 | Destructive, high-impact, irreversible, or customer-data-sensitive action | Explicit executive approval plus enhanced rollback and review |

## Hard Stops

The agent must not execute a mutation when any of the following is true:

- the target store identity has not been read and confirmed in the current task;
- the exact target resource has not been read immediately before the change;
- the requested fields, IDs, variants, publications, or scopes are ambiguous;
- Shopify AI Toolkit validation has not passed where validation is available;
- the user has not explicitly approved the final material change;
- the change affects a live product description without a complete source backup;
- the change affects pricing, subscriptions, inventory, customer data, orders, discounts, publications, or themes without a rollback plan;
- the result cannot be verified with a follow-up read;
- a credential or sensitive data item would be exposed in logs, chat, source control, or an artifact;
- the proposed operation exceeds least privilege;
- production and development/staging identity are inferred rather than verified.

## Required Preflight Record

Before an approved mutation, record:

1. timestamp and operator/agent;
2. connected store name and primary domain;
3. target resource type, GID, handle, and current status;
4. exact fields to change;
5. current values and proposed values;
6. validation evidence;
7. customer-facing impact;
8. dependency and link impact;
9. rollback method;
10. approval evidence.

## Complete-Source Rule

When Shopify `descriptionHtml`, page content, theme content, or a Custom Liquid field contains a complete storefront implementation:

- retrieve the entire current source;
- store the approved source in GitHub;
- never patch an isolated fragment directly in production;
- validate the complete replacement;
- preserve the native Shopify header and footer unless the approved design says otherwise;
- verify responsive behavior, accessibility, purchase controls, product data loading, links, and failure states;
- keep the previous complete source available for rollback.

## Approval Language

Approval must identify the material change. General statements such as “continue,” “work on it,” or “fix the page” authorize preparation and validation, not an unspecified production mutation.

Valid mutation approval should be equivalent to:

> Approve updating [resource] from [current state] to [proposed state].

A previously approved governed workflow may replace per-operation approval only when its target, fields, limits, rollback behavior, and audit logging are explicit.

## Production Mutation Sequence

1. Read current store and target state.
2. Save a pre-change snapshot.
3. Build the exact operation.
4. Validate code or GraphQL.
5. Present material change and impact.
6. Obtain approval.
7. Execute the smallest possible mutation.
8. Read the target again.
9. Test customer-facing behavior when applicable.
10. Record outcome and rollback reference.

## Rollback Standards

### Product or collection content

Restore the previous complete title, description, media mapping, variants, prices, tags, status, and publication state as applicable.

### Product-page executable source

Restore the previous complete `descriptionHtml` or approved source payload; do not attempt an emergency partial patch unless restoration is impossible.

### Pricing

Restore every affected variant price and compare-at price, then verify storefront and cart values.

### Inventory

Use compare-and-set semantics with a fresh inventory read. Record location, inventory item, previous quantity, new quantity, and reason.

### Subscription or selling plan

Do not launch without a tested rollback that protects existing subscriber contracts. Never delete or materially alter active subscriber entitlements without separate review.

### Theme

Only modify an unpublished theme unless the approved release workflow explicitly promotes a validated theme. Preserve the currently published theme as the immediate rollback target.

## Post-Change Verification

At minimum, verify:

- Shopify read-back matches approved values;
- storefront title, media, price, availability, and purchase controls are correct;
- cart behavior is correct;
- customer delivery or portal routing is correct;
- related links resolve;
- no unintended resource changed;
- the change record identifies success, partial failure, or rollback.

## Data Protection

Never commit or expose:

- Shopify access tokens or client secrets;
- customer names, emails, phone numbers, addresses, or order details;
- payment information;
- private app credentials;
- webhook signing secrets;
- unpublished proprietary customer files.

Use environment secrets and approved secret-management systems only.
