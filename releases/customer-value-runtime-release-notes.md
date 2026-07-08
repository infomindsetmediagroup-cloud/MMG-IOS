# Customer Value Runtime Release Notes

## Scope

This release package records the customer-value runtime work added to the MMG-IOS repository during the current execution sequence.

## Completed Batches

- Added customer value doctrine panel to the Kairos dashboard runtime.
- Seeded customer value and stewardship doctrine into dashboard state.
- Styled customer value runtime controls, progress bars, action buttons, and priority cards.
- Documented the customer value runtime doctrine under repository doctrine records.
- Clarified README execution mode standards.
- Registered customer-facing value surfaces across website, dashboard, onboarding, Knowledge Library, Shopify, and service pages.
- Added customer value runtime backlog with acceptance criteria.
- Added customer value copy bank with homepage hero options, Kairos positioning lines, dashboard microcopy, and language guardrails.
- Wired the customer value doctrine into the web admin local operator.
- Added customer value Shopify read models, product value-context inference, and commerce snapshot support.
- Added reusable SwiftUI customer value components for native app surfaces.
- Added a native Customer Value overview screen.
- Wired the Customer Value overview screen into the native app root as the first tab.
- Rendered customer-value data inside the dashboard command-center brief panel.
- Expanded the dashboard runtime with income, asset, audience, and execution pathways.
- Seeded customer-value pathways, stronger guidance rules, and expanded tone guardrails into dashboard state.
- Bound dashboard doctrine rendering directly to `kairosState.brandDoctrine` and `kairosState.stewardshipDoctrine`.
- Added a Shopify homepage customer-value hero markup package.
- Added Shopify homepage hero styling and installation notes.
- Added a reusable Shopify product-page customer-value block.
- Added Shopify product-page value-block styling and installation notes.

## Canonical Brand Language

Primary promise:

**Your Knowledge Has Value.**

Supporting statement:

**Helping you discover it, build it, and share it with the world.**

Strategic positioning:

**Build around the value only you can provide.**

## Runtime Intent

Kairos should present itself as the steady guide that helps users preserve context, organize work, recommend next actions, and compound isolated ideas into a body of work.

The dashboard runtime should now frame customer-facing work through four practical pathways:

1. Income Path
2. Asset Path
3. Audience Path
4. Execution Path

These pathways must support practical opportunity without income guarantees, get-rich framing, shortcut claims, or hype-first language.

## Shopify Customer-Facing Surfaces

The Shopify homepage package leads with the canonical customer promise and frames MMG / Kairos as a system for discovering, building, and sharing customer knowledge.

The Shopify product-page block positions products as tools inside the broader value-building system instead of isolated purchases.

Both surfaces reinforce practical guidance, education, stewardship, execution, and long-term value while avoiding shortcut or guaranteed-outcome claims.

## Implementation Surfaces Updated

- `kairos-web-admin/scripts/kairos-operate-local.mjs`
- `kairos-web-admin/src/shopify/read-only-client.mjs`
- `web/kairos-dashboard/scripts/state.js`
- `web/kairos-dashboard/scripts/dashboard.js`
- `web/kairos-dashboard/scripts/command-center-brief-engine.js`
- `web/kairos-dashboard/scripts/command-center-brief-panel.js`
- `shopify/homepage/customer-value-hero.html`
- `shopify/homepage/customer-value-hero.css`
- `shopify/homepage/customer-value-hero-install.md`
- `shopify/products/customer-value-product-block.html`
- `shopify/products/customer-value-product-block.css`
- `shopify/products/customer-value-product-block-install.md`
- `MMGIOS/Shared/Components/MetricCard.swift`
- `MMGIOS/Features/CustomerValue/CustomerValueOverviewView.swift`
- `MMGIOS/App/AppRootView.swift`

## Validation Status

No full local build was run in this execution environment. The repository uses XcodeGen with `MMGIOS` as the source root, so the new `MMGIOS/Features/CustomerValue` SwiftUI screen is included by the existing source path configuration.

Changes were committed through the connected GitHub app and marked to avoid unnecessary CI usage during active development.

## Next Recommended Batch

The next implementation batch should create service-page and onboarding customer-value surfaces so services and intake flows match the same customer-facing promise and guardrails.
