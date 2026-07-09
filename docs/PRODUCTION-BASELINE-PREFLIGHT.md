# Production Baseline Preflight

## Purpose

This checklist verifies that the current runtime foundation is structurally organized before the next production layer is added.

## Current foundation

- Workflow Runtime
- Task Engine
- Production Queue
- Command Runtime Summary
- Design Studio workflow attachment
- Knowledge Vault context records

## Structural checks

- Runtime models are registered in `MMGIOSApp`.
- Preview containers include the same runtime models used by visible runtime views.
- Design Studio project creation generates related records through a single factory path.
- Generated records preserve stable IDs across project, workflow, task, queue, and knowledge context.
- Runtime dashboards are read-only except for explicit internal validation actions.
- Development commits continue using `[skip ci]` until manual validation is ready.

## Second preflight hardening pass

- Removed unresolved Customer Portal and Customer Value symbols from the active app shell.
- Removed unverified customer/value SwiftData models from `MMGIOSApp` registration.
- Limited the app shell validation surface to verified runtime views: Command, Workflow, and Studio.
- Confirmed runtime source files are registered in `MMGIOS.xcodeproj/project.pbxproj`.
- Converted the iOS simulator workflow to manual-only so normal development commits do not spend Actions minutes.
- Updated the simulator build workflow to use a generic iOS Simulator destination instead of a specific device name.

## Third preflight hardening pass

- Narrowed the Xcode `PBXSourcesBuildPhase` to the runtime validation surface only.
- Removed legacy dashboard/admin/production/growth/settings source files from the active compile phase for this validation gate.
- Kept file references in the project so older files remain available for later reintegration.
- Preserved app shell, runtime models, runtime services, Command Runtime, Workflow Runtime, Design Studio Runtime, Task Engine, Production Queue, and Knowledge Vault in the compile phase.
- Reduced the expected manual simulator run to the smallest meaningful build target.

## Build-readiness checks before running GitHub Actions

- Confirm `MMGIOSApp` model container compiles with verified runtime SwiftData models.
- Confirm `AppRootView` compiles with Command, Workflow, and Studio tabs only.
- Confirm Command tab loads Command Runtime summary.
- Confirm Workflow tab seeds and advances runtime records.
- Confirm Studio tab creates project, workflow, task, queue, and knowledge records.
- Confirm no duplicate seed records are created after repeated tab visits.

## Security and production-copy checks

- No API keys are stored in Swift source files.
- No runtime feature depends on the consumer ChatGPT app.
- Production runtime records use stable IDs instead of title-only linkage.
- Customer-facing deliverables are not exposed by default.
- Intermediate production records remain internal until release functionality is implemented.
- Demo seed data is isolated to internal validation surfaces.

## Gate before next layer

Do not add Asset Management, Deliverables, or Approval Engine until this baseline passes a manual simulator build check.
