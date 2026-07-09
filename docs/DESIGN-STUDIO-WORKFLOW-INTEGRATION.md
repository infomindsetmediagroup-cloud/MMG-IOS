# Design Studio Workflow Integration

## Scope

This checklist validates the first Design Studio to Workflow Runtime integration slice.

## Runtime files

- `MMGIOS/Features/CommandCenter/CommandCenterRuntimeSummaryView.swift`
- `MMGIOS/Features/DesignStudio/DesignStudioProjectRecord.swift`
- `MMGIOS/Features/DesignStudio/DesignStudioProjectFactory.swift`
- `MMGIOS/Features/DesignStudio/DesignStudioWorkflowView.swift`
- `MMGIOS/Features/KnowledgeVault/KnowledgeVaultRecord.swift`

## Manual validation

- Command tab shows workflow summary cards.
- Command tab shows queue metrics by lane.
- Studio tab creates a Design Studio project.
- Project creation creates a Knowledge Vault record.
- Project creation creates a workflow record.
- Project creation creates an initial task.
- Project creation creates a production queue item.
- Design Studio project stores workflow, task, queue, and knowledge IDs.
- Workflow tab reflects generated workflow, task, and queue records.

## Operational significance

This is the first end-to-end runtime path for project creation:

Design Studio Project → Knowledge Vault Context → Workflow → Task → Production Queue.

## Next implementation slice

- Add workflow/task/queue detail navigation.
- Add approval queue and blocked queue views.
- Add customer portal deliverables shell.
- Add asset records linked to Design Studio projects.
