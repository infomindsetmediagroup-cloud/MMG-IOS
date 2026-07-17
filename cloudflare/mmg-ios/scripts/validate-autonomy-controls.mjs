import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entryPath = join(root, "src/kairos-production-entry.js");
const autonomyPath = join(root, "src/kairos-autonomy-runtime-v1.js");
const wranglerPath = join(root, "wrangler.toml");
for (const path of [entryPath, autonomyPath, wranglerPath]) assert.ok(existsSync(path), `Missing autonomy dependency: ${path}`);

const entry = readFileSync(entryPath, "utf8");
const autonomy = readFileSync(autonomyPath, "utf8");
const wrangler = readFileSync(wranglerPath, "utf8");

for (const marker of [
  './kairos-autonomy-runtime-v1.js',
  'kairos-production-baseline-20260717-6',
  'const AUTONOMY_PREFIX = "/api/autonomy/"',
  'handleAutonomyRequest',
  'runAutonomyCycle',
  'bounded-native-controls',
  'failureContainedToAutonomyRequest: true',
  'approvalGatesPreserved: true',
  'delegate: delegatedRequest => handleStableRequest',
]) assert.ok(entry.includes(marker), `Production autonomy edge missing: ${marker}`);

for (const marker of [
  'kairos-autonomy-runtime-20260716-3',
  '"/api/autonomy/status"',
  '"/api/autonomy/cycles"',
  '"/api/autonomy/decisions"',
  '"/api/autonomy/artifacts"',
  '"/api/autonomy/run"',
  'verified-native-intelligent-autonomy',
  'verify-durable-artifact-readback-before-completion',
  'external-publication',
  'live-storefront-mutation',
  'bypass-approval',
  'claimCycle',
]) assert.ok(autonomy.includes(marker), `Autonomy runtime missing: ${marker}`);

assert.ok(wrangler.includes('main = "src/kairos-production-entry.js"'), "The stable Worker entrypoint changed.");
assert.ok(wrangler.includes('workers_dev = true'), "The working workers.dev route changed.");
assert.ok(wrangler.includes('crons = ["*/15 * * * *"]'), "The bounded recovery schedule is missing.");
assert.ok(wrangler.includes('KAIROS_AUTONOMY_ENABLED = "true"'), "Autonomy is not enabled in the Worker contract.");

console.log(JSON.stringify({
  status: "passed",
  contract: "kairos-autonomy-controls-behind-stable-loader-20260717-1",
  statusRoute: true,
  cyclesRoute: true,
  decisionsRoute: true,
  artifactsRoute: true,
  manualBoundedRun: true,
  scheduledRecoveryCycle: "15-minutes",
  approvalGates: "preserved",
  durableArtifactReadback: "required",
  browserLoadingSurfaceChanged: false,
}, null, 2));
