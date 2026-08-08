# Kairos Canonical Manuscript and Shopify Publishing Contract V1

**Status:** AUTHORITATIVE  
**Owner:** Mindset Media Group™  
**Runtime entry:** `cloudflare/mmg-ios/src/kairos-production-entry-canonical-publishing-v1.js`  
**Digital Asset contract:** `mmg-digital-asset-edition-v2-customer-package-v1`  
**Shopify publishing contract:** `mmg-shopify-product-publishing-v1`  
**Shopify product-page contract:** `mmg-shopify-product-page-canonical-v1`

This contract defines exactly how the two publishing portions of the Kairos Command Center operate:

1. manuscript development through the final **Digital Asset** customer deliverable; and
2. approval-gated **Shopify product publishing** using the approved Digital Asset release.

It also defines the permanent product-page content contract Kairos must use whenever it writes, rewrites, prepares, updates, or publishes any Shopify product page for Mindset Media Group™. The product-page rules are not limited to manuscript-derived products.

The existing Digital Asset Edition V2 contract remains authoritative for file specifications. This document binds that contract to executable Worker routes and the Shopify publication sequence.

## Permanent invocations

### Digital Asset

The phrase **Digital Asset**, or the presence of both an approved manuscript and approved cover in the same project, invokes the complete manuscript-production workflow.

Executable route:

```text
POST /api/kairos/publishing/manuscripts/:projectId/digital-asset
```

Kairos must not treat this invocation as a simple export. It must inspect, develop, edit, restructure, expand, manufacture, validate, and package the title under the Digital Asset Edition V2 contract.

### Shopify Publishing

The phrase **Shopify Publishing** invokes the Shopify handoff for an already approved Digital Asset project.

Draft route:

```text
POST /api/kairos/publishing/manuscripts/:projectId/shopify-draft
```

Required confirmation:

```text
CREATE SHOPIFY PRODUCT DRAFT
```

Live route:

```text
POST /api/kairos/publishing/manuscripts/:projectId/shopify-publish
```

Required confirmation:

```text
PUBLISH PRODUCT LIVE
```

A live publication is never implied by draft creation. These are separate approval gates.

## Canonical public identity

Every customer-facing and storefront-facing identity is locked to:

- Written by: Mindset Media Group™
- Author: Mindset Media Group™
- Creator: Mindset Media Group™
- Copyright holder: Mindset Media Group™
- Publisher: Mindset Media Group™
- Shopify vendor: Mindset Media Group

The personal name `Michael King` is prohibited in covers, interiors, metadata, Shopify fields, filenames, manifests, README files, SEO, social metadata, and delivery records.

The canonical Worker entry enforces this identity at two boundaries:

1. before a manufacturing job enters the `KairosProject` Durable Object; and
2. before any manuscript auto-pipeline record is persisted or returned through the canonical publishing API.

Legacy records are sanitized at the boundary; new manufacturing jobs are created with the canonical MMG identity from the start.

## Manuscript-to-Digital-Asset state machine

```text
INTAKE
  -> SOURCE_REGISTERED
  -> COVER_REGISTERED
  -> MANUSCRIPT_ANALYZED
  -> DEVELOPMENT_IN_PROGRESS
  -> EDITORIAL_REVIEW
  -> CUSTOMER_APPROVAL
  -> APPROVED_EDITORIAL_LOCKED
  -> MANUFACTURING
  -> FILE_LEVEL_QA
  -> DIGITAL_ASSET_APPROVED
  -> CUSTOMER_PACKAGE_READY
```

Mandatory gates:

1. Both manuscript and approved cover are registered to one project.
2. The complete manuscript is inspected before development begins.
3. The developed manuscript contains at least 100 substantive finished pages.
4. No placeholders, filler, duplicate paragraphs, or false page inflation remain.
5. The approved editorial checksum is the sole manufacturing authority.
6. The KDP interior is cover-free and exactly 6 × 9 inches.
7. The Digital Edition V2 uses the approved cover as page one.
8. The customer ZIP contains exactly the six canonical customer files.
9. File-level validation, not a UI state, proves completion.

## Exact customer package

For title stem `<Title-Slug>`:

```text
<Title-Slug>_Customer-Spec-Sheet.pdf
<Title-Slug>_KDP-Interior_6x9.pdf
<Title-Slug>_Digital-Edition-V2.pdf
<Title-Slug>_Cover-Portrait_2048x3072.png
<Title-Slug>_Cover-Thumbnail_2048x2048.png
<Title-Slug>_README.txt
```

Archive:

```text
<Title-Slug>_Digital-Asset-Edition-V2_Customer-Package.zip
```

The existing manufacturing engine internally exposes the six deliverables under stable generic artifact keys. The canonical contract maps those keys to the exact title-specific customer names and validates the underlying integrity-checked archive. The canonical package download route sets the required title-specific archive filename without altering the verified ZIP bytes.

Shopify publication is blocked until all six deliverables, the archive, and a positive integrity result are present.

## Shopify publishing state machine

```text
CUSTOMER_PACKAGE_READY
  -> SHOPIFY_METADATA_READY
  -> SHOPIFY_DRAFT_AUTHORIZED
  -> SHOPIFY_DRAFT_CREATED
  -> SHOPIFY_DRAFT_VERIFIED
  -> PRODUCT_MEDIA_INSTALLED
  -> DELIVERY_ASSET_ATTACHED
  -> LIVE_PUBLICATION_AUTHORIZED
  -> PRODUCT_ACTIVE
  -> STOREFRONT_PUBLICATION_VERIFIED
```

## Permanent Shopify product-page content contract

`mmg-shopify-product-page-canonical-v1` is mandatory every time Kairos creates product-page copy, rewrites an existing product page, prepares a Shopify listing, creates/updates a product draft, or publishes a product live.

Kairos must generate and retain the complete product-page package below. A field may be explicitly `null` only when it is structurally inapplicable, such as `series` or `bookNumber`; Kairos may not silently omit a required field.

1. Product Title (`title`)
2. Product Listing Title (`listingTitle`)
3. SEO Title (`seoTitle`)
4. Meta Description (`metaDescription`)
5. URL Handle (`handle`)
6. Product Type (`productType`)
7. Vendor (`vendor`)
8. Collections (`collections`) — normally 3–5 relevant MMG collections
9. Product Tags (`tags`) — digital products include `Digital Download`
10. Primary Keyword (`primaryKeyword`)
11. Secondary Keywords (`secondaryKeywords`)
12. Product Price (`price`)
13. Currency (`currency`)
14. Product Status (`status`)
15. Product Format (`productFormat`)
16. Product Family (`productFamily`)
17. Series (`series`) when applicable
18. Book Number (`bookNumber`) when applicable
19. Product Image Alt Text (`productImageAltText`)
20. Canonical URL (`canonicalURL`)
21. Social Title (`socialTitle`)
22. Social Description (`socialDescription`)
23. Full HTML Description (`descriptionHtml`)
24. Product Media (`productMedia`)
25. Approved Product Template (`templateSuffix`)
26. Release/manifest/file/checksum linkage (`releaseLinkage`) when applicable
27. Digital-delivery configuration (`digitalDelivery`) when applicable

SEO, canonical URL, social metadata, accessibility alt text, collections/tags/keywords, price/status, template selection, and applicable media/delivery/release data are release-blocking fields. Kairos must not label a product page publish-ready when any required portion is absent.

### Canonical product-page architecture

The approved product page is a structural clone of the current MMG product-page golden master. Kairos preserves the established architecture and swaps only product-specific content and identifiers unless a separate redesign is explicitly approved.

The canonical architecture includes:

- approved structural clone/template and section order;
- existing MMG styling and responsive behavior;
- Shopify-safe purchase system and add-to-cart behavior;
- full-cover image containment;
- multiple purchase opportunities where the approved template uses them;
- **Your Learning Journey**;
- **Continue Your Journey**;
- Judge.me review layer;
- Intelligent Carousel Engine;
- final CTA;
- product-specific title/copy, identifiers, series data, handle, price, and featured media substitutions only.

A product-page content task must retrieve and reuse this approved architecture before generating a new page. Kairos must not improvise a different product-page information architecture merely because the product is new.

### Content-production sequence

For every Shopify product page, Kairos follows this sequence:

```text
RETRIEVE APPROVED PRODUCT-PAGE BLUEPRINT
  -> WRITE COMPLETE PRODUCT CONTENT PACKAGE
  -> SEO / CANONICAL / SOCIAL / ACCESSIBILITY QC
  -> TAXONOMY / PRICE / STATUS / TEMPLATE QC
  -> CREATE OR UPDATE AS DRAFT
  -> SHOPIFY READBACK
  -> MEDIA / DELIVERY / RELEASE LINKAGE
  -> FINAL PRODUCT-PAGE QC
  -> SEPARATE LIVE APPROVAL
  -> ACTIVATE + PUBLISH
  -> STOREFRONT READBACK / VERIFICATION
  -> RECORD EVIDENCE
```

No step may be skipped by treating a partial Shopify record as a completed product page.

### Draft behavior

Kairos creates or updates a Shopify product only as `DRAFT`. The product record and its Kairos release record must together include the entire `mmg-shopify-product-page-canonical-v1` field package.

Existing active products are protected from silent overwrite or demotion.

### Live behavior

Live publication requires a separate approval receipt bound to the current product-page contract, manifest/release when applicable, and Shopify draft. Kairos must:

1. verify the draft has not changed since approval;
2. verify the canonical product-page content contract is complete;
3. verify SEO title/meta description, handle, vendor/type, tags, collections, template, price, product media, and image alt text from Shopify readback where those fields are Shopify-native;
4. verify the approved delivery asset and release linkage for digital products;
5. change the product to `ACTIVE` when the approved workflow requires it;
6. publish it to the approved Shopify publication/channel;
7. read the product back from Shopify;
8. record the product ID, variant ID, handle, live URL, publication IDs, contract ID, and verification time;
9. retain a rollback record.

Publication is a verified state transition, not the act of sending a mutation.

## API surface

```text
GET  /api/kairos/publishing/contracts
GET  /api/kairos/publishing/manuscripts/:projectId/status
POST /api/kairos/publishing/manuscripts/:projectId/digital-asset
GET  /api/kairos/publishing/manuscripts/:projectId/package
POST /api/kairos/publishing/manuscripts/:projectId/shopify-draft
POST /api/kairos/publishing/manuscripts/:projectId/shopify-publish
```

These routes are the canonical Command Center surface. They delegate to the existing manuscript manufacturing and Shopify engines while enforcing the MMG contracts before customer delivery, draft creation, or live publication.

## Failure behavior

Kairos must stop and return a machine-readable error when:

- public identity is noncanonical;
- prohibited personal attribution is detected in a new public request;
- the approved editorial checksum does not match;
- required customer files are missing;
- the package archive is missing;
- package integrity is not positively verified;
- the canonical Shopify product-page contract is incomplete;
- required SEO, canonical, social, accessibility, taxonomy, commerce, template, media, or applicable delivery/release data is absent;
- the exact Shopify confirmation is absent;
- the product draft changed after approval;
- digital delivery is not configured when required;
- the live publication cannot be verified.

No failure may be converted into a false success state.

## Validation

The canonical contract test suite verifies:

- exact six-file title-specific package naming;
- existing generic manufacturing artifact compatibility;
- public-identity rejection and legacy-record sanitization;
- exact draft and live confirmation phrases;
- package completeness and positive integrity gates;
- complete Shopify product-page field/architecture contract exposure;
- draft and live product-page readiness gates;
- draft-first and separately approved live publication behavior.

## Dead-code rule

Only the Worker entry named in `wrangler.toml` and modules reachable from that entry are production code. Unreferenced legacy entry wrappers are removable only after repository search confirms no workflow, configuration, test, or import depends on them.
