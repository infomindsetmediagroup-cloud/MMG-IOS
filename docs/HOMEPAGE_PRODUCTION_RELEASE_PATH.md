# Canonical Homepage Production Release Path

## Status

Locked production path for all MMG homepage refinements.

## Source of truth

Homepage source is maintained in:

- `cloudflare/mmg-ios/src/kairos-canonical-homepage-source-section-a-20260718.js`
- `cloudflare/mmg-ios/src/kairos-canonical-homepage-source-section-b-20260718.js`
- `cloudflare/mmg-ios/src/kairos-canonical-homepage-source-css-a-20260718.js`
- `cloudflare/mmg-ios/src/kairos-canonical-homepage-source-css-b-20260718.js`
- `cloudflare/mmg-ios/src/kairos-canonical-homepage-source-js-20260718.js`
- `cloudflare/mmg-ios/src/kairos-canonical-homepage-source-meta-20260718.js`

The builder/publisher remains:

- `cloudflare/mmg-ios/src/kairos-canonical-homepage-publisher-20260718.js`

## Required release sequence

1. Modify the canonical homepage source only.
2. Bump `BUILD` in `cloudflare/mmg-ios/src/kairos-production-entry-immutable-v1.js` to force a distinct Cloudflare release.
3. Use `.github/workflows/deploy-cloudflare-production.yml` as the single release authority.
4. Deploy and verify the matching Cloudflare Worker build.
5. Install the exact source bundle into the verified non-live `Kairos Staging` Shopify theme.
6. Require exact source read-back for Liquid, CSS, and JavaScript and semantic read-back for `templates/index.json`.
7. Promote the same verified source bundle to the Shopify `MAIN` theme with `PUBLISH_CANONICAL_MMG_HOMEPAGE_LIVE`.
8. Require published-theme read-back verification.
9. Verify the live storefront marker before declaring completion.

## Non-negotiable rules

- Do not create a second homepage publishing workflow.
- Do not bypass Kairos Staging source verification.
- Do not reconstruct source during live promotion.
- Do not publish a different bundle than the one verified in staging.
- Roll back a theme write when exact read-back fails.
- Visual refinements must preserve this release path unless the Founder explicitly replaces it.

## Proven production evidence

The path was proven by GitHub Actions run `29632059655`, where Worker deployment, matching release verification, Shopify staging installation, Shopify MAIN publication, and live storefront verification all completed successfully.
