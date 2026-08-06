import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');
const fail = (message) => {
  console.error(`MANUSCRIPT_GOVERNANCE_FAILURE: ${message}`);
  process.exitCode = 1;
};

const lockedFiles = [
  'manuscript.docx',
  'manuscript.pdf',
  'ebook.epub',
  'cover.png',
  'metadata.json',
];
const retiredAuthority = '.github/workflows/deploy-kairos-manuscript-runtime.yml';
try {
  await access(path.join(root, retiredAuthority));
  fail(`retired deployment authority still exists: ${retiredAuthority}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const productionUrl = 'https://mmg-ios.info-mindsetmediagroup.workers.dev';
const workflowsDir = path.join(root, '.github', 'workflows');
const workflowNames = (await readdir(workflowsDir)).filter((name) => /\.ya?ml$/i.test(name));
const deployAuthorities = [];
for (const name of workflowNames) {
  const source = await read(path.join('.github', 'workflows', name));
  if (/\bnpx\s+wrangler\s+deploy\b/.test(source) && source.includes(productionUrl)) {
    deployAuthorities.push(name);
  }
}
if (deployAuthorities.length !== 1 || deployAuthorities[0] !== 'deploy-kairos-canonical-worker.yml') {
  fail(`expected one production Kairos Worker deployment authority; found ${deployAuthorities.join(', ') || 'none'}`);
}

const deliverables = await read('cloudflare/mmg-ios/src/kairos-manuscript-deliverables-http-v1.js');
for (const file of lockedFiles) {
  if (!deliverables.includes(`'${file}'`) && !deliverables.includes(`\"${file}\"`)) {
    fail(`locked delivery file is missing: ${file}`);
  }
}
if (!deliverables.includes('withDeliverableTimeout') || !deliverables.includes('202')) {
  fail('deliverable controller must retain bounded timeout and asynchronous processing semantics');
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

const workflow = await read('.github/workflows/deploy-kairos-canonical-worker.yml');
if (!workflow.includes('playwright.manuscript-orchestration.config.mjs')) {
  fail('canonical workflow must execute the manuscript orchestration E2E test');
}
if (!workflow.includes('node scripts/validate-kairos-manuscript-governance.mjs')) {
  fail('canonical workflow must execute this governance validator');
}
if (!workflow.includes('Verify exact production deployment') || !workflow.includes('deploymentSha')) {
  fail('canonical workflow must verify the exact deployed commit');
}

if (!process.exitCode) {
  console.log(JSON.stringify({
    ok: true,
    deploymentAuthority: deployAuthorities[0],
    retiredAuthorityRemoved: true,
    lockedFiles,
    manuscriptRouteOwners: routeOwnerCount,
    canvaExcluded: true,
    syntheticJourney: ['setup', 'editorial-review', 'five-file-build', 'zip', 'download'],
  }, null, 2));
}
