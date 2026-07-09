# Workflow Runtime Foundation

Status: Implementation batch started.

## Scope

This runtime creates the shared workflow layer used by the Customer Portal, Design Studio, Command Center, and Kairos orchestration.

## Implemented in this batch

- Workflow enums for type, stage, status, and priority.

## Next code files

- Persisted workflow record.
- Workflow transition record.
- Workflow service.
- SwiftData model registration.
- Command Center visibility.

## Acceptance criteria

- Workflows receive immutable relationship IDs.
- Workflows can be created for customer production projects.
- Workflow stages can transition only through approved lifecycle paths.
- Transitions are recorded for auditability.
- Design Studio projects can attach to workflow records.
