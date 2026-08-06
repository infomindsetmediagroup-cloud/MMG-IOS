# MMG Digital Asset Edition V2 — Canonical Production Contract

**Status:** AUTHORITATIVE — NO EXCEPTIONS  
**Owner:** Mindset Media Group™  
**Contract ID:** `mmg-digital-asset-edition-v2-customer-package-v1`

This document is the single controlling package standard for every Mindset Media Group digital asset. It supersedes every earlier five-file, twelve-artifact, Gold Master, full-wrap, development, or generic manuscript package specification for customer-facing digital-asset delivery.

## Permanent identity authority

Every MMG digital asset is written, authored, created, copyrighted, and published by **Mindset Media Group™**.

The name **Michael King must never appear as the author, writer, creator, copyright holder, or publisher** of an MMG digital asset. This prohibition applies to every customer-facing and platform-facing location, including:

- cover and title pages;
- copyright pages;
- about pages and back matter;
- PDF and DOCX metadata;
- Customer Spec Sheets;
- README files;
- KDP metadata and upload records;
- product records and storefront metadata;
- ZIP manifests and customer delivery records.

The required identity is:

- **Written by:** Mindset Media Group™
- **Author:** Mindset Media Group™
- **Creator:** Mindset Media Group™
- **Copyright holder:** Mindset Media Group™
- **Publisher:** Mindset Media Group™

A package containing personal author attribution is invalid and must be rejected and rebuilt before delivery.

## Permanent invocation triggers

Either of the following immediately invokes the complete A-to-Z manuscript production pipeline without a follow-up question:

1. The user says **Digital Asset**.
2. The user uploads both a manuscript and a cover image, in either order, in the same active project or conversation.

The second trigger is complete as soon as both files are present. The system must not interpret a cover upload as a request to generate, redesign, edit, or replace an image. It must preserve the uploaded cover as the approved source asset and begin manuscript analysis and production.

On invocation, the system must:

- enter Manuscript Engine Mode;
- register the uploaded cover and manuscript to the same project;
- inspect the complete manuscript before drafting;
- research current facts and platform requirements when the manuscript requests research or contains time-sensitive claims;
- remove duplication, filler, dead material, formatting defects, and unsupported claims;
- preserve the source purpose, voice, title, series identity, and approved cover direction;
- substantively expand the manuscript to the MMG minimum of 100 finished pages without page-count padding;
- prepare the customer-ready digital edition and KDP-ready interior;
- manufacture the canonical customer package;
- validate every file and the final ZIP before reporting completion.

Invocation alone must never call an image-generation tool. Image generation is used only when the user explicitly asks for a new cover, cover modification, replacement artwork, or additional interior/marketing imagery. When an approved cover is uploaded, the default operation is preservation, sizing, and package preparation—not visual regeneration.

## Production contract

When a cover image and manuscript are supplied for a digital-asset project, Kairos must:

1. Preserve the source project and approved cover.
2. Research only when the production assignment authorizes outside research.
3. Edit, restructure, strengthen, and substantively expand the manuscript while preserving its approved purpose and voice.
4. Produce a developed field guide with at least 100 substantive finished pages, at least eight developed sections, and multiple practical frameworks, workflows, checklists, worksheets, templates, prompts, labs, decision rules, action steps, or implementation tools.
5. Reject padding, duplicated paragraphs, filler, false page-count inflation, placeholders, and incomplete editorial output.
6. Use the checksum-verified approved final editorial manuscript as the sole manufacturing authority.
7. Preserve the approved uploaded cover. Canva is excluded from the base pipeline.
8. Apply Mindset Media Group™ as the sole writer, author, creator, copyright holder, and publisher.
9. Manufacture and validate the exact title-specific customer package below.

## Exact customer package

For title stem `<Title-Slug>`, the ZIP must contain exactly:

1. `<Title-Slug>_Customer-Spec-Sheet.pdf`
2. `<Title-Slug>_KDP-Interior_6x9.pdf`
3. `<Title-Slug>_Digital-Edition-V2.pdf`
4. `<Title-Slug>_Cover-Portrait_2048x3072.png`
5. `<Title-Slug>_Cover-Thumbnail_2048x2048.png`
6. `<Title-Slug>_README.txt`

Final archive:

`<Title-Slug>_Digital-Asset-Edition-V2_Customer-Package.zip`

No seventh customer file is permitted.

## Required format specifications

### Customer Spec Sheet

- PDF
- US Letter
- Product identity, edition, publisher, page count, developed sections, audience, outcomes, package manifest, usage guidance, and technical specifications
- Written by and published by Mindset Media Group™
- Customer-facing language only

### KDP Interior

- PDF
- Exact 6 × 9-inch page geometry
- Cover-free interior
- Print-safe margins and pagination
- Selectable text
- Minimum 100 substantive finished pages
- Author, creator, copyright holder, and publisher identity set to Mindset Media Group™

### Digital Edition V2

- PDF
- US Letter
- Approved front cover as page one
- Title page and contents
- Selectable text and structured headings
- Customer-ready screen-reading layout
- Written by and published by Mindset Media Group™

### Portrait Cover

- PNG
- RGB
- 2048 × 3072 pixels
- Approved cover preserved without unauthorized redesign

### Square Thumbnail

- PNG
- RGB
- 2048 × 2048 pixels
- Complete portrait cover visible
- No destructive crop, redraw, invented logo, or substituted visual

### README

- Plain text
- Exact package manifest
- Edition information and file-use instructions
- Writer, creator, copyright holder, and publisher identified as Mindset Media Group™
- No individual author attribution
- No internal workflow, repository, QA, storefront, or production-system language

## Prohibited customer-package content

The ZIP must not contain:

- DOCX files
- source manuscripts
- Markdown
- HTML
- JSON
- internal manifests
- research records
- QA reports
- temporary outputs
- test fixtures
- placeholders
- Canva files or references
- Shopify administration content
- Kairos internal instructions
- duplicate or alternate package versions
- Michael King as author, writer, creator, copyright holder, or publisher
- any other individual author attribution

Internal production artifacts may exist outside the customer ZIP when needed for controlled manufacturing, but they are never customer deliverables.

## Acceptance gates

A package is complete only when automated validation proves:

- contract ID matches the canonical contract
- exact required non-ZIP artifacts exist
- all exact title-specific filenames exist in the required order
- ZIP contains exactly the canonical customer files
- every file is non-empty and opens successfully
- KDP Interior is 6 × 9 inches and at least 100 pages
- Digital Edition is US Letter and includes the approved cover
- portrait cover is 2048 × 3072 PNG
- square thumbnail is 2048 × 2048 PNG
- README names all customer files
- title page states Written by Mindset Media Group™
- copyright page identifies Mindset Media Group™ as copyright holder
- PDF and DOCX metadata identify Mindset Media Group™ as author and creator
- Customer Spec Sheet and README identify Mindset Media Group™ as writer and publisher
- no customer file contains Michael King as author, writer, creator, copyright holder, or publisher
- forbidden files and internal language are absent
- approved editorial checksum is the manufacturing authority
- Canva is excluded

A UI success state, database record, or generated filename is not proof of completion. Completion requires executable file-level evidence.

## Supersession rule

Any code, workflow, test, prompt, instruction, document, or saved package that conflicts with this contract is retired. It must be rejected as stale and rebuilt under this contract before delivery.
