# Command Center Live Operations — Next Slice

## Objective

Move the repository forward from green validation into the next executable production slice: Command Center Live Operations.

## Scope

This slice should improve the Command Center as the executive runtime surface for MMG/Kairos operations without destabilizing the green native iOS baseline.

## Required implementation targets

1. **Release-gate visibility**
   - Show customer releases by operational state: draft/internal review, blocked by gates, publish-ready, and published.
   - Preserve the rule that only approved final deliverables can become customer-published releases.

2. **Production queue visibility**
   - Keep lane-level queue metrics visible.
   - Make blocked queue items obvious.
   - Preserve production-only asset handling.

3. **Workflow and task readiness**
   - Keep active workflow, approval workflow, and open task counts visible.
   - Treat approval requirements as a first-class executive signal.

4. **Validation contract alignment**
   - Any new source file must be added through `project.yml` source paths or placed under an existing included source directory.
   - Any new required runtime surface should be added to the manual validation assertions only when it becomes a permanent contract.

## Non-goals

- Do not redesign the app shell.
- Do not reintroduce duplicate view declarations.
- Do not move large stale PR branches into `main` without reconciliation.
- Do not convert this into customer-facing release logic until the approval gate is stable.

## Acceptance criteria

- The Command Center continues to compile under the Manual iOS Validation workflow.
- The Command Center gives an executive-level summary of operational readiness.
- Release-gate language remains consistent with the production-only asset doctrine.
- The change can be reviewed as one coherent production slice.
