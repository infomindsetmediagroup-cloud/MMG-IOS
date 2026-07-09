# Workflow Runtime Foundation

Status: Foundation slice implemented.

## Scope

This runtime creates the shared workflow layer used by the Customer Portal, Design Studio, Command Center, and Kairos orchestration.

## Implemented in this batch

- Workflow enums for type, stage, status, and priority.
- Workflow stage transition policy.
- Workflow stage progress scoring.
- Persistent workflow record.
- Persistent workflow transition record.
- SwiftData app model registration.
- SwiftData preview model registration.
- Runtime validation checklist.

## Next code files

- Workflow service actions for create and transition.
- Command Center workflow visibility.
- Design Studio project workflow attachment.
- Task Engine foundation.

## Acceptance criteria

- Workflows receive immutable IDs.
- Workflows can be created for customer production projects.
- Workflow stages can transition only through approved lifecycle paths.
- Transitions are recorded for auditability.
- Design Studio projects can attach to workflow records.
