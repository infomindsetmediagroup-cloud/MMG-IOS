# ADR: Shopify AI Toolkit Adoption

- **Status:** Accepted
- **Date:** 2026-07-20
- **Decision owner:** MMG Executive / Kairos Engineering
- **Scope:** Shopify development, validation, and controlled store operations

## Context

MMG/Kairos requires a Shopify-aware engineering layer that uses current Shopify documentation, API schemas, validation capabilities, and Shopify CLI store operations. General model knowledge alone is not an acceptable authority for Shopify implementation or mutation work.

## Decision

Adopt Shopify's official AI Toolkit as the canonical Shopify engineering and execution layer. Codex environments must install the official `shopify@openai-curated` plugin. Shopify CLI is the governed interface for authenticated store operations.

The toolkit supplements the secure Kairos OpenAI API runtime. It does not replace Kairos as the production intelligence, orchestration, approval, or customer-facing runtime.

## Control Boundary

| Capability | Default authority |
|---|---|
| Documentation lookup, generation, schema review, and static validation | Automatic |
| Read-only authenticated store queries | Governed automatic |
| Development and staging mutations | Explicit approval, change ID, rollback plan, validation, receipt |
| Production mutations | Executive approval, change ID, rollback plan, exact confirmation, verification |

Direct use of `--allow-mutations` outside the governed wrapper is prohibited. The wrapper supplies the flag only after the applicable controls pass.

## Privacy and Security

- `OPT_OUT_INSTRUMENTATION=true` is mandatory unless the executive owner explicitly authorizes Shopify instrumentation.
- `SHOPIFY_CLI_NO_ANALYTICS=1` is mandatory.
- Shopify credentials and stored-auth material remain outside Git.
- Operation receipts record metadata and hashes, not credentials or operation variables.
- Least-privilege scopes and environment separation are required.

## Consequences

- Future Shopify Liquid, Admin GraphQL, Storefront GraphQL, Functions, extensions, metafields, metaobjects, app configuration, and store-operation work must use Shopify Toolkit context and validation.
- Development and staging are the initial execution targets.
- Production access remains disabled until authentication, approval, rollback, and verification controls are deliberately configured.
- The repository provides bootstrap, diagnostic, policy, execution, and CI enforcement surfaces.
