# MMG/Kairos Cloudflare-Exclusive Deployment Doctrine

Status: Permanent implementation and operations doctrine.

## Canonical platform

Cloudflare is the sole active deployment, hosting, edge-runtime, and production-delivery platform for MMG/Kairos unless the Executive explicitly approves a future constitutional amendment.

Canonical production services include:

- Cloudflare Workers
- Cloudflare Pages or Worker static assets where applicable
- Cloudflare-managed DNS, routing, and edge delivery
- Cloudflare secrets, bindings, and environment configuration
- Cloudflare deployment verification and runtime health evidence

## Vercel retirement

Vercel is retired from the MMG/Kairos operating architecture.

Vercel must not be treated as:

- an active deployment target
- a hosting dependency
- a required build system
- a release gate
- a production health signal
- an authoritative status check
- a blocker for Cloudflare deployment or release decisions

Any legacy or external Vercel status check is non-authoritative and must be ignored when evaluating MMG/Kairos production readiness.

## Engineering rules

- New application and website work must target Cloudflare-compatible runtimes and deployment workflows.
- Do not add or restore Vercel configuration, adapters, deployment scripts, environment variables, documentation, or dependencies without explicit Executive approval.
- Do not describe a Vercel failure, warning, quota, or rate limit as an MMG/Kairos deployment failure.
- Production verification must rely on Cloudflare deployment completion, Worker or Pages runtime health, build identity, and verified application behavior.
- Preserve the current frozen Cloudflare deployment and authentication configuration unless a verified implementation requirement and explicit approval justify a change.

## Reporting standard

Future deployment reports must reference Cloudflare only. Legacy third-party status checks that are not part of the approved Cloudflare architecture must be excluded from operational conclusions.
