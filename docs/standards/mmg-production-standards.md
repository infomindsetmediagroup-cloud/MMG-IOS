# MMG Production Standards

## General Execution

- Treat every production request as part of a live enterprise system.
- Preserve approved systems and templates unless the user explicitly requests redesign.
- Prefer complete implementation-ready deliverables over high-level planning.
- Validate links, routing, product behavior, source completeness, and ecosystem continuity.

## Source Code Standards

- Store full production source in GitHub when available.
- Never make partial code canonical.
- Keep Shopify Custom Liquid files complete and directly reusable.
- Preserve product-specific handles, prices, images, CTAs, metadata, internal links, and purchase behavior.
- Keep canonical source separate from draft fragments.

## Shopify Standards

Recommended storage paths:

```text
shopify/homepage/
shopify/pages/
shopify/products/
shopify/site-portals/
shopify/snippets/
shopify/themes/
shopify/qa/
```

## Naming Standards

Use descriptive lowercase paths with hyphens. Include version tags only when preserving a specific approved Golden Master or release artifact.

Examples:

```text
shopify/products/ai-prompting-for-beginners/custom-liquid-v1.3.1.html
shopify/pages/publishing-philosophy/source.html
releases/packages/mmg-fp-003-publishing-philosophy/release-notes.md
```

## QA Standards

Every meaningful shipped item should preserve:

- source file path
- Shopify destination or intended destination
- internal links checked
- critical CTAs checked
- mobile layout notes
- release date
- known issues or blockers

## Asset Standards

GitHub should store source records, prompts, generated asset notes, approved references, and canonical source files when available. Production image delivery may still use Shopify CDN or another optimized delivery layer.
