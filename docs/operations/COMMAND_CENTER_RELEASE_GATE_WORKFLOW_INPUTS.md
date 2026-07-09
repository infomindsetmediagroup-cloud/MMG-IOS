# Manual Validation Inputs — Command Center Release Gate Slice

Use these inputs when validating the branch in GitHub Actions.

## Workflow

Manual iOS Validation

## Inputs

- Branch, tag, or SHA to validate: `agent/command-center-release-ops`
- xcodebuild destination for simulator build: `generic/platform=iOS Simulator`

## Expected result

The workflow should complete green. If it fails, triage the first Swift compiler error before changing the validation assertions.
