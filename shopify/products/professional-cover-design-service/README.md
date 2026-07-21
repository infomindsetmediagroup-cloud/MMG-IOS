# Professional Cover Design Service™ — Canonical Service Product

This directory defines the first canonical MMG **service-product standard**. It converts the verified live Shopify product into a governed source, delivery, metadata, QA, and deployment contract that Kairos can reproduce for future services.

## Status

- Live Shopify product: active and unchanged by this branch.
- Candidate source: split into HTML, CSS, and JavaScript for review and testing.
- Deployment state: `candidate-not-deployed`.
- Production write authority: not granted by this package.

## Canonical contract

The service standard binds:

1. Shopify product identity, variants, SKUs, and prices.
2. A one-purchase/one-project commercial model.
3. Immediate Project Guide delivery followed by Customer Portal intake.
4. Scope validation before production.
5. Visible production milestones and quality assurance.
6. Organized final delivery and a connected next step.
7. A rollback-ready, approval-gated deployment path.

## Source layout

- `contract.json` — machine-readable product and delivery contract.
- `live-baseline.md` — verified live state and observed risks.
- `source/section.html` — semantic storefront structure.
- `source/styles.css` — scoped responsive presentation.
- `source/behavior.js` — read-only product hydration and customer-initiated cart behavior.
- `qa.md` — acceptance criteria.
- `deployment.md` — preflight, rollout, rollback, and verification procedure.

## Governing rule

The live product remains the source of customer truth until a separately approved deployment replaces its `descriptionHtml` or moves the implementation into a Shopify product template. A merge of this repository package does not authorize a Shopify mutation.
