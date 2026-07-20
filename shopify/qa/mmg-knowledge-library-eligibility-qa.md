# MMG Knowledge Library Eligibility — QA Contract

**Version:** 1.0.0  
**Status:** Staging required before publication  
**Authority:** `registry/knowledge-library/mmg-knowledge-library-contract-v1.json`

## Metafield Definition Tests

- Namespace is exactly `mmg`.
- Owner type is `PRODUCT`.
- All canonical fields exist with compatible Shopify types.
- Product type, asset status, experience level, format, and customer destination use approved values only.
- Asset ID is unique across the digital-asset registry.
- Subscription value is an integer of at least 1.
- Services and the subscription product cannot set `subscription_eligible` to true.

## Public Catalog Tests

- Active digital downloads with required public metadata appear.
- Draft, approved-but-unreleased, and retired assets do not appear as active public assets.
- Services do not appear as selectable library assets.
- The MMG Knowledge Subscription product does not appear as a selectable library asset.
- Portrait covers render without clipping and preserve the 2:3 storefront role.
- The Included with Membership badge does not render unless the complete subscription metadata predicate passes.

## Subscription Selection Tests

- Anonymous visitors cannot enter authoritative selection mode.
- Customers without an active MMG Knowledge Subscription cannot confirm a title.
- Owned assets are excluded or marked unavailable and cannot be selected again.
- Closed, expired, canceled, or not-yet-open windows reject selection.
- Assets with missing square thumbnails remain blocked.
- Assets with missing or unverified delivery-package references remain blocked.
- An asset requiring more units than remain is unavailable.
- The same asset cannot be selected twice in one window.
- Services, subscriptions, retired assets, and unavailable products are rejected server-side even when a browser request is manually altered.

## First Package Tests

- Post-purchase action reads **Choose Your First Two Titles**.
- Window capacity is exactly 2 units.
- Two one-unit assets may be confirmed.
- A third one-unit asset is rejected.
- Selection does not occur inside Shopify checkout.
- Confirmation creates active delivery grants and makes the assets visible in My Library.

## Scheduled Package Review Tests

- Kairos proposes exactly two assets per package.
- Review window is never shorter than 24 hours or longer than 48 hours.
- Customer may accept, swap an eligible title, or confirm while the window is open.
- Swap candidates pass the same ownership, eligibility, unit, and delivery checks.
- Closing confirmation creates one customer-facing library entry per asset ID.

## Public Source Privacy Tests

- Product metadata JSON contains public catalog fields only.
- Customer ownership grants are absent.
- Subscription contract identifiers are absent.
- Authoritative remaining-unit totals are absent.
- Protected delivery URLs are absent.
- `serverDecisionRequired` remains true.

## Liquid Integration Tests

- Metadata stylesheet is loaded once per page or section, not once per product card.
- Card integration renders the eligibility badge and JSON data record.
- JSON output remains valid when optional series and related-asset fields are blank.
- Product titles, handles, URLs, and metafield text are JSON encoded.
- No `100vw`, negative-margin breakout, body mutation, or `#MainContent` override is introduced.
- Badge wraps naturally on narrow screens.

## AI Image Mastery Seed Tests

- Asset ID is `mmg-dd-ai-image-mastery-001`.
- Canonical path is `/products/ai-image-mastery`.
- Product type is `digital_download`.
- Subscription value is 1.
- Public catalog status remains active.
- Subscription selection remains blocked until the square thumbnail, delivery package, metafield writes, and runtime IDs are verified.

## Publication Gate

Do not activate the subscription picker on the live Knowledge Library until Shopify metafield definitions are provisioned, selectable products have complete verified metadata, Kairos authentication and ownership checks are operational, and all mode-boundary tests pass.
