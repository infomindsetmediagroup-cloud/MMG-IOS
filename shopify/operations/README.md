# MMG Shopify Operations

This directory is the canonical operating layer for governed Shopify work performed by Kairos, Codex, ChatGPT, or another approved automation agent.

## Authority

- GitHub is the source of truth for approved Shopify source, product contracts, release history, and operating policy.
- The connected Shopify store is the source of truth for current live state.
- A live read must precede any recommendation or change.
- Shopify AI Toolkit validation is mandatory for Liquid, Admin GraphQL, Storefront GraphQL, app configuration, extensions, metafields, metaobjects, Shopify Functions, customer-account integrations, and store operations.
- The Shopify AI Toolkit supplements the secure Kairos runtime; it does not replace Kairos orchestration or approval controls.

## Documents

- [`live-baseline-2026-07-20.md`](./live-baseline-2026-07-20.md) — verified store, catalog, product, and collection snapshot.
- [`product-contracts.md`](./product-contracts.md) — canonical service, digital-download, and subscription contracts.
- [`change-control.md`](./change-control.md) — approval boundaries, preflight requirements, rollback rules, and production safeguards.
- [`workflows.md`](./workflows.md) — standard read, validation, mutation, and verification workflows.
- [`normalization-plan-2026-07-20.md`](./normalization-plan-2026-07-20.md) — exact product-type and SKU normalization proposal.
- [`link-audit-2026-07-20.md`](./link-audit-2026-07-20.md) — verified internal-link audit and separate temporary-redirect proposal.
- [`graphql/`](./graphql/) — validated preflight, forward, and rollback Admin GraphQL artifacts. Every mutation file is prepared-only and approval-gated.
- [`manifests/`](./manifests/) — machine-readable preconditions, proposed changes, untouched fields, rollback state, and postconditions.
- [`../../registry/shopify-product-contracts.json`](../../registry/shopify-product-contracts.json) — machine-readable product and governance registry.

## Prepared Change Sets

| Change-set ID | Scope | State |
|---|---|---|
| `shopify-product-normalization-20260720` | Two product types and four variant SKUs | Prepared; not approved; not executed |
| `shopify-temporary-dead-link-redirects-20260720` | Six temporary redirects to `/collections/all` | Prepared; not approved; not executed |

The two change sets are independent. Approval of one never authorizes the other.

## Default Operating Mode

1. Documentation, generation, static analysis, and schema validation may run automatically.
2. Read-only store inspection may run through governed automation.
3. Any mutation affecting products, variants, pricing, inventory, collections, media, themes, subscriptions, customer data, orders, discounts, content, publications, URL redirects, or production configuration requires explicit executive approval or a separately approved governed workflow.
4. Production changes require a pre-change snapshot, validation evidence, change record, rollback plan, and post-change verification.
5. No credential, token, secret, customer record, or private order data may be committed to this repository.

## Current State

The live catalog currently contains one canonical service product and one canonical digital-download product. Both product types remain blank and all four live SKUs remain null. The subscription product remains an approved target contract and has not yet been created in Shopify. Six product routes referenced by live page source are not currently backed by live products or exact-path redirects.
