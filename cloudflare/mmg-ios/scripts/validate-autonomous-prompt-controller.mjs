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
const fullThemeBaseline = read(join(workerRoot, "src/kairos-approved-baseline-restore-v1.js"));
const directPlan = read(join(workerRoot, "src/kairos-direct-homepage-plan-v1.js"));
const directExecution = read(join(workerRoot, "src/kairos-direct-homepage-execution-v1.js"));
const index = read(join(repoRoot, "web/kairos-dashboard/index.html"));
const hub = read(join(repoRoot, "web/kairos-dashboard/scripts/command-hub.js"));

assert.match(wrangler, /^main\s*=\s*"src\/kairos-production-entry-autonomous-v1\.js"$/m);

assert.ok(entry.includes('./kairos-production-entry.js'), "The autonomous entry must wrap the Tuesday production entry.");
assert.ok(entry.includes('./kairos-autonomous-prompt-controller-v1.js'));
assert.ok(entry.includes('./kairos-approved-baseline-restore-v1.js'));
assert.ok(entry.includes('./kairos-direct-homepage-plan-v1.js'));
assert.ok(entry.includes('./kairos-direct-homepage-execution-v1.js'));
assert.ok(entry.includes('restoreApprovedHomepageBaseline(env)'));
assert.ok(entry.includes('handleDirectHomepageExecution'));
assert.ok(entry.includes('handleDirectHomepagePlan'));
assert.ok(entry.indexOf('handleDirectHomepageExecution') < entry.indexOf('handleDirectHomepagePlan'), "Approved direct execution must run before all generic planners and executors.");
assert.ok(entry.indexOf('handleDirectHomepagePlan') < entry.indexOf('handleNeuronFreeHomepagePlan'), "Direct plan must run before legacy binders.");
assert.ok(entry.includes('labeledHomepagePromptsRequireWorkersAI: false'));
assert.ok(entry.includes('labeledHomepagePromptsUseSecondBindingPass: false'));
assert.ok(entry.includes('approvedDirectPackagesUseApprovalTimeRebinding: false'));
assert.ok(entry.includes('tuesday-command-center-6f96b10d'));

for (const marker of [
  'kairos-autonomous-prompt-controller-20260717-1',
  'autonomous-text-only-v1',
  '/api/shopify/staging/execute/jobs',
  'writeThemeFiles',
  'structuralMutationAuthorized: false',
  'styleMutationAuthorized: false',
  'visualMutationAuthorized: false',
  'liveThemeMutationAuthorized: false',
]) assert.ok(controller.includes(marker), `Missing autonomous controller contract: ${marker}`);

for (const marker of [
  'kairos-full-theme-main-baseline-20260717-1',
  'themeDuplicate',
  'themeUpdate',
  'full-theme-main-duplicate',
  'layout/theme.liquid',
  'config/settings_schema.json',
  'config/settings_data.json',
  'templates/index.json',
  'current-live-main-theme',
  'fullThemeDuplicate: true',
  'liveThemeChanged: false',
  'stagingOnly: true',
]) assert.ok(fullThemeBaseline.includes(marker), `Missing full-theme baseline contract: ${marker}`);

for (const marker of [
  'kairos-direct-homepage-plan-20260717-1',
  'deterministic-direct-source-plan',
  'secondBindingPassUsed: false',
  'workersAIUsed: false',
  'neuronsConsumed: 0',
  'buildTextPackage',
  'textOnlyPackage',
  'autonomous-text-only-v1',
  'structuralMutationAuthorized: false',
  'styleMutationAuthorized: false',
  'visualMutationAuthorized: false',
  'liveThemeMutationAuthorized: false',
  '/_kairos/autonomous-plan-jobs/',
  'X-Kairos-Second-Binding-Pass',
]) assert.ok(directPlan.includes(marker), `Missing direct homepage plan contract: ${marker}`);

for (const marker of [
  'kairos-direct-homepage-execution-20260717-1',
  'direct-homepage-execution-v1',
  'approvedDirectPackage: true',
  'approvalTimeRebindingUsed: false',
  'approvedPackageExecutedDirectly: true',
  'approvalTimeInventoryRebuildUsed: false',
  'sourceHashesVerified: true',
  'candidateHashesVerified: true',
  'structuralSignaturesVerified: true',
  'rebuildApprovedCandidate',
  'writeThemeFiles',
  '/_kairos/autonomous-execution-jobs/',
  'X-Kairos-Approval-Time-Rebinding',
  'workersAIUsed: false',
  'neuronsConsumed: 0',
]) assert.ok(directExecution.includes(marker), `Missing direct homepage execution contract: ${marker}`);

assert.ok(!directPlan.includes('env.AI.run'), "Direct homepage plan must not call Workers AI.");
assert.ok(!directPlan.includes('runKairosIntelligence'), "Direct homepage plan must not call any inference runtime.");
assert.ok(!directPlan.includes('buildExplicitObjective'), "Direct homepage plan must not convert operations back into prose.");
assert.ok(!directPlan.includes('delegate('), "Direct homepage plan must not pass labeled fields through a second binder.");
assert.ok(!directExecution.includes('buildHomepageInventory'), "Approved direct execution must not rebuild the text inventory.");
assert.ok(!directExecution.includes('normalizeOperations'), "Approved direct execution must not rebind approved operations.");
assert.ok(!directExecution.includes('env.AI.run'), "Approved direct execution must not call Workers AI.");
assert.ok(!directExecution.includes('runKairosIntelligence'), "Approved direct execution must not call any inference runtime.");
assert.ok(!fullThemeBaseline.includes('await writeThemeFile(config, auth, stagingTheme.id, filename, source)'), "Legacy one-file staging restore remains active.");

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
  directHomepagePlan: "kairos-direct-homepage-plan-20260717-1",
  directHomepageExecution: "kairos-direct-homepage-execution-20260717-1",
  fullThemeBaseline: "kairos-full-theme-main-baseline-20260717-1",
  visualBaseline: "tuesday-command-center-6f96b10d",
  browserFilesChanged: false,
  websiteMode: "fresh-main-duplicate-plus-direct-approved-package-execution",
  dirtyStagingReuse: false,
  labeledHomepagePromptWorkersAIRequired: false,
  labeledHomepagePromptNeuronUsage: 0,
  labeledHomepagePromptSecondBindingPass: false,
  approvalTimeInventoryRebuild: false,
  approvalTimeOperationRebinding: false,
  executionBoundary: "exact-source-hash-plus-candidate-hash-plus-structural-signature",
}, null, 2));
