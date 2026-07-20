# Shopify AI Toolkit Runbook

## Status

Canonical MMG/Kairos Shopify engineering and controlled store-operations layer.

## Architecture boundary

- **Kairos runtime:** production intelligence, orchestration, authorization, policy, and audit authority.
- **Shopify AI Toolkit:** Shopify documentation search, code generation guidance, validation, and CLI-assisted store execution.
- **GitHub:** source of truth, review history, release evidence, and rollback authority.
- **Shopify:** governed commerce and customer-facing infrastructure.

The toolkit does not receive OpenAI API keys and does not replace the Kairos backend.

## Requirements

- Node.js 22.12 or newer.
- Codex CLI installed and authenticated.
- Shopify CLI installed at the latest stable version.
- Access to the Kairos staging Shopify store.
- Minimum Admin API scopes for the operation being performed.

## One-time workstation setup

Run the repository installer:

```bash
npm run shopify:toolkit:install
```

The installer updates Shopify CLI to the latest stable version, adds the official `shopify@openai-curated` Codex plugin, and verifies both commands. The equivalent manual commands are:

```bash
npm install -g @shopify/cli@latest
codex plugin add shopify@openai-curated
```

Persist the MMG privacy controls in the developer shell or secure environment manager:

```bash
export OPT_OUT_INSTRUMENTATION=true
export SHOPIFY_CLI_NO_ANALYTICS=1
```

Copy `.env.example` into the local secret-management workflow and configure:

```bash
MMG_SHOPIFY_STAGING_STORE=<non-live-kairos-staging-store>.myshopify.com
MMG_SHOPIFY_PRODUCTION_STORE=mindsetmediagroup.myshopify.com
MMG_SHOPIFY_ALLOW_MUTATIONS=false
MMG_SHOPIFY_PRODUCTION_APPROVED=false
```

Never commit credentials, Shopify access tokens, or authenticated CLI state.

## Preflight

```bash
npm run shopify:toolkit:preflight
```

The preflight checks Node, Codex, Shopify CLI, privacy controls, and separation between staging and production store configuration.

## Authenticate a store

Request only the scopes required for the immediate operation:

```bash
shopify store auth \
  --store "$MMG_SHOPIFY_STAGING_STORE" \
  --scopes read_products
```

Re-run authentication when the token expires or required scopes change.

## Read-only smoke test

```bash
npm run shopify:store:read -- \
  --query-file shopify/graphql/read/store-identity.graphql \
  --store "$MMG_SHOPIFY_STAGING_STORE"
```

Read mode rejects any query file containing a GraphQL mutation.

## Approved staging mutation

Before executing a mutation:

1. Generate and validate the GraphQL operation with the Shopify toolkit.
2. Record the expected change, affected resources, approval reference, and rollback operation in the pull request or approved work order.
3. Confirm the target is the non-live Kairos staging store.
4. Open a narrow execution window:

```bash
export MMG_SHOPIFY_ALLOW_MUTATIONS=true
```

5. Execute through the governed wrapper:

```bash
npm run shopify:store:mutate -- \
  --query-file shopify/graphql/mutations/<approved-operation>.graphql \
  --variable-file shopify/graphql/variables/<approved-operation>.json \
  --store "$MMG_SHOPIFY_STAGING_STORE" \
  --approval-id <pull-request-or-work-order-reference>
```

6. Immediately close the mutation window:

```bash
export MMG_SHOPIFY_ALLOW_MUTATIONS=false
```

7. Verify the post-change state with a separate read query.

Each wrapper execution writes a local JSON receipt under `reports/shopify-operations/`. That directory is intentionally excluded from Git. Attach the relevant receipt to the governed change record when evidence must be retained.

## Production mutation boundary

Production is blocked unless all of the following are true:

- `--production` is supplied.
- The selected store matches `MMG_SHOPIFY_PRODUCTION_STORE`.
- `MMG_SHOPIFY_ALLOW_MUTATIONS=true`.
- `MMG_SHOPIFY_PRODUCTION_APPROVED=true`.
- `--approval-id` is supplied.
- The mutation was validated, reviewed, and has a rollback plan.

Example syntax, only during an approved production window:

```bash
npm run shopify:store:mutate -- \
  --production \
  --query-file shopify/graphql/mutations/<approved-operation>.graphql \
  --variable-file shopify/graphql/variables/<approved-operation>.json \
  --approval-id <executive-approval-reference>
```

Direct live-theme mutation remains disabled. Theme work follows pull, branch, validate, preview, approval, publish, archive, and public verification.

## Codex operating prompt

Use this repository instruction when assigning Shopify work:

```text
Use the official Shopify AI Toolkit. Search current Shopify documentation before writing code, validate every Shopify artifact with the appropriate toolkit skill, target Kairos staging by default, use minimum scopes, and do not execute mutations without the governed MMG wrapper and an approval reference. Preserve the existing MMG/Kairos architecture and return validation evidence.
```

## Validation and troubleshooting

```bash
npm run shopify:policy
npm run check
shopify store auth list --json
shopify store info --store "$MMG_SHOPIFY_STAGING_STORE" --json
```

Common failures:

- **Node version rejected:** install Node 22.12 or newer.
- **Codex missing:** install and authenticate Codex, then add `shopify@openai-curated`.
- **Shopify CLI missing:** install `@shopify/cli@latest` globally.
- **Store token missing or expired:** re-run `shopify store auth` with minimum scopes.
- **Mutation rejected:** confirm the approved query is a mutation, open the mutation window, and supply an approval reference.
- **Production rejected:** do not bypass the guard. Confirm executive approval, rollback evidence, and the exact production target.
