# Kairos Canonical Manuscript and Shopify Publishing Contract V1

**Status:** AUTHORITATIVE  
**Owner:** Mindset Media Group™  
**Runtime entry:** `cloudflare/mmg-ios/src/kairos-production-entry-canonical-publishing-v1.js`  
**Digital Asset contract:** `mmg-digital-asset-edition-v2-customer-package-v1`  
**Shopify contract:** `mmg-shopify-product-publishing-v1`

This contract defines exactly how the two publishing portions of the Kairos Command Center operate:

1. manuscript development through the final **Digital Asset** customer deliverable; and
2. approval-gated **Shopify product publishing** using the approved Digital Asset release.

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

### Draft behavior

Kairos creates or updates a Shopify product only as `DRAFT`. The product record must include:

- product title and listing title;
- full HTML description;
- price and currency;
- vendor and product type;
- URL handle;
- SEO title and meta description;
- social title and social description;
- tags, collections, keywords, and image alt text;
- product media;
- approved custom product template;
- manifest/checksum linkage to the approved Digital Asset release;
- digital-delivery configuration status.

Existing active products are protected from silent overwrite or demotion.

### Live behavior

Live publication requires a separate approval receipt bound to the current manifest and Shopify draft. Kairos must:

1. verify the draft has not changed since approval;
2. verify the approved delivery asset is attached;
3. change the product to `ACTIVE`;
4. publish it to the approved Shopify publication/channel;
5. read the product back from Shopify;
6. record the product ID, variant ID, handle, live URL, publication IDs, and verification time;
7. retain a rollback record.

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
- the exact Shopify confirmation is absent;
- the product draft changed after approval;
- digital delivery is not configured;
- the live publication cannot be verified.

No failure may be converted into a false success state.

## Validation

The canonical contract test suite verifies:

- exact six-file title-specific package naming;
- existing generic manufacturing artifact compatibility;
- public-identity rejection and legacy-record sanitization;
- exact draft and live confirmation phrases;
- package completeness and positive integrity gates;
- draft-first and separately approved live publication behavior.

## Dead-code rule

Only the Worker entry named in `wrangler.toml` and modules reachable from that entry are production code. Unreferenced legacy entry wrappers are removable only after repository search confirms no workflow, configuration, test, or import depends on them.
