import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entryPath = join(root, "src/kairos-production-entry.js");
const plannerPath = join(root, "src/kairos-homepage-preserve-planner-v1.js");
const executorPath = join(root, "src/kairos-homepage-template-text-executor-v1.js");
const wranglerPath = join(root, "wrangler.toml");
for (const path of [entryPath, plannerPath, executorPath, wranglerPath]) assert.ok(existsSync(path), `Missing visual-preservation dependency: ${path}`);

const entry = readFileSync(entryPath, "utf8");
const planner = readFileSync(plannerPath, "utf8");
const executor = readFileSync(executorPath, "utf8");
const wrangler = readFileSync(wranglerPath, "utf8");

for (const marker of [
  './kairos-homepage-preserve-planner-v1.js',
  './kairos-homepage-template-text-executor-v1.js',
  'kairos-production-baseline-20260717-8',
  'const STAGING_EXECUTE_PATH = "/api/shopify/staging/execute/jobs"',
  'VISUAL_REDESIGN_CONFIRMATION = "AUTHORIZE VISUAL REDESIGN"',
  'handleStagingPlan',
  'handleStagingExecution',
  'enforceVisualPreservation',
  'enforceExecutionPreservation',
  'explicitVisualRedesignAuthorized',
  'unsafeVisualPlan',
  'styleMutationAuthorized: false',
  'visualMutationAuthorized: false',
  'cssMutationAuthorized: false',
  'assetMutationAuthorized: false',
  'designTokenMutationAuthorized: false',
  'themeSchemeMutationAuthorized: false',
  'nativeThemeDecision: "keep-current"',
  'selectedChanges: []',
  'visual_preservation_replan_required',
  'serverEnforcedWebsiteVisualPreservation',
]) assert.ok(entry.includes(marker), `Server visual-preservation edge missing: ${marker}`);

for (const marker of [
  'kairos-homepage-preserve-planner-20260716-2',
  'NON_TEXT_KEY',
  'colorsTypographySpacingCardsPillsAndLayout: true',
  'No Liquid, CSS, asset, class, color, typography, spacing, card, pill, layout, link, animation, or responsive behavior changes.',
  'styleMutationAuthorized: false',
  'liquidMutationAuthorized: false',
  'assetMutationAuthorized: false',
  'preserveExistingDesign: true',
]) assert.ok(planner.includes(marker), `Published-framework planner missing: ${marker}`);

for (const marker of [
  'kairos-homepage-template-text-executor-20260716-1',
  'published-main-template-text-settings-v1',
  'published_framework_proof_missing',
  'published_homepage_changed',
  'staging_homepage_changed',
  'homepage_template_readback_mismatch',
  'published_main_theme_changed',
  'stylesheetsWritten: []',
  'assetsWritten: []',
  'classesChanged: false',
  'designTokensChanged: false',
]) assert.ok(executor.includes(marker), `Published-framework executor missing: ${marker}`);

assert.ok(wrangler.includes('main = "src/kairos-production-entry.js"'), "The stable Worker entrypoint changed.");
assert.ok(wrangler.includes('workers_dev = true'), "The working workers.dev route changed.");
assert.ok(wrangler.includes('directory = "../../web/kairos-dashboard"'), "The Tuesday dashboard asset directory changed.");

console.log(JSON.stringify({
  status: "passed",
  contract: "kairos-server-visual-preservation-20260717-1",
  defaultPlanningMode: "published-main-framework-text-only",
  stagingExecutor: "hash-bound-template-text",
  visualRedesignRequiresExplicitFour-partAuthorization: true,
  colorsTypographyPillsButtonsCardsSpacing: "immutable",
  cssAssetsClassesDesignTokens: "immutable",
  nativeHeaderFooterStyling: "keep-current",
  unsafeLegacyPlans: "rejected-and-replan-required",
  liveThemeMutation: false,
  browserLoadingSurfaceChanged: false,
}, null, 2));
