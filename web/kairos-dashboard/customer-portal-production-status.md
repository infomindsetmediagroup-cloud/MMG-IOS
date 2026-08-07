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

`deploy-kairos-canonical-worker.yml` is the canonical GitHub Actions production deployment path for the Kairos Worker. The former `deploy-cloudflare-production.yml` and `deploy-cloudflare-workers.yml` automatic deployment paths are retired and non-deploying.

Cloudflare Workers Builds Git integration remains an external control-plane trigger because the repository's existing Cloudflare deploy credential does not have Workers CI/Builds configuration access. Attempts to remove that trigger were fail-closed and performed no mutation. The canonical exact-SHA deployment must therefore be verified as the final live deployment after repository changes until that Cloudflare account permission is changed.
