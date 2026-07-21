# MMG Commerce Operations Dashboard QA

## Authentication and privacy

- [ ] `GET /api/admin/commerce/operations` requires an authenticated MMG admin session.
- [ ] The principal must carry `mmg-commerce-operator`.
- [ ] Staging and production are the only accepted environment values.
- [ ] Responses are private and non-cacheable.
- [ ] Customer, contract, entitlement, ownership, storage, token, alert-destination, and provider-payload identifiers are absent.
- [ ] The browser component exposes no mutation controls.
- [ ] The component never calls `/api/internal/commerce/operations`.

## Data presentation

- [ ] Overall health status and evaluation time render correctly.
- [ ] Rollout stage, cohort percentage, release ID, and observation state render correctly.
- [ ] Consistency status and failed checks render correctly.
- [ ] Open incident count matches the returned incident list.
- [ ] SEV1, SEV2, SEV3, and SEV4 states use distinguishable text and borders.
- [ ] Health signals show title, state, value, unit, sample count, and reason code.
- [ ] Control cards show code, mode, reason, version, and change time.
- [ ] Empty health, incident, control, and audit states remain understandable.

## Runtime safety

- [ ] DOM content is created with `textContent` and `replaceChildren`; no API value reaches `innerHTML`.
- [ ] Refresh retains the selected environment.
- [ ] Network failure shows a protected failure state and changes no controls.
- [ ] Unauthorized access shows the operator-required state.
- [ ] Invalid or missing dates render as unavailable rather than throwing.
- [ ] Dashboard-loaded and dashboard-error events contain no private identifiers.

## Responsive and accessible behavior

- [ ] Heading hierarchy remains logical inside the existing Admin Portal.
- [ ] Loading status is announced through `aria-live`.
- [ ] Environment and refresh controls are keyboard operable.
- [ ] Focus indicators are visible.
- [ ] Summary, signal, control, and incident cards collapse cleanly on mobile.
- [ ] No 100vw, negative-margin breakout, page-shell reset, or MainContent mutation is introduced.
- [ ] Reduced motion disables the loading animation.

## Integration

- [ ] The dashboard is inserted additively into the authenticated Admin Portal.
- [ ] Existing Admin Portal navigation, authentication, support, and Kairos controls remain operational.
- [ ] The endpoint is connected to the same operations repository used by the protected control plane.
- [ ] The advisory fresh-E2E indicator is not used as rollout authority; the rollout service performs release-bound verification independently.
