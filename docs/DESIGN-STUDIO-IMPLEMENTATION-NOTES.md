# Design Studio Implementation Notes

## Branch

`design-studio-foundation-current`

## Current Scope

This branch reapplies the Customer Portal Design Studio foundation on top of the latest `main` branch.

Implemented code-level foundation:

- Design Studio project model
- Design Studio asset model
- Version history model
- Export job model
- Permission record model
- Customer Portal navigation entry
- Design Studio workspace screen
- Project detail view
- Asset detail view
- Navigable project and asset rows
- New project editor form
- New asset editor form
- Workspace toolbar actions for seed, new project, and new asset
- Export approval action
- Export rejection/failure action
- Approval/rejection version records
- Asset status update on approved export release
- Seeded demo projects, assets, version records, export jobs, and permissions
- SwiftData model container registration
- Preview model container registration

## Production Doctrine Alignment

The implementation follows the HP12 Customer Portal Design Studio doctrine:

- The Customer Portal is not dashboard-only.
- The Command Center governs the customer experience.
- The Design Studio is the creative production workspace.
- The Asset Library stores production work.
- The Customer Knowledge Vault preserves context.
- Kairos orchestrates generation, refinement, versioning, export preparation, and approval routing.

## Production-Only Asset Doctrine

The workspace treats intermediate assets as MMG/Kairos in-house production materials unless released as approved final deliverables.

This is represented through:

- Asset statuses including Locked In-House
- Export jobs requiring approval before release
- Permission records separating approved deliverable export from intermediate asset access
- Kairos history summaries on assets
- Version history records for auditability
- Project-level and asset-level production detail views
- Manual create flows for live project and asset testing
- Executable approval/rejection controls on export jobs

## Next Implementation Pass

Recommended next pass:

1. Add relationship IDs instead of title-based linkage.
2. Connect Design Studio records to the broader Asset Library once that module is implemented.
3. Connect Customer Knowledge Vault references to real customer knowledge records.
4. Add Kairos generation/refinement action stubs for document, image, and brand workflows.
5. Add production audit/activity timeline.
6. Add basic filtering by project type, status, and approval queue.
7. Add edit/update flows for existing projects and assets.
8. Add dedicated export job creation form.

## Validation Note

All commits use `[skip ci]` to preserve GitHub Actions minutes during rapid development. Run manual iOS validation when the implementation batch is ready for final verification.
