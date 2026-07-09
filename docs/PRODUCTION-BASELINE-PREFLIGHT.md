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

## Build-readiness checks before running GitHub Actions

- Open the app target in Xcode.
- Confirm `MMGIOSApp` model container compiles with all registered SwiftData models.
- Confirm `AppRootView` preview compiles with all runtime models.
- Launch the app locally.
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

Do not add Asset Management, Deliverables, or Approval Engine until this baseline passes a local build check or manual Xcode validation.
