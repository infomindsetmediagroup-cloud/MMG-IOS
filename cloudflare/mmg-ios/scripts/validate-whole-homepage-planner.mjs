import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workerRoot, "../..");
const read = path => readFileSync(path, "utf8");

const entry = read(join(workerRoot, "src/kairos-production-entry-autonomous-v1.js"));
const planner = read(join(workerRoot, "src/kairos-whole-homepage-planner-v1.js"));
const index = read(join(repoRoot, "web/kairos-dashboard/index.html"));

assert.ok(entry.includes('./kairos-whole-homepage-planner-v1.js'));
assert.ok(entry.includes('handleWholeHomepagePlan'));
assert.ok(entry.includes('KAIROS_WHOLE_HOMEPAGE_PLANNER_BUILD'));
assert.ok(entry.indexOf('handleWholeHomepagePlan') < entry.indexOf('handleDirectHomepagePlan'), "Whole-page continuation must run before the old 16-field planner.");
assert.ok(entry.includes('homepageWholePagePlannerEnabled: true'));
assert.ok(entry.includes('homepageWholePageMaximumOperations: 64'));
assert.ok(entry.includes('homepageTemplateOnlyMutation: true'));

for (const marker of [
  'kairos-whole-homepage-planner-20260717-1',
  'MAX_OPERATIONS = 64',
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
  'assignJourneyZones',
  'buildWholePageOperations',
  'sectionReview',
  'templateOnlyMutation: true',
  'sectionLiquidFilesWritten: 0',
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
]) assert.ok(planner.includes(marker), `Missing whole-homepage planner contract: ${marker}`);

assert.ok(!planner.includes('env.AI.run'), "Whole-homepage planning must not call Workers AI.");
assert.ok(!planner.includes('runKairosIntelligence'), "Whole-homepage planning must not call private inference.");
assert.ok(!planner.includes('sections/${'), "Whole-homepage planning must not write shared section Liquid files.");
assert.ok(planner.includes('filename: TEMPLATE_FILE'));
assert.ok(planner.includes('sourceHashes: { [TEMPLATE_FILE]'));
assert.ok(planner.includes('url|link(?!.*label)|href'));
assert.ok(planner.includes('product|collection|menu'));

assert.ok(index.includes('content="kairos-command-hub-recovery-20260714-1"'));
assert.ok(index.includes('./scripts/command-hub.js?v=recovery-20260714-1'));
assert.ok(!index.includes('command-hub-canonical-v3'));

console.log(JSON.stringify({
  status: "passed",
  planner: "kairos-whole-homepage-planner-20260717-1",
  maximumOperations: 64,
  journeyZones: 8,
  templateOnlyMutation: true,
  sectionLiquidFilesWritten: 0,
  URLsMutable: false,
  workersAIUsed: false,
  privateRuntimeUsed: false,
  neuronsConsumed: 0,
  visualBaseline: "tuesday-command-center-6f96b10d",
}, null, 2));
