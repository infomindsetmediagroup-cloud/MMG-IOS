# Checkpoint 003B — Production Hardening Plan

## Objective

Convert the validated Checkpoint 003A code baseline into an operationally verified internal-alpha runtime without expanding unrelated product scope.

## Required workstreams

### Backend deployment and configuration

- Deploy `/api/kairos` to the approved server runtime.
- Configure `OPENAI_API_KEY`, `OPENAI_MODEL`, and `KAIROS_RUNTIME_TOKEN` as server-side secrets.
- Confirm that no provider credential is present in iOS build settings, repository history, Pages output, or client bundles.
- Run authorized and unauthorized live smoke tests.

### Deterministic backend builds

- Generate and commit `package-lock.json` using the approved Node 22 toolchain.
- Replace `npm install` with `npm ci` in backend validation.
- Record the validated Node and npm versions.

### Runtime security

- Add server-side request throttling and payload-cost ceilings.
- Add token rotation and revocation procedures.
- Define the migration from shared internal-alpha gateway token to short-lived user/device-bound credentials.

### Persistence and trust

- Persist backend request/audit records.
- Persist Executive Chat conversations and status transitions.
- Replace suppressed SwiftData save errors with explicit error reporting and recovery.

### Experience consolidation

- Reduce the root tab surface to a coherent navigation hierarchy.
- Preserve all current modules while routing access through Command Center, Work, Customers, Studio, Library, and More.

### Repository hygiene

- Inventory merged legacy slice branches.
- Delete only branches proven fully represented in `main`.
- Preserve immutable checkpoint documentation and validation records.

## Exit criteria

Checkpoint 003B is complete only when:

1. iOS validation passes on the checkpoint head.
2. Backend validation passes on the checkpoint head.
3. The deployed endpoint passes authenticated end-to-end smoke testing.
4. Security limitations are documented accurately.
5. The checkpoint PR is merged to `main`.
6. GitHub Pages successfully republishes the merged baseline.
