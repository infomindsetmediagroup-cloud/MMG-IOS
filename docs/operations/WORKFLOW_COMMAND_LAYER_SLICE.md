# Workflow Command Layer Slice

## Purpose

Turn workflow detail from a passive inspection screen into an operational command surface.

## Runtime changes

- Adds command operations to `WorkflowRuntimeService`:
  - request approval;
  - approve;
  - reject;
  - block;
  - resume;
  - complete;
  - archive.
- Adds command controls to `WorkflowRuntimeDetailView`.
- Persists a `WorkflowTransitionRecord` for every command action.
- Keeps command transitions inside the same workflow history stream.

## Operational value

Operators can now advance, block, resume, approve, reject, complete, or archive workflows directly from the workflow detail screen. This moves the workflow runtime closer to a live execution console.

## CI policy

This remains inside the held PR #16 batch. Do not run Manual iOS Validation until the batch is intentionally promoted to validation.
