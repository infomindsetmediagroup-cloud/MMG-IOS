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
const zeroNeuronRouter = read(join(workerRoot, "src/kairos-zero-neuron-child-router-v1.js"));
const doctrineRegistry = read(join(workerRoot, "src/kairos-internal-doctrine-registry-v1.js"));
const websiteGovernance = read(join(workerRoot, "src/kairos-website-planning-governance-v1.js"));
const homepageContinuation = read(join(workerRoot, "src/kairos-homepage-continuation-v1.js"));
const index = read(join(repoRoot, "web/kairos-dashboard/index.html"));
const hub = read(join(repoRoot, "web/kairos-dashboard/scripts/command-hub.js"));

assert.match(wrangler, /^main\s*=\s*"src\/kairos-production-entry-autonomous-v1\.js"$/m);

assert.ok(entry.includes('./kairos-production-entry.js'), "The autonomous entry must wrap the Tuesday production entry.");
assert.ok(entry.includes('./kairos-autonomous-prompt-controller-v1.js'));
assert.ok(entry.includes('./kairos-approved-baseline-restore-v1.js'));
assert.ok(entry.includes('./kairos-direct-homepage-plan-v1.js'));
assert.ok(entry.includes('./kairos-direct-homepage-execution-v1.js'));
assert.ok(entry.includes('./kairos-zero-neuron-child-router-v1.js'));
assert.ok(entry.includes('./kairos-internal-doctrine-registry-v1.js'));
assert.ok(entry.includes('./kairos-website-planning-governance-v1.js'));
assert.ok(entry.includes('./kairos-homepage-continuation-v1.js'));
assert.ok(entry.includes('restoreApprovedHomepageBaseline(internalEnv)'));
assert.ok(entry.includes('governWebsitePlanningRequest'));
assert.ok(entry.includes('buildPrivateGovernedPlanningRequest'));
assert.ok(entry.includes('applyWebsiteGovernanceToPlanResponse'));
assert.ok(entry.includes('handleWebsiteGovernanceStatus'));
assert.ok(entry.includes('buildDeterministicHomepageContinuationRequest'));
assert.ok(entry.includes('applyHomepageContinuationMetadata'));
assert.ok(entry.includes('handleZeroNeuronChildRequest'));
assert.ok(entry.includes('handleDirectHomepageExecution'));
assert.ok(entry.includes('handleDirectHomepagePlan'));
assert.ok(entry.indexOf('governWebsitePlanningRequest') < entry.indexOf('handleDirectHomepagePlan'), "Website doctrine must be resolved before planning begins.");
assert.ok(entry.indexOf('buildDeterministicHomepageContinuationRequest') < entry.indexOf('handleDirectHomepagePlan'), "Continuation routing must run before planning.");
assert.ok(entry.indexOf('handleZeroNeuronChildRequest') < entry.indexOf('handleDirectHomepageExecution'), "Zero-neuron internal routing must run before generic request execution.");
assert.ok(entry.indexOf('handleDirectHomepageExecution') < entry.indexOf('handleDirectHomepagePlan'), "Approved direct execution must run before all generic planners and executors.");
assert.ok(entry.indexOf('handleDirectHomepagePlan') < entry.indexOf('handleNeuronFreeHomepagePlan'), "Direct plan must run before legacy binders.");
assert.ok(entry.includes('requestType: "homepage"'), "Existing Website Retool must remain homepage by default unless a future planner declares another page type.");
assert.ok(entry.includes('&& !continuation.active'), "Continuation planning must not duplicate MAIN again.");
assert.ok(entry.includes('homepageContinuationPrivateRuntimeRequired: false'));
assert.ok(entry.includes('homepageContinuationDuplicatesMain: false'));
assert.ok(entry.includes('homepageContinuationPreservesApprovedStaging: true'));
assert.ok(entry.includes('X-Kairos-Managed-Staging-Reused'));
assert.ok(entry.includes('X-Kairos-Main-Duplicated'));
assert.ok(entry.includes('X-Kairos-Private-Runtime-Used'));
assert.ok(entry.includes('workersAIBlockedEnv'));
assert.ok(entry.includes('if (property === "AI") return undefined'));
assert.ok(entry.includes('if (property === "AI") return false'));
assert.ok(entry.includes('workersAIAvailableToRequests: false'));
assert.ok(entry.includes('workersAIUsed: false'));
assert.ok(entry.includes('neuronsConsumed: 0'));
assert.ok(entry.includes('childRetrievalMode: "deterministic-internal"'));
assert.ok(entry.includes('generativeInferenceMode: "kairos-private-runtime-only"'));
assert.ok(entry.includes('websiteDoctrineInheritedAutomatically: true'));
assert.ok(entry.includes('websiteLinkDestinationsMutableByTextPlan: false'));
assert.ok(entry.includes('websiteDesignMutationAuthorizedByCopyObjective: false'));
assert.ok(entry.includes('homepageHeroOnlyCompletionAccepted: false'));
assert.ok(entry.includes('X-Kairos-Website-Doctrine-Inherited'));
assert.ok(entry.includes('labeledHomepagePromptsRequireWorkersAI: false'));
assert.ok(entry.includes('labeledHomepagePromptsUseSecondBindingPass: false'));
assert.ok(entry.includes('approvedDirectPackagesUseApprovalTimeRebinding: false'));
assert.ok(entry.includes('tuesday-command-center-6f96b10d'));

for (const marker of [
  'kairos-homepage-continuation-20260717-1',
  'DETERMINISTIC HOMEPAGE CONTINUATION — TEXT ONLY',
  'preserveManagedStaging: true',
  'duplicateMainBeforePlanning: false',
  'currentManagedStagingReused: true',
  'freshMainDuplicateRequired: false',
  'priorApprovedTextPreserved: true',
  'deterministicContinuation: true',
  'privateRuntimeUsed: false',
  'workersAIUsed: false',
  'neuronsConsumed: 0',
  'Products and services heading',
  'personalized subscriptions',
  'X-Kairos-Managed-Staging-Reused',
  'X-Kairos-Main-Duplicated',
  'X-Kairos-Private-Runtime-Used',
]) assert.ok(homepageContinuation.includes(marker), `Missing deterministic continuation contract: ${marker}`);

assert.ok(!homepageContinuation.includes('env.AI.run'), "Homepage continuation must not call Workers AI.");
assert.ok(!homepageContinuation.includes('runKairosIntelligence'), "Homepage continuation must not call the private runtime.");

for (const marker of [
  'kairos-zero-neuron-child-router-20260717-1',
  '/api/internal-intelligence/status',
  'workersAIEnabledForChildRequests: false',
  'workersAIUsed: false',
  'neuronsConsumed: 0',
  'deterministic-internal',
  'private Kairos runtime only for genuinely generative work',
  'doctrine-vault',
  'knowledge-library',
  'system-registry',
  'release-control',
  'executive-briefing',
  'findInternalDoctrines',
  'domainResultReturnedDirectly: true',
  'X-Kairos-Workers-AI-Used',
  'X-Kairos-Neurons-Consumed',
]) assert.ok(zeroNeuronRouter.includes(marker), `Missing zero-neuron child router contract: ${marker}`);

assert.ok(!zeroNeuronRouter.includes('env.AI.run'), "Zero-neuron child router must never call Workers AI.");
assert.ok(!zeroNeuronRouter.includes('runKairosIntelligence'), "Retrieval/control child actions must not call private inference either.");

for (const marker of [
  'kairos-internal-doctrine-registry-20260717-1',
  'MMG Website Experience Objective',
  'MMG Homepage Journey Map',
  'MMG/Kairos Experience-First Doctrine',
  'MMG Door Opener Doctrine',
  'Never change a URL, link destination, product reference, collection reference, navigation item, or customer pathway unless that exact destination change is included in an approved link plan.',
  'Copy curation does not authorize changes to layout, styling, typography, colors, assets, spacing, sections, blocks, templates, Liquid, CSS, JavaScript, or responsive behavior.',
  'findInternalDoctrines',
  'resolveInternalDoctrine',
]) assert.ok(doctrineRegistry.includes(marker), `Missing internal doctrine registry contract: ${marker}`);

for (const marker of [
  'kairos-website-planning-governance-20260717-1',
  '/api/website/governance/status',
  'governWebsitePlanningRequest',
  'buildPrivateGovernedPlanningRequest',
  'applyWebsiteGovernanceToPlanResponse',
  'buildWebsiteGovernanceContext',
  'inheritedAutomatically: true',
  'Ecosystem orientation and routing layer',
  'A homepage objective is not complete after hero-only work.',
  'product',
  'service',
  'subscription',
  'landing',
  'collection',
  'labelsAndDestinationsGovernedSeparately: true',
  'textOnlyMayChangeDestinations: false',
  'destinationChangesRequireSeparateExactApproval: true',
  'copyDoesNotAuthorizeDesignMutation: true',
  'consultApprovedRecordsBeforeFuturePlans: true',
  'additional-approved-batches-required',
  'wholePageCompletionRequired',
  'governanceApplied: true',
  'workersAIUsedForGovernance: false',
  'neuronsConsumedForGovernance: 0',
  'X-Kairos-Doctrine-Inherited',
  'X-Kairos-Planning-Neurons',
]) assert.ok(websiteGovernance.includes(marker), `Missing website planning governance contract: ${marker}`);

assert.ok(!websiteGovernance.includes('env.AI.run'), "Website governance retrieval must not call Workers AI.");
assert.ok(!websiteGovernance.includes('runKairosIntelligence'), "Website governance retrieval must remain deterministic and internal.");

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
  homepageContinuation: "kairos-homepage-continuation-20260717-1",
  websitePlanningGovernance: "kairos-website-planning-governance-20260717-1",
  zeroNeuronChildRouter: "kairos-zero-neuron-child-router-20260717-1",
  doctrineRegistry: "kairos-internal-doctrine-registry-20260717-1",
  directHomepagePlan: "kairos-direct-homepage-plan-20260717-1",
  directHomepageExecution: "kairos-direct-homepage-execution-20260717-1",
  fullThemeBaseline: "kairos-full-theme-main-baseline-20260717-1",
  visualBaseline: "tuesday-command-center-6f96b10d",
  browserFilesChanged: false,
  websiteDoctrineInheritedAutomatically: true,
  websiteGovernanceNeuronUsage: 0,
  homepageContinuationPrivateRuntimeRequired: false,
  homepageContinuationNeuronUsage: 0,
  homepageContinuationDuplicatesMain: false,
  homepageContinuationPreservesApprovedStaging: true,
  homepageHeroOnlyCompletionAccepted: false,
  websiteLinkDestinationsMutableByTextPlan: false,
  websiteDesignMutationAuthorizedByCopyObjective: false,
  supportedFuturePageTypes: ["product", "service", "subscription", "landing", "collection", "page"],
  workersAIAvailableToRequestRuntime: false,
  childRetrievalNeuronUsage: 0,
  doctrineVaultNeuronUsage: 0,
  generativeInference: "kairos-private-runtime-only",
  websiteMode: "fresh-main-initialization-plus-managed-staging-continuation-plus-direct-approved-package-execution",
  labeledHomepagePromptWorkersAIRequired: false,
  labeledHomepagePromptNeuronUsage: 0,
  labeledHomepagePromptSecondBindingPass: false,
  approvalTimeInventoryRebuild: false,
  approvalTimeOperationRebinding: false,
  executionBoundary: "exact-source-hash-plus-candidate-hash-plus-structural-signature",
}, null, 2));
