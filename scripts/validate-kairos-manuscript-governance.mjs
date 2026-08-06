import { readFile, readdir } from 'node:fs/promises';
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

const workflowsDir = path.join(root, '.github', 'workflows');
const workflowNames = (await readdir(workflowsDir)).filter((name) => /\.ya?ml$/i.test(name));
const deployAuthorities = [];
for (const name of workflowNames) {
  const source = await read(path.join('.github', 'workflows', name));
  if (/\bnpx\s+wrangler\s+deploy\b/.test(source) && /mmg-ios|WORKER_DIRECTORY:\s*cloudflare\/mmg-ios/.test(source)) {
    deployAuthorities.push(name);
  }
}

if (deployAuthorities.length !== 1 || deployAuthorities[0] !== 'deploy-kairos-canonical-worker.yml') {
  fail(`expected one Kairos Worker deployment authority; found ${deployAuthorities.join(', ') || 'none'}`);
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
for (const evidence of ['intake', 'review', 'final', 'zip', 'download']) {
  if (!orchestrator.toLowerCase().includes(evidence)) fail(`synthetic E2E lacks ${evidence} evidence`);
}
for (const file of lockedFiles) {
  if (!orchestrator.includes(file)) fail(`synthetic E2E does not assert ZIP member ${file}`);
}

const workflow = await read('.github/workflows/deploy-kairos-canonical-worker.yml');
if (!workflow.includes('test:manuscript-orchestration')) {
  fail('canonical workflow must execute the manuscript orchestration E2E test');
}
if (!workflow.includes('validate:kairos-manuscript-governance')) {
  fail('canonical workflow must execute this governance validator');
}

if (!process.exitCode) {
  console.log(JSON.stringify({
    ok: true,
    deploymentAuthority: deployAuthorities[0],
    lockedFiles,
    manuscriptRouteOwners: routeOwnerCount,
    canvaExcluded: true,
    syntheticE2E: true,
  }, null, 2));
}
