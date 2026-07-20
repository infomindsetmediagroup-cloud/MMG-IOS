# MMG / Kairos Agent Operating Rules

## Shopify AI Toolkit

The official Shopify AI Toolkit is the mandatory Shopify-aware engineering layer for this repository.

1. Use the Codex plugin `shopify@openai-curated`.
2. Search Shopify documentation through the toolkit before generating Shopify code.
3. Validate Liquid, Admin GraphQL, app configuration, extensions, Functions, metafields, metaobjects, and customer-account integrations through the relevant Shopify toolkit skill before committing.
4. Keep `OPT_OUT_INSTRUMENTATION=true` and `SHOPIFY_CLI_NO_ANALYTICS=1` in MMG development environments.
5. Use the minimum Shopify Admin API scopes required for the current operation.
6. Default all store execution to the non-live Kairos staging store.
7. Do not run a mutation through raw `shopify store execute`. Use `npm run shopify:store:mutate -- ...` so approval, production, telemetry, and receipt controls are enforced.
8. Do not modify a live Shopify theme, pricing, inventory, subscriptions, customer data, legal claims, or production configuration without explicit executive approval and a rollback plan.
9. Preserve the canonical path: feature branch → pull request → validation → merge → governed deployment → authenticated Shopify publication → public verification.
10. The Shopify toolkit supplements the Kairos OpenAI API runtime. It does not replace Kairos orchestration, server-side secrets, authorization, audit records, or production policy.

Run `npm run shopify:toolkit:preflight` before Shopify work and `npm run check` before promotion.
