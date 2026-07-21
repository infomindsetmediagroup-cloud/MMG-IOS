#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${MMG_COMMERCE_ENVIRONMENT:?MMG_COMMERCE_ENVIRONMENT is required}"
: "${MMG_COMMERCE_RELEASE_ID:?MMG_COMMERCE_RELEASE_ID is required}"
: "${MMG_COMMERCE_RELEASE_COMMIT_SHA:?MMG_COMMERCE_RELEASE_COMMIT_SHA is required}"

if [[ "${MMG_COMMERCE_ENVIRONMENT}" != "staging" ]]; then
  echo "MMG release registration is staging-only." >&2
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
command -v psql >/dev/null 2>&1 || {
  echo "Required command is unavailable: psql" >&2
  exit 69
}

registered_by="${MMG_RELEASE_REGISTERED_BY:-mmg-staging-integration}"
if [[ ${#registered_by} -lt 1 || ${#registered_by} -gt 200 ]]; then
  echo "Invalid release-registration actor." >&2
  exit 64
fi

PSQL_HISTORY=/dev/null psql "${DATABASE_URL}" \
  --no-psqlrc \
  --set=release_id="${MMG_COMMERCE_RELEASE_ID}" \
  --set=release_sha="${MMG_COMMERCE_RELEASE_COMMIT_SHA}" \
  --set=registered_by="${registered_by}" <<'SQL'
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('mmg-commerce-staging-release:' || :'release_id', 0));

DO $$
DECLARE
  existing_environment text;
  existing_sha text;
BEGIN
  SELECT environment, release_commit_sha
    INTO existing_environment, existing_sha
    FROM mmg_commerce_releases
   WHERE release_id = :'release_id';

  IF existing_sha IS NOT NULL THEN
    IF existing_environment <> 'staging' THEN
      RAISE EXCEPTION 'MMG_STAGING_RELEASE_ENVIRONMENT_COLLISION:%', :'release_id';
    END IF;
    IF existing_sha <> :'release_sha' THEN
      RAISE EXCEPTION 'MMG_STAGING_RELEASE_SHA_COLLISION:%', :'release_id';
    END IF;
  END IF;
END;
$$;

INSERT INTO mmg_commerce_releases (
  release_id,
  environment,
  release_commit_sha,
  status,
  current_phase,
  release_version,
  plan,
  created_by,
  created_at,
  updated_at
) VALUES (
  :'release_id',
  'staging',
  :'release_sha',
  'planned',
  'preflight',
  1,
  jsonb_build_object(
    'registration', 'staging_integration_workflow',
    'publicationIncluded', false,
    'liveCustomerDataAllowed', false
  ),
  :'registered_by',
  now(),
  now()
)
ON CONFLICT (release_id) DO UPDATE
SET updated_at = EXCLUDED.updated_at,
    plan = mmg_commerce_releases.plan || EXCLUDED.plan
WHERE mmg_commerce_releases.environment = 'staging'
  AND mmg_commerce_releases.release_commit_sha = EXCLUDED.release_commit_sha;

INSERT INTO mmg_commerce_release_events (
  release_id,
  event_type,
  actor_id,
  payload,
  occurred_at
) VALUES (
  :'release_id',
  'staging_release_registered',
  :'registered_by',
  jsonb_build_object(
    'releaseCommitSha', :'release_sha',
    'environment', 'staging',
    'publicationAllowed', false,
    'liveCustomerDataAllowed', false
  ),
  now()
);
COMMIT;
SQL

echo "MMG staging release ${MMG_COMMERCE_RELEASE_ID} is registered for rehearsal evidence."
