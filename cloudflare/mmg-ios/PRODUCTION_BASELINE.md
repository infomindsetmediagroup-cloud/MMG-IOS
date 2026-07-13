# MMG/Kairos Cloudflare Production Baseline

Status: reconciled and refrozen
Baseline: `kairos-production-baseline-20260713-1`
Canonical Worker entry: `src/kairos-production-entry.js`

## Runtime structure

The production Worker now uses one canonical entry module. The entry composes the retained publishing runtime with the governed Website Retool, link intelligence, Website Intelligence supervisor, and scheduled execution services.

Retained runtime foundation:

- `src/kairos-production-entry-v1.js` — publishing and production subsystem composition
- `src/kairos-production-entry-v2.js` — production exception boundary
- `src/kairos-production-entry.js` — canonical Cloudflare entry and route composition

Obsolete incremental production wrappers `v3` through `v15` were removed after their active behavior was consolidated into the canonical entry.

## Browser baseline

Cloudflare serves the dashboard from `../../web/kairos-dashboard` through the `ASSETS` binding. Website Production is maintained at `web-003.html` with empty objective fields, simplified customer-facing language, staging safeguards, verification, rollback, visual review, and separate live approval.

## Deployment contract

The production workflow must pass all of the following before publishing a success receipt:

1. Install Worker dependencies.
2. Run `npm run validate:production`.
3. Complete a Wrangler dry-run bundle validation.
4. Deploy the canonical Worker.
5. Verify the canonical runtime header in the browser.
6. Verify the native publishing/product-asset foundation remains operational.
7. Verify Website Production contains no prefilled objective prompt.
8. Verify the Creation Engine browser asset remains available.

The authoritative success check is the GitHub commit status:

`kairos-cloudflare-production: success`

## Scheduled operations

Website Intelligence runs twice daily through Cloudflare cron triggers:

- `0 15 * * *`
- `0 2 * * *`

These runs prepare evidence and approval-ready work. They do not authorize live publication.

## Governance boundary

- Diagnostics, evidence collection, and bounded staging preparation may run automatically.
- Customer-facing changes remain governed.
- Live publication, structural redesign, pricing, legal claims, and destructive actions require explicit executive approval.
