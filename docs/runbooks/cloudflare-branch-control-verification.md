# Cloudflare Branch-Control Verification

## Canonical release policy

- Production branch: `main`
- Non-production branch builds: enabled for preview validation only
- Pull-request and feature branches must not replace the canonical `mmg-ios` production Worker
- The protected GitHub workflow `.github/workflows/deploy-kairos-manuscript-runtime.yml` is the only governed production release path

## Verification procedure

1. Commit a documentation-only change to a non-production branch.
2. Confirm Cloudflare creates a preview or non-production build for that branch.
3. Confirm the canonical production Worker remains on the last approved `main` release.
4. Confirm GitHub validation completes independently of the preview build.
5. Record the preview result in PR #378 and close issue #379 only after the production service is proven unchanged.

## Acceptance criteria

- `main` is the only production branch.
- Non-production branches may build, but do not deploy to the canonical production Worker.
- Failed or unreviewed pull-request commits cannot become production.
- Production deployment requires the exact manual confirmation and release ID enforced by the governed GitHub Actions workflow.
