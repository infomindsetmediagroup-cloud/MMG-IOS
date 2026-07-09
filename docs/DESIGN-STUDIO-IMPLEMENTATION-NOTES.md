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

## Next Implementation Pass

Recommended next pass:

1. Add create/edit forms for projects and assets.
2. Add export job approval action.
3. Add relationship IDs instead of title-based linkage.
4. Connect Design Studio records to the broader Asset Library once that module is implemented.
5. Connect Customer Knowledge Vault references to real customer knowledge records.
6. Add Kairos generation/refinement action stubs for document, image, and brand workflows.
7. Add production audit/activity timeline.
8. Add basic filtering by project type, status, and approval queue.

## Validation Note

All commits use `[skip ci]` to preserve GitHub Actions minutes during rapid development. Run manual iOS validation when the implementation batch is ready for final verification.
