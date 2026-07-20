# MMG IOS / Kairos Operating System

Canonical production repository for the Mindset Media Group ecosystem and Kairos operating system.

## Production Scope

This repository contains only material required to build, operate, verify, or govern the platform:

- `MMGIOS/` and `MMGIOS.xcodeproj` — native SwiftUI application
- `cloudflare/mmg-ios/` — canonical Cloudflare Worker runtime and deployment contract
- `web/kairos-dashboard/` — Command Center and browser production assets
- `shopify/` — approved Shopify source, staging assets, governed release material, and validated GraphQL operations
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

## Shopify AI Toolkit

The official Shopify AI Toolkit is the required Shopify-aware engineering and governed store-operations layer for MMG/Kairos.

```bash
npm run shopify:toolkit:install
export OPT_OUT_INSTRUMENTATION=true
export SHOPIFY_CLI_NO_ANALYTICS=1
npm run shopify:toolkit:preflight
```

Store reads and approved mutations must use the repository wrappers:

```bash
npm run shopify:store:read -- --query-file <query.graphql>
npm run shopify:store:mutate -- --query-file <mutation.graphql> --approval-id <reference>
```

See `docs/runbooks/shopify-ai-toolkit.md` and `AGENTS.md` for installation, authentication, validation, mutation controls, production gates, rollback requirements, and Codex operating rules.

## Native Development

Minimum deployment target: iOS 17.0.

Use the repository make targets or XcodeGen configuration to generate and build the `MMGIOS` scheme on an iPhone simulator.

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
- Live publication, destructive changes, pricing, legal claims, structural redesign, and production store mutations require explicit executive approval.
- Direct live-theme mutation is disabled; theme work requires preview, approval, rollback evidence, publication, and public verification.
- New files must have a current production, validation, security, governance, or operational purpose.
