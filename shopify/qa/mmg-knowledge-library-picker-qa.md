# MMG Knowledge Library Picker — QA Contract

**Component:** MMG Knowledge Library Picker v1.0  
**Status:** Staging required before publication

## Data Preconditions

- The canonical route remains `/pages/knowledge-library`.
- The current live Knowledge Library source is captured before integration.
- The authenticated picker endpoint is available through the deployed MMG/Kairos runtime.
- The endpoint resolves the customer from the authenticated session.
- The endpoint resolves the active subscription and entitlement window server-side.
- A session-bound CSRF token is available for mutations.
- At least two digital assets pass every subscription-selection release gate.
- Every selectable asset has a unique `mmg.asset_id`.
- Every selectable asset has verified portrait and square media.
- Every selectable asset has a verified delivery package.

## Authentication and Authorization Tests

1. Unauthenticated GET returns the approved unauthenticated response or snapshot state.
2. Unauthenticated POST cannot select, remove, or confirm.
3. A customer cannot supply another customer ID in the payload.
4. Customer, subscription, and window identity fields are rejected when supplied by the browser.
5. A customer cannot read or mutate another customer’s entitlement window.
6. An inactive subscriber cannot select a title.
7. A canceled or expired entitlement window cannot be mutated.
8. The server rejects a foreign Origin header.
9. The server rejects a missing or mismatched CSRF token.
10. Public page source contains no customer ownership grants, subscription contract IDs, or entitlement-window IDs.

## First-Package Functional Tests

1. The page headline reads **Choose Your First Two Titles**.
2. The authoritative snapshot reports two total units and a two-title target.
3. Owned assets are absent from selectable results.
4. Services are absent from selectable results.
5. The MMG Knowledge Subscription product is absent from selectable results.
6. Incomplete or unverified delivery packages are absent.
7. Selecting one one-unit title leaves one unit and one title remaining.
8. Selecting the second one-unit title leaves zero units and enables confirmation.
9. A third title cannot be selected.
10. A selected title can be removed before confirmation.
11. Removing a title restores its unit.
12. The same asset cannot be selected twice.
13. Confirmation fails with fewer than two titles.
14. Confirmation succeeds with exactly two titles and two units.
15. Confirmed selections become locked.
16. The confirmation operation creates delivery-grant inputs once.
17. Replaying the same confirmation request does not duplicate grants.

## Scheduled-Package Review Tests

1. Kairos-proposed titles appear selected when the review window opens.
2. The window remains within the approved 24–48-hour range.
3. An unconfirmed proposed title can be removed.
4. An eligible replacement can be selected.
5. An owned replacement cannot be selected.
6. Confirmation requires exactly two titles and all two units.
7. Closed, expired, or confirmed windows cannot be edited.

## Concurrency and Idempotency Tests

1. Every mutation carries a unique `requestId`.
2. Replaying a processed request ID returns the current result without applying the mutation again.
3. Every mutation carries `expectedWindowVersion`.
4. A stale version returns `WINDOW_VERSION_CONFLICT`.
5. The conflict response includes the newest available snapshot.
6. Two simultaneous final-unit selections cannot overdraw capacity.
7. Two simultaneous confirmations cannot create duplicate delivery grants.
8. Versioned persistence is atomic.

## Filtering and Presentation Tests

1. Search filters title, summary, topic, level, format, and series text.
2. Topic filtering changes visible cards only.
3. Experience-level filtering changes visible cards only.
4. Format filtering changes visible cards only.
5. Reset Filters clears every presentation filter.
6. Filtering never changes server eligibility or remaining units.
7. Selected titles remain ordered before unselected titles.
8. Series order is preserved where applicable.
9. Title order is the deterministic fallback.
10. An empty filtered result displays the approved empty state.

## Accessibility Tests

- The loading and mutation status uses `role="status"` and `aria-live="polite"`.
- Search and select controls have visible labels.
- Every title action is a native button.
- Every product detail link is keyboard reachable.
- Visible focus appears on inputs, selects, links, and buttons.
- Selected, unavailable, processing, and confirmed states use text rather than color alone.
- Disabled cards display a readable reason.
- The confirmation summary explains remaining title and unit requirements.
- Reduced-motion mode suppresses nonessential animation.
- No-JavaScript mode preserves public Knowledge Library and Customer Portal links.

## Responsive Tests

Test at:

- 320 px
- 375 px
- 390 px
- 430 px
- 768 px
- 1024 px
- 1440 px

Verify:

- No horizontal scrolling.
- One card column on small mobile.
- Two columns on tablet.
- Three columns on desktop.
- Filters stack without clipping.
- Titles, metadata pills, buttons, and reason text wrap naturally.
- The confirmation panel does not obscure content.
- Sticky confirmation falls back to static positioning on mobile.
- Images do not distort.

## Shopify-Safe Tests

- No `100vw` breakout.
- No negative-margin page breakout.
- No `#MainContent` mutation.
- No `document.body.style` mutation.
- No removal of the native Shopify header or footer.
- Existing Public Catalog links and one-time purchase behavior remain intact.
- The picker is inserted only into the approved Knowledge Library location.
- The provisional Frontpage collection source does not become an authority for selection.

## Event Tests

Verify emission and payloads for:

```text
mmg:knowledge-library-picker-ready
mmg:knowledge-library-selection-updated
mmg:knowledge-library-package-confirmed
mmg:knowledge-library-picker-error
```

## Publication Gate

Do not publish until the authenticated endpoint, session identity, CSRF validation, durable ownership grants, versioned entitlement windows, atomic confirmation, delivery-grant creation, two fully eligible assets, and full end-to-end authorization QA are complete.
