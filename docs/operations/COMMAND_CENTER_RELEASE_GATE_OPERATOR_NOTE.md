# Command Center Release Gate Operator Note

## Operator guidance

When this PR is ready to validate, use the GitHub Actions manual workflow rather than pushing additional trigger-based commits.

Run:

- Workflow: Manual iOS Validation
- Branch: `agent/command-center-release-ops`
- Destination: `generic/platform=iOS Simulator`

## Interpretation

- Green means the runtime slice is build-valid and ready for merge consideration.
- Red means inspect the first compiler error before adding more scope.

## Preserve scope

Do not add unrelated feature work to this branch after validation starts.
