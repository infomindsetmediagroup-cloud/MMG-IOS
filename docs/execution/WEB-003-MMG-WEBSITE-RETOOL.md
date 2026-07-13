# WEB-003 — MMG Website Retool Production Implementation

Status: Active production workstream

## Objective

Move the approved MMG website architecture into governed Shopify implementation without replacing Shopify-native operating behavior.

## Approved first package

1. Install the canonical MMG homepage package on the unpublished Kairos Staging theme.
2. Preserve the current published theme unchanged during staging implementation.
3. Verify all written Liquid, CSS, and template files through Shopify read-back hashes.
4. Preserve the complete original-file rollback package.
5. Prepare the next source-grounded pass for Shopify's native header.

## Locked native header doctrine

- Extend Shopify's native header rather than replacing it.
- Hamburger and menu control on the left.
- Mindset Media Group brand area centered.
- Search and cart controls on the right.
- Retain compact MMG ecosystem/category language where space permits.
- Preserve Shopify navigation, cart, search, accessibility, localization, and theme-editor compatibility.
- Use premium black MMG styling with blue accents and mobile-first behavior.

## Execution boundary

The WEB-003 console writes only to the verified unpublished Kairos Staging theme. Promotion to the published theme requires a separate release after desktop and iPhone visual acceptance.

## Execution path

`/web-003.html`

Flow:

Inspect → Plan → Approve → Execute on Kairos Staging → Read-back verification → Preserve rollback evidence

## Acceptance criteria

- MMG-IOS runtime reports ready before execution.
- Target theme is unpublished Kairos Staging.
- Published theme identity is preserved and unchanged.
- Canonical package files match approved hashes after Shopify read-back.
- Rollback evidence is complete.
- No replacement header or duplicate navigation system is introduced.
