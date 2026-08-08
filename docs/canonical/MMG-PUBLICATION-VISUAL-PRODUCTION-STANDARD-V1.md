# MMG Publication Visual Production Standard V1

**Status:** AUTHORITATIVE  
**Owner:** Mindset Media Group™  
**Contract ID:** `mmg-publication-visual-production-standard-v1`  
**Executable contract:** `cloudflare/mmg-ios/src/kairos-publication-visual-standard-v1.js`

## Purpose

This standard governs the visual production of Mindset Media Group™ customer-facing digital publications and KDP submission interiors.

It raises the professional visual quality of the existing Digital Asset Edition V2 deliverables without changing the number, names, roles, archive structure, or approval sequence of those deliverables.

## Approved visual-quality benchmarks

The following approved MMG documents define the quality benchmark and visual language for polished customer-facing guides and manuals:

- **MMG Project Guide Golden Master v1.0**
- **MMG Subscription Member Guide Golden Master v1.0**

These benchmarks establish expectations for disciplined whitespace, page hierarchy, typography, section rhythm, structured information, branded headers and footers, professional alignment, readable callouts, page numbering, and cohesive visual systems.

They are **not** a literal one-size-fits-all page template. Kairos must adapt the visual system to the publication type and approved manuscript.

## Immutable rules

1. The approved manuscript remains the content authority.
2. A visual-production upgrade does not authorize a rewrite, shortening, expansion, restructuring of meaning, or material editorial change.
3. Every title retains its approved or established title-specific color identity.
4. MMG blue may support the system where appropriate, but Kairos must not homogenize the entire publication library into one blue palette.
5. The existing customer package remains exactly six canonical deliverables.
6. The existing archive structure remains unchanged.
7. Changing the number of customer deliverables requires explicit executive approval and a contract amendment.

## Customer-facing Digital Edition

**Canonical file role:** `Digital-Edition-V2.pdf`  
**Production class:** `premium-customer-facing-publication`

The Digital Edition is the primary polished customer reading and use edition.

Kairos must build the actual approved manuscript into a professionally designed publication rather than treating the manuscript as a raw word-processing export.

### Required visual behavior

- preserve the approved cover as page one where required by the Digital Asset Edition V2 contract;
- preserve the individual title's established color system and visual identity;
- use disciplined whitespace and consistent grid/alignment logic;
- establish clear typographic hierarchy for title, part, chapter, section, body, captions, callouts, and supporting material;
- use professional headers, footers, folios/page numbers, and navigation aids where appropriate;
- create deliberate chapter and section openings;
- maintain readable line lengths, type sizes, contrast, spacing, and information density;
- create visual rhythm across the publication instead of repeating an undifferentiated text page;
- use cards, callouts, grids, diagrams, checklists, tables, worksheets, prompts, and modular structures only when the manuscript and publication type benefit from them;
- ensure visual devices clarify the manuscript rather than compete with it;
- maintain professional accessibility/readability standards.

### Publication-type adaptation

The same quality standard applies across different asset classes, but the layout must fit the content:

- **Book:** professional book typography and chapter rhythm; visual design supports sustained reading.
- **Manual / Field Guide:** sequence, procedures, callouts, checklists, reference navigation, and implementation clarity.
- **Playbook:** action-oriented hierarchy, frameworks, decision rules, examples, and execution modules.
- **Prompt Library:** modular prompt presentation, strong scanability, categories, use notes, and repeatable prompt structures.
- **Workbook:** instructional hierarchy, exercises, worksheets, response space, checklists, and completion flow.
- **Guide:** balanced narrative, instruction, examples, frameworks, and reference elements.

### Prohibited Digital Edition behavior

- raw word-processor-export appearance;
- forcing every title into the same blue visual identity;
- ornamental clutter unrelated to the manuscript;
- one universal page template forced onto every type of publication;
- visual design that silently changes approved manuscript meaning or content;
- decorative elements that reduce legibility or professional credibility.

## KDP submission interior

**Canonical file role:** `KDP-Interior_6x9.pdf`  
**Production class:** `professional-submission-only-interior`

The KDP interior is a separate production class from the customer-facing Digital Edition.

Its purpose is professional submission to Amazon KDP and platform review. It must look like a clean professionally typeset book interior, not like a branded customer handbook or storefront document.

### Required KDP behavior

- remain cover-free;
- remain exactly 6 × 9 inches where required by the current Digital Asset Edition V2 contract;
- use professional print typography;
- use clean title, copyright, contents, chapter, and back-matter hierarchy;
- use appropriate margins and mirrored gutters where required;
- use clean paragraph spacing and consistent text flow;
- use professional pagination and folio placement;
- handle images, tables, lists, and section breaks cleanly;
- preserve print-safe geometry and readability;
- use restrained title-aware accents only when suitable for print and platform compatibility;
- prioritize KDP submission utility over customer-facing decoration.

### Prohibited KDP behavior

- embedded front cover;
- customer-facing brochure layouts;
- marketing cards or promotional panels;
- oversized decorative MMG branding;
- storefront calls to action;
- merchandising blocks;
- `Continue Your Journey` promotional content unless that material is part of the explicitly approved manuscript itself;
- decorative handbook-style UI that does not belong in a professional print interior.

## Other existing customer deliverables

The visual standard does not add or remove files.

- **Customer-Spec-Sheet.pdf:** professional, concise, branded, technically clear, and aligned to the title.
- **Cover-Portrait_2048x3072.png:** preserve the approved title cover and title-specific visual identity.
- **Cover-Thumbnail_2048x2048.png:** preserve the approved title cover without destructive cropping or unrelated redesign.
- **README.txt:** concise operational guidance explaining file purpose; not a marketing document.

## Exact customer package — unchanged

For title stem `<Title-Slug>`:

```text
<Title-Slug>_Customer-Spec-Sheet.pdf
<Title-Slug>_KDP-Interior_6x9.pdf
<Title-Slug>_Digital-Edition-V2.pdf
<Title-Slug>_Cover-Portrait_2048x3072.png
<Title-Slug>_Cover-Thumbnail_2048x2048.png
<Title-Slug>_README.txt
```

Archive remains:

```text
<Title-Slug>_Digital-Asset-Edition-V2_Customer-Package.zip
```

The visual-production standard changes **quality and presentation**, not deliverable count or delivery architecture.

## Production sequence

```text
APPROVED MANUSCRIPT
  -> APPROVED COVER / TITLE VISUAL IDENTITY
  -> IDENTIFY PUBLICATION TYPE
  -> PRESERVE TITLE-SPECIFIC PALETTE
  -> DIGITAL EDITION PROFESSIONAL DESIGN BUILD
  -> KDP SUBMISSION INTERIOR TYPESETTING BUILD
  -> OTHER EXISTING CUSTOMER FILES
  -> VISUAL / EDITORIAL / TECHNICAL QA
  -> EXISTING SIX-FILE PACKAGE
  -> EXISTING ARCHIVE
  -> FILE-LEVEL VERIFICATION
```

## Digital Edition QA

Before customer release, verify:

- manuscript content is preserved;
- approved cover and title identity are aligned;
- title-specific palette is preserved;
- hierarchy is professional and consistent;
- typography, spacing, line length, and contrast are readable;
- page architecture fits the publication type;
- structured modules support rather than overwhelm the content;
- no raw-export appearance remains;
- customer-facing edition feels like a finished professional publication.

## KDP interior QA

Before release, verify:

- cover is absent;
- required trim geometry is correct;
- professional typesetting is consistent;
- chapter hierarchy is clean;
- margins and gutters are clean;
- pagination is clean;
- images/tables/lists are print-safe;
- no customer-marketing UI is present;
- the file remains submission-only in purpose and presentation.

## Editorial boundary

Visual production and editorial production are separate authorities.

The renderer may improve typography, spacing, hierarchy, page breaks, visual modules, callout treatment, tables, diagrams, and layout **without changing manuscript meaning**.

Any substantive rewrite, addition, deletion, expansion, shortening, or factual/editorial change must pass through the existing editorial approval workflow.

## Contract enforcement

The executable source of truth is:

`cloudflare/mmg-ios/src/kairos-publication-visual-standard-v1.js`

The contract test is:

`cloudflare/mmg-ios/test/kairos-publication-visual-standard-v1.test.js`

The contract freezes:

- exact six-file customer package;
- Digital Edition and KDP as separate production classes;
- title-specific color preservation;
- visual-quality benchmark names;
- manuscript-content authority;
- prohibition on visual changes being treated as editorial approval.

## Supersession rule

This standard remains authoritative until explicitly superseded by a later approved MMG publication visual-production contract. A renderer, template, prompt, workflow, or future Kairos feature may refine implementation details but may not contradict these rules without an approved amendment.
