import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const runtimePath = join(workerRoot, "src/kairos-workflow-runtime-v1.js");
const entryPath = join(workerRoot, "src/kairos-production-entry-v2.js");
const uiPath = join(repoRoot, "web/kairos-dashboard/scripts/workflow-runtime.js");
const cssPath = join(repoRoot, "web/kairos-dashboard/styles/workflow-runtime.css");
const indexPath = join(repoRoot, "web/kairos-dashboard/index.html");

for (const file of [runtimePath, entryPath, uiPath, cssPath, indexPath]) assert.ok(existsSync(file), `Workflow production file missing: ${file}`);

const runtime = readFileSync(runtimePath, "utf8");
for (const capability of [
  "createWorkflow", "listWorkflows", "readWorkflow", "updateWorkflow", "createTask", "updateTask",
  "completionRequiresTaskClosure: true", "externalPublicationAutomatic: false", "destructiveActionAutomatic: false",
  "approvalRequired", "calculateProgress", "Production queue",
]) assert.ok(runtime.toLowerCase().includes(capability.toLowerCase()), `Workflow runtime contract missing: ${capability}`);

const entry = readFileSync(entryPath, "utf8");
for (const route of ["/api/workflows", "/tasks", "PATCH"]) assert.ok(entry.includes(route), `Workflow route missing: ${route}`);

const ui = readFileSync(uiPath, "utf8");
for (const label of ["Workflow Runtime", "Production Queue", "Create Workflow", "Require executive approval before start", "Add Task"]) assert.ok(ui.includes(label), `Workflow UI missing: ${label}`);
assert.ok(ui.includes('[data-child="work-queue"]'), "Work Queue child card is not connected to Workflow Runtime.");
assert.ok(!ui.includes("position:fixed"), "Workflow Runtime must not introduce floating controls.");

const index = readFileSync(indexPath, "utf8");
assert.ok(index.includes("scripts/workflow-runtime.js"), "Command Center does not load Workflow Runtime.");
assert.ok(index.includes("styles/workflow-runtime.css"), "Command Center does not load Workflow Runtime styles.");

console.log(JSON.stringify({
  status: "ready",
  workflowRuntime: true,
  taskEngine: true,
  productionQueue: true,
  workQueueEntryPoint: "Operations / Work Queue",
  approvalGate: true,
  floatingControls: 0,
}, null, 2));
