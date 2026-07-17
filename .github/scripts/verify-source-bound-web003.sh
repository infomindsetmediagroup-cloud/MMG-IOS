#!/usr/bin/env bash
set -euo pipefail

: "${KAIROS_URL:?KAIROS_URL is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${EXPECTED_SOURCE_BOUND_BUILD:?EXPECTED_SOURCE_BOUND_BUILD is required}"

for attempt in $(seq 1 48); do
  rm -f health-headers.txt health.json
  curl --silent --show-error --location --max-time 30 \
    -H 'Cache-Control: no-cache' \
    -D health-headers.txt \
    "${KAIROS_URL}/api/health?source-bound-build=${GITHUB_SHA}-${attempt}-$(date +%s)" \
    --output health.json || true
  live_build="$(awk 'BEGIN{IGNORECASE=1} /^x-kairos-source-bound-web-003:/{gsub(/\r/,"",$2); print $2}' health-headers.txt | tail -1)"
  if [ "${live_build}" = "${EXPECTED_SOURCE_BOUND_BUILD}" ]; then
    break
  fi
  if [ "${attempt}" = "48" ]; then
    node -e 'const fs=require("fs");console.error(JSON.stringify({error:"exact-build-not-live",headers:fs.existsSync("health-headers.txt")?fs.readFileSync("health-headers.txt","utf8"):"",health:fs.existsSync("health.json")?fs.readFileSync("health.json","utf8"):""}))'
    exit 1
  fi
  sleep 5
done

cat > request.json <<'JSON'
{
  "objective": "Rewrite the existing published Mindset Media Group homepage customer-facing copy so visitors immediately understand the knowledge, publishing, creator education, and digital-product ecosystem. Preserve the existing homepage structure and design. Also prepare bounded native Shopify header and footer color options for explicit staging approval. Do not publish anything live.",
  "requestType": "full-retool",
  "intent": "full-retool",
  "fullRetoolConfirmed": true,
  "structuralMutationAuthorized": true,
  "styleMutationAuthorized": true,
  "contentOnlyLocked": false
}
JSON

http_code="$(curl --silent --show-error --location --max-time 300 \
  -H 'Content-Type: application/json' \
  -H 'Cache-Control: no-cache' \
  --data @request.json \
  "${KAIROS_URL}/api/shopify/staging/plan/jobs?source-bound=${GITHUB_SHA}-$(date +%s)" \
  --output source-bound-plan.json \
  --write-out '%{http_code}' || true)"

HTTP_CODE="${http_code}" node <<'NODE'
const fs = require('fs');
const raw = fs.existsSync('source-bound-plan.json') ? fs.readFileSync('source-bound-plan.json', 'utf8') : '';
let body = {};
try { body = raw ? JSON.parse(raw) : {}; } catch {}
const result = body.result || {};
const plan = result.plan || {};
const changes = Array.isArray(plan.changes)
  ? plan.changes.filter(change => !['no-change', 'native-theme-exception-candidate'].includes(change?.changeType))
  : [];
const checks = {
  httpSuccess: ['200', '202'].includes(process.env.HTTP_CODE),
  completed: body.status === 'completed',
  sourceBoundComposite: plan.sourceBoundCopyComposite === true,
  visibleCopyChanges: changes.length > 0,
  visibleTextEvidence: Number(result?.evidence?.visibleTextChangeCount || 0) > 0,
  canonicalPackageExcluded: plan.canonicalPackage === null,
  canonicalInstallationDisabled: plan?.compositePackage?.canonicalHomepageInstallation === false,
  nativeThemeInspectionPresent: Boolean(plan.websiteRetoolExceptions),
  stagingOnly: plan?.compositePackage?.stagingOnly === true,
};
const diagnostic = {
  httpCode: Number(process.env.HTTP_CODE || 0),
  status: body.status || null,
  build: body.build || null,
  error: body.error || null,
  safeguards: body.safeguards || null,
  checks,
  changeCount: changes.length,
  changes: changes.slice(0, 8),
};
console.log(JSON.stringify(diagnostic));
if (Object.values(checks).some(value => value !== true)) process.exit(1);
NODE
