# Kairos Self-Hosted Runtime

Kairos is provider-independent and does not require a paid AI API.

## Runtime topology

```text
Kairos dashboard
  -> Cloudflare control plane
  -> policy, workflow, manifest, receipt, and deterministic planning engines
  -> optional self-hosted model endpoint
  -> Shopify, GitHub, storage, and business-system tools
```

The Cloudflare Worker is the always-available control plane. It does not host a large language model. The optional model runs on a user-controlled computer or server and must be exposed to the Worker through an authenticated HTTPS endpoint or a private service bridge.

## Default mode

The committed defaults are:

```toml
KAIROS_MODEL_PROVIDER = "deterministic"
KAIROS_MODEL_REQUIRED = "false"
KAIROS_MODEL_TIMEOUT_MS = "15000"
KAIROS_MODEL_NAME = "qwen2.5:7b-instruct"
KAIROS_SHOPIFY_WRITES_ENABLED = "false"
```

This mode has no inference charge. Kairos can classify objectives, select governed workflows, prepare plans, validate requests, enforce approvals, process receipts, and execute registered deterministic operations without a model.

## Optional local Ollama model

Start the local model:

```bash
docker compose -f docker-compose.kairos-local.yml up -d
```

The first start downloads `qwen2.5:7b-instruct`. Replace `KAIROS_MODEL_NAME` with a smaller compatible model when the machine cannot support the default.

A Cloudflare Worker cannot call `localhost` on the operator's computer. Provide an authenticated HTTPS bridge or private service endpoint, then configure:

```text
KAIROS_MODEL_PROVIDER=ollama
KAIROS_MODEL_ENDPOINT=https://private-model-endpoint.example
KAIROS_MODEL_AUTH_TOKEN=<secret>
KAIROS_MODEL_REQUIRED=false
```

Do not place `KAIROS_MODEL_AUTH_TOKEN`, `KAIROS_RUNTIME_TOKEN`, Shopify credentials, or manifest-signing keys in `wrangler.toml`. Store them as Cloudflare secrets.

## OpenAI-compatible self-hosted servers

Kairos also supports local servers exposing `/v1/chat/completions`, including llama.cpp and vLLM deployments:

```text
KAIROS_MODEL_PROVIDER=openai-compatible
KAIROS_MODEL_ENDPOINT=https://private-model-endpoint.example
KAIROS_MODEL_NAME=<served-model-name>
KAIROS_MODEL_AUTH_TOKEN=<optional-secret>
```

This compatibility mode does not imply use of OpenAI or any paid provider.

## Failure behavior

When `KAIROS_MODEL_REQUIRED=false`, endpoint failures, timeouts, and malformed model output automatically fall back to the deterministic planner. The response records `fallback: true` and a machine-readable `fallbackReason`.

Set `KAIROS_MODEL_REQUIRED=true` only for a future workflow that cannot safely continue without model inference. This is not the MMG default.

## API

### Public health

```http
GET /api/health
```

Reports provider mode, fallback status, whether a model endpoint is configured, and whether Shopify writes are enabled. It does not expose endpoint URLs or secrets.

### Protected provider status

```http
GET /api/kairos/intelligence
Authorization: Bearer <KAIROS_RUNTIME_TOKEN>
```

### Protected objective planning

```http
POST /api/kairos/plan
Authorization: Bearer <KAIROS_RUNTIME_TOKEN>
Content-Type: application/json

{
  "objective": "Prepare a new MMG digital product for Shopify",
  "context": {
    "productType": "digital_download"
  }
}
```

Planning never grants permission to perform a production mutation. Production execution still requires the existing signed manifest, scope firewall, approval reference, idempotency controls, and receipt evidence.

## Autonomy policy

The runtime remains at Autonomy Level 2, Draft Mode.

Automatic capabilities include research preparation, workflow selection, deterministic validation, draft planning, health checks, evidence preparation, and read-only operations already registered by policy.

Approval remains mandatory for pricing, live publication, production deployment, customer communications, financial commitments, permission changes, destructive actions, and Shopify writes.

## Deployment sequence

1. Run `npm test` and `npm run typecheck`.
2. Deploy the branch to a staging Worker.
3. Verify `/api/health` reports `paidApiRequired: false`.
4. Verify an authenticated `/api/kairos/plan` request returns a deterministic plan.
5. Keep `KAIROS_SHOPIFY_WRITES_ENABLED=false`.
6. Connect the optional Ollama endpoint only after its HTTPS authentication boundary is tested.
7. Promote to production only after the staging checks and approval review pass.

## Reduced operation when the local model is offline

Kairos continues to:

- enforce policies and approval gates;
- create and verify signed manifests;
- process deterministic workflow operations;
- maintain idempotency receipts;
- monitor health and business events;
- prepare draft execution plans;
- validate Shopify operation scope;
- surface model unavailability without claiming the business workflow is complete.
