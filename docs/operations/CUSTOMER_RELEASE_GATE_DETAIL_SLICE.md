# Customer Release Gate Detail Slice

## Purpose

Add a focused drill-down view for customer release gate state so operators can inspect exactly why a release is blocked or cleared before customer publication.

## Runtime changes

- Adds `CustomerReleaseGateDetailView`.
- Routes release queue rows in `CustomerReleaseDashboardView` into the gate detail screen.
- Routes Command Center release rows into the same gate detail screen.
- Shows each `CustomerReleaseGatePolicy` result with a pass/fail marker and detail text.
- Adds blocked-release count to the Customer Release runtime summary.
- Adds `CustomerReleaseSeedFactory` for local blocked, approved, and published release samples.
- Adds a dashboard operator control to seed sample release data without requiring live customer records.

## Doctrine preserved

The detail view reinforces that only approved final deliverables may be released to controlled Customer Portal access. Intermediate production assets, editable files, layered files, drafts, and reusable source materials remain internal unless explicitly approved as final customer deliverables.

## Sample data states

The seed factory creates:

1. an approved-final deliverable eligible for customer release;
2. an internal draft deliverable that must remain inside MMG/Kairos;
3. a preview package blocked by missing approval metadata;
4. a blocked release missing approval metadata;
5. an approved release ready to publish;
6. a published release separated from staged releases.

## Validation plan

Hold validation until this branch is part of a larger batch, unless executive review requires a focused check.

Recommended inputs when validation is approved:

- Branch, tag, or SHA to validate: `agent/customer-release-gate-detail`
- xcodebuild destination for simulator build: `generic/platform=iOS Simulator`
