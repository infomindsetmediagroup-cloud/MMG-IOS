# MMG/Kairos Cloudflare Production Baseline

Status: reconciled and refrozen  
Baseline: `kairos-production-baseline-20260713-2`  
Canonical Worker entry: `src/kairos-production-entry.js`

## Runtime Structure

The production Worker uses one canonical entry module. It composes the retained publishing runtime with Website Retool, link intelligence, Website Intelligence, executive briefing, governed approval, approved-work dispatch, correction/resubmission, verified completion receipts, and scheduled operations.

Retained runtime foundation:

- `src/kairos-production-entry-v1.js` — publishing and production subsystem composition
- `src/kairos-production-entry-v2.js` — production exception and approved-work boundary
- `src/kairos-production-entry.js` — canonical Cloudflare entry and route composition

Obsolete incremental production wrappers and retired Vercel deployment adapters have been removed.

## Browser Baseline

Cloudflare serves `../../web/kairos-dashboard` through the `ASSETS` binding. Website Production remains at `web-003.html` with empty objective fields, customer-facing language, staging safeguards, verification, rollback, visual review, and separate live approval.

## Deployment Contract

A production success receipt requires:

1. Production validation.
2. Wrangler dry-run bundle validation.
3. Canonical Worker deployment.
4. Runtime health and header verification.
5. Durable project storage verification.
6. Publishing and product capability verification.
7. Website Production structural verification.
8. Empty objective-state verification.
9. Command Center and executive briefing verification.
10. Creation Engine asset verification.

The authoritative success check is:

```text
kairos-cloudflare-production: success
```

## Scheduled Operations

Website Intelligence and executive briefing preparation run through Cloudflare cron triggers:

```text
0 15 * * *
0 2 * * *
```

Scheduled runs prepare evidence and approval-ready work. They do not authorize live publication.

## Governance Boundary

- Diagnostics, evidence collection, and bounded staging preparation may run automatically.
- Customer-facing changes remain governed.
- Live publication, structural redesign, pricing, legal claims, and destructive actions require explicit executive approval.
