# Kairos Customer Portal Production Status

Status: production implementation verified
Date: 2026-08-07

## Locked security boundary

- Customer identity is derived server-side from the Shopify Customer Account OAuth session.
- Browser-supplied customer identifiers are not trusted or forwarded.
- Customer project reads, approval mutations, and final-package access are ownership scoped.
- Cross-customer reads, mutations, and package resolution are non-disclosing.
- Unauthenticated `/customer-portal` requests are redirected to `/api/customer/auth/start`.
- The public Shopify `/pages/customer-portal` page is a gateway only; customer-specific data is served from the authenticated Kairos workspace.

## Required regression coverage

The required Kairos validation gate runs customer-account authentication, two-customer projection isolation, and Customer Portal runtime regression suites. The canonical Worker pipeline also runs customer security tests, synthetic WebKit E2E, a deployable Worker dry run, exact-SHA production verification, and the live OAuth/protected-portal boundary check.

## Deployment ownership

`deploy-kairos-canonical-worker.yml` remains the canonical GitHub Actions production deployment path for the Kairos Worker. The former `deploy-cloudflare-production.yml` and `deploy-cloudflare-workers.yml` automatic deployment paths are retired and non-deploying.

Cloudflare Workers Builds Git integration remains an external control-plane trigger because the repository's existing Cloudflare deploy credential does not have Workers CI/Builds configuration access. Attempts to remove that trigger were fail-closed and performed no mutation.

To prevent the external integration from becoming the final production writer, `finalize-kairos-after-cloudflare-builds.yml` runs on `main`, re-runs the Customer Portal security gate and Worker dry-run, observes the external `Workers Builds: mmg-ios` check, waits for that writer to finish when present, then deploys the exact current Git SHA and re-verifies deployment identity, Shopify Customer Account OAuth start, and the unauthenticated protected-portal redirect. This preserves the canonical GitHub-controlled build as the final live deployment until the Cloudflare account permission is changed and the external trigger can be removed.
