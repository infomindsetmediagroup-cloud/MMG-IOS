# Kairos Formal Runtime Reset — 2026-07-11

## Decision

The prototype execution runtime is archived and removed from the live operational surface. The approved MMG/Kairos doctrines, constitutional architecture, product strategy, knowledge model, and long-term roadmap remain authoritative.

## Archived baseline

Branch: `archive/kairos-prototype-runtime-20260711`

The archive preserves the failed proposal, review, Shopify planning, and mutation implementation for forensic review. It must not be treated as an operational production baseline.

## Live reset rules

1. The Command Center must not present seeded demonstration work as real operational work.
2. A capability may be labeled operational only after an end-to-end production-representative acceptance test has passed with preserved evidence.
3. External Shopify mutations are disabled during recovery.
4. Planning output is not execution evidence.
5. A successful API response is not completion evidence unless the external system is read back and verified.
6. Production publication requires explicit executive approval after staging verification.
7. Failed verification must trigger a tested rollback path.

## First implementation vertical

The first capability to be rebuilt is the Shopify staging-theme workflow:

- authenticate through one documented credential path;
- create or select a non-live staging theme;
- read and hash the exact target source;
- apply one bounded staging-only mutation;
- read back and verify the resulting content hash;
- generate a human-readable preview and rollback package;
- require executive approval before publish;
- publish only after staging acceptance;
- verify the live storefront;
- roll back automatically when live verification fails.

## Exit criteria

Shopify theme mutation may not be re-enabled in the live Command Center until all staging-theme acceptance criteria pass and the evidence is committed or otherwise preserved as a release artifact.
