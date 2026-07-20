# MMG IOS / Kairos Operating System

Canonical production repository for the Mindset Media Group ecosystem and Kairos operating system.

## Production Scope

This repository contains only material required to build, operate, verify, or govern the platform:

- `MMGIOS/` and `MMGIOS.xcodeproj` — native SwiftUI application
- `cloudflare/mmg-ios/` — canonical Cloudflare Worker runtime and deployment contract
- `web/kairos-dashboard/` — Command Center and browser production assets
- `shopify/` — approved Shopify source, staging assets, and governed release material
- `kairos/` — active platform modules, models, and orchestration logic
- `assets/` — approved brand and product assets used by production systems
- `docs/` — canonical Constitution, security architecture, technical decisions, and required runbooks
- `registry/` — active system, release, page, product, asset, and editorial registries
- `.github/workflows/` — build, validation, and deployment automation

Historical chat exports, duplicate completion reports, temporary audits, generated archives, screenshots, local caches, and superseded deployment adapters do not belong on `main`.

## Canonical Runtime

Cloudflare is the production browser runtime. The canonical Worker entry is:

```text
cloudflare/mmg-ios/src/kairos-production-entry.js
```

The browser assets are served from:

```text
web/kairos-dashboard/
```

The authoritative deployment receipt is:

```text
kairos-cloudflare-production: success
```

## Native Development

Minimum deployment target: iOS 17.0.

Use the repository make targets or XcodeGen configuration to generate and build the `MMGIOS` scheme on an iPhone simulator.

## Shopify AI Toolkit

Shopify development and controlled store operations use Shopify's official AI Toolkit and Shopify CLI under the MMG/Kairos governance wrapper.

```bash
npm run shopify:toolkit:install -- --install-cli
npm run shopify:toolkit:doctor
npm run shopify:toolkit:policy
```

Canonical policy and operating instructions:

```text
shopify/ai-toolkit/policy.json
docs/workflows/shopify-ai-toolkit-operations.md
```

## Validation

Before promotion:

```bash
npm run check
cd cloudflare/mmg-ios
npm run validate:production
npx wrangler deploy --dry-run
```

Production deployment is handled by `.github/workflows/deploy-cloudflare-production.yml`.

## Governance Boundary

- GitHub is the canonical source of truth for code, approved assets, version history, and production governance.
- Shopify customer-facing changes remain governed and staging-first.
- Live publication, destructive changes, pricing, legal claims, and structural redesign require explicit executive approval.
- Shopify mutations must run through the governed wrapper; direct mutation bypasses are prohibited.
- New files must have a current production, validation, security, governance, or operational purpose.
