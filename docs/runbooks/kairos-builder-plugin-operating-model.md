# Kairos Builder Plugin Operating Model

## Objective

Use installed app-building plugins to improve architecture, tool design, validation, and delivery speed without turning those plugins into production dependencies or granting them operational authority.

## Canonical rule

Builder guidance can improve **how Kairos is built**. It cannot expand **what the active task is authorized to do**.

A manuscript task remains a manuscript task. It cannot touch Shopify, navigation, the homepage, products, pages, themes, menus, or store configuration.

## Registered advisors

### Build ChatGPT App

Use `openai-developers/build-chatgpt-app` when Kairos needs a ChatGPT Apps SDK, MCP, or widget surface. Apply its docs-first workflow, tool-first planning, explicit annotations, decoupled data/render pattern, CSP controls, and minimum working repository contract.

Do not add an Apps SDK or MCP dependency to the current manuscript runtime merely because the advisor is installed.

Official reference: https://developers.openai.com/

### Agents SDK

Use `openai-developers/agents-sdk` for explicitly approved prototypes, agent orchestration experiments, and focused evaluation harnesses. Follow single-agent-first design, narrow deterministic tools, explicit approval gates, a runnable smoke path, and health/readiness checks.

The active Cloudflare manuscript runtime does not require the OpenAI API. Adding an Agents SDK runtime or `OPENAI_API_KEY` remains a separate architectural decision requiring explicit approval.

Official reference: https://developers.openai.com/api/docs/guides/agents

### GitHub

Use the GitHub plugin for repository orientation, scoped branches, pull requests, CI evidence, and deployment traceability. Repository writes require an explicit user request and must stay within the active task scope.

### Shopify

Use Shopify developer guidance for documentation, GraphQL schema discovery, Liquid, extensions, and CLI validation. Shopify mutations remain available only through a separately approved Shopify workflow manifest. Manuscript workflows have zero Shopify access.

## Build sequence

1. Classify the requested app or module.
2. Select only the advisor relevant to that module.
3. Write the exact task contract: inputs, outputs, tools, state, approvals, and forbidden operations.
4. Build the smallest complete vertical slice.
5. Run syntax, unit, policy, and deployment-bundle validation.
6. Deploy only through the module-specific deployment lane.
7. Verify the live health endpoint and the exact workflow being activated.
8. Record what changed and confirm unrelated systems were untouched.

## Manuscript activation contract

The production manuscript lane permits:

- manuscript source upload and durable storage;
- manuscript intake and project setup;
- customer-supplied cover storage;
- editorial workbench operations;
- manuscript manufacturing and delivery operations;
- book-package generation;
- publishing-project status and artifact retrieval.

It denies:

- Shopify mutations;
- navigation and menu changes;
- homepage or page changes;
- theme changes;
- product publication and product-media installation;
- website-builder publication;
- unrelated API mutations;
- minute-level website reconciliation schedules.

## Activation evidence

The deployment is acceptable only when all of the following pass:

- manuscript boundary tests;
- Kairos scope-firewall tests;
- builder-plugin registry validation;
- Shopify governance validation;
- active Cloudflare Worker dry-run;
- deployed manuscript status endpoint returns `ready: true`;
- a deliberate Shopify mutation probe returns HTTP 403;
- no storefront mutation endpoint is called during deployment.
