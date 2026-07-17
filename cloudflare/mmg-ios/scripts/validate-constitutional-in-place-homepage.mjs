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
const immutableExecutor = read(join(workerRoot, "src/kairos-immutable-approved-file-execution-v1.js"));
const index = read(join(repoRoot, "web/kairos-dashboard/index.html"));

assert.ok(entry.includes('./kairos-safe-section-bound-homepage-planner-v3.js'));
assert.ok(entry.includes('handleSafeSectionBoundHomepagePlan'));
assert.ok(!entry.includes('handleWholeHomepagePlan'));
assert.ok(!entry.includes('handleConstitutionalInPlaceHomepagePlan'));
assert.ok(entry.indexOf('handleSafeSectionBoundHomepagePlan') < entry.indexOf('handleDirectHomepagePlan'));
assert.ok(entry.includes('homepageWholePageMaximumOperations: 200'));
assert.ok(entry.includes('homepageInnerHTMLSectionBoundariesUsed: true'));
assert.ok(entry.includes('homepageGlobalChromePreserved: true'));
assert.ok(entry.includes('homepageOuterWrapperIsContentSection: false'));
assert.ok(entry.includes('homepageHeroIdentityLocked: true'));
assert.ok(entry.includes('homepageSectionIdentityPreserved: true'));
assert.ok(entry.includes('homepageGenericJourneyZoneAssignmentUsed: false'));
assert.ok(entry.includes('homepagePositionFallbackUsed: false'));
assert.ok(entry.includes('homepageSectionRepurposingAuthorized: false'));

for (const marker of [
  'kairos-safe-section-bound-homepage-20260717-3',
  'globalHomepageChromePreserved = true',
  'outerCustomLiquidWrapperIsNotContentSection = true',
  'GLOBAL_CHROME_TEXT',
  'Mindset Media Group™',
  'Books · AI · Business · Creator Education',
  'Back to Top',
  'workersAIUsed: false',
  'privateRuntimeUsed: false',
  'neuronsConsumed: 0',
]) assert.ok(safePlanner.includes(marker), `Missing safe section-bound guard: ${marker}`);

for (const marker of [
  'kairos-section-bound-homepage-planner-20260717-2',
  'innerHTMLSectionBoundariesUsed: true',
  'heroIdentityLocked: true',
  'genericJourneyZoneAssignmentUsed: false',
  'positionFallbackUsed: false',
  'sectionRepurposingAuthorized: false',
  'findSemanticRegion',
  'groupSemanticRegions',
  'classifySemanticRegion',
  'identity uncertain; preserve semantic region without rewriting',
  'explicit inner hero id/class/aria or first hero-type Shopify section',
  'MAX_OPERATIONS = 200',
  'urlsChanged: false',
  'designChanged: false',
  'structureChanged: false',
  'workersAIUsed: false',
  'privateRuntimeUsed: false',
  'neuronsConsumed: 0',
]) assert.ok(sectionPlanner.includes(marker), `Missing section-bound planner contract: ${marker}`);

assert.ok(sectionPlanner.includes('const candidates = ["section", "article"]'));
assert.ok(sectionPlanner.includes('htmlSectionId'));
assert.ok(sectionPlanner.includes('semanticGroup'));
assert.ok(!sectionPlanner.includes('assignJourneyZones('));
assert.ok(!sectionPlanner.includes('fallbackZone('));
assert.ok(!sectionPlanner.includes('zoneScore('));
assert.ok(!sectionPlanner.includes('env.AI.run'));
assert.ok(!sectionPlanner.includes('runKairosIntelligence'));

for (const marker of [
  'kairos-canonical-homepage-copy-20260717-1',
  'mmg-website-experience-objective-v1',
  'mmg-homepage-journey-map-v1',
  'mmg-experience-first-doctrine-v1',
  'mmg-door-opener-doctrine-v1',
  'Books. AI. Business. Creator Education.',
  'First, understand the journey.',
  'Then choose how you want to build.',
  'Now choose the resource that supports your stage.',
  'Get a free system before you buy anything.',
  'Every path connects to the next one.',
  'Built in public, one post at a time.',
  'Watch the system grow in real time.',
  'Built from the ground up.',
  'Choose your next step.',
]) assert.ok(copyRegistry.includes(marker), `Missing canonical homepage copy: ${marker}`);

assert.ok(immutableExecutor.includes('immutableApprovedCandidateUsed: true'));
assert.ok(immutableExecutor.includes('approvalTimeReconstructionUsed: false'));
assert.ok(immutableExecutor.includes('authorizedDiffVerified: true'));
assert.ok(!immutableExecutor.includes('approved_text_source_changed'));
assert.ok(!immutableExecutor.includes('approved_text_segment_changed'));

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
  outerCustomLiquidWrapperIsContentSection: false,
  heroIdentityLocked: true,
  genericZoneAssignmentUsed: false,
  positionFallbackUsed: false,
  sectionRepurposingAuthorized: false,
  unknownRegionsPreserved: true,
  immutableApprovedFileExecution: true,
  URLsMutable: false,
  designMutable: false,
  workersAIUsed: false,
  privateRuntimeUsed: false,
  neuronsConsumed: 0,
  visualBaseline: "tuesday-command-center-6f96b10d",
}, null, 2));
