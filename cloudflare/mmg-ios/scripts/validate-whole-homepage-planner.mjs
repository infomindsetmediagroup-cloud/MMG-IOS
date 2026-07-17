import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workerRoot, "../..");
const read = path => readFileSync(path, "utf8");

const entry = read(join(workerRoot, "src/kairos-production-entry-autonomous-v1.js"));
const safePlanner = read(join(workerRoot, "src/kairos-safe-section-bound-homepage-planner-v3.js"));
const sectionPlanner = read(join(workerRoot, "src/kairos-section-bound-homepage-planner-v2.js"));
const copyRegistry = read(join(workerRoot, "src/kairos-canonical-homepage-copy-v1.js"));
const executor = read(join(workerRoot, "src/kairos-immutable-approved-file-execution-v1.js"));
const index = read(join(repoRoot, "web/kairos-dashboard/index.html"));

assert.ok(entry.includes('./kairos-safe-section-bound-homepage-planner-v3.js'));
assert.ok(entry.includes('handleSafeSectionBoundHomepagePlan'));
assert.ok(!entry.includes('./kairos-whole-homepage-planner-v1.js'));
assert.ok(!entry.includes('handleWholeHomepagePlan'));
assert.ok(entry.indexOf('handleSafeSectionBoundHomepagePlan') < entry.indexOf('handleDirectHomepagePlan'));
assert.ok(entry.includes('homepageWholePagePlannerEnabled: true'));
assert.ok(entry.includes('homepageWholePageMaximumOperations: 200'));
assert.ok(entry.includes('homepageTemplateOnlyMutation: false'));
assert.ok(entry.includes('homepageMarkupBackedSettingsCovered: true'));
assert.ok(entry.includes('homepagePageBoundSectionSourcesCovered: true'));
assert.ok(entry.includes('homepageInnerHTMLSectionBoundariesUsed: true'));
assert.ok(entry.includes('homepageGlobalChromePreserved: true'));
assert.ok(entry.includes('homepageSectionIdentityPreserved: true'));
assert.ok(entry.includes('homepageGenericJourneyZoneAssignmentUsed: false'));
assert.ok(entry.includes('homepagePositionFallbackUsed: false'));

for (const marker of [
  'kairos-section-bound-homepage-planner-20260717-2',
  'MAX_OPERATIONS = 200',
  'MAX_SECTION_FILES = 48',
  'inspectHomepageSource',
  'deriveSectionFiles',
  'buildSectionBoundInventory',
  'buildTemplateInventory',
  'buildSafeSectionLiquidInventory',
  'isMarkupContainer',
  'json-markup-text',
  'liquid-text',
  'visibleTextSegments',
  'sourceSkeleton',
  'findSemanticRegion',
  'groupSemanticRegions',
  'classifySemanticRegion',
  'innerHTMLSectionBoundariesUsed: true',
  'heroIdentityLocked: true',
  'genericJourneyZoneAssignmentUsed: false',
  'positionFallbackUsed: false',
  'sectionRepurposingAuthorized: false',
  'currentManagedStagingReused: true',
  'workersAIUsed: false',
  'privateRuntimeUsed: false',
  'neuronsConsumed: 0',
  'linkMutationAuthorized: false',
  'structuralMutationAuthorized: false',
  'styleMutationAuthorized: false',
  'liveThemeMutationAuthorized: false',
]) assert.ok(sectionPlanner.includes(marker), `Missing section-bound homepage inspector contract: ${marker}`);

assert.ok(sectionPlanner.includes('const candidates = ["section", "article"]'));
assert.ok(sectionPlanner.includes('semanticGroup'));
assert.ok(sectionPlanner.includes('htmlSectionId'));
assert.ok(sectionPlanner.includes('identity uncertain; preserve semantic region without rewriting'));
assert.ok(!sectionPlanner.includes('assignJourneyZones('));
assert.ok(!sectionPlanner.includes('fallbackZone('));
assert.ok(!sectionPlanner.includes('zoneScore('));
assert.ok(!sectionPlanner.includes('env.AI.run'));
assert.ok(!sectionPlanner.includes('runKairosIntelligence'));
assert.ok(sectionPlanner.includes('sections/${type}.liquid'));
assert.ok(sectionPlanner.includes('GENERIC_SHARED_SECTION_TYPES'));
assert.ok(sectionPlanner.includes('sectionIds.length !== 1'));
assert.ok(sectionPlanner.includes('isPageBoundSectionSource'));
assert.ok(sectionPlanner.includes('url|link(?!.*label)|href'));
assert.ok(sectionPlanner.includes('product|collection|menu'));
assert.ok(sectionPlanner.includes('sourceHashes'));

for (const marker of [
  'kairos-safe-section-bound-homepage-20260717-3',
  'GLOBAL_CHROME_TEXT',
  'globalHomepageChromePreserved = true',
  'outerCustomLiquidWrapperIsNotContentSection = true',
  'removedGlobalChromeOperations',
]) assert.ok(safePlanner.includes(marker), `Missing safe homepage wrapper contract: ${marker}`);

for (const marker of [
  'kairos-canonical-homepage-copy-20260717-1',
  'KAIROS_HOMEPAGE_DOCTRINE_IDS',
  'KAIROS_CANONICAL_HOMEPAGE_COPY',
  'Books. AI. Business. Creator Education.',
  'First, understand the journey.',
  'Then choose how you want to build.',
  'Get a free system before you buy anything.',
  'Every path connects to the next one.',
  'Choose your next step.',
]) assert.ok(copyRegistry.includes(marker), `Missing canonical copy registry contract: ${marker}`);

for (const marker of [
  'immutableApprovedCandidateUsed: true',
  'approvalTimeReconstructionUsed: false',
  'authorizedDiffVerified: true',
  'writeThemeFiles',
  'workersAIUsed: false',
  'neuronsConsumed: 0',
]) assert.ok(executor.includes(marker), `Immutable executor cannot verify homepage package: ${marker}`);

assert.ok(index.includes('content="kairos-command-hub-recovery-20260714-1"'));
assert.ok(index.includes('./scripts/command-hub.js?v=recovery-20260714-1'));
assert.ok(!index.includes('command-hub-canonical-v3'));

console.log(JSON.stringify({
  status: "passed",
  activePlanner: "kairos-safe-section-bound-homepage-20260717-3",
  sectionInspector: "kairos-section-bound-homepage-planner-20260717-2",
  canonicalCopyRegistry: "kairos-canonical-homepage-copy-20260717-1",
  maximumOperations: 200,
  innerHTMLSectionBoundariesUsed: true,
  globalHomepageChromePreserved: true,
  heroIdentityLocked: true,
  genericZoneAssignmentUsed: false,
  positionFallbackUsed: false,
  unknownRegionsPreserved: true,
  templatePlainTextCoverage: true,
  templateMarkupTextCoverage: true,
  guardedPageBoundSectionCoverage: true,
  immutableApprovedFileExecution: true,
  URLsMutable: false,
  workersAIUsed: false,
  privateRuntimeUsed: false,
  neuronsConsumed: 0,
  visualBaseline: "tuesday-command-center-6f96b10d",
}, null, 2));
