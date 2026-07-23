# Cloudflare Branch-Control Verification

## Canonical release policy

- Production branch: `main`
- Non-production branch builds: enabled for preview validation only
- Production deploy command: `npx wrangler versions upload`
- Non-production branch deploy command: `npx wrangler versions upload`
- Root directory: `cloudflare/mmg-ios`
- Pull-request and feature branches must not replace the canonical `mmg-ios` production Worker
- The protected GitHub workflow `.github/workflows/deploy-kairos-manuscript-runtime.yml` is the only governed production release path

## Verification procedure

1. Commit a documentation-only change to a non-production branch.
2. Confirm Cloudflare creates a non-production build for that branch.
3. Confirm Cloudflare executes `npx wrangler versions upload`, not `npx wrangler deploy`.
4. Confirm the canonical production Worker remains on the last approved release.
5. Confirm GitHub validation completes independently of the non-production build.
6. Record the result in PR #378 and close issue #379 only after the release controls are verified.

## Verified configuration

The Cloudflare dashboard was visually verified on 2026-07-23 with the following settings:

- Production branch: `main`
- Builds for non-production branches: enabled
- Deploy command: `npx wrangler versions upload`
- Non-production branch version command: `npx wrangler versions upload`
- Build command: none
- Root directory: `cloudflare/mmg-ios`

Because this Worker uses Durable Objects, Cloudflare does not provide a normal preview URL. Version upload remains the required non-promoting branch behavior.

## Acceptance criteria

- `main` is the only production branch.
- Non-production branches may build and upload versions, but do not promote them to active production traffic.
- Failed or unreviewed pull-request commits cannot become production.
- Production deployment requires the exact manual confirmation and release ID enforced by the governed GitHub Actions workflow.
