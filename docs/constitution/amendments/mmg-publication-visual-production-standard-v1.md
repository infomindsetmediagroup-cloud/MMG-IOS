# MMG/Kairos Constitutional Amendment

## Publication Visual Production Standard V1

**Status:** Approved constitutional amendment  
**Owner:** Mindset Media Group™  
**Contract ID:** `mmg-publication-visual-production-standard-v1`  
**Effective date:** 2026-08-08

## Amendment

Mindset Media Group™ permanently distinguishes customer-facing digital publication design from KDP submission-interior production.

Customer-facing digital books, guides, manuals, playbooks, prompt libraries, workbooks, field guides, and related assets must be produced as polished professional publications using the approved MMG premium handbook/guide visual language as a quality benchmark. The approved manuscript remains the content authority, and each title retains its established title-specific color identity.

The **MMG Project Guide Golden Master v1.0** and **MMG Subscription Member Guide Golden Master v1.0** are approved visual-quality benchmark exemplars. They establish standards for hierarchy, typography, whitespace, rhythm, structured information, branded page systems, and professional presentation. They are not literal universal templates and must not erase the identity of individual titles.

KDP interiors are a separate production class. They must remain restrained, cover-free, professionally typeset, submission-focused interiors suitable for KDP review. They must not inherit unnecessary customer-facing brochure treatments, merchandising panels, storefront calls to action, oversized decorative branding, or handbook-style UI.

Visual production does not authorize substantive editorial change. Rewriting, expansion, shortening, factual change, or alteration of manuscript meaning remains governed by the existing editorial approval workflow.

The existing Digital Asset Edition V2 customer package remains unchanged at exactly six customer deliverables plus the existing archive. This amendment raises visual and typesetting quality only. It does not add, remove, rename, or repurpose customer deliverables.

## Locked deliverable structure

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

Any future change to this deliverable count or role structure requires explicit executive approval and a formal contract amendment.

## Canonical implementation authority

The detailed governing specification is:

`docs/canonical/MMG-PUBLICATION-VISUAL-PRODUCTION-STANDARD-V1.md`

The executable contract is:

`cloudflare/mmg-ios/src/kairos-publication-visual-standard-v1.js`

The contract validation suite is:

`cloudflare/mmg-ios/test/kairos-publication-visual-standard-v1.test.js`

## Refreeze

The MMG/Kairos constitutional baseline is refrozen with the Publication Visual Production Standard V1 incorporated.

Future publication renderers, templates, manufacturing prompts, workflow revisions, and production engines must conform to `mmg-publication-visual-production-standard-v1` unless an explicitly approved later amendment supersedes it.
