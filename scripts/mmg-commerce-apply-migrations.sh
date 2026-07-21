#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${MMG_COMMERCE_ENVIRONMENT:?MMG_COMMERCE_ENVIRONMENT is required}"
: "${MMG_COMMERCE_RELEASE_ID:?MMG_COMMERCE_RELEASE_ID is required}"
: "${MMG_COMMERCE_RELEASE_COMMIT_SHA:?MMG_COMMERCE_RELEASE_COMMIT_SHA is required}"

if [[ "${MMG_COMMERCE_ENVIRONMENT}" != "staging" ]]; then
  echo "MMG migration runner is staging-only." >&2
  exit 64
fi
if [[ ! "${MMG_COMMERCE_RELEASE_ID}" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$ ]]; then
  echo "Invalid staging release ID." >&2
  exit 64
fi
if [[ ! "${MMG_COMMERCE_RELEASE_COMMIT_SHA}" =~ ^[a-f0-9]{40}$ ]]; then
  echo "Invalid staging release commit SHA." >&2
  exit 64
fi

for command in psql sha256sum mktemp; do
  command -v "${command}" >/dev/null 2>&1 || {
    echo "Required command is unavailable: ${command}" >&2
    exit 69
  }
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

migrations=(
  "database/migrations/20260720_001_mmg_knowledge_entitlements.sql"
  "database/migrations/20260720_002_mmg_delivery_window_controller.sql"
  "database/migrations/20260720_003_mmg_thank_you_first_title_handoff.sql"
  "database/migrations/20260720_004_mmg_my_library_delivery.sql"
  "database/migrations/20260720_005_mmg_shopify_subscription_reconciliation.sql"
  "database/migrations/20260720_006_mmg_recommendation_curation_ranking.sql"
  "database/migrations/20260720_007_mmg_live_commerce_deployment_control.sql"
  "database/migrations/20260720_008_mmg_commerce_operations_control.sql"
  "database/migrations/20260720_009_mmg_commerce_operations_integrity.sql"
  "database/migrations/20260721_010_mmg_production_adapters_staging_rehearsal.sql"
  "database/migrations/20260721_011_mmg_staging_integration_execution.sql"
)

for migration in "${migrations[@]}"; do
  [[ -f "${migration}" ]] || {
    echo "Required migration is missing: ${migration}" >&2
    exit 66
  }
done

applied_by="${MMG_MIGRATION_APPLIED_BY:-mmg-staging-integration}"
if [[ ${#applied_by} -lt 1 || ${#applied_by} -gt 200 ]]; then
  echo "Invalid migration actor." >&2
  exit 64
fi

bundle="$(mktemp)"
cleanup() {
  rm -f "${bundle}"
}
trap cleanup EXIT

cat >"${bundle}" <<'SQL'
\set ON_ERROR_STOP on
SELECT pg_advisory_lock(hashtextextended('mmg-commerce-staging-migrations', 0));

CREATE TABLE IF NOT EXISTS mmg_schema_migrations (
  migration_id text PRIMARY KEY,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL,
  CHECK (char_length(migration_id) BETWEEN 8 AND 160)
);

CREATE OR REPLACE FUNCTION pg_temp.mmg_assert_migration(
  requested_id text,
  requested_sha text
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  existing_sha text;
BEGIN
  SELECT content_sha256
    INTO existing_sha
    FROM mmg_schema_migrations
   WHERE migration_id = requested_id;
  IF existing_sha IS NULL THEN
    RETURN false;
  END IF;
  IF existing_sha <> requested_sha THEN
    RAISE EXCEPTION 'MMG_MIGRATION_HASH_MISMATCH:%', requested_id;
  END IF;
  RETURN true;
END;
$$;
SQL

for migration in "${migrations[@]}"; do
  migration_id="$(basename "${migration}" .sql)"
  migration_sha="$(sha256sum "${migration}" | awk '{print $1}')"
  {
    printf "\\echo Checking %s\n" "${migration_id}"
    printf "SELECT pg_temp.mmg_assert_migration('%s', '%s') AS mmg_already_applied \\gset\n" \
      "${migration_id}" "${migration_sha}"
    printf "\\if :mmg_already_applied\n"
    printf "\\echo Already applied: %s\n" "${migration_id}"
    printf "\\else\n"
    printf "\\echo Applying: %s\n" "${migration_id}"
    printf "\\i %s\n" "${migration}"
    printf "INSERT INTO mmg_schema_migrations (migration_id, content_sha256, applied_by) VALUES ('%s', '%s', :'mmg_applied_by');\n" \
      "${migration_id}" "${migration_sha}"
    printf "\\endif\n"
  } >>"${bundle}"
done

cat >>"${bundle}" <<'SQL'
SELECT COUNT(*) AS applied_migration_count
FROM mmg_schema_migrations
WHERE migration_id IN (
  '20260720_001_mmg_knowledge_entitlements',
  '20260720_002_mmg_delivery_window_controller',
  '20260720_003_mmg_thank_you_first_title_handoff',
  '20260720_004_mmg_my_library_delivery',
  '20260720_005_mmg_shopify_subscription_reconciliation',
  '20260720_006_mmg_recommendation_curation_ranking',
  '20260720_007_mmg_live_commerce_deployment_control',
  '20260720_008_mmg_commerce_operations_control',
  '20260720_009_mmg_commerce_operations_integrity',
  '20260721_010_mmg_production_adapters_staging_rehearsal',
  '20260721_011_mmg_staging_integration_execution'
);
SELECT pg_advisory_unlock(hashtextextended('mmg-commerce-staging-migrations', 0));
SQL

PSQL_HISTORY=/dev/null psql "${DATABASE_URL}" \
  --no-psqlrc \
  --set=mmg_applied_by="${applied_by}" \
  --file="${bundle}"

echo "MMG staging migrations 001-011 are reconciled for release ${MMG_COMMERCE_RELEASE_ID}."
