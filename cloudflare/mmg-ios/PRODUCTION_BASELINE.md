# Kairos Production Standard Baseline

**Baseline:** `kairos-production-standard-20260714`  
**Status:** Frozen  
**Production:** `https://mmg-ios.info-mindsetmediagroup.workers.dev`

## Canonical runtime

- Cloudflare Worker: `mmg-ios`
- Active entry: `src/kairos-production-entry-v19.js`
- Dashboard assets: `web/kairos-dashboard`
- Durable Object binding: `KAIROS_PROJECTS`
- Durable Object class: `KairosProject`
- Readiness registry: `kairos-readiness-registry-20260714-30`

## Verified application baseline

- Kairos Command Center loads from the Cloudflare Worker asset binding.
- Chrome Command Center hamburger uses the persistent layout shell.
- The menu button is not destroyed during telemetry or layout refresh.
- The generic hamburger controller excludes the Command Center-owned control.
- Dashboard HTML, JavaScript, CSS, and readiness responses use controlled no-store behavior where required.
- Readiness numbers are sourced from the canonical backend registry.

## Current readiness floors

- Knowledge: 87%
- Content: 89%
- Business: 85%
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
