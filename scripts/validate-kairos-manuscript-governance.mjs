import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');
const fail = (message) => {
  console.error(`MANUSCRIPT_GOVERNANCE_FAILURE: ${message}`);
  process.exitCode = 1;
};

const retiredAuthority = '.github/workflows/deploy-kairos-manuscript-runtime.yml';
try {
  await access(path.join(root, retiredAuthority));
  fail(`retired deployment authority still exists: ${retiredAuthority}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const canonicalWorkflow = await read('.github/workflows/deploy-kairos-canonical-worker.yml');
for (const evidence of [
  'https://mmg-ios.info-mindsetmediagroup.workers.dev',
  'npx wrangler deploy',
  'Verify exact production deployment',
  'deploymentSha',
  'playwright.manuscript-orchestration.config.mjs',
  'node scripts/validate-kairos-manuscript-governance.mjs',
]) {
  if (!canonicalWorkflow.includes(evidence)) fail(`canonical workflow lacks evidence: ${evidence}`);
}

const deliverables = await read('cloudflare/mmg-ios/src/kairos-manuscript-deliverables-http-v1.js');
const lockedKinds = [
  'GOLD_MASTER_DOCX',
  'DIGITAL_ASSET_PDF',
  'KDP_INTERIOR_PDF',
  'KDP_FULL_WRAP_COVER_PDF',
  'STANDALONE_COVER_IMAGE',
];
for (const kind of lockedKinds) {
  if (!deliverables.includes(`\"${kind}\"`)) fail(`locked delivery kind is missing: ${kind}`);
}
for (const evidence of [
  'packageFiles.length !== 5',
  'ZIP_ARCHIVE',
  'X-Kairos-Manuscript-Package-File-Count',
  'ready-for-manufacturing',
  'checksum-verified-final-editorial-version',
]) {
  if (!deliverables.includes(evidence)) fail(`deliverable controller lacks evidence: ${evidence}`);
}

const manuscriptFiles = [
  'cloudflare/mmg-ios/src/kairos-manuscript-deliverables-http-v1.js',
  'cloudflare/mmg-ios/src/kairos-manuscript-canonical-identity-router-v1.js',
  'cloudflare/mmg-ios/src/kairos-manuscript-package-state-v1.js',
  'cloudflare/mmg-ios/public/manuscript-studio.js',
];
for (const file of manuscriptFiles) {
  const source = await read(file);
  if (/canva/i.test(source)) fail(`Canva is prohibited from the manuscript pipeline: ${file}`);
}

const canonicalEntry = await read('cloudflare/mmg-ios/src/kairos-production-entry-local-canonical-v1.js');
const routeOwnerCount = (canonicalEntry.match(/handleManuscriptPackageState\(canonicalRequest, env, ctx\)/g) || []).length;
if (routeOwnerCount !== 1) fail(`manuscript package route must have one owner; found ${routeOwnerCount}`);

const orchestrator = await read('browser-tests/manuscript-pipeline-orchestrator.spec.mjs');
const syntheticEvidence = [
  'Project Setup stores the cover and assignment in one idempotent transaction',
  'ready-for-manufacturing',
  '/deliverables/build',
  'mmg-locked-five-asset-kdp-delivery-package-v1',
  'Exactly five customer deliverables are ready.',
  'Download Complete Package',
  '/deliverables/zip',
  'assetCount).toBe(5)',
  'x-kairos-idempotency-key',
];
for (const evidence of syntheticEvidence) {
  if (!orchestrator.includes(evidence)) fail(`synthetic E2E lacks executable evidence: ${evidence}`);
}

if (!process.exitCode) {
  console.log(JSON.stringify({
    ok: true,
    deploymentAuthority: 'deploy-kairos-canonical-worker.yml',
    retiredAuthorityRemoved: true,
    lockedKinds,
    manuscriptRouteOwners: routeOwnerCount,
    canvaExcluded: true,
    syntheticJourney: ['setup', 'editorial-review', 'five-file-build', 'zip', 'download'],
  }, null, 2));
}
