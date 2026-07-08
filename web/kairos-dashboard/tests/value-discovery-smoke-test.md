# Value Discovery Smoke Test Plan

## Purpose

Validate the dashboard Value Discovery integration without triggering GitHub Actions during active development.

## Files Under Test

- `web/kairos-dashboard/scripts/customer-portal-runner.js`
- `web/kairos-dashboard/scripts/customer-portal-panel.js`
- `web/kairos-dashboard/styles/value-discovery.css`
- `web/kairos-dashboard/index.html`

## Smoke Test Steps

1. Serve `web/kairos-dashboard/index.html` locally.
2. Confirm `value-discovery.css` loads from the page head.
3. Confirm the customer portal panel renders.
4. Confirm six Value Discovery fields appear.
5. Enter sample text in every field.
6. Click `Save Value Discovery`.
7. Confirm profile completion updates above zero.
8. Confirm Kairos recommendation rows render.
9. Click `Map Customer Portal`.
10. Confirm the portal readiness run includes Value Discovery items.

## Expected Recommendation Categories

- Identity
- Asset Path
- Audience
- Execution

## Pass Criteria

The smoke test passes when the form saves, profile completion updates, and recommendation rows are visible after saving.
