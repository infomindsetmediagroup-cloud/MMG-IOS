# Kairos Rebuild Reconciliation — 2026-07-11

## Canonical production baseline

- Runtime shell: `web/kairos-dashboard/index.html`
- Shell controller: `web/kairos-dashboard/scripts/runtime-reset-dashboard.js`
- Shell styling: `web/kairos-dashboard/styles/runtime-reset.css`
- Cloudflare Worker: `cloudflare/mmg-ios/src/reset-worker.js`
- Wrangler entry point: `cloudflare/mmg-ios/wrangler.toml`
- Canonical visual doctrine: `docs/KAIROS_COMMAND_CENTER_SHELL_DOCTRINE.md`
- Archived prototype branch: `archive/kairos-prototype-runtime-20260711`

## Rebuild rules

1. Preserve the canonical Kairos shell unless executive approval authorizes a material visual change.
2. Build capabilities one vertical at a time.
3. A capability remains non-interactive until its backend route exists and its failure states are visible.
4. No external mutation capability may be marked operational without source validation, bounded execution, read-back verification, rollback preparation, approval controls, and recorded evidence.
5. Parent cards may expose planned capabilities, but planned or disabled items must not simulate execution.
6. Every promoted capability must have a named route, evidence schema, acceptance criteria, and rollback boundary.
7. Production publishing remains disabled until the Shopify staging-theme vertical passes all acceptance criteria.

## Parent operating centers

- Executive Operations
- Shopify & Website
- Products & Production
- Knowledge
- System & Release

## Capability sequence

1. Live storefront inspection — read-only public evidence.
2. Shopify credential validation — read-only Admin API evidence.
3. Staging-theme discovery or creation.
4. Staging-theme bounded file mutation.
5. Read-back verification and rollback package.
6. Executive preview and approval.
7. Controlled publication and live verification.
8. Product creation and publication.
9. Collections and navigation.
10. Production, customer delivery, knowledge, and autonomous department capabilities.

## Current operational truth

The only newly activated rebuild vertical is live public storefront inspection. Theme mutation, theme publication, product publication, collections, and navigation remain disabled or unimplemented until separately promoted with evidence.
