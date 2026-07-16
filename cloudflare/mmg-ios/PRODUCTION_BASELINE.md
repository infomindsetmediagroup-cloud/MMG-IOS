# Kairos Production Standard Baseline

**Baseline:** `kairos-production-standard-20260715-19`
**Status:** Frozen  
**Production:** `https://mmg-ios.info-mindsetmediagroup.workers.dev`

## Canonical runtime

- Cloudflare Worker: `mmg-ios`
- Active entry: `src/kairos-production-entry-v33.js`
- Dashboard assets: `web/kairos-dashboard`
- Durable Object binding: `KAIROS_PROJECTS`
- Durable Object class: `KairosProject`
- Dashboard build: `kairos-command-hub-routed-20260715-2`
- Readiness registry: `kairos-readiness-registry-20260714-31`

## Verified application baseline

- Kairos Command Center loads from the Cloudflare Worker asset binding.
- Chrome Command Center hamburger uses the persistent layout shell.
- The menu button is not destroyed during telemetry or layout refresh.
- The generic hamburger controller excludes the Command Center-owned control.
- Dashboard HTML, JavaScript, CSS, and readiness responses use controlled no-store behavior where required.
- Readiness numbers are sourced from the canonical backend registry.
- All 25 child workspaces have an operational routed action contract.
- Website Retool supports proposal review, non-live staging execution, responsive preview links, explicit preview approval, explicit live apply/save, live read-back verification, and recorded rollback.
- Theme-file upserts wait for Shopify's asynchronous write job to finish before any source read-back or completion claim.
- Supporting section and asset files are installed before dependent JSON templates, and the template write is paired with an installed dependency so Shopify can return an authoritative asynchronous job result.
- Exact MD5 receipts or SHA-256 job-body results verify every staged file; advisory operation-result size metadata cannot override stronger integrity evidence.
- Approved website files are source-hash bound and promoted into the current MAIN theme without changing Shopify theme roles.

## Current readiness floors

- Knowledge: 87%
- Content: 89%
- Business: 86%
- Customers: 88%
- Operations: 100%

## Production gates

Every change to this baseline must pass:

1. Complete production validation suite
2. Reconciled baseline validation
3. Canonical Cloudflare Worker bundle validation
4. Cloudflare deployment
5. Live production verification
6. Deployment receipt publication

## Freeze rule

No capability expansion, readiness increase, runtime wrapper, asset-loader change, navigation change, or Cloudflare configuration change may be added to this baseline without explicit executive approval. Maintenance fixes must preserve the manifest and update it only after the replacement state passes all production gates.
