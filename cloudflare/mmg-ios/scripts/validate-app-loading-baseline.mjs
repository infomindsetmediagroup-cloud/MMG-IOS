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

assert.deepEqual(activeEntries, ['main = "src/kairos-production-entry.js"'], "The proven Worker entrypoint must remain active.");
assert.match(wrangler, /^workers_dev\s*=\s*true$/m, "The working workers.dev route must remain enabled.");
assert.ok(!wrangler.includes("custom_domain = true"), "A custom domain must not replace the proven workers.dev browser route.");
assert.match(wrangler, /directory\s*=\s*"\.\.\/\.\.\/web\/kairos-dashboard"/, "The proven dashboard asset directory must remain active.");
assert.match(wrangler, /run_worker_first\s*=\s*true/, "Worker-first routing must remain active.");
assert.match(wrangler, /not_found_handling\s*=\s*"single-page-application"/, "SPA asset fallback must remain active.");

assert.ok(index.includes('content="kairos-command-hub-recovery-20260714-1"'), "The proven root document marker is missing.");
assert.ok(index.includes('id="kairos-hub"'), "The root Command Center mount is missing.");
assert.ok(index.includes('./scripts/command-hub-stable-v2.js?v=20260717-1'), "The stable contract-driven renderer is missing.");
assert.ok(index.includes('./styles/command-hub-stable-v2.css?v=20260717-1'), "The stable renderer stylesheet is missing.");
for (const obsolete of [
  "./scripts/command-hub.js?v=recovery-20260714-1",
  "prebreak-functionality-recovery.js",
  "authoritative-command-center-reconcile.js",
  "command-center-layout.js",
  "command-center-governance.js",
  "objective-router.js",
]) assert.ok(!index.includes(obsolete), `Obsolete browser module still loads: ${obsolete}`);

assert.ok(workflow.includes("https://mmg-ios.info-mindsetmediagroup.workers.dev"), "Production verification must target the proven browser hostname.");
assert.ok(workflow.includes("npx wrangler deploy --dry-run"), "Bundle validation must run before deployment.");
assert.ok(workflow.includes("npx wrangler deploy"), "The canonical deployment step is missing.");
assert.ok(workflow.includes("Prove app opens after deployment"), "Live app-loading readback is required.");
assert.ok(workflow.includes("kairos-command-hub-recovery-20260714-1"), "Live readback must verify the proven root marker.");

console.log(JSON.stringify({
  status: "passed",
  contract: "kairos-stable-loader-contract-20260717-2",
  productionUrl: "https://mmg-ios.info-mindsetmediagroup.workers.dev/",
  workerEntry: "src/kairos-production-entry.js",
  rootBuild: "kairos-command-hub-recovery-20260714-1",
  renderer: "kairos-command-hub-stable-v2-20260717-1",
  obsoleteRendererStackLoaded: false,
}, null, 2));
