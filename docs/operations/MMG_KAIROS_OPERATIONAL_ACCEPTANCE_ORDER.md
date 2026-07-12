# MMG/Kairos Operational Acceptance Order

Status: executable production gate

Canonical runtime: `https://mmg-ios.info-mindsetmediagroup.workers.dev`

Canonical branch: `main`

## Order of execution

1. Confirm `/api/health` reports a ready Cloudflare Workers runtime.
2. Confirm the Command Center shell is served by Cloudflare assets, shares the API build fingerprint, includes the approved Kairos Shopify CDN header image, and loads the mobile resilience guards.
3. Send an authorized, non-destructive Kairos request and preserve request and audit identifiers.
4. Generate a fresh, source-grounded Shopify theme proposal through `/api/theme-plan`.
5. Review the bounded file set, source hashes, expected benefits, risks, and rollback plan.
6. Execute `/api/actions` with `shopify.theme.files.upsert` only when the explicit production mutation switch and approval phrase are both supplied.
7. Require published-theme verification, per-file before/after hashes, backup metadata, rollback availability, and verified completion evidence.
8. Preserve the resulting JSON acceptance report in the workflow run summary.

## Safety boundary

The workflow is `workflow_dispatch` only. Repository pushes do not run it and do not consume Actions minutes.

Proposal validation is the default. Production mutation is refused unless all of the following are present:

- `execute_shopify_mutation` is enabled.
- `KAIROS_RUNTIME_TOKEN` is configured as a repository secret.
- The approval phrase is exactly `EXECUTE GOVERNED SHOPIFY ACCEPTANCE`.
- Kairos produces a non-empty source-grounded mutation plan.
- The published Shopify theme still matches the proposal theme ID.
- Every target file still matches its expected SHA-256 source hash.

The runtime must automatically roll back completed writes if any subsequent write or verification fails. A run is not accepted unless the returned evidence confirms the published theme, verified file hashes, backup metadata, and rollback availability.

## Execution interface

Run **Manual MMG Kairos Operational Acceptance** from GitHub Actions.

Use proposal-only mode first. Inspect the generated proposal evidence in the job summary. Enable production mutation only after the bounded proposal is acceptable.

The executable implementation is `scripts/validate-operational-acceptance.mjs`.
