# MMG Digital Asset Edition V2 — Canonical Production Contract

**Status:** AUTHORITATIVE — NO EXCEPTIONS  
**Owner:** Mindset Media Group™  
**Contract ID:** `mmg-digital-asset-edition-v2-customer-package-v1`

This document is the single controlling package standard for every Mindset Media Group digital asset. It supersedes every earlier five-file, twelve-artifact, Gold Master, full-wrap, development, or generic manuscript package specification for customer-facing digital-asset delivery.

## Invocation contract

When a cover image and manuscript are supplied for a digital-asset project, Kairos must:

1. Preserve the source project and approved cover.
2. Research only when the production assignment authorizes outside research.
3. Edit, restructure, strengthen, and substantively expand the manuscript while preserving its approved purpose and voice.
4. Produce a developed field guide with at least 100 substantive finished pages, at least eight developed sections, and multiple practical frameworks, workflows, checklists, worksheets, templates, prompts, labs, decision rules, action steps, or implementation tools.
5. Reject padding, duplicated paragraphs, filler, false page-count inflation, placeholders, and incomplete editorial output.
6. Use the checksum-verified approved final editorial manuscript as the sole manufacturing authority.
7. Use ChatGPT image generation and the approved uploaded cover for visual production. Canva is excluded from the base pipeline.
8. Manufacture and validate the exact title-specific six-file customer package below.

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
- Customer-facing language only

### KDP Interior

- PDF
- Exact 6 × 9-inch page geometry
- Cover-free interior
- Print-safe margins and pagination
- Selectable text
- Minimum 100 substantive finished pages

### Digital Edition V2

- PDF
- US Letter
- Approved front cover as page one
- Title page and contents
- Selectable text and structured headings
- Customer-ready screen-reading layout

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
- Exact six-file manifest
- Edition information and file-use instructions
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

Internal production artifacts may exist outside the customer ZIP when needed for controlled manufacturing, but they are never customer deliverables.

## Acceptance gates

A package is complete only when automated validation proves:

- contract ID matches the canonical contract
- exactly six non-ZIP artifacts exist
- all six exact title-specific filenames exist in the required order
- ZIP contains exactly those six files
- every file is non-empty and opens successfully
- KDP Interior is 6 × 9 inches and at least 100 pages
- Digital Edition is US Letter and includes the approved cover
- portrait cover is 2048 × 3072 PNG
- square thumbnail is 2048 × 2048 PNG
- README names all six files
- forbidden files and internal language are absent
- approved editorial checksum is the manufacturing authority
- Canva is excluded

A UI success state, database record, or generated filename is not proof of completion. Completion requires executable file-level evidence.

## Supersession rule

Any code, workflow, test, prompt, instruction, document, or saved package that conflicts with this contract is retired. It must be rejected as stale and rebuilt under this contract before delivery.
