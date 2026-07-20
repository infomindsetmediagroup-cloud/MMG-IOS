# MMG Shopify AI Toolkit

This directory is the governed repository boundary for Shopify-aware AI development and store operations.

## Canonical Components

- `policy.json` — machine-readable MMG/Kairos approval and execution policy.
- `operations/` — auditable GraphQL operations used through the governed wrapper.
- `../../scripts/shopify-ai-toolkit-install.mjs` — installs or updates the official Codex plugin and optionally Shopify CLI.
- `../../scripts/shopify-ai-toolkit-doctor.mjs` — verifies local tooling and governance configuration.
- `../../scripts/shopify-store-execute.mjs` — executes Shopify CLI store operations with mutation controls and local receipts.

## Mandatory Rules

1. Install the official Codex plugin: `shopify@openai-curated`.
2. Keep `OPT_OUT_INSTRUMENTATION=true` and `SHOPIFY_CLI_NO_ANALYTICS=1`.
3. Authenticate development and staging stores before production.
4. Use committed or staged GraphQL files; inline operations are prohibited.
5. Run store operations through `npm run shopify:store:execute`.
6. Never commit credentials, stored-auth material, operation variables containing secrets, or customer data.
7. Production mutations require explicit executive approval, a change ID, a rollback plan, and the exact production confirmation token.
8. Validate and verify every mutation before treating it as complete.

See `docs/workflows/shopify-ai-toolkit-operations.md` for the operating procedure.
