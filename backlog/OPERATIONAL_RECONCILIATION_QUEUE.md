# Operational Reconciliation Queue

## Purpose

This queue converts the repository reconciliation recommendations into executable implementation batches for MMG IOS / Kairos.

## Operating Constraints

- Preserve GitHub Actions minutes during active development.
- Prefer `[skip ci]` for documentation, backlog, and low-risk structural commits.
- Use manual workflow dispatch only at validation gates.
- Do not direct-merge large branch divergences without subsystem grouping.
- Keep each production batch coherent, reviewable, and reversible.

## P0 — Validation Contract Alignment

### P0.1 — Keep iOS build workflow aligned with active runtime slice

**Surface:** `.github/workflows/ios-build.yml`

**Problem:** The app can compile successfully while a post-build file/wiring assertion fails. That is an operational assertion failure, not a Swift compile failure.

**Action:** Treat workflow assertions as a validation contract. Update assertions whenever the active production-critical slice changes.

**Acceptance criteria:**

- Build step reaches `** BUILD SUCCEEDED **`.
- Assertion step checks the current runtime-critical files.
- Root navigation and model-container wiring are asserted for active vertical slices.
- Stale assertions are removed from the workflow in the same batch that supersedes them.

### P0.2 — Preserve manual validation posture

**Surface:** `.github/workflows/ios-build.yml`

**Problem:** Push-triggered validation can burn minutes during rapid iteration.

**Action:** Keep validation manual unless explicitly approved for release gating.

**Acceptance criteria:**

- Workflow remains `workflow_dispatch` only during active buildout.
- Validation runs are intentionally triggered.
- Documentation commits use `[skip ci]` where applicable.

## P0 — Source Graph Integrity

### P0.3 — Audit XcodeGen source paths

**Surface:** `project.yml`

**Action:** Verify every production Swift feature module is included in `targets.MMGIOS.sources`.

**Acceptance criteria:**

- All active `MMGIOS/Features/*` runtime directories are included.
- Documentation/spec files inside source folders are excluded when necessary.
- The generated project is reproducible from `project.yml`.

### P0.4 — Enforce SwiftData model registration

**Surface:** `MMGIOS/App/MMGIOSApp.swift`, `MMGIOS/App/AppRootView.swift`

**Action:** Every persisted model required at runtime must be registered in the app model container and preview container when applicable.

**Acceptance criteria:**

- No persisted record type is introduced without container registration.
- Preview model containers remain aligned with runtime containers.
- Build verification catches missing model types before release.

## P1 — Feature Surface Traceability

### P1.1 — Root navigation surface audit

**Surface:** `MMGIOS/App/AppRootView.swift`

**Action:** Ensure active production surfaces are reachable from the app shell or a clear parent dashboard.

**Acceptance criteria:**

- Command Center, Workflow Runtime, Customer Portal, Design Studio, Asset Management, Deliverables, and Customer Release surfaces remain reachable.
- No production-critical view is orphaned.
- Tab labels remain short and operational.

### P1.2 — Command Center runtime summary alignment

**Surface:** `MMGIOS/Features/CommandCenter`

**Action:** Keep the Command Center summary aligned with active workflow, deliverable, release, and customer portal state.

**Acceptance criteria:**

- Summary values are derived from real runtime records where possible.
- Any placeholder or seed-derived metrics are clearly replaced by persisted records over time.
- Status enums referenced by the summary must match canonical enum names.

## P1 — Backlog Structure

### P1.3 — Normalize backlog format

**Surface:** `backlog/*`

**Action:** Standardize backlog records around priority, surface, dependency, action, and acceptance criteria.

**Acceptance criteria:**

- P0/P1/P2/P3 labels are used consistently.
- Duplicate work orders are consolidated.
- Each item has an explicit validation path.

### P1.4 — Create subsystem dependency map

**Surface:** `docs/operations`, `docs/architecture`, `backlog`

**Action:** Add a dependency map showing which modules depend on workflow runtime, task engine, production queue, deliverables, customer release, and portal records.

**Acceptance criteria:**

- Dependency map exists as a maintained document.
- Each new vertical slice references its upstream dependencies.
- Merge planning uses subsystem grouping instead of isolated file-by-file reasoning.

## P2 — Documentation Hardening

### P2.1 — Separate current-state docs from roadmap docs

**Surface:** `docs/*`

**Action:** Ensure documentation does not blur implemented architecture with future intent.

**Acceptance criteria:**

- Current implementation docs state what exists now.
- Roadmap docs are labeled as planned, future, or proposed.
- Release docs reflect validated scope only.

### P2.2 — Add operational index

**Surface:** `docs/operations/README.md`

**Action:** Create an index for build validation, reconciliation, release gates, and repository operating rules.

**Acceptance criteria:**

- Operational docs are discoverable from one index.
- Validation and release-gate procedures are linked.
- The index can be used by future coding agents without restarting context discovery.

## P3 — Cleanup And Efficiency

### P3.1 — Identify obsolete scaffolding

**Surface:** full repository

**Action:** Flag unused scaffold files, dead specs, duplicate docs, and stale generated artifacts.

**Acceptance criteria:**

- Cleanup candidates are listed before deletion.
- No production source is removed without a clear replacement.
- Large destructive cleanup is handled in a separate branch.

### P3.2 — Branch reconciliation planning

**Surface:** GitHub branches and PRs

**Action:** Before merging divergent branches, compare by subsystem and preserve only canonical implementations.

**Acceptance criteria:**

- Divergence is grouped by app, features, docs, workflows, assets, and backlog.
- Conflicting duplicate implementations are resolved by doctrine and current runtime compatibility.
- Integration is staged behind validation gates.

## Next Recommended Batch

The next implementation batch should be:

**P0.1 + P0.3 + P0.4** — validation contract alignment, XcodeGen source-path audit, and SwiftData model-registration audit.

This is the highest-leverage operational-prep batch because it protects every future vertical slice from silent wiring drift.
