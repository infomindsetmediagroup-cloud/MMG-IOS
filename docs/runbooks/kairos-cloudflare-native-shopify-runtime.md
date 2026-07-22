# Kairos Cloudflare-Native Shopify Runtime

## Status

This runtime is deterministic and Cloudflare-native.

- Vercel is prohibited.
- OpenAI is not required and no OpenAI API call exists in the runtime path.
- Shopify writes are disabled by default.
- Arbitrary GraphQL execution is prohibited.
- Every task receives a signed, expiring operation manifest.
- A task grants no authority outside its exact workflow, operation, resource, target, fields, and file paths.

## Non-negotiable operation boundary

A manuscript request cannot touch Shopify.

A product request cannot touch navigation, pages, themes, another product, or store settings.

A page request cannot touch navigation, products, themes, another page, or store settings.

A menu request cannot touch products, pages, themes, another menu, or store settings.

A theme-file request can touch only the exact approved filenames on one verified `UNPUBLISHED` theme. It cannot write to the `MAIN` theme and cannot publish a theme.

Any unrelated operation fails closed. User intent does not imply store-wide authority.

## Cloudflare secrets

Configure these through Cloudflare or Wrangler. Never commit their values.

```bash
wrangler secret put KAIROS_RUNTIME_TOKEN
wrangler secret put KAIROS_MANIFEST_SIGNING_KEY
wrangler secret put SHOPIFY_STORE_DOMAIN
```

Choose one Shopify credential mode.

### Existing Admin API access token

```bash
wrangler secret put SHOPIFY_ADMIN_ACCESS_TOKEN
```

### Client credentials

```bash
wrangler secret put SHOPIFY_CLIENT_ID
wrangler secret put SHOPIFY_CLIENT_SECRET
```

`SHOPIFY_STORE_DOMAIN` must be the exact `*.myshopify.com` domain, not the public storefront domain.

## Receipt persistence

Production write execution requires a Cloudflare KV binding named `KAIROS_RECEIPTS`. The runtime stores immutable receipts and idempotency records for 90 days.

Create the namespace and add the returned namespace ID to `wrangler.toml`:

```bash
wrangler kv namespace create KAIROS_RECEIPTS
```

```toml
[[kv_namespaces]]
binding = "KAIROS_RECEIPTS"
id = "<cloudflare-kv-namespace-id>"
```

Do not enable Shopify writes until this binding exists and receipt persistence has been verified.

## Shopify app scopes

Grant only the scopes required for the workflows Kairos will use.

| Workflow | Accepted scope groups |
|---|---|
| Verify installation | Store identity and current app installation query |
| Product update | `read_products`, `write_products` |
| Page update | `read_content` or `read_online_store_pages`; `write_content` or `write_online_store_pages` |
| Menu update | `read_online_store_navigation`, `write_online_store_navigation` |
| Unpublished theme files | `read_themes`, `write_themes` |

The runtime verifies granted scopes through `currentAppInstallation.accessScopes` before executing a registered operation.

## Deployment sequence

1. Keep `KAIROS_SHOPIFY_WRITES_ENABLED = "false"`.
2. Configure the required secrets.
3. Configure `KAIROS_RECEIPTS`.
4. Run repository checks.
5. Deploy the Worker.
6. Verify health.
7. Verify the Shopify installation and read the granted scopes.
8. Confirm that a manuscript manifest cannot execute a Shopify operation.
9. Confirm that a mismatched Shopify target is rejected.
10. Confirm that all writes are rejected while the global write gate is false.
11. Enable writes only through a separately approved production change.

## Health verification

```bash
curl -sS https://<worker-host>/api/health
```

Expected identity:

```json
{
  "runtime": "cloudflare",
  "vercel": false,
  "openAi": false,
  "deterministic": true,
  "shopifyWritesEnabled": false
}
```

## Shopify installation verification

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $KAIROS_RUNTIME_TOKEN" \
  -H "Content-Type: application/json" \
  https://<worker-host>/api/kairos/verify-shopify
```

The receipt must identify the expected store, current app installation, and granted scopes. It must not contain Shopify credentials.

## Write authorization sequence

A Shopify write requires all of the following:

1. A registered workflow.
2. One exact resource target.
3. An exact field allowlist.
4. Exact file paths for theme operations.
5. An approval reference and approval timestamp.
6. The same approval reference in `X-Kairos-Explicit-Approval` when the manifest is issued.
7. A valid HMAC-signed manifest.
8. An unexpired 30-minute manifest window.
9. `KAIROS_SHOPIFY_WRITES_ENABLED = "true"`.
10. A unique idempotency key.
11. Persistent receipt storage.
12. Required Shopify scopes.
13. A successful pre-mutation read.
14. No Shopify GraphQL or user errors.
15. A successful post-mutation readback.
16. A receipt whose digest covers the complete execution evidence.

Failure of any requirement denies the operation.

## Registered Shopify operations

- `shopify.verifyInstallation`
- `shopify.product.update`
- `shopify.page.update`
- `shopify.menu.update`
- `shopify.theme.unpublishedFiles.upsert`

Not registered and therefore impossible through this runtime:

- Arbitrary GraphQL
- Theme publication
- Live-theme file writes
- Theme deletion
- Order cancellation
- Refunds
- Gift-card writes
- Staff writes

New operations require Shopify documentation review, schema discovery, GraphQL validation, a narrow workflow contract, scope-firewall tests, and explicit code review before registration.
