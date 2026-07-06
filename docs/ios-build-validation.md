# iOS Build Validation Playbook

## Purpose

This playbook defines the build-validation process for the MMG IOS / Kairos native app.

The current validation target is to produce a clean Xcode build from the generated project before continuing deeper feature development.

## Required Local Commands

```bash
make bootstrap
make generate
make open
```

Then build the `MMGIOS` scheme in Xcode on an iPhone simulator.

## CI Validation

GitHub Actions workflow:

```text
.github/workflows/ios-build.yml
```

The workflow performs:

1. Repository checkout
2. Xcode selection
3. XcodeGen installation
4. Xcode project generation
5. Clean simulator build

## Expected Fix Cycle

If CI fails:

1. Open the failed workflow job.
2. Capture the first Swift compiler error.
3. Fix missing types, missing files, imports, or project-generation issues.
4. Re-run the failed workflow job.
5. Repeat until the build passes.

## Current Engineering Priority

Do not add another major feature module until the generated Xcode project builds cleanly.

## Known Risk Areas

- Newly added Swift files must be included by XcodeGen through `project.yml`.
- The hand-authored `MMGIOS.xcodeproj` may lag behind generated source files.
- Local JSON stores rely on Observation and iOS 17.
- SwiftUI previews may surface constructor mismatches after app-shell updates.
- GitHub Actions may require Actions to be enabled for the repository before workflow runs appear.
