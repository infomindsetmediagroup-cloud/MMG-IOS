import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');
const fail = (message) => {
  const escaped = String(message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.error(`::error title=Kairos manuscript governance::${escaped}`);
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
  'npx wrangler deploy',
  'Verify exact production deployment',
  'playwright.manuscript-orchestration.config.mjs',
  'node scripts/validate-kairos-manuscript-governance.mjs',
]) {
  if (!canonicalWorkflow.includes(evidence)) fail(`canonical workflow lacks evidence: ${evidence}`);
}

const deliverables = await read('cloudflare/mmg-ios/src/kairos-manuscript-deliverables-http-v1.js');
for (const evidence of [
  'GOLD_MASTER_DOCX',
  'DIGITAL_ASSET_PDF',
  'KDP_INTERIOR_PDF',
  'KDP_FULL_WRAP_COVER_PDF',
  'STANDALONE_COVER_IMAGE',
  'packageFiles.length !== 5',
  'ZIP_ARCHIVE',
  'X-Kairos-Manuscript-Package-File-Count',
]) {
  if (!deliverables.includes(evidence)) fail(`locked package controller lacks evidence: ${evidence}`);
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
for (const evidence of [
  '/deliverables/build',
  'mmg-locked-five-asset-kdp-delivery-package-v1',
  'Exactly five customer deliverables are ready.',
  'Download Complete Package',
  '/deliverables/zip',
]) {
  if (!orchestrator.includes(evidence)) fail(`synthetic E2E lacks executable evidence: ${evidence}`);
}

if (!process.exitCode) {
  console.log(JSON.stringify({
    ok: true,
    deploymentAuthority: 'deploy-kairos-canonical-worker.yml',
    retiredAuthorityRemoved: true,
    manuscriptRouteOwners: routeOwnerCount,
    canvaExcluded: true,
    lockedPackageFileCount: 5,
    syntheticJourney: ['setup', 'editorial-review', 'five-file-build', 'zip', 'download'],
  }, null, 2));
}
