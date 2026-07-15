import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '../..');
const read = path => readFileSync(path, 'utf8');
const paths = {
  v25: join(root, 'src/kairos-production-entry-v25.js'),
  v24: join(root, 'src/kairos-production-entry-v24.js'),
  v23: join(root, 'src/kairos-production-entry-v23.js'),
  v22: join(root, 'src/kairos-production-entry-v22.js'),
  v21: join(root, 'src/kairos-production-entry-v21.js'),
  v20: join(root, 'src/kairos-production-entry-v20.js'),
  manifest: join(root, 'production-baseline.json'),
  layout: join(repo, 'web/kairos-dashboard/scripts/command-center-layout.js'),
  controller: join(repo, 'web/kairos-dashboard/scripts/chrome-hamburger-controller.js')
};
for (const path of Object.values(paths)) assert.ok(existsSync(path), `missing ${path}`);
const wrangler = read(join(root, 'wrangler.toml'));
const active = wrangler.split(/\r?\n/).filter(line => /^main\s*=/.test(line.trim()));
assert.deepEqual(active, ['main = "src/kairos-production-entry-v25.js"']);
assert.ok(wrangler.includes('Validated delegation ancestry'));
const v25 = read(paths.v25), v24 = read(paths.v24), v23 = read(paths.v23), v22 = read(paths.v22), v21 = read(paths.v21), v20 = read(paths.v20);
for (const marker of ['kairos-production-entry-v24.js','openLaunchOfferLearning','approveLaunchOfferLearning','recordLaunchOfferAdoption','/api/launch-offer-learning','async scheduled','runtime.scheduled','X-Kairos-Launch-Offer-Learning']) assert.ok(v25.includes(marker), `v25 missing ${marker}`);
assert.ok(v24.includes("from'./kairos-production-entry-v23.js'") && v24.includes('/api/launch-revenue-mandates'));
assert.ok(v23.includes("from'./kairos-production-entry-v22.js'") && v23.includes('/api/revenue-growth-mandates'));
assert.ok(v22.includes("from'./kairos-production-entry-v21.js'") && v22.includes('/api/growth-offer-mandates'));
assert.ok(v21.includes("from'./kairos-production-entry-v20.js'") && v21.includes('/api/growth-campaign-mandates'));
assert.ok(v20.includes('/api/growth-commercial-activations'));
const baseline = JSON.parse(read(paths.manifest));
assert.equal(baseline.baseline, 'kairos-production-standard-20260715-5');
assert.equal(baseline.status, 'frozen');
assert.equal(baseline.worker.entry, 'src/kairos-production-entry-v25.js');
assert.equal(baseline.approvedExpansion.automaticExecution, false);
const layout = read(paths.layout), controller = read(paths.controller);
for (const marker of ['kairos-command-center-layout-20260714-9','data-command-menu','aria-controls="command-center-menu"']) assert.ok(layout.includes(marker));
for (const marker of ['kairos-chrome-hamburger-controller-20260714-3','button.matches(\'[data-command-menu]\')']) assert.ok(controller.includes(marker));
console.log(JSON.stringify({status:'ready',baseline:baseline.baseline,activeEntry:'kairos-production-entry-v25',launchOfferLearning:true,delegationPreserved:true,scheduledHandlers:true,frozen:true},null,2));
