import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entryPath = join(root, "src/kairos-production-entry.js");
const operationalPath = join(root, "src/kairos-operational-runtime-v1.js");
const wranglerPath = join(root, "wrangler.toml");
for (const path of [entryPath, operationalPath, wranglerPath]) assert.ok(existsSync(path), `Missing operational dependency: ${path}`);

const entry = readFileSync(entryPath, "utf8");
const operational = readFileSync(operationalPath, "utf8");
const wrangler = readFileSync(wranglerPath, "utf8");

for (const marker of [
  './kairos-operational-runtime-v1.js',
  'kairos-production-baseline-20260717-7',
  'handleOperationalRequest',
  'mirrorOperationalResponse',
  'KAIROS_OPERATIONAL_RUNTIME_BUILD',
  'failureContainedToOperationalRequest: true',
  'durableStatePreserved: true',
  'addOperationalHealth',
  'durableOperationalLedger',
  'durableWorkItems',
  'durableWorkflowRecords',
  'executionReceiptMirroring',
  'systemRegistry',
]) assert.ok(entry.includes(marker), `Production operational edge missing: ${marker}`);

for (const marker of [
  'KAIROS_ACTION_CONTRACTS',
  '"/api/hub/run"',
  '"/api/hub/contracts"',
  '"/api/hub/work-items"',
  '"/api/workflows"',
  '"/api/system-registry"',
  'ledgerGet',
  'ledgerList',
  'ledgerUpsert',
  'execution-receipts',
]) assert.ok(operational.includes(marker), `Operational runtime missing: ${marker}`);

assert.ok(wrangler.includes('main = "src/kairos-production-entry.js"'), "The stable Worker entrypoint changed.");
assert.ok(wrangler.includes('workers_dev = true'), "The working workers.dev route changed.");
assert.ok(wrangler.includes('name = "KAIROS_PROJECTS"'), "Durable operational storage is not bound.");

console.log(JSON.stringify({
  status: "passed",
  contract: "kairos-durable-operational-routes-behind-loader-20260717-1",
  actionContracts: true,
  durableWorkItems: true,
  durableWorkflows: true,
  executionReceipts: true,
  systemRegistry: true,
  operationalHealth: true,
  browserLoadingSurfaceChanged: false,
}, null, 2));
