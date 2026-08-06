# MMG Canonical Digital Asset Edition V2

**Status:** Locked production contract  
**Contract ID:** `mmg-canonical-digital-asset-edition-v2`  
**Effective date:** 2026-08-05  
**Authority:** Mindset Media Group (MMG) / Kairos Manuscript Builder

This document is the repository source of truth for every MMG digital-asset title. It supersedes every earlier five-file, twelve-artifact, Gold Master DOCX, full-wrap-cover, auto-pipeline, and generic manuscript delivery contract for customer-facing digital assets.

## Invocation contract

When an approved manuscript and approved cover are supplied, Kairos must:

1. Preserve the author's message, voice, approved facts, and title identity.
2. Remove duplicated, empty, placeholder, contradictory, or mechanically repeated material.
3. Edit, restructure, and substantively expand the manuscript to MMG publishing quality.
4. Produce a coherent, useful, non-padded KDP interior of **at least 100 pages**.
5. Use the checksum-verified final editorial manuscript as the sole manufacturing authority.
6. Use the approved cover without redrawing, substituting, recoloring, or destructive cropping.
7. Manufacture and validate the exact six-file title-specific customer package below.
8. Deliver one ZIP containing exactly those six files and no internal production material.

Page count is a minimum quality gate, not permission to pad. Repetition, duplicate conclusions, repeated examples, artificial line breaks, oversized typography, and blank-page inflation do not satisfy the standard.

## Exact customer package

For title stem `[Title]`, the ZIP must contain exactly:

1. `[Title]_Customer-Spec-Sheet.pdf`
2. `[Title]_KDP-Interior_6x9.pdf`
3. `[Title]_Digital-Edition-V2.pdf`
4. `[Title]_Cover-Portrait_2048x3072.png`
5. `[Title]_Cover-Thumbnail_2048x2048.png`
6. `[Title]_README.txt`

Archive filename:

`[TITLE]_Digital-Asset-Edition-V2_Customer-Package.zip`

No seventh customer file is allowed. The ZIP archive record may exist as an internal artifact, but it is not counted as one of the six customer files.

## File specifications

### Customer Spec Sheet

- PDF, exactly 2 pages
- US Letter: 612 x 792 points
- Identifies title, author, publisher, edition, word count, page counts, audience, learning outcomes, package contents, use instructions, and technical validation
- Publisher identity: `Mindset Media Group™`

### KDP Interior

- PDF
- Cover-free
- Exact trim: 6 x 9 inches (432 x 648 points)
- At least 100 pages
- Print-safe margins, pagination, headings, and body typography
- No cover page image embedded as the print cover
- No placeholders, barcode boxes, crop instructions, production notes, or internal QA language

### Digital Edition V2

- PDF
- US Letter: 612 x 792 points
- Approved portrait cover is page one
- Includes title/edition information and contents navigation
- Text remains selectable and searchable
- Screen-reading layout
- Must not be substituted for the KDP interior

### Portrait Cover

- PNG
- Exactly 2048 x 3072 pixels
- Complete approved cover preserved
- No invented logo, redraw, substitution, recoloring, or destructive crop

### Square Thumbnail

- PNG
- Exactly 2048 x 2048 pixels
- Complete portrait cover remains visible
- Use contain/letterbox treatment when required; do not crop away cover content

### README

- Plain UTF-8 text
- Exact package manifest and filenames
- Product/edition identity
- File guide, page counts, word count, use instructions, and delivery notes
- Directs the customer to keep all six files together

## Forbidden customer-package contents

The customer ZIP must not contain:

- DOCX or source manuscript files
- Markdown, HTML, JSON, XML, logs, manifests, or internal receipts
- Gold Master files
- Full-wrap cover PDFs
- Original intake files
- QA reports, screenshots, temporary files, cache files, or test fixtures
- Placeholder text or assets
- Canva files or Canva dependencies

Canva is excluded from the manuscript and digital-asset pipeline. Cover, thumbnail, interior, digital-edition, and promotional visual production are handled by ChatGPT/MMG production tools and Kairos manufacturing code.

## Manufacturing authority and validation

The package is complete only when all of the following are executable facts:

- Final editorial text is checksum verified.
- KDP interior page count is at least 100.
- Every PDF opens and reports the required page geometry.
- The Digital Edition begins with the approved cover.
- Portrait and thumbnail dimensions are exact.
- Every customer file is non-empty and checksum recorded.
- ZIP entry names exactly match the six-file manifest.
- ZIP contains no extra or forbidden files.
- Package contract equals `mmg-canonical-digital-asset-edition-v2`.

A UI status, log message, mock record, or artifact list is not completion. The files and ZIP bytes must exist, open, and pass validation.

## Canonical reference package

The controlling reference supplied by MMG is:

`AI-Image-Mastery_Digital-Asset-Edition-V2_Customer-Package.zip`

Its structure establishes the six-file naming, two-page US Letter spec sheet, 6 x 9 KDP interior, US Letter Digital Edition V2, 2048 x 3072 portrait cover, 2048 x 2048 complete-cover thumbnail, and README delivery model.
