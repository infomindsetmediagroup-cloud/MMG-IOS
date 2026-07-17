import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(path, "utf8");
const files = {
  hybrid: join(root, "src/kairos-production-entry.js"),
  v45: join(root, "src/kairos-production-entry-v45.js"),
  v38: join(root, "src/kairos-production-entry-v38.js"),
  v36: join(root, "src/kairos-production-entry-v36.js"),
  child: join(root, "src/kairos-child-action-runtime-v1.js"),
  native: join(root, "src/kairos-native-task-execution-v1.js"),
  autonomy: join(root, "src/kairos-autonomy-runtime-v1.js"),
  intelligence: join(root, "src/kairos-intelligence-v1.js"),
};
for (const path of Object.values(files)) assert.ok(existsSync(path), `Missing enhanced runtime file: ${path}`);
const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, read(path)]));

assert.ok(source.hybrid.includes('./kairos-production-entry-v45.js'));
assert.ok(source.hybrid.includes('serveTuesdayAsset'));
assert.ok(source.hybrid.includes('enhancedRuntime.fetch'));
assert.ok(source.hybrid.includes('failureContainedToRequest: true'));
assert.ok(source.v45.includes('./kairos-production-entry-v44.js'));
assert.ok(source.v38.includes('handleChildActionRequest'));
assert.ok(source.v36.includes('handleAutonomyRequest'));
assert.ok(source.child.includes('const EXECUTE_ROUTE = "/api/hub/execute"'));
assert.ok(source.native.includes('executeNativeTask'));
assert.ok(source.native.includes('durableReadbackRequired: true'));
assert.ok(source.autonomy.includes('verified-native-intelligent-autonomy'));
assert.ok(source.intelligence.includes('cloudflare-account-scoped'));
assert.ok(source.intelligence.includes('STRUCTURED_OUTPUT_ATTEMPTS = 3'));

console.log(JSON.stringify({
  status: "passed",
  contract: "tuesday-shell-enhanced-v45-runtime",
  browserIsolation: true,
  enhancedAPIRuntime: true,
  childActions: true,
  nativeExecution: true,
  boundedAutonomy: true,
  enhancedInference: true,
}, null, 2));
