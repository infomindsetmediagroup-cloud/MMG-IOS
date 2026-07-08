# Manual iOS Validation Runbook

## Purpose

Use this runbook when the project needs real Xcode validation but no local Mac is available.

The repository now includes a manual GitHub Actions workflow:

`.github/workflows/ios-manual-validation.yml`

This workflow is intentionally manual so active development commits do not automatically burn GitHub Actions minutes.

## How to Run from GitHub Web or Mobile

1. Open the MMG-IOS repository in GitHub.
2. Select the `Actions` tab.
3. Select `Manual iOS Validation`.
4. Select `Run workflow`.
5. For `ref_name`, enter the branch or SHA to validate.
   - Recommended branch: `value-discovery-integration`
   - Current validated target candidate: latest branch head
6. Leave `simulator_destination` as `generic/platform=iOS Simulator` unless the workflow logs show that Xcode needs a more specific destination.
7. Start the workflow.

## What the Workflow Does

- Checks out the selected ref.
- Shows the installed Xcode version.
- Installs XcodeGen.
- Generates `MMGIOS.xcodeproj` from `project.yml`.
- Lists available schemes.
- Prints available simulator destinations with `xcodebuild -showdestinations`.
- Resolves package dependencies.
- Builds the `MMGIOS` scheme for iOS Simulator with signing disabled.
- Verifies native Value Discovery source files exist.
- Verifies dashboard Value Discovery files exist.
- Verifies Shopify customer-value files exist.
- Confirms `Your Knowledge Has Value` is present in the Shopify surfaces.

## If the Workflow Fails

1. Open the failed workflow run.
2. Open the failed job.
3. Copy the failing compiler or shell output.
4. Bring the error back into ChatGPT.
5. Patch the repository.
6. Commit the fix with `[skip ci]`.
7. Re-run the manual validation workflow only when ready to spend another validation run.

## Simulator Destination Fallback

The default destination is:

`generic/platform=iOS Simulator`

If that fails, use the destinations printed by the workflow logs. Choose one exact destination from the `xcodebuild -showdestinations` output and enter it in the `simulator_destination` field on the next manual run.

## Expected Fix Loop

- Run manual validation.
- Read logs.
- Patch compile or static validation failure.
- Commit fix with `[skip ci]`.
- Re-run manual validation.
- Repeat until clean.

## Notes

Runtime behaviors that require simulator interaction, such as persistence across relaunch and visual navigation checks, still require either a cloud Mac session with simulator access or a later TestFlight/device validation path. The manual workflow establishes the first required gate: cloud Xcode project generation and compile validation.
