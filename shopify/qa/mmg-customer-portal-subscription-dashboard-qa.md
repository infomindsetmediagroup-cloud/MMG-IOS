# MMG Customer Portal Subscription Dashboard — QA Contract

## Release status

**Staging only. Do not publish until every required release gate passes.**

## Data and authentication

- [ ] Unauthenticated requests return `401` and no private dashboard fields.
- [ ] Authenticated requests derive the customer ID from the server session.
- [ ] Browser query parameters, form fields, and Liquid data attributes cannot select another customer.
- [ ] Responses include `Cache-Control: no-store, private`, `Vary: Cookie`, and `X-Content-Type-Options: nosniff`.
- [ ] Shopify provider contract IDs, internal dispatch IDs, delivery-package references, ownership-grant IDs, and audit payloads are absent from the response.
- [ ] A customer with no subscription record receives the governed no-membership state.
- [ ] A customer with a canceled or expired subscription sees the latest membership record and a renewal path without receiving active entitlement controls.

## Locked plan validation

- [ ] Monthly displays $14.95, one package, and two assets per billing cycle.
- [ ] Bi-weekly displays $24.95, two packages, and four assets per billing cycle.
- [ ] Weekly displays $39.95, four packages, and eight assets per billing cycle.
- [ ] Weekly never displays a fifth package in a five-week calendar month.
- [ ] Every package displays a two-asset target.

## Progress accounting

- [ ] Assets remaining equals total assets minus committed assets.
- [ ] Packages remaining equals total packages minus completed packages.
- [ ] Counts never display below zero or above the locked plan capacity.
- [ ] My Library count uses distinct active ownership by canonical asset ID.
- [ ] Browser-calculated counts are never submitted back as authoritative state.

## Current-package priority

Validate the resolver order:

1. `recovery_required`
2. `open`
3. `delivery_ready`
4. `confirmed`
5. `scheduled`
6. `delivered`
7. `closed`
8. `expired`
9. `canceled`

- [ ] An open first package displays **Choose your first two titles**.
- [ ] An open scheduled package displays **Review this package**.
- [ ] A recovery-required package directs the customer to Customer Service or the authorized recovery workflow.
- [ ] A confirmed or delivered package directs the customer to My Library.
- [ ] A scheduled package directs the customer to browse the Knowledge Library while waiting.
- [ ] No current package displays a safe next-package state.

## Review-window countdown

- [ ] Countdown uses the server-provided `closesAt` timestamp.
- [ ] Countdown updates without changing authoritative package state.
- [ ] Closed windows display **Review window closed**.
- [ ] Missing or invalid deadlines display **No deadline**.
- [ ] Countdown is exposed with `role="timer"` and does not rely on color alone.

## Title cards

- [ ] Selected, reserved, and confirmed titles display title, format, topic, and square thumbnail when present.
- [ ] Missing thumbnail data does not break the card.
- [ ] Title strings are rendered with `textContent` rather than injected HTML.
- [ ] Services and subscription products cannot appear as package titles.
- [ ] Owned-title exclusions remain enforced by the server-side picker and controller.

## Package timeline

- [ ] Packages render in ascending package-sequence order.
- [ ] Status text is readable without color.
- [ ] Delivered packages show the delivered date.
- [ ] Delivery-ready packages show the preparation state.
- [ ] Recovery-required packages use the warning state.
- [ ] Empty schedules show a clear reconciliation message.

## Existing Customer Portal preservation

- [ ] Capture the complete live Customer Portal source before integration.
- [ ] Insert the dashboard without deleting or replacing service-project modules.
- [ ] Preserve current support, account, navigation, authentication, and portal-access behavior.
- [ ] Preserve the native Shopify header and footer.
- [ ] Do not add global `html`, `body`, or `#MainContent` overrides.
- [ ] Do not add `100vw`, negative viewport breakouts, or horizontal overflow.
- [ ] Do not expose authenticated portal data in public Liquid source.

## Responsive behavior

- [ ] 320px viewport has no horizontal scrolling.
- [ ] 375px and 430px layouts use one-column cards and full-width actions.
- [ ] Tablet layouts use two-column progress and resource cards where space permits.
- [ ] Desktop layouts use four-column progress and resource cards.
- [ ] Square thumbnails retain a 1:1 presentation.
- [ ] Long plan names, titles, and support text wrap without clipping.

## Accessibility

- [ ] Heading hierarchy remains logical inside the existing portal page.
- [ ] Loading and error states are announced through a live region.
- [ ] All links are keyboard reachable.
- [ ] Focus-visible styling is clear on every action.
- [ ] Status, progress, and recovery meaning is conveyed in text.
- [ ] Decorative images use empty alt text; linked title meaning remains in adjacent text.
- [ ] Reduced-motion preference disables nonessential transitions.
- [ ] Screen-reader testing covers loading, unauthenticated, active, recovery, and error states.

## Event refresh

- [ ] `mmg:knowledge-library-selection-updated` refreshes the dashboard once.
- [ ] `mmg:knowledge-library-package-confirmed` refreshes the dashboard once.
- [ ] `mmg:entitlement-counter-ready` refreshes the dashboard without an event loop.
- [ ] Disconnecting the component removes listeners and timers.

## Failure states

- [ ] Network failure preserves the page shell and shows a retry/support message.
- [ ] Invalid JSON produces a governed error state.
- [ ] `404` displays membership discovery rather than a generic server error.
- [ ] `500` does not leak exception details.
- [ ] An absent endpoint displays a configuration-required state.

## Production dependencies

- [ ] Both PostgreSQL migrations are applied.
- [ ] Production SQL connectivity is healthy.
- [ ] Shopify subscription reconciliation is active.
- [ ] Delivery-window scheduling is active.
- [ ] Delivery dispatch and acknowledgement are active.
- [ ] At least two subscription-selectable digital assets are fully verified.
- [ ] Production monitoring separates portal API failures from unrelated page-shell workflow failures.
