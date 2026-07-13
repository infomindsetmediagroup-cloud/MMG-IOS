import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const runtimePath = join(workerRoot, "src/kairos-creative-studio-v1.js");
const entryPath = join(workerRoot, "src/kairos-production-entry-v2.js");
const uiPath = join(repoRoot, "web/kairos-dashboard/scripts/creative-studio.js");
const cssPath = join(repoRoot, "web/kairos-dashboard/styles/creative-studio.css");
const indexPath = join(repoRoot, "web/kairos-dashboard/index.html");

for (const file of [runtimePath, entryPath, uiPath, cssPath, indexPath]) assert.ok(existsSync(file), `Creative Studio production file missing: ${file}`);

const runtime = readFileSync(runtimePath, "utf8");
for (const marker of [
  "createCreativeProject", "createWorkflow", "Creative Studio ·", "Lock creative brief", "Prepare source assets",
  "Build production draft", "Review and revise", "Approve final deliverable",
  "intermediateAssetsStayInWorkspace: true", "editableSourceFilesStayInWorkspace: true",
  "finalDeliverableRequiresApproval: true", "externalPublicationAutomatic: false",
]) assert.ok(runtime.includes(marker), `Creative Studio runtime contract missing: ${marker}`);

const entry = readFileSync(entryPath, "utf8");
for (const route of ["/api/creative-studio/projects", "/api/creative-studio/latest"]) assert.ok(entry.includes(route), `Creative Studio route missing: ${route}`);

const ui = readFileSync(uiPath, "utf8");
for (const marker of [
  '[data-child="creative-studio"]', "Creative Production Workspace", "Create Project + Workflow",
  "Open in Work Queue", "Intermediate and editable source assets stay inside the MMG/Kairos workspace",
]) assert.ok(ui.includes(marker), `Creative Studio UI missing: ${marker}`);

const css = readFileSync(cssPath, "utf8");
assert.ok(!css.includes("position:fixed"), "Creative Studio must not introduce floating controls.");

const index = readFileSync(indexPath, "utf8");
assert.ok(index.includes("scripts/creative-studio.js"), "Command Center does not load Creative Studio.");
assert.ok(index.includes("styles/creative-studio.css"), "Command Center does not load Creative Studio styles.");

console.log(JSON.stringify({
  status: "ready",
  creativeStudioWorkflowBridge: true,
  governedProductionBrief: true,
  fiveTaskWorkflow: true,
  internalAssetBoundary: true,
  workQueueIntegration: true,
  floatingControls: 0,
}, null, 2));
