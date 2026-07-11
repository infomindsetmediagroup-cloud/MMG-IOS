# Checkpoint 014 — Storefront Inspection Runtime

## Objective

Give the authenticated Kairos executive session a real, read-only inspection capability for the Mindset Media Group Shopify storefront.

## Implemented

- storefront inspection executed inside the authenticated `/api/kairos` runtime
- hard allowlist for `https://themindsetmediagroup.com`
- Shopify sitemap and nested-sitemap discovery
- bounded crawl depth, page count, concurrency, response size, and request timeout
- page evidence for HTTP status, redirects, title, meta description, canonical URL, H1 headings, links, assets, and confirmed issues
- automatic audit-intent routing from `/api/kairos`
- compact verified evidence injection before Kairos generates its audit response
- audit and session traceability
- focused routing tests

## Security boundaries

- read-only GET inspection
- no arbitrary-host fetching
- no browser-supplied Shopify credential
- no additional serverless route, preserving the Vercel function limit
- existing signed operator session required through `/api/kairos`
- no mutation, theme publishing, product editing, or storefront deployment
- public storefront evidence is distinguished from unavailable Shopify Admin evidence

## Validation

- `npm test`
- `npm run typecheck`

## Follow-up

A separate Shopify Admin GraphQL 2026-07 adapter can add internal theme, product, collection, page, blog, and article inventory after its read scopes and server-side credential flow are approved.
