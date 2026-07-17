import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workerRoot, "../..");
const read = path => readFileSync(path, "utf8");

const wrangler = read(join(workerRoot, "wrangler.toml"));
const entry = read(join(workerRoot, "src/kairos-production-entry-autonomous-v1.js"));
const controller = read(join(workerRoot, "src/kairos-autonomous-prompt-controller-v1.js"));
const index = read(join(repoRoot, "web/kairos-dashboard/index.html"));
const hub = read(join(repoRoot, "web/kairos-dashboard/scripts/command-hub.js"));

assert.match(wrangler, /^main\s*=\s*"src\/kairos-production-entry-autonomous-v1\.js"$/m);
assert.match(wrangler, /^\[ai\]$/m);
assert.match(wrangler, /^binding\s*=\s*"AI"$/m);
assert.match(wrangler, /KAIROS_WORKERS_AI_MODEL\s*=\s*"@cf\/qwen\/qwen3-30b-a3b-fp8"/);

assert.ok(entry.includes('./kairos-production-entry.js'), "The autonomous entry must wrap the Tuesday production entry.");
assert.ok(entry.includes('./kairos-autonomous-prompt-controller-v1.js'));
assert.ok(entry.includes('tuesday-command-center-6f96b10d'));

for (const marker of [
  'kairos-autonomous-prompt-controller-20260717-1',
  'autonomous-text-only-v1',
  '/api/hub/run',
  '/api/shopify/staging/plan/jobs',
  '/api/shopify/staging/execute/jobs',
  'writeThemeFiles',
  'visibleTextSegments',
  'sourceSkeleton',
  'structuralMutationAuthorized: false',
  'styleMutationAuthorized: false',
  'visualMutationAuthorized: false',
  'liveThemeMutationAuthorized: false',
  'browserSurfaceChanged: false',
]) assert.ok(controller.includes(marker), `Missing autonomous controller contract: ${marker}`);

assert.ok(index.includes('content="kairos-command-hub-recovery-20260714-1"'));
assert.ok(index.includes('./scripts/command-hub.js?v=recovery-20260714-1'));
assert.ok(!index.includes('command-hub-canonical-v3'));
assert.ok(hub.includes('kairos-command-hub-20260714-38'));
assert.ok(hub.includes('Active work'));
assert.ok(hub.includes('Finished work'));
assert.ok(hub.includes('Work to be done'));
assert.ok(hub.includes('1 · Request'));
assert.ok(hub.includes('2 · Execute'));
assert.ok(hub.includes('3 · Verify'));
assert.ok(hub.includes('4 · Deliver'));

console.log(JSON.stringify({
  status: "passed",
  contract: "kairos-autonomous-prompt-controller-20260717-1",
  visualBaseline: "tuesday-command-center-6f96b10d",
  browserFilesChanged: false,
  websiteMode: "text-only-source-bound-staging",
  childPromptExecution: "autonomous-workflow",
}, null, 2));
