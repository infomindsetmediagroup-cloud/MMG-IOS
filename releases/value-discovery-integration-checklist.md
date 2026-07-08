# Value Discovery Integration Checklist

## Implemented Surfaces

- `web/kairos-dashboard/scripts/customer-portal-runner.js`
- `web/kairos-dashboard/scripts/customer-portal-panel.js`
- `web/kairos-dashboard/styles/value-discovery.css`
- `web/kairos-dashboard/index.html`

## Runtime Coverage

- Captures customer knowledge and expertise.
- Captures skills.
- Captures professional experience.
- Captures life experience.
- Captures interests.
- Captures desired outcomes.
- Persists the profile in local customer portal state.
- Generates Kairos recommendations from the profile.
- Displays recommendations in the dashboard customer portal panel.

## Manual Validation Path

1. Open the Kairos dashboard.
2. Confirm the Value Discovery stylesheet loads.
3. Confirm the Customer Portal panel renders.
4. Fill every Value Discovery field.
5. Select Save Value Discovery.
6. Confirm profile completion updates.
7. Confirm Kairos recommendation cards render.
8. Select Map Customer Portal.
9. Confirm the portal run includes Value Discovery readiness and recommendation handoff.

## Notes

GitHub connector writes use skip-CI during active development to preserve Actions minutes. Full build validation should be run only at final integration checkpoint.
