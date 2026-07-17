#!/usr/bin/env bash
set -euo pipefail

: "${KAIROS_URL:?KAIROS_URL is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${EXPECTED_DETERMINISTIC_BUILD:?EXPECTED_DETERMINISTIC_BUILD is required}"

for attempt in $(seq 1 48); do
  rm -f health-headers.txt health.json
  curl --silent --show-error --location --max-time 30 \
    -H 'Cache-Control: no-cache' \
    -D health-headers.txt \
    "${KAIROS_URL}/api/health?deterministic-build=${GITHUB_SHA}-${attempt}-$(date +%s)" \
    --output health.json || true
  live_build="$(awk 'BEGIN{IGNORECASE=1} /^x-kairos-deterministic-web-003:/{gsub(/\r/,"",$2); print $2}' health-headers.txt | tail -1)"
  if [ "${live_build}" = "${EXPECTED_DETERMINISTIC_BUILD}" ]; then
    break
  fi
  if [ "${attempt}" = "48" ]; then
    node -e 'const fs=require("fs");console.error(JSON.stringify({error:"exact-deterministic-build-not-live",headers:fs.existsSync("health-headers.txt")?fs.readFileSync("health-headers.txt","utf8"):"",health:fs.existsSync("health.json")?fs.readFileSync("health.json","utf8"):""}))'
    exit 1
  fi
  sleep 5
done

http_code="$(curl --silent --show-error --location --max-time 180 \
  -H 'Cache-Control: no-cache' \
  "${KAIROS_URL}/api/website/diagnostics/deterministic-plan?verification=${GITHUB_SHA}-$(date +%s)" \
  --output deterministic-plan.json \
  --write-out '%{http_code}' || true)"

HTTP_CODE="${http_code}" node <<'NODE'
const fs = require('fs');
const raw = fs.existsSync('deterministic-plan.json') ? fs.readFileSync('deterministic-plan.json', 'utf8') : '';
let body = {};
try { body = raw ? JSON.parse(raw) : {}; } catch {}
const operations = Array.isArray(body.operations) ? body.operations : [];
const checks = {
  httpSuccess: process.env.HTTP_CODE === '200',
  completed: body.status === 'completed',
  deterministicRuntime: body.build === 'kairos-web003-deterministic-first-runtime-20260717-1',
  deterministicFirst: body.deterministicFirst === true,
  sourceBoundComposite: body.sourceBoundCopyComposite === true,
  visibleOperations: operations.length > 0,
  everyOperationChangesText: operations.every(operation => typeof operation.before === 'string' && typeof operation.after === 'string' && operation.before !== operation.after),
  canonicalPackageExcluded: body.canonicalPackageExcluded === true,
  canonicalInstallationDisabled: body.canonicalHomepageInstallation === false,
  nativeThemeCandidatesPresent: Number(body.nativeCandidateCount || 0) > 0,
  stagingOnly: body.stagingOnly === true,
  liveThemeUnchanged: body.liveThemeChanged === false,
};
console.log(JSON.stringify({
  httpCode: Number(process.env.HTTP_CODE || 0),
  status: body.status || null,
  build: body.build || null,
  error: body.error || null,
  checks,
  operationCount: operations.length,
  operations,
  nativeCandidateCount: Number(body.nativeCandidateCount || 0),
  nativeCandidates: body.nativeCandidates || [],
}, null, 2));
if (Object.values(checks).some(value => value !== true)) process.exit(1);
NODE
