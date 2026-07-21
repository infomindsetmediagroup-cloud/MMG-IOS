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
- [`../../registry/shopify-product-contracts.json`](../../registry/shopify-product-contracts.json) — machine-readable product and governance registry.

## Default Operating Mode

1. Documentation, generation, static analysis, and schema validation may run automatically.
2. Read-only store inspection may run through governed automation.
3. Any mutation affecting products, variants, pricing, inventory, collections, media, themes, subscriptions, customer data, orders, discounts, content, publications, or production configuration requires explicit executive approval or a separately approved governed workflow.
4. Production changes require a pre-change snapshot, validation evidence, change record, rollback plan, and post-change verification.
5. No credential, token, secret, customer record, or private order data may be committed to this repository.

## Current State

The live catalog currently contains one canonical service product and one canonical digital-download product. The subscription product remains an approved target contract and has not yet been created in Shopify.
