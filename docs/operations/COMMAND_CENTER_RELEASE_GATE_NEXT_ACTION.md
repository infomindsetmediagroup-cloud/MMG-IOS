# Command Center Release Gate Next Action

## Next action

Run Manual iOS Validation on `agent/command-center-release-ops` when ready.

## If green

- Merge the PR into `main`.
- Run Manual iOS Validation against `main` if a post-merge gate is required.
- Continue with seeded sample release data and detail navigation in a separate branch.

## If red

- Fix the first compiler error.
- Do not weaken validation assertions unless the assertion is demonstrably stale.
- Re-run the same branch after the fix.
