# MMG-IOS Accepted Production Baseline

Status: FROZEN / ACCEPTED
Date: 2026-07-13
Repository: infomindsetmediagroup-cloud/MMG-IOS
Accepted application commit: 3b6cadcfefa7b3102283d9c4bb2be8da1a6ba116
Accepted Cloudflare workflow run: 29264793668
Deployment context: kairos-cloudflare-production

## Executive acceptance

The full Kairos Command Center and the standalone Website Production / Website Retool workspace were manually accepted on iPhone Safari by the executive user.

Accepted behavior:
- Full Command Center loads successfully in Safari.
- Website Production / Website Retool opens and functions correctly.
- Mobile layout no longer blows out, clips, or stalls.
- Main shell uses staged module loading to avoid Safari startup freezes.
- Static browser routes bypass the production API handler chain and resolve directly through the Cloudflare assets binding.
- Website Production uses the standalone mobile-first workspace instead of the unstable injected mobile overlay.
- Shopify website execution remains governed and staging-first.
- No promotion of the published Shopify theme is authorized by this baseline.

## Freeze directive

This record establishes the current production state as the canonical MMG-IOS baseline. Future changes must be implemented as explicit, bounded work above this baseline and must not silently alter the accepted mobile loading, routing, Website Production flow, staging safeguards, or deployment behavior.

## Canonical production entry points

- Command Center: /
- Website Production: /web-003.html

## Release proof

The accepted application commit received a successful `kairos-cloudflare-production` deployment receipt before this baseline record was created.
