import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workerRoot, "../..");
const read = path => readFileSync(path, "utf8");

const wrangler = read(join(workerRoot, "wrangler.toml"));
const index = read(join(repoRoot, "web/kairos-dashboard/index.html"));
const workflow = read(join(repoRoot, ".github/workflows/deploy-cloudflare-production.yml"));

const activeEntries = wrangler
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => /^main\s*=/.test(line));

assert.deepEqual(activeEntries, ['main = "src/kairos-production-entry.js"'], "The Tuesday Worker entrypoint must remain active.");
assert.match(wrangler, /^workers_dev\s*=\s*true$/m, "The working workers.dev route must remain enabled.");
assert.ok(!wrangler.includes("custom_domain = true"), "A custom domain must not replace the proven workers.dev browser route.");
assert.match(wrangler, /directory\s*=\s*"\.\.\/\.\.\/web\/kairos-dashboard"/, "The Tuesday dashboard asset directory must remain active.");
assert.match(wrangler, /run_worker_first\s*=\s*true/, "Worker-first routing must remain active.");
assert.match(wrangler, /not_found_handling\s*=\s*"single-page-application"/, "SPA asset fallback must remain active.");

assert.ok(index.includes('content="kairos-command-hub-recovery-20260714-1"'), "The proven Tuesday root document marker is missing.");
assert.ok(index.includes('id="kairos-hub"'), "The root Command Center mount is missing.");
assert.ok(index.includes('./scripts/command-hub.js?v=recovery-20260714-1'), "The proven Tuesday Command Center boot module is missing.");
assert.ok(!index.includes("kairos-command-center-inline-20260717-1"), "The failed inline recovery shell must not replace the Tuesday loader.");

assert.ok(workflow.includes("https://mmg-ios.info-mindsetmediagroup.workers.dev"), "Production verification must target the proven browser hostname.");
assert.ok(workflow.includes("npx wrangler deploy --dry-run"), "Bundle validation must run before deployment.");
assert.ok(workflow.includes("npx wrangler deploy"), "The canonical deployment step is missing.");
assert.ok(workflow.includes("Verify deployed production baseline"), "Live production readback is required.");

console.log(JSON.stringify({
  status: "passed",
  contract: "kairos-tuesday-loading-baseline-20260714",
  productionUrl: "https://mmg-ios.info-mindsetmediagroup.workers.dev/",
  workerEntry: "src/kairos-production-entry.js",
  rootBuild: "kairos-command-hub-recovery-20260714-1",
  enhancedFeatureFilesAllowed: true,
  bootSurfaceMutationAllowed: false,
}, null, 2));
