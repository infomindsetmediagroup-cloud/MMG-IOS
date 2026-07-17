import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workerRoot, "../..");
const read = path => readFileSync(path, "utf8");
const requireFile = path => assert.ok(existsSync(path), `Missing integration file: ${path}`);
const requireAll = (source, markers, label) => markers.forEach(marker => assert.ok(source.includes(marker), `${label} missing: ${marker}`));

const paths = {
  hybrid: join(workerRoot, "src/kairos-production-entry.js"),
  enhanced: join(workerRoot, "src/kairos-production-entry-v45.js"),
  website: join(workerRoot, "src/kairos-production-entry-v43.js"),
  childEdge: join(workerRoot, "src/kairos-production-entry-v38.js"),
  autonomyEdge: join(workerRoot, "src/kairos-production-entry-v36.js"),
  childRuntime: join(workerRoot, "src/kairos-child-action-runtime-v1.js"),
  nativeTask: join(workerRoot, "src/kairos-native-task-execution-v1.js"),
  autonomy: join(workerRoot, "src/kairos-autonomy-runtime-v1.js"),
  intelligence: join(workerRoot, "src/kairos-intelligence-v1.js"),
  operational: join(workerRoot, "src/kairos-operational-runtime-v1.js"),
  dashboard: join(repoRoot, "web/kairos-dashboard/index.html"),
  commandHub: join(repoRoot, "web/kairos-dashboard/scripts/command-hub.js"),
  childBridge: join(repoRoot, "web/kairos-dashboard/scripts/child-action-bridge.js"),
  websiteIntent: join(repoRoot, "web/kairos-dashboard/scripts/website-intent-router.js"),
  deployment: join(repoRoot, ".github/workflows/deploy-cloudflare-production.yml"),
};

Object.values(paths).forEach(requireFile);
const sources = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, read(path)]));

requireAll(sources.hybrid, [
  './kairos-production-entry-v45.js',
  'kairos-tuesday-shell-enhanced-runtime-20260717-1',
  'kairos-command-hub-recovery-20260714-1',
  '!url.pathname.startsWith(API_PREFIX)',
  'serveTuesdayAsset',
  'enhancedRuntime.fetch',
  'enhanced-api-failure-contained',
  'failureContainedToRequest: true',
  'enhancedRuntime.scheduled',
], "Hybrid production entry");

requireAll(sources.enhanced, [
  './kairos-production-entry-v44.js',
  './kairos-web003-deterministic-first-runtime-v1.js',
  'kairos-production-entry-20260717-103',
  'handleDeterministicFirstWeb003Request',
], "Enhanced v45 edge");

requireAll(sources.website, [
  './kairos-production-entry-v42.js',
  '/api/shopify/staging/plan/jobs',
  '/api/shopify/staging/execute/jobs',
  'published-main-homepage-instance-liquid-text-v1',
], "Website production edge");

requireAll(sources.childEdge, [
  './kairos-production-entry-v37.js',
  'handleChildActionRequest',
  'objective-to-verified-deliverable',
  'synchronousChildActionExecution',
], "Child-action edge");

requireAll(sources.autonomyEdge, [
  './kairos-production-entry-v35.js',
  'handleAutonomyRequest',
  'runAutonomyCycle',
  'event-driven-plus-15-minute-recovery-cron',
  'enhancedAccountScopedInference',
], "Autonomy edge");

requireAll(sources.childRuntime, [
  'kairos-child-action-runtime-20260716-1',
  'const EXECUTE_ROUTE = "/api/hub/execute"',
  'direct-objective-to-deliverable',
  'verified-native-task-execution',
  'storage: "durable-object"',
], "Child-action runtime");

requireAll(sources.nativeTask, [
  'kairos-native-task-execution-20260716-3',
  'executeNativeTask',
  'enhanced-inference-required-for-verified-native-execution',
  'status: "verified"',
  'durableReadbackRequired: true',
  'externalActionTaken: false',
  'approvalBypassed: false',
], "Native task execution");

requireAll(sources.autonomy, [
  'kairos-autonomy-runtime-20260716-3',
  'verified-native-intelligent-autonomy',
  'produce-grounded-native-analysis-deliverables',
  'verify-durable-artifact-readback-before-completion',
  '"/api/autonomy/status"',
  '"/api/autonomy/run"',
], "Autonomy runtime");

requireAll(sources.intelligence, [
  'STRUCTURED_OUTPUT_ATTEMPTS = 3',
  'self-hosted-private',
  'cloudflare-account-scoped',
  'customer-content-isolated-no-training',
  'runKairosIntelligence',
  'structured-retry-',
], "Enhanced inference runtime");

requireAll(sources.operational, [
  'KAIROS_ACTION_CONTRACTS',
  'ledgerGet',
  'ledgerList',
  'ledgerUpsert',
], "Durable operational runtime");

requireAll(sources.dashboard, [
  'kairos-command-hub-recovery-20260714-1',
  'id="kairos-hub"',
  './scripts/command-hub.js?v=recovery-20260714-1',
], "Tuesday browser shell");

requireAll(sources.commandHub, [
  '/api/shopify/staging/plan/jobs',
  '/api/shopify/staging/execute/jobs',
  '/api/shopify/staging/visual-verification',
  '/api/shopify/homepage-release/publish',
], "Command Center functionality");

requireAll(sources.childBridge, [
  '/api/hub/execute',
], "Child-card UI bridge");

requireAll(sources.websiteIntent, [
  'full-retool',
], "Website intent routing");

requireAll(sources.deployment, [
  'npm run validate:loading',
  'npm run validate:production',
  'npx wrangler deploy --dry-run',
  'Prove app opens after deployment',
  'kairos-command-hub-recovery-20260714-1',
], "Canonical production workflow");

const workflows = readdirSync(join(repoRoot, ".github/workflows")).filter(name => /\.ya?ml$/i.test(name)).sort();
assert.deepEqual(workflows, ["deploy-cloudflare-production.yml"], "Only the loading-gated canonical production workflow may remain active.");

console.log(JSON.stringify({
  status: "passed",
  contract: "tuesday-shell-enhanced-runtime-integration-20260717-1",
  browserShell: "kairos-command-hub-recovery-20260714-1",
  workerEntry: "src/kairos-production-entry.js",
  enhancedRuntime: "src/kairos-production-entry-v45.js",
  childActions: "objective-to-verified-deliverable",
  nativeExecution: "verified-artifact-and-durable-readback",
  autonomy: "bounded-event-driven-plus-cron",
  inference: "account-scoped-or-self-hosted-private",
  websiteProduction: "staging-preview-approval-execution-readback-rollback",
  productionWorkflowAuthorityCount: workflows.length,
}, null, 2));
