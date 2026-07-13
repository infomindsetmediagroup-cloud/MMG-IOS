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

## GitHub-to-Cloudflare automatic deployment rule

The canonical production delivery path is:

```text
Approved GitHub push
→ GitHub deployment workflow triggers
→ workflow automatically deploys the approved build to Cloudflare
→ Cloudflare becomes the active deployed runtime for that commit
```

Operational consequences:

- Any approved GitHub push that triggers the configured deployment workflow is an automatic Cloudflare deployment event.
- No separate manual Cloudflare push should be assumed or requested after the workflow triggers.
- Do not describe a workflow-triggering GitHub push as merely committed, queued locally, or awaiting an additional deployment step.
- A triggered workflow means deployment to Cloudflare is in progress until the workflow completes or fails.
- A successfully completed deployment workflow is the authoritative evidence that the corresponding GitHub commit was delivered to Cloudflare.
- Runtime verification may still be performed after deployment, but it is verification of the deployed Cloudflare build, not a second deployment operation.
- Commits or pushes intentionally configured to skip the deployment workflow are not automatic Cloudflare deployment events.

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
- When a GitHub write triggers the deployment workflow, report that Cloudflare deployment has automatically started.
- When the workflow completes successfully, report the commit as deployed to Cloudflare; do not say a separate Cloudflare deployment is still required.

## Reporting standard

Future deployment reports must reference Cloudflare only. Legacy third-party status checks that are not part of the approved Cloudflare architecture must be excluded from operational conclusions.

For workflow-triggering pushes, use this reporting sequence:

1. `Committed to GitHub; automatic Cloudflare deployment triggered.`
2. `Cloudflare deployment completed successfully.` or the exact Cloudflare workflow failure state.
3. `Runtime verification completed.` when post-deployment verification evidence is available.
