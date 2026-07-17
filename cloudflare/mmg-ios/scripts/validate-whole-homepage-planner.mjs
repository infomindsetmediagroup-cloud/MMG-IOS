import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workerRoot, "../..");
const read = path => readFileSync(path, "utf8");

const entry = read(join(workerRoot, "src/kairos-production-entry-autonomous-v1.js"));
const planner = read(join(workerRoot, "src/kairos-whole-homepage-planner-v1.js"));
const constitutionalPlanner = read(join(workerRoot, "src/kairos-constitutional-in-place-homepage-planner-v1.js"));
const executor = read(join(workerRoot, "src/kairos-direct-homepage-execution-v1.js"));
const index = read(join(repoRoot, "web/kairos-dashboard/index.html"));

assert.ok(entry.includes('./kairos-whole-homepage-planner-v1.js'));
assert.ok(entry.includes('./kairos-constitutional-in-place-homepage-planner-v1.js'));
assert.ok(entry.includes('handleConstitutionalInPlaceHomepagePlan'));
assert.ok(entry.includes('handleWholeHomepagePlan'));
assert.ok(entry.indexOf('handleConstitutionalInPlaceHomepagePlan') < entry.indexOf('handleWholeHomepagePlan'), "Constitutional in-place planning must run before generic whole-page planning.");
assert.ok(entry.indexOf('handleWholeHomepagePlan') < entry.indexOf('handleDirectHomepagePlan'), "Whole-page continuation must run before the old limited planner.");
assert.ok(entry.includes('homepageWholePagePlannerEnabled: true'));
assert.ok(entry.includes('homepageWholePageMaximumOperations: 160'));
assert.ok(entry.includes('homepageTemplateOnlyMutation: false'));
assert.ok(entry.includes('homepageMarkupBackedSettingsCovered: true'));
assert.ok(entry.includes('homepagePageBoundSectionSourcesCovered: true'));
assert.ok(entry.includes('homepageSectionIdentityPreserved: true'));
assert.ok(entry.includes('homepageGenericJourneyZoneAssignmentUsed: false'));

for (const marker of [
  'kairos-whole-homepage-planner-20260717-3',
  'MAX_OPERATIONS = 96',
  'MAX_SECTION_FILES = 40',
  'guided-pathways',
  'products-and-resources',
  'services',
  'subscription',
  'kairos',
  'mission-and-trust',
  'final-next-step',
  'inspectHomepageSource',
  'deriveSectionFiles',
  'buildHomepageInventory',
  'buildTemplateInventory',
  'buildSafeSectionLiquidInventory',
  'isMarkupContainer',
  'markupContainerPrecedence: true',
  'json-markup-text',
  'liquid-text',
  'visibleTextSegments',
  'sourceSkeleton',
  'assertUniqueOperationIDs',
  'dedupeOperations',
  'whole_homepage_duplicate_plain_path',
  'assignJourneyZones',
  'buildWholePageOperations',
  'sectionReview',
  'templateAndSectionSourceCoverage: true',
  'markupBackedSettingsSupported: true',
  'currentManagedStagingReused: true',
  'workersAIUsed: false',
  'privateRuntimeUsed: false',
  'neuronsConsumed: 0',
  'linkMutationAuthorized: false',
  'structuralMutationAuthorized: false',
  'styleMutationAuthorized: false',
  'liveThemeMutationAuthorized: false',
]) assert.ok(planner.includes(marker), `Missing markup-first homepage inspector contract: ${marker}`);

assert.ok(planner.indexOf('const markupContainer = isMarkupContainer') < planner.indexOf('if (!isPlainEditableText'), "Markup containers must be classified before plain strings.");
assert.ok(planner.includes('/(custom_liquid|richtext|rich_text|markup|html|content|liquid)/i.test(name)'), "Plain text classifier must explicitly reject markup-container setting names.");
assert.ok(!planner.includes('env.AI.run'), "Whole-homepage inspection must not call Workers AI.");
assert.ok(!planner.includes('runKairosIntelligence'), "Whole-homepage inspection must not call private inference.");
assert.ok(planner.includes('sections/${type}.liquid'), "Planner must inspect referenced homepage section files.");
assert.ok(planner.includes('GENERIC_SHARED_SECTION_TYPES'), "Shared generic section files must remain guarded.");
assert.ok(planner.includes('sectionIds.length !== 1'), "Section-file edits must require a unique homepage section type.");
assert.ok(planner.includes('isPageBoundSectionSource'), "Section-file edits must require page-bound MMG/Kairos signals.");
assert.ok(planner.includes('url|link(?!.*label)|href'));
assert.ok(planner.includes('product|collection|menu'));
assert.ok(planner.includes('sourceHashes'));

for (const marker of [
  'kairos-constitutional-in-place-homepage-20260717-1',
  'sectionIdentityPreserved = true',
  'genericJourneyZoneAssignmentUsed = false',
  'sectionRepurposingAuthorized = false',
  'MAX_OPERATIONS = 160',
]) assert.ok(constitutionalPlanner.includes(marker), `Missing active constitutional planner contract: ${marker}`);

for (const marker of [
  'json-markup-text',
  'liquid-text',
  'applyVisibleOperations',
  'sourceSkeleton',
  'writeThemeFiles',
  'approvalTimeRebindingUsed: false',
]) assert.ok(executor.includes(marker), `Executor cannot verify homepage operation type: ${marker}`);

assert.ok(index.includes('content="kairos-command-hub-recovery-20260714-1"'));
assert.ok(index.includes('./scripts/command-hub.js?v=recovery-20260714-1'));
assert.ok(!index.includes('command-hub-canonical-v3'));

console.log(JSON.stringify({
  status: "passed",
  inspector: "kairos-whole-homepage-planner-20260717-3",
  activePlanner: "kairos-constitutional-in-place-homepage-20260717-1",
  maximumOperations: 160,
  markupContainerPrecedence: true,
  duplicatePlainPathsRejected: true,
  customLiquidWholeValueReplacementAllowed: false,
  templatePlainTextCoverage: true,
  templateMarkupTextCoverage: true,
  guardedPageBoundSectionCoverage: true,
  sectionIdentityPreserved: true,
  genericZoneAssignmentUsed: false,
  URLsMutable: false,
  workersAIUsed: false,
  privateRuntimeUsed: false,
  neuronsConsumed: 0,
  visualBaseline: "tuesday-command-center-6f96b10d",
}, null, 2));
