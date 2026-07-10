# MMG/Kairos Checkpoint 011 — Design Studio Production Workspace

**Status:** Active implementation; validation pending  
**Branch:** `checkpoint-011-design-studio-production`  
**Baseline:** Checkpoint 010 Publishing reference domain merged into `main` under Constitution v1.0

## Objective

Establish the Customer Portal Design Studio as a governed MMG/Kairos production workspace that composes the shared Platform Services asset and workflow contracts and supports Publishing without becoming a free standalone design or export platform.

## Included

- tenant-scoped Design Studio project and asset contracts
- canonical Design Studio production lifecycle
- workflow factory composed from shared Platform Services contracts
- source, editable, generated, proof, and approved-deliverable asset roles
- explicit release approval records
- executable prohibition on releasing intermediate assets
- publishing-project linkage without duplicating Publishing ownership
- canonical Design Studio fact events

## Production-only asset doctrine

Source files, editable files, generations, proofs, templates, reusable components, and intermediate production materials remain inside the MMG/Kairos workspace. Only assets explicitly classified as approved deliverables and covered by a tenant-scoped release approval may leave the workspace.

## Boundaries

- no standalone public design platform
- no unrestricted downloads
- no autonomous customer delivery
- no production database persistence
- no external image, video, or document-generation providers
- no retailer, marketplace, billing, or financial actions
- no bypass of executive approval
- Checkpoint 006 remains the certified rollback baseline

## Validation required before merge

1. TypeScript build.
2. Design lifecycle transition tests.
3. Workflow dependency tests.
4. Cross-tenant rejection test.
5. Intermediate-asset release rejection test.
6. Approved-deliverable release test.
7. Publishing linkage architecture review.
8. Constitutional architecture review.

All active-development commits should use `[skip ci]` until one deliberate validation run is approved.
