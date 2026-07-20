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
ai-toolkit/   Shopify AI Toolkit policy, auditable GraphQL operations, and governed execution contract.
```

## Rule

Store full production source whenever available. Do not store abbreviated page code as the canonical version.

Shopify-aware AI development and authenticated store operations must follow `ai-toolkit/policy.json` and `docs/workflows/shopify-ai-toolkit-operations.md`.
