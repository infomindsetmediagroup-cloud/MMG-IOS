# Shopify Source

This folder stores the canonical source for the current MMG Shopify site.

## Subfolders

```text
pages/        Custom Liquid and page source for public Shopify pages.
products/     Product page source, product-specific Custom Liquid, product metadata, and purchase-flow notes.
homepage/     Homepage Golden Master source and revisions.
portals/      Customer Portal, Admin Portal, and related portal page source.
snippets/     Reusable Shopify snippets and Liquid fragments.
themes/       Theme-level notes, section references, and deployment records.
qa/           Shopify-specific QA notes, link checks, and release validation.
operations/   Live baselines, product contracts, workflows, governance, and change control.
```

## Operational Baseline

Start with [`operations/README.md`](./operations/README.md) before any Shopify inspection, generation, validation, or store operation.

The connected Shopify store is authoritative for current live state. GitHub is authoritative for approved source, product contracts, release history, governance, and rollback material.

## Rule

Store full production source whenever available. Do not store abbreviated page code as the canonical version.

Any customer-facing mutation must follow the approval, validation, snapshot, rollback, and post-change verification requirements in [`operations/change-control.md`](./operations/change-control.md).
