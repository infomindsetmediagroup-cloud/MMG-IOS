import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workerRoot, "../..");
const read = path => readFileSync(path, "utf8");
const requireFile = path => assert.ok(existsSync(path), `Missing stable integration file: ${path}`);
const requireAll = (source, markers, label) => markers.forEach(marker => assert.ok(source.includes(marker), `${label} missing: ${marker}`));

const paths = {
  entry: join(workerRoot, "src/kairos-production-entry.js"),
  base: join(workerRoot, "src/kairos-production-entry-v2.js"),
  wrangler: join(workerRoot, "wrangler.toml"),
  dashboard: join(repoRoot, "web/kairos-dashboard/index.html"),
  commandHub: join(repoRoot, "web/kairos-dashboard/scripts/command-hub.js"),
  websiteIntent: join(repoRoot, "web/kairos-dashboard/scripts/website-intent-router.js"),
  childBridge: join(repoRoot, "web/kairos-dashboard/scripts/child-action-bridge.js"),
  workflow: join(repoRoot, ".github/workflows/deploy-cloudflare-production.yml"),
};
Object.values(paths).forEach(requireFile);
const source = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, read(path)]));

requireAll(source.entry, [
  './kairos-production-entry-v2.js',
  'kairos-production-baseline-20260715-4',
  '/api/shopify/link-intelligence/audit',
  '/api/shopify/link-intelligence/repair/prepare',
  '/api/shopify/link-intelligence/repair/execute',
  '/api/shopify/link-intelligence/review/prepare',
  '/api/shopify/link-intelligence/review/decide',
  '/api/shopify/link-intelligence/review/execute',
  '/api/shopify/website-retool/schema-inspection',
  '/api/shopify/website-retool/exceptions/prepare',
  '/api/shopify/website-retool/exceptions/execute',
  '/api/shopify/website-retool/exceptions/rollback',
  '/api/shopify/website-intelligence/run',
  '/api/shopify/website-intelligence/latest',
  '/api/executive-briefing/build',
  '/api/executive-briefing/latest',
  '/api/executive-briefing/decide',
  '/api/shopify/homepage-release/',
  '/api/shopify/staging/plan/jobs',
], "Stable operational entry");

requireAll(source.wrangler, [
  'main = "src/kairos-production-entry.js"',
  'workers_dev = true',
  'binding = "ASSETS"',
  'run_worker_first = true',
  'binding = "AI"',
  'name = "KAIROS_PROJECTS"',
  'KAIROS_AUTONOMY_ENABLED = "true"',
], "Worker configuration");

requireAll(source.dashboard, [
  'kairos-command-hub-recovery-20260714-1',
  'id="kairos-hub"',
  './scripts/command-hub.js?v=recovery-20260714-1',
  './scripts/website-production-mobile-route.js?v=recovery-20260714-1',
  'shopify-release-control.js',
  'website-visual-verification.js',
  'shopify-page-compiler.js',
], "Locked browser shell with restored modules");

requireAll(source.commandHub, [
  '/api/shopify/staging/plan/jobs',
  '/api/shopify/staging/execute/jobs',
  '/api/shopify/staging/visual-verification',
  '/api/shopify/homepage-release/publish',
], "Command Center production controls");

requireAll(source.websiteIntent, ['full-retool'], "Website intent routing UI");
requireAll(source.childBridge, ['/api/hub/execute'], "Child-card execution bridge asset");
requireAll(source.workflow, [
  'npm run validate:loading',
  'npm run validate:production',
  'npx wrangler deploy --dry-run',
  'npx wrangler deploy',
  'Prove app opens after deployment',
  'kairos-command-hub-recovery-20260714-1',
], "Canonical production deployment");

console.log(JSON.stringify({
  status: "passed",
  contract: "kairos-stable-functionality-behind-tuesday-loader-20260717-1",
  loadingBaseline: "kairos-command-hub-recovery-20260714-1",
  activeEntry: "src/kairos-production-entry.js",
  websiteLinkLifecycle: true,
  websiteSchemaInspection: true,
  websiteExceptionPlanningExecutionRollback: true,
  websiteIntelligence: true,
  executiveBriefing: true,
  homepageReleaseControl: true,
  stagingPlanning: true,
  restoredDashboardModules: true,
  deeperRuntimePromotionDeferredUntilSeparatelyDeployable: true,
}, null, 2));
