# Local Build Check Handoff

## Objective

Validate the current runtime foundation locally before enabling GitHub Actions or building the next production layer.

## Execution environment result

The available execution container is Linux and does not include Xcode or `xcodebuild`, so a true local iOS compile could not be executed here.

A static build-readiness validation was performed through the GitHub connector instead, followed by one controlled manual GitHub Actions simulator build.

## Static validation completed

- Confirmed `MMGIOS.xcodeproj/project.pbxproj` exists.
- Confirmed the project originally registered only the legacy app source files.
- Fixed the Xcode project source registration so the new runtime files are included in the app target.
- Confirmed the updated project file now references the runtime source files in PBXBuildFile, PBXFileReference, group children, and PBXSourcesBuildPhase sections.

## First manual simulator build result

The first controlled GitHub Actions simulator build reached Xcode compilation and failed with Swift compiler errors.

Primary cause:

- The workflow runs `xcodegen generate`, which regenerates `MMGIOS.xcodeproj` from `project.yml`.
- `project.yml` was still including the entire `MMGIOS` directory.
- That pulled older legacy source files back into the compile target and created conflicts with the new runtime layer.

Primary compiler failure:

- `WorkflowStatus` and `WorkflowPriority` were ambiguous because older domain models already define those names.

Fixes applied after first failure:

- Constrained `project.yml` to the runtime validation source set only.
- Namespaced runtime workflow enums as `RuntimeWorkflowType`, `RuntimeWorkflowStage`, `RuntimeWorkflowStatus`, and `RuntimeWorkflowPriority`.
- Updated runtime records, services, policies, and dashboards to use the namespaced workflow enums.

## Manual Xcode check still required

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

- Source inclusion in `project.yml` first, because XcodeGen overwrites `MMGIOS.xcodeproj`.
- SwiftData model registration in `MMGIOSApp`.
- Preview model registration in `AppRootView`.
- Type name collisions with existing app models.
- Tab count and SwiftUI view references.
- Any missing import for SwiftData or SwiftUI.
- New source file membership in `MMGIOS.xcodeproj/project.pbxproj` only if XcodeGen is not being used.

## Release discipline

After simulator validation passes:

- Keep `[skip ci]` for development commits.
- Run GitHub Actions only at controlled validation checkpoints.
- Do not add Asset Management, Deliverables, or Approval Engine until the runtime foundation compiles.

## Next implementation gate

Once this build check passes, proceed to:

1. Asset Management Foundation.
2. Deliverables Engine.
3. Approval Engine.
