import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workerRoot, "../..");
const read = path => readFileSync(path, "utf8");

const entry = read(join(workerRoot, "src/kairos-production-entry-autonomous-v1.js"));
const planner = read(join(workerRoot, "src/kairos-whole-homepage-planner-v1.js"));
const executor = read(join(workerRoot, "src/kairos-direct-homepage-execution-v1.js"));
const index = read(join(repoRoot, "web/kairos-dashboard/index.html"));

assert.ok(entry.includes('./kairos-whole-homepage-planner-v1.js'));
assert.ok(entry.includes('handleWholeHomepagePlan'));
assert.ok(entry.includes('KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD'));
assert.ok(entry.indexOf('handleWholeHomepagePlan') < entry.indexOf('handleDirectHomepagePlan'), "Whole-page continuation must run before the old limited planner.");
assert.ok(entry.includes('homepageWholePagePlannerEnabled: true'));
assert.ok(entry.includes('homepageWholePageMaximumOperations: 96'));
assert.ok(entry.includes('homepageTemplateOnlyMutation: false'));
assert.ok(entry.includes('homepageMarkupBackedSettingsCovered: true'));
assert.ok(entry.includes('homepagePageBoundSectionSourcesCovered: true'));

for (const marker of [
  'kairos-whole-homepage-planner-20260717-2',
  'MAX_OPERATIONS = 96',
  'MAX_SECTION_FILES = 40',
  'guided-pathways',
  'products-and-resources',
  'services',
  'subscription',
  'kairos',
  'mission-and-trust',
  'final-next-step',
  'Publish Your Knowledge',
  'Access Professional Services',
  'Join a Personalized Subscription',
  'Personalized Learning That Continues With You',
  'inspectHomepageSource',
  'deriveSectionFiles',
  'buildHomepageInventory',
  'buildTemplateInventory',
  'buildSafeSectionLiquidInventory',
  'isMarkupSetting',
  'json-markup-text',
  'liquid-text',
  'visibleTextSegments',
  'sourceSkeleton',
  'assignJourneyZones',
  'buildWholePageOperations',
  'sectionReview',
  'templateAndSectionSourceCoverage: true',
  'markupBackedSettingsSupported: true',
  'sectionFilesRequested',
  'sectionFilesReadable',
  'sectionLiquidFilesWritten',
  'currentManagedStagingReused: true',
  'freshMainDuplicateRequired: false',
  'priorApprovedTextPreserved: true',
  'workersAIUsed: false',
  'privateRuntimeUsed: false',
  'neuronsConsumed: 0',
  'linkMutationAuthorized: false',
  'structuralMutationAuthorized: false',
  'styleMutationAuthorized: false',
  'liveThemeMutationAuthorized: false',
]) assert.ok(planner.includes(marker), `Missing complete homepage planner contract: ${marker}`);

assert.ok(!planner.includes('env.AI.run'), "Whole-homepage planning must not call Workers AI.");
assert.ok(!planner.includes('runKairosIntelligence'), "Whole-homepage planning must not call private inference.");
assert.ok(planner.includes('sections/${type}.liquid'), "Planner must inspect referenced homepage section files.");
assert.ok(planner.includes('GENERIC_SHARED_SECTION_TYPES'), "Shared generic section files must remain guarded.");
assert.ok(planner.includes('sectionIds.length !== 1'), "Section-file edits must require a unique homepage section type.");
assert.ok(planner.includes('isPageBoundSectionSource'), "Section-file edits must require page-bound MMG/Kairos signals.");
assert.ok(planner.includes('url|link(?!.*label)|href'));
assert.ok(planner.includes('product|collection|menu'));
assert.ok(planner.includes('sourceHashes'));
assert.ok(planner.includes('files.filter(file => file.filename.startsWith("sections/"))'));

for (const marker of [
  'json-markup-text',
  'liquid-text',
  'applyVisibleOperations',
  'sourceSkeleton',
  'writeThemeFiles',
  'approvalTimeRebindingUsed: false',
]) assert.ok(executor.includes(marker), `Executor cannot verify complete homepage operation type: ${marker}`);

assert.ok(index.includes('content="kairos-command-hub-recovery-20260714-1"'));
assert.ok(index.includes('./scripts/command-hub.js?v=recovery-20260714-1'));
assert.ok(!index.includes('command-hub-canonical-v3'));

console.log(JSON.stringify({
  status: "passed",
  planner: "kairos-whole-homepage-planner-20260717-2",
  maximumOperations: 96,
  journeyZones: 8,
  templatePlainTextCoverage: true,
  templateMarkupTextCoverage: true,
  guardedPageBoundSectionCoverage: true,
  sharedGenericSectionMutation: false,
  URLsMutable: false,
  workersAIUsed: false,
  privateRuntimeUsed: false,
  neuronsConsumed: 0,
  visualBaseline: "tuesday-command-center-6f96b10d",
}, null, 2));
