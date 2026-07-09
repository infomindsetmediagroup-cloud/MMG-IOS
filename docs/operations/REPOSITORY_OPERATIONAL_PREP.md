# Repository Operational Prep

## Status

This document locks the current MMG IOS / Kairos repository reconciliation recommendations into an executable operational-prep standard.

The current repository baseline is a native iOS / Kairos operating-system repository. The README defines the repo as the canonical GitHub repository for the MMG / Kairos operating system and states that it stores native iOS source, Kairos architecture, Shopify source, assets, documentation, registries, backlog records, QA notes, and release packages.

## Current Verified Baseline

- Repository: `infomindsetmediagroup-cloud/MMG-IOS`
- Default branch: `main`
- iOS target: `17.0`
- Bundle identifier: `com.mindsetmediagroup.mmgios`
- Xcode project generation: `xcodegen generate`
- Build verification workflow: `.github/workflows/ios-build.yml`
- Workflow trigger posture: manual `workflow_dispatch`
- CI minutes posture: preserve Actions minutes during rapid development; use `[skip ci]` on non-validation commits when appropriate.

## Operational Interpretation Of Latest Build State

The prior Swift compile failure caused by `WorkflowStatus` resolution has been cleared in the current baseline. The app now reaches `** BUILD SUCCEEDED **` before any additional repository assertion layer runs.

The key operational distinction is:

1. **Xcode build success** proves the generated project compiles for the iOS simulator.
2. **Post-build assertions** prove required vertical-slice files and wiring exist.
3. A failure after `** BUILD SUCCEEDED **` is not a Swift compilation failure; it is an operational wiring/assertion failure.

That distinction is now canonical for triage.

## Canonical Repository Structure

The repository should remain organized by execution surface and operational domain:

| Area | Canonical Purpose |
| --- | --- |
| `MMGIOS/App` | SwiftUI app entry, model container wiring, root navigation shell |
| `MMGIOS/Config` | Shared app styling, constants, configuration |
| `MMGIOS/Features/*` | Native app vertical slices and runtime modules |
| `.github/workflows` | Manual validation and release-gate workflows |
| `docs` | Doctrine, architecture, standards, decisions, operational prep |
| `backlog` | Prioritized implementation queues and executable work orders |
| `registry` | Product, page, asset, campaign, release, and operational registries |
| `releases` | QA records, release packages, changelogs, deployment summaries |
| `shopify` | Shopify source, snippets, templates, and deployment notes |
| `assets` | Brand, prompt, cover, logo, and visual-system assets |
| `kairos` | Platform architecture, command centers, modules, data models, operating logic |

## Reconciliation Rules

1. **One canonical home per subsystem.** Do not scatter the same feature across multiple peer folders unless the boundary is explicit.
2. **Every new SwiftData model must be wired into the app model container when persistence is required.**
3. **Every new user-facing vertical slice should be exposed through either the root navigation shell or a clearly reachable parent surface.**
4. **Every validation check must match current canonical scope.** Do not leave stale test assertions from a prior slice.
5. **Manual validation remains preferred during rapid development.** The current workflow posture is manual dispatch, not automatic push validation.
6. **Documentation must describe the real implementation, not future intent disguised as current state.**
7. **Backlog items must have acceptance criteria and dependency notes before implementation.**
8. **Use `[skip ci]` for documentation and low-risk structural commits unless the explicit purpose is validation.**

## Current Operational Priorities

### P0 — Validation Contract Alignment

Objective: Keep `.github/workflows/ios-build.yml` aligned with the active vertical slice.

Acceptance criteria:

- The Xcode build step succeeds.
- Post-build assertions check the current production-critical files.
- Assertions include app/root wiring checks for newly introduced vertical slices.
- Stale assertions are removed or replaced in the same commit that changes the slice focus.

### P0 — Source Graph Integrity

Objective: Ensure `project.yml` includes every compiled feature path and excludes non-source documentation correctly.

Acceptance criteria:

- Every `MMGIOS/Features/*` runtime module required by the app is present under `sources`.
- Markdown or spec files inside source folders are excluded when necessary.
- Generated Xcode project remains reproducible from `project.yml`.

### P1 — Runtime Surface Traceability

Objective: Make every feature reachable and auditable.

Acceptance criteria:

- Root app shell exposes active command surfaces.
- Persistence models are registered in `MMGIOSApp` and preview containers when needed.
- Dashboard summaries reflect production state rather than placeholder counts.

### P1 — Backlog Normalization

Objective: Convert implementation intent into executable queues.

Acceptance criteria:

- Backlog files use P0/P1/P2/P3 priority.
- Each item includes owner surface, dependency, acceptance criteria, and validation command.
- Duplicate work orders are merged.

### P2 — Documentation Indexing

Objective: Keep docs navigable as the repository expands.

Acceptance criteria:

- Architecture docs, doctrine docs, operational docs, and release docs are separated.
- Current-state docs are clearly distinguished from roadmap docs.
- Cross-links are added when a workflow depends on another doctrine or module.

## Validation Commands

Use these commands locally or in manual workflow verification:

```bash
xcodegen generate
xcodebuild -list -project MMGIOS.xcodeproj
xcodebuild -showdestinations -project MMGIOS.xcodeproj -scheme MMGIOS || true
xcodebuild \
  -project MMGIOS.xcodeproj \
  -scheme MMGIOS \
  -destination "generic/platform=iOS Simulator" \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  build
```

## Execution Standard

For each new production batch:

1. Inspect the existing subsystem.
2. Add or adjust only the minimum required files.
3. Update persistence and root navigation wiring if the feature requires it.
4. Update the workflow assertion layer only when the validation contract changes.
5. Commit with `[skip ci]` unless intentionally running manual validation.
6. Run manual build verification only at meaningful gates, not after every small documentation or scaffolding change.

## Locked Recommendation

The repository should now be operated as an implementation-ready Kairos native platform repository, not as an exploratory scratchpad. The strongest path forward is controlled vertical-slice expansion with explicit validation contracts, manual CI dispatch, and documentation/backlog files that track the actual current architecture.
