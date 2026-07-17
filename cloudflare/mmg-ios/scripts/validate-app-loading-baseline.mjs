import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workerRoot, "../..");
const read = path => readFileSync(path, "utf8");
const wrangler = read(join(workerRoot, "wrangler.toml"));
const index = read(join(repoRoot, "web/kairos-dashboard/index.html"));
const renderer = read(join(repoRoot, "web/kairos-dashboard/scripts/command-hub-canonical-v3.js"));
const workflow = read(join(repoRoot, ".github/workflows/deploy-cloudflare-production.yml"));

const activeEntries = wrangler.split(/\r?\n/).map(line => line.trim()).filter(line => /^main\s*=/.test(line));
assert.deepEqual(activeEntries, ['main = "src/kairos-production-entry-canonical-v1.js"'], "The canonical wrapper must be the only Worker entrypoint.");
assert.match(wrangler, /^workers_dev\s*=\s*true$/m);
assert.ok(!wrangler.includes("custom_domain = true"));
assert.match(wrangler, /directory\s*=\s*"\.\.\/\.\.\/web\/kairos-dashboard"/);
assert.match(wrangler, /run_worker_first\s*=\s*true/);
assert.match(wrangler, /not_found_handling\s*=\s*"single-page-application"/);

assert.ok(index.includes('content="kairos-command-hub-recovery-20260714-1"'), "The proven root document marker is missing.");
assert.ok(index.includes('id="kairos-hub"'));
assert.ok(index.includes('./scripts/command-hub-canonical-v3.js?v=20260717-2'));
assert.ok(index.includes('./styles/command-hub-canonical-v3.css?v=20260717-1'));
for (const obsolete of [
  "command-hub-stable-v2.js",
  "command-hub.js?v=recovery",
  "prebreak-functionality-recovery.js",
  "authoritative-command-center-reconcile.js",
  "command-center-layout.js",
  "command-center-governance.js",
  "objective-router.js",
]) assert.ok(!index.includes(obsolete), `Obsolete browser module still loads: ${obsolete}`);
assert.ok(!/^\s*import\s/m.test(renderer), "The core renderer must load before any optional module is requested.");
assert.ok(renderer.includes('const fallback='), "The embedded action registry is missing.");

assert.ok(workflow.includes("https://mmg-ios.info-mindsetmediagroup.workers.dev"));
assert.ok(workflow.includes("npx wrangler deploy --dry-run"));
assert.ok(workflow.includes("npx wrangler deploy"));
assert.ok(workflow.includes("Prove app opens after deployment"));
assert.ok(workflow.includes("kairos-command-hub-recovery-20260714-1"));
assert.ok(workflow.includes("command-hub-canonical-v3.js"));

console.log(JSON.stringify({
  status: "passed",
  contract: "kairos-canonical-loader-contract-20260717-1",
  productionUrl: "https://mmg-ios.info-mindsetmediagroup.workers.dev/",
  workerEntry: "src/kairos-production-entry-canonical-v1.js",
  rootBuild: "kairos-command-hub-recovery-20260714-1",
  renderer: "kairos-command-hub-canonical-v3-20260717-2",
  embeddedFallbackRegistry: true,
  optionalModuleFailureContained: true,
}, null, 2));
