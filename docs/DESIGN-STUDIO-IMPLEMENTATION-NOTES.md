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
- Audit event model
- Stable project relationship IDs
- Stable asset relationship IDs
- Stable IDs on version, export, permission, and audit records
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
- Approval/rejection audit events
- Project, asset, and workspace audit timelines
- Asset status update on approved export release
- Seeded demo projects, assets, version records, export jobs, permissions, and audit events
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
- Stable relationship IDs with title-based fallback for early records
- Audit timeline across creation, export queueing, approvals, rejections, and release decisions

## Next Implementation Pass

Recommended next pass:

1. Connect Design Studio records to the broader Asset Library once that module is implemented.
2. Connect Customer Knowledge Vault references to real customer knowledge records.
3. Add Kairos generation/refinement action stubs for document, image, and brand workflows.
4. Add basic filtering by project type, status, and approval queue.
5. Add edit/update flows for existing projects and assets.
6. Add dedicated export job creation form.
7. Add migration/backfill support for any title-linked records created before stable IDs.
8. Add audit filters by event type, project, asset, and approval status.

## Validation Note

All commits use `[skip ci]` to preserve GitHub Actions minutes during rapid development. Run manual iOS validation when the implementation batch is ready for final verification.
