# Local Build Check Handoff

## Objective

Validate the current runtime foundation locally before enabling GitHub Actions or building the next production layer.

## Do not run yet

Do not trigger GitHub Actions until the local Xcode build has been checked.

## Manual Xcode check

1. Pull latest `main`.
2. Open the iOS project in Xcode.
3. Select the MMG iOS app target.
4. Clean build folder.
5. Build for simulator.
6. Launch the app.

## Runtime validation path

1. Open Command tab.
2. Confirm workflow summary cards load.
3. Confirm queue metrics load.
4. Open Workflow tab.
5. Confirm one seeded workflow appears.
6. Tap Advance.
7. Confirm workflow stage and progress update.
8. Tap Complete Task.
9. Confirm open task count updates.
10. Tap Complete Queue.
11. Confirm open queue count updates.
12. Open Studio tab.
13. Confirm Design Studio project appears.
14. Confirm workflow, task, queue, and knowledge IDs are stored on the project.
15. Confirm Knowledge Vault context appears.

## Failure checks

If the project does not compile, inspect:

- SwiftData model registration in `MMGIOSApp`.
- Preview model registration in `AppRootView`.
- Type name collisions with existing app models.
- Tab count and SwiftUI view references.
- Any missing import for SwiftData or SwiftUI.

## Release discipline

After local validation passes:

- Keep `[skip ci]` for development commits.
- Run GitHub Actions only at a controlled validation checkpoint.
- Do not merge additional architectural changes until the runtime foundation compiles.

## Next implementation gate

Once this build check passes, proceed to:

1. Asset Management Foundation.
2. Deliverables Engine.
3. Approval Engine.
