# Shopify AI Toolkit Operations Runbook

## Purpose

Use Shopify's official AI Toolkit with Codex while preserving MMG/Kairos least-privilege, staging-first, approval, audit, and rollback requirements.

## 1. Install the Local Toolchain

From the repository root:

```bash
npm run shopify:toolkit:install -- --install-cli
```

This command:

1. Requires Node.js 22.12 or newer.
2. Requires Codex CLI.
3. Installs Shopify CLI when `--install-cli` is supplied and the CLI is missing.
4. Installs or updates `shopify@openai-curated`.
5. Creates `.env.shopify.local` with instrumentation disabled and the execution environment set to development.

The plugin is installed at the Codex user level. It is not vendored into this repository.

## 2. Configure the Development Environment

Edit `.env.shopify.local`:

```dotenv
OPT_OUT_INSTRUMENTATION=true
SHOPIFY_CLI_NO_ANALYTICS=1
MMG_SHOPIFY_ENVIRONMENT=development
SHOPIFY_STORE_DOMAIN=your-development-store.myshopify.com
MMG_SHOPIFY_MUTATION_APPROVED=0
MMG_SHOPIFY_CHANGE_ID=
MMG_SHOPIFY_ROLLBACK_PLAN=
MMG_SHOPIFY_PRODUCTION_CONFIRMATION=
```

Do not add Admin API tokens. `shopify store auth` manages its own stored authentication outside Git.

Run the diagnostic:

```bash
npm run shopify:toolkit:doctor
```

## 3. Authenticate With Least Privilege

Log in and authenticate the development store:

```bash
shopify auth login
shopify store auth \
  --store your-development-store.myshopify.com \
  --scopes read_products,read_metaobjects,read_themes
```

Request only the scopes required for the approved operation. Add write scopes only when an approved mutation requires them.

Confirm available authentication and store metadata:

```bash
shopify store auth list
shopify store info --store your-development-store.myshopify.com --json
```

## 4. Use the Toolkit During Development

Tell Codex to use the Shopify plugin whenever work involves Shopify Liquid, GraphQL, Functions, extensions, app configuration, metafields, metaobjects, customer accounts, or store operations.

Required sequence:

1. Retrieve current Shopify documentation and schemas through the toolkit.
2. Generate or revise the implementation.
3. Validate the relevant Shopify artifact through the toolkit.
4. Run repository tests and policy checks.
5. Execute authenticated store operations only through the governed wrapper.
6. Verify the resulting Shopify state.

## 5. Execute a Read-Only Store Query

```bash
npm run shopify:store:execute -- \
  --store your-development-store.myshopify.com \
  --query-file shopify/ai-toolkit/operations/shop-info.graphql \
  --json
```

Inline `--query` operations are blocked so the exact operation can be reviewed, hashed, and reproduced.

## 6. Execute an Approved Mutation

Create a dedicated `.graphql` mutation file under `shopify/ai-toolkit/operations/`. Validate it through the Shopify AI Toolkit before execution.

Set the approval controls locally:

```bash
export MMG_SHOPIFY_ENVIRONMENT=development
export MMG_SHOPIFY_MUTATION_APPROVED=1
export MMG_SHOPIFY_CHANGE_ID="MMG-SHOPIFY-CHANGE-0001"
export MMG_SHOPIFY_ROLLBACK_PLAN="Restore the captured pre-change values using the paired rollback operation."
```

Execute through the wrapper:

```bash
npm run shopify:store:execute -- \
  --store your-development-store.myshopify.com \
  --query-file shopify/ai-toolkit/operations/example-approved-mutation.graphql \
  --variable-file /secure/local/path/variables.json \
  --json
```

The wrapper adds `--allow-mutations` only after policy and approval checks pass. A local receipt is written under `artifacts/shopify-change-receipts/`; variables and credentials are not included.

## 7. Production Mutation Gate

Production is disabled by default. In addition to all normal mutation controls, set:

```bash
export MMG_SHOPIFY_ENVIRONMENT=production
export MMG_SHOPIFY_PRODUCTION_CONFIRMATION=APPROVE_MMG_SHOPIFY_PRODUCTION_MUTATION
```

This token is a deliberate execution acknowledgement, not a substitute for executive approval. Before a production mutation:

1. Capture the authoritative pre-change state.
2. Record the approved change ID.
3. Validate the operation and variables.
4. Confirm the target `*.myshopify.com` domain.
5. Confirm least-privilege scopes.
6. Confirm the rollback operation or restoration procedure.
7. Execute one bounded change.
8. Read the affected records back.
9. Verify storefront or portal behavior where applicable.
10. Preserve the change receipt with the release record.

## 8. CI and Repository Validation

Run:

```bash
npm run shopify:toolkit:policy
npm run check
```

CI verifies the canonical files, Node requirement, telemetry controls, required npm scripts, secret patterns, and direct mutation bypasses. CI does not authenticate to a store and does not run mutations.

## 9. Troubleshooting

### Codex plugin installation fails

Update Codex CLI and rerun:

```bash
npm run shopify:toolkit:install
```

### Shopify CLI is missing or outdated

```bash
npm install -g @shopify/cli@latest
shopify version
```

### Store execution says authentication is missing

Re-authenticate with only the required scopes:

```bash
shopify store auth \
  --store your-development-store.myshopify.com \
  --scopes read_products
```

### Mutation is blocked

Do not bypass the wrapper. Confirm the operation is approved, then set the change ID, rollback plan, environment, and mutation approval variables. Production also requires the exact production confirmation token.

### Instrumentation warning

Confirm both values are loaded in the shell or `.env.shopify.local`:

```bash
OPT_OUT_INSTRUMENTATION=true
SHOPIFY_CLI_NO_ANALYTICS=1
```
