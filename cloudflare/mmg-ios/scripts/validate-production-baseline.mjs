import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const sourceRoot = join(workerRoot, "src");
const entryPath = join(sourceRoot, "kairos-production-entry.js");
const guardedEntryPath = join(sourceRoot, "kairos-production-entry-v2.js");
const wranglerPath = join(workerRoot, "wrangler.toml");

const requiredFiles = [
  entryPath,
  join(sourceRoot, "kairos-production-entry-v1.js"), guardedEntryPath,
  join(sourceRoot, "kairos-executive-briefing-v1.js"),
  join(sourceRoot, "kairos-approved-work-dispatcher-v1.js"),
  join(sourceRoot, "kairos-approved-website-executor-v1.js"),
  join(sourceRoot, "kairos-executive-correction-loop-v1.js"),
  join(sourceRoot, "kairos-social-production-v1.js"),
  join(repoRoot, "web/kairos-dashboard/index.html"),
  join(repoRoot, "web/kairos-dashboard/web-003.html"),
  join(repoRoot, "web/kairos-dashboard/scripts/command-hub.js"),
  join(repoRoot, "web/kairos-dashboard/scripts/command-center-layout.js"),
  join(repoRoot, "web/kairos-dashboard/scripts/command-center-governance.js"),
  join(repoRoot, "web/kairos-dashboard/scripts/creation-engine.js"),
  join(repoRoot, "web/kairos-dashboard/scripts/executive-briefing.js"),
  join(repoRoot, "web/kairos-dashboard/scripts/social-production.js"),
  join(repoRoot, "web/kairos-dashboard/styles/command-center-layout.css"),
  join(repoRoot, "web/kairos-dashboard/styles/command-center-governance.css"),
  join(repoRoot, "web/kairos-dashboard/styles/executive-briefing.css"),
  join(repoRoot, "web/kairos-dashboard/styles/social-production.css"),
  join(repoRoot, "web/kairos-dashboard/styles/shopify-analytics.css"),
];
for (const filename of requiredFiles) assert.ok(existsSync(filename), `Required production file is missing: ${filename}`);

const staleRuntimeFiles = readdirSync(sourceRoot).filter(name => /^kairos-production-entry-v(?:[3-9]|1[0-5])\.js$/.test(name));
assert.deepEqual(staleRuntimeFiles, [], `Obsolete production wrappers remain: ${staleRuntimeFiles.join(", ")}`);
assert.ok(!existsSync(join(sourceRoot, "kairos-deterministic-homepage-v2.js")), "Unused duplicate homepage planner remains in the production source tree.");

const wrangler = readFileSync(wranglerPath, "utf8");
assert.match(wrangler, /^main\s*=\s*"src\/kairos-production-entry\.js"/m, "Wrangler must point to the canonical production entry.");
assert.match(wrangler, /crons\s*=\s*\["0 15 \* \* \*", "0 2 \* \* \*"\]/, "Morning and evening schedules must remain configured.");

const source = readFileSync(entryPath, "utf8");
for (const route of [
  "/api/shopify/staging/plan/jobs", "/api/shopify/staging/execute/jobs",
  "/api/shopify/website-intelligence/run", "/api/shopify/website-intelligence/latest",
  "/api/executive-briefing/build", "/api/executive-briefing/latest", "/api/executive-briefing/decide",
]) assert.ok(source.includes(route), `Canonical runtime is missing route: ${route}`);
assert.ok(source.includes("visual_replacement_forbidden"), "Patch-only homepage replacement guard is missing.");
assert.ok(source.includes("scheduled(controller, env, ctx)"), "Scheduled website intelligence handler is missing.");

const guardedSource = readFileSync(guardedEntryPath, "utf8");
for (const route of [
  "/api/executive-briefing/execute", "/api/executive-briefing/execution/run", "/api/executive-briefing/fix/prepare",
  "/api/social-production/prepare", "/api/social-production/decide", "/api/social-production/latest", "/api/social-production/",
]) assert.ok(guardedSource.includes(route), `Production route is missing: ${route}`);

const social = readFileSync(join(sourceRoot, "kairos-social-production-v1.js"), "utf8");
for (const control of [
  "tiktok-single-image", "tiktok-carousel", "tiktok-video", "cross-platform-caption", "social-asset-queue",
  "yourBrand: true", "paidPartnership: false", "brandPartner: false", "externalPublishingPerformed: false",
  "connectorAvailable: false", "publish: false", "approvalBeforeHandoff: true", "#mindsetmediagroup",
]) assert.ok(social.includes(control), `Social production contract is missing: ${control}`);

const dashboardIndex = readFileSync(join(repoRoot, "web/kairos-dashboard/index.html"), "utf8");
for (const asset of [
  "scripts/command-center-layout.js", "styles/command-center-layout.css",
  "scripts/command-center-governance.js", "styles/command-center-governance.css",
  "scripts/executive-briefing.js", "styles/executive-briefing.css",
  "scripts/social-production.js", "styles/social-production.css",
]) assert.ok(dashboardIndex.includes(asset), `Command Center asset missing: ${asset}`);

const commandHub = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/command-hub.js"), "utf8");
for (const center of ["knowledge", "content", "business", "customers", "operations"]) assert.ok(commandHub.includes(`id: "${center}"`), `Command Center parent is missing: ${center}`);
for (const embeddedTool of ["Manuscript Studio", "Social Production", "Executive Briefing", "System Registry"]) assert.ok(commandHub.includes(embeddedTool), `Embedded child tool is missing: ${embeddedTool}`);
const childActionCount = (commandHub.match(/\["[^"]+",\s*"[^"]+",\s*"[^"]+",\s*"[^"]+"\]/g) || []).length;
assert.equal(childActionCount, 25, `Command Center must define exactly 25 child cards; found ${childActionCount}.`);

const layout = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/command-center-layout.js"), "utf8");
for (const label of ["Online", "Active Work", "Capabilities", "Entry Points"]) assert.ok(layout.includes(label), `Compact status strip is missing: ${label}`);
assert.ok(layout.includes("command-menu-button"), "Integrated hamburger control is missing.");
assert.ok(layout.includes('hub.querySelector(".metrics")?.remove()'), "Legacy metric cards are not removed.");
assert.ok(layout.includes("Real-time visibility. Governed tools. Measurable outcomes."), "Simplified command hero copy is missing.");

const briefingUI = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/executive-briefing.js"), "utf8");
assert.ok(briefingUI.includes("America/Los_Angeles"), "Briefing UI must use Pacific time.");
assert.ok(briefingUI.includes("Morning Approval Brief") && briefingUI.includes("Evening Approval Brief"), "Dynamic morning/evening briefing titles are missing.");
assert.ok(briefingUI.includes("state.briefing.window !== currentWindow()"), "Briefing does not refresh when the approval window changes.");
assert.ok(briefingUI.includes('hero.insertAdjacentElement("afterend", section)'), "Executive briefing must mount immediately after the command hero.");

const analyticsCSS = readFileSync(join(repoRoot, "web/kairos-dashboard/styles/shopify-analytics.css"), "utf8");
assert.ok(analyticsCSS.includes("overflow:visible"), "Store performance cards must not use a horizontal scroller.");
assert.ok(analyticsCSS.includes("repeat(2,minmax(0,1fr))"), "Store performance mobile grid must remain fixed at two columns.");

const governance = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/command-center-governance.js"), "utf8");
assert.ok(governance.includes("exactly five parent cards"), "Five-parent runtime guard is missing.");
const governanceCSS = readFileSync(join(repoRoot, "web/kairos-dashboard/styles/command-center-governance.css"), "utf8");
for (const selector of [".manuscript-launch", ".social-production-launch", "[data-floating-launch]"]) assert.ok(governanceCSS.includes(selector), `Floating-launch suppression is missing: ${selector}`);

const socialUI = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/social-production.js"), "utf8");
for (const label of ["TikTok Single Image Post", "TikTok Multi-Image / Carousel Post", "TikTok Video Post", "Cross-Platform Caption Package", "Social Asset Production Queue", "Approve Package", "Request Fix", "Connector-ready payload"]) assert.ok(socialUI.includes(label), `Social Production UI is missing: ${label}`);
assert.ok(!socialUI.includes("document.body.appendChild(button)"), "Social Production still creates a standalone launcher.");

const websiteProduction = readFileSync(join(repoRoot, "web/kairos-dashboard/web-003.html"), "utf8");
assert.ok(!websiteProduction.includes("PRESERVE_PROMPT"), "Website Production still contains a prefilled homepage prompt.");
assert.ok(!websiteProduction.includes("placeholder:j.placeholder"), "Website Production still assigns predetermined prompt placeholders.");

const runtimeModule = await import(`${pathToFileURL(entryPath).href}?validation=${Date.now()}`);
assert.equal(typeof runtimeModule.default?.fetch, "function", "Canonical runtime must export fetch().");
assert.equal(typeof runtimeModule.default?.scheduled, "function", "Canonical runtime must export scheduled().");
assert.equal(typeof runtimeModule.KairosProject, "function", "Canonical runtime must export KairosProject.");

console.log(JSON.stringify({
  status: "ready",
  baseline: "kairos-production-baseline-20260713-5",
  integratedHeaderStatusStrip: true,
  integratedHamburgerNavigation: true,
  legacyMetricCardsRemoved: true,
  dynamicMorningEveningBriefing: true,
  fixedStorePerformanceGrid: true,
  commandCenterParents: 5,
  childCardsPerParent: 5,
  totalEntryPoints: 25,
  floatingLaunchControls: 0,
  websiteProductionPromptEmpty: true,
  scheduledWebsiteIntelligence: true,
  scheduledExecutiveBriefing: true,
}, null, 2));