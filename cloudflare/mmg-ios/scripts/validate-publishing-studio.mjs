import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const runtimePath = join(workerRoot, "src/kairos-publishing-studio-v1.js");
const entryPath = join(workerRoot, "src/kairos-production-entry-v2.js");
const uiPath = join(repoRoot, "web/kairos-dashboard/scripts/publishing-studio.js");
const bridgePath = join(repoRoot, "web/kairos-dashboard/scripts/publishing-production-center.js");
const cssPath = join(repoRoot, "web/kairos-dashboard/styles/publishing-studio.css");
const indexPath = join(repoRoot, "web/kairos-dashboard/index.html");

for (const file of [runtimePath, entryPath, uiPath, bridgePath, cssPath, indexPath]) assert.ok(existsSync(file), `Publishing Studio production file missing: ${file}`);

const runtime = readFileSync(runtimePath, "utf8");
for (const marker of [
  "createPublishingProject", "createWorkflow", "Publishing Studio ·", "Confirm editorial readiness",
  "Build publication metadata", "Prepare production files", "Assemble catalog and commerce package",
  "Approve release package", "draftFilesStayInternal: true", "sourceFilesStayInternal: true",
  "platformSubmissionAutomatic: false", "liveStorePublicationAutomatic: false",
  "pricingRequiresApproval: true", "finalReleaseRequiresApproval: true",
]) assert.ok(runtime.includes(marker), `Publishing Studio runtime contract missing: ${marker}`);

const entry = readFileSync(entryPath, "utf8");
for (const route of ["/api/publishing-studio/projects", "/api/publishing-studio/latest"]) assert.ok(entry.includes(route), `Publishing Studio route missing: ${route}`);

const ui = readFileSync(uiPath, "utf8");
for (const marker of [
  '[data-child="publishing-studio"]', "Publication Production Workspace", "Create Publication + Workflow",
  "Open in Work Queue", "Open Manuscript Studio", "Draft and source files remain internal",
]) assert.ok(ui.includes(marker), `Publishing Studio UI missing: ${marker}`);

const bridge = readFileSync(bridgePath, "utf8");
assert.ok(!bridge.includes('if (["Publishing Studio", "Creative Studio"].includes(title)) card.remove()'), "Legacy production center still removes canonical child cards.");
assert.ok(bridge.includes("removeObsoleteComposite"), "Legacy composite cleanup is missing.");

const css = readFileSync(cssPath, "utf8");
assert.ok(!css.includes("position:fixed"), "Publishing Studio must not introduce floating controls.");

const index = readFileSync(indexPath, "utf8");
assert.ok(index.includes("scripts/publishing-studio.js"), "Command Center does not load Publishing Studio.");
assert.ok(index.includes("styles/publishing-studio.css"), "Command Center does not load Publishing Studio styles.");

console.log(JSON.stringify({
  status: "ready",
  publishingStudioWorkflowBridge: true,
  fiveStagePublicationWorkflow: true,
  manuscriptStudioBridge: true,
  releaseApprovalBoundary: true,
  canonicalFiveByFivePreserved: true,
  floatingControls: 0,
}, null, 2));
