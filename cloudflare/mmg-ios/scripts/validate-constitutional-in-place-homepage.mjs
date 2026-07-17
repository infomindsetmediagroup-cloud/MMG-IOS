import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workerRoot, "../..");
const read = path => readFileSync(path, "utf8");

const entry = read(join(workerRoot, "src/kairos-production-entry-autonomous-v1.js"));
const planner = read(join(workerRoot, "src/kairos-constitutional-in-place-homepage-planner-v1.js"));
const immutableExecutor = read(join(workerRoot, "src/kairos-immutable-approved-file-execution-v1.js"));
const index = read(join(repoRoot, "web/kairos-dashboard/index.html"));

assert.ok(entry.includes('./kairos-constitutional-in-place-homepage-planner-v1.js'));
assert.ok(entry.includes('handleConstitutionalInPlaceHomepagePlan'));
assert.ok(entry.indexOf('handleConstitutionalInPlaceHomepagePlan') < entry.indexOf('handleWholeHomepagePlan'), "Constitutional in-place planning must intercept before generic zone planning.");
assert.ok(entry.includes('homepageSectionIdentityPreserved: true'));
assert.ok(entry.includes('homepageGenericJourneyZoneAssignmentUsed: false'));
assert.ok(entry.includes('homepageSectionRepurposingAuthorized: false'));
assert.ok(entry.includes('homepageWholePageMaximumOperations: 160'));

for (const marker of [
  'kairos-constitutional-in-place-homepage-20260717-1',
  'MMG-HOMEPAGE-v6.6.0-KAIROS-OPERATIONAL-ACTIVATION-GREEN-CANDIDATE',
  'mmg-website-experience-objective-v1',
  'mmg-homepage-journey-map-v1',
  'mmg-experience-first-doctrine-v1',
  'mmg-door-opener-doctrine-v1',
  'sectionIdentityPreserved = true',
  'genericJourneyZoneAssignmentUsed = false',
  'sectionRepurposingAuthorized = false',
  'identity uncertain; preserve section',
  'first homepage section / hero type',
  'constitutional-section-preserving-in-place-copy',
  'urlsChanged: false',
  'designChanged: false',
  'structureChanged: false',
  'workersAIUsed: false',
  'privateRuntimeUsed: false',
  'neuronsConsumed: 0',
]) assert.ok(planner.includes(marker), `Missing constitutional in-place contract: ${marker}`);

assert.ok(planner.includes('section.sectionIndex === 0'), "The first homepage section must be locked to hero identity.");
assert.ok(planner.indexOf('section.sectionIndex === 0') < planner.indexOf('const identity = classifyText'), "Hero identity must be resolved before semantic classification.");
assert.ok(!planner.includes('fallbackZone('), "Position-based zone fallback must not exist in the constitutional planner.");
assert.ok(!planner.includes('assignJourneyZones('), "Generic journey-zone assignment must not exist in the constitutional planner.");
assert.ok(!planner.includes('zoneScore('), "Generic zone scoring must not exist in the constitutional planner.");
assert.ok(!planner.includes('env.AI.run'), "Constitutional homepage planning must not call Workers AI.");
assert.ok(!planner.includes('runKairosIntelligence'), "Constitutional homepage planning must not call private inference.");
assert.ok(planner.includes('Open Customer Portal'));
assert.ok(planner.includes('First, understand the journey.'));
assert.ok(planner.includes('Then choose how you want to build.'));
assert.ok(planner.includes('Get a free system before you buy anything.'));
assert.ok(planner.includes('Every path connects to the next one.'));
assert.ok(planner.includes('Built in public, one post at a time.'));
assert.ok(planner.includes('Watch the system grow in real time.'));
assert.ok(planner.includes('Built from the ground up.'));
assert.ok(planner.includes('Choose your next step.'));

assert.ok(immutableExecutor.includes('immutableApprovedCandidateUsed: true'));
assert.ok(immutableExecutor.includes('approvalTimeReconstructionUsed: false'));
assert.ok(immutableExecutor.includes('authorizedDiffVerified: true'));

assert.ok(index.includes('content="kairos-command-hub-recovery-20260714-1"'));
assert.ok(index.includes('./scripts/command-hub.js?v=recovery-20260714-1'));

console.log(JSON.stringify({
  status: "passed",
  planner: "kairos-constitutional-in-place-homepage-20260717-1",
  canonicalCopySource: "MMG-HOMEPAGE-v6.6.0-KAIROS-OPERATIONAL-ACTIVATION-GREEN-CANDIDATE",
  heroIdentityLocked: true,
  genericZoneAssignmentUsed: false,
  sectionRepurposingAuthorized: false,
  unknownSectionsPreserved: true,
  maximumOperations: 160,
  immutableApprovedFileExecution: true,
  URLsMutable: false,
  designMutable: false,
  workersAIUsed: false,
  privateRuntimeUsed: false,
  neuronsConsumed: 0,
  visualBaseline: "tuesday-command-center-6f96b10d",
}, null, 2));
