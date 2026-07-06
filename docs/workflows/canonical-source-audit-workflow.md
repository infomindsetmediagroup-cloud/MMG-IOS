# Canonical Source Audit Workflow

Status: Active operating workflow.

## Purpose

This workflow governs how MMG Shopify pages, portal pages, product pages, and related source files move from uploaded source to approved canonical repository source.

## Rule

Only approved, production-ready code becomes canonical. Drafts, partial rewrites, shortened examples, representative snippets, and unapproved revisions must not replace canonical source files.

## Pipeline

1. Ingest current source from the user or source export.
2. Preserve the uploaded source as the working input where appropriate.
3. Audit navigation, internal links, CTAs, editorial quality, UX, mobile responsiveness, accessibility, SEO, code quality, and Shopify behavior.
4. Scrub and polish the source while preserving approved behavior and page intent.
5. Produce the final production-ready source.
6. Store the approved final source in the correct repository path.
7. Store QA notes with the source.
8. Store release notes with the source.
9. Update the relevant registry.
10. Deploy or prepare deployment to Shopify only after approval.

## Canonical File Pattern

Each audited page or product should use this pattern:

```text
source.liquid
qa.md
release-notes.md
metadata.md
```

## Shopify Runtime Rule

GitHub is the canonical engineering record. Shopify is the live deployment runtime.

## Approval Rule

When a page is still being edited, keep it as a working draft. Once the user approves it, promote it to canonical source in the repository.
