# MMG Shopify Product Contracts

These contracts define the minimum Shopify, customer-experience, delivery, metadata, portal, and quality-assurance requirements Kairos must reproduce for future MMG products.

## Shared Contract

Every product must define and validate:

- unique product title and stable handle;
- explicit product archetype;
- vendor, product type, tags, and canonical internal identifier;
- price and variant model;
- portrait primary product image using the approved MMG product-image standard when appropriate;
- complete product-page source stored in GitHub;
- SEO title, meta description, canonical URL, and social metadata;
- purchase-state and availability behavior;
- customer instructions and delivery contract;
- portal, download, or membership destination;
- support and refund boundaries;
- pre-publication QA and post-publication verification;
- rollback material for any live source replacement.

Product descriptions that contain executable HTML, CSS, or JavaScript are deployable code and must be governed as complete-source releases.

## Contract A — Service Product

### Live reference

`professional-cover-design-service`

### Commerce model

- One purchase covers one validated project.
- Variants represent service scope or tier.
- Inventory tracking is normally disabled unless a capacity-control workflow is deliberately implemented.
- Each variant requires a stable internal identifier; SKUs should be added before autonomous cross-system operations are enabled.

### Current reference tiers

| Tier | Price | Purpose |
|---|---:|---|
| Starter | $97.95 | Focused entry service scope |
| Growth | $197.95 | Expanded production scope |
| Professional | $397.95 | Premium or complex production scope |

### Customer-delivery contract

1. Customer purchases the correct tier.
2. Shopify confirms the order.
3. The immediate deliverable is the MMG Project Guide™ Customer Handbook.
4. The customer completes the Customer Portal and supplies required source material.
5. MMG validates order, scope, requirements, and source files.
6. The project enters production.
7. Deliverables pass review and quality assurance.
8. Final files are organized, packaged, and delivered with instructions.
9. Related services and logical next steps are surfaced without misrepresenting availability.

### Required metadata

- archetype: `service`
- fulfillment mode: `digital-service`
- project model: `one-purchase-one-project`
- onboarding guide: `MMG Project Guide™`
- portal requirement: `customer-portal-required`
- inventory policy: `not-tracked` unless capacity controls are approved

## Contract B — Digital Download

### Live reference

`ai-image-mastery`

### Commerce model

- One-time purchase.
- Normally one default variant unless format, license, edition, or bundle choices require multiple variants.
- Inventory tracking is disabled.
- Digital delivery follows successful checkout.

### Current reference price

| Product | Price |
|---|---:|
| AI Image Mastery™ | $9.95 |

### Customer-delivery contract

1. Customer purchases the product.
2. Shopify confirms payment.
3. The approved digital file or access package is delivered.
4. Customer instructions explain access, file use, and the first practical action.
5. The product connects to the next relevant learning or creator-workflow step.
6. The delivery path is tested before publication and after any file replacement.

### Required metadata

- archetype: `digital-download`
- fulfillment mode: `automatic-digital-delivery`
- purchase model: `one-time`
- portal requirement: optional unless the product includes progress tracking or account-bound resources
- inventory policy: `not-tracked`

## Contract C — Subscription Product

### State

Approved target contract. Not currently live in Shopify.

### Approved commercial structure

| Cadence | Price | Included digital assets |
|---|---:|---:|
| Monthly | $14.95 | 2 per month |
| Bi-weekly | $24.95 | 4 per month |
| Weekly | $39.95 | 8 per month |

### Customer-delivery contract

1. Customer selects a cadence and completes subscription checkout.
2. Shopify and the approved subscription platform confirm active recurring status.
3. The customer receives the separate MMG Subscription Member Guide.
4. The member completes the subscription profile and personalization intake.
5. The first curated package is not released until the member profile is complete and subscription status is verified.
6. Future packages follow the purchased cadence and documented entitlement count.
7. The member can review cadence, billing, delivery history, package status, and support instructions through the approved customer experience.
8. Cancellation, pause, failed-payment, retry, renewal, and entitlement rules must be explicit before launch.

### Required metadata

- archetype: `subscription`
- fulfillment mode: `recurring-digital-delivery`
- onboarding guide: `MMG Subscription Member Guide`
- profile requirement: `required-before-first-package`
- subscription verification: `required-before-delivery`
- entitlement unit: `digital-assets`
- inventory policy: `not-tracked`

### Required implementation before creation

- select and document the Shopify-compatible subscription app or native selling-plan architecture;
- validate Basic-plan compatibility and app costs;
- define selling-plan groups and cadence semantics;
- define billing anchors and delivery dates;
- define proration, cancellation, pause, retry, and failed-payment behavior;
- define customer portal and entitlement records;
- define webhook/event processing in the secure Kairos backend;
- validate all GraphQL operations with Shopify AI Toolkit;
- create as draft first;
- perform end-to-end test purchases before activation.

## Automation Readiness Gates

Kairos may manufacture additional products only after the relevant reference contract has:

- stable Shopify product type and internal identifiers;
- complete source stored in GitHub;
- validated product media and alt text;
- verified checkout behavior;
- verified customer delivery;
- verified links and related-resource references;
- documented rollback procedure;
- approved mutation workflow.
