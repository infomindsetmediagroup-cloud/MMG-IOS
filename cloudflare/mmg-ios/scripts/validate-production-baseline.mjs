import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const workerRoot=resolve(here,"..");
const repoRoot=resolve(workerRoot,"../..");
const sourceRoot=join(workerRoot,"src");
const canonicalEntryPath=join(sourceRoot,"kairos-production-entry.js");
const guardedEntryPath=join(sourceRoot,"kairos-production-entry-v2.js");
const activeEntryPath=join(sourceRoot,"kairos-production-entry-v3.js");
const wranglerPath=join(workerRoot,"wrangler.toml");

const requiredFiles=[
  canonicalEntryPath,guardedEntryPath,activeEntryPath,join(sourceRoot,"kairos-production-entry-v1.js"),
  join(sourceRoot,"kairos-executive-briefing-v1.js"),join(sourceRoot,"kairos-approved-work-dispatcher-v1.js"),
  join(sourceRoot,"kairos-approved-website-executor-v1.js"),join(sourceRoot,"kairos-executive-correction-loop-v1.js"),
  join(sourceRoot,"kairos-social-production-v1.js"),join(sourceRoot,"kairos-offer-builder-v1.js"),
  join(sourceRoot,"kairos-product-launch-studio-v1.js"),join(repoRoot,"web/kairos-dashboard/index.html"),
  join(repoRoot,"web/kairos-dashboard/web-003.html"),join(repoRoot,"web/kairos-dashboard/scripts/command-hub.js"),
  join(repoRoot,"web/kairos-dashboard/scripts/command-center-layout.js"),join(repoRoot,"web/kairos-dashboard/scripts/command-center-governance.js"),
  join(repoRoot,"web/kairos-dashboard/scripts/creation-engine.js"),join(repoRoot,"web/kairos-dashboard/scripts/executive-briefing.js"),
  join(repoRoot,"web/kairos-dashboard/scripts/social-production.js"),join(repoRoot,"web/kairos-dashboard/styles/command-hub.css"),
  join(repoRoot,"web/kairos-dashboard/styles/command-center-layout.css"),join(repoRoot,"web/kairos-dashboard/styles/command-center-governance.css"),
  join(repoRoot,"web/kairos-dashboard/styles/executive-briefing.css"),join(repoRoot,"web/kairos-dashboard/styles/social-production.css"),
  join(repoRoot,"web/kairos-dashboard/styles/shopify-analytics.css")
];
for(const filename of requiredFiles)assert.ok(existsSync(filename),`Required production file is missing: ${filename}`);
const staleRuntimeFiles=readdirSync(sourceRoot).filter(name=>/^kairos-production-entry-v(?:[4-9]|1[0-5])\.js$/.test(name));
assert.deepEqual(staleRuntimeFiles,[],`Obsolete production wrappers remain: ${staleRuntimeFiles.join(", ")}`);
assert.ok(!existsSync(join(sourceRoot,"kairos-deterministic-homepage-v2.js")),"Unused duplicate homepage planner remains in production source.");

const wrangler=readFileSync(wranglerPath,"utf8");
assert.match(wrangler,/^main\s*=\s*"src\/kairos-production-entry-v3\.js"/m,"Wrangler must point to the active certification entry.");
assert.match(wrangler,/crons\s*=\s*\["0 15 \* \* \*", "0 2 \* \* \*"\]/,"Morning and evening schedules must remain configured.");

const canonical=readFileSync(canonicalEntryPath,"utf8");
for(const route of ["/api/shopify/staging/plan/jobs","/api/shopify/staging/execute/jobs","/api/shopify/website-intelligence/run","/api/shopify/website-intelligence/latest","/api/executive-briefing/build","/api/executive-briefing/latest","/api/executive-briefing/decide"])assert.ok(canonical.includes(route),`Canonical runtime is missing route: ${route}`);
assert.ok(canonical.includes("visual_replacement_forbidden"));
assert.ok(canonical.includes("scheduled(controller, env, ctx)"));

const guarded=readFileSync(guardedEntryPath,"utf8");
for(const route of ["/api/executive-briefing/execute","/api/executive-briefing/execution/run","/api/executive-briefing/fix/prepare","/api/social-production/prepare","/api/social-production/decide","/api/social-production/latest","/api/social-production/"])assert.ok(guarded.includes(route),`Production route is missing: ${route}`);

const active=readFileSync(activeEntryPath,"utf8");
for(const marker of ["certifyOffer","certifyLaunchReadiness","canonicalRuntime.fetch","canonicalRuntime.scheduled","X-Kairos-Certification-Runtime"])assert.ok(active.includes(marker),`Active certification runtime is missing: ${marker}`);

const social=readFileSync(join(sourceRoot,"kairos-social-production-v1.js"),"utf8");
for(const control of ["tiktok-single-image","tiktok-carousel","tiktok-video","cross-platform-caption","social-asset-queue","yourBrand: true","paidPartnership: false","brandPartner: false","externalPublishingPerformed: false","connectorAvailable: false","publish: false","approvalBeforeHandoff: true","#mindsetmediagroup"])assert.ok(social.includes(control),`Social production contract is missing: ${control}`);

const dashboardIndex=readFileSync(join(repoRoot,"web/kairos-dashboard/index.html"),"utf8");
for(const asset of ["scripts/command-center-layout.js","styles/command-center-layout.css","scripts/command-center-governance.js","styles/command-center-governance.css","scripts/executive-briefing.js","styles/executive-briefing.css","scripts/social-production.js","styles/social-production.css"])assert.ok(dashboardIndex.includes(asset),`Command Center asset missing: ${asset}`);
const commandHub=readFileSync(join(repoRoot,"web/kairos-dashboard/scripts/command-hub.js"),"utf8");
for(const center of ["knowledge","content","business","customers","operations"])assert.match(commandHub,new RegExp(`id\\s*:\\s*["']${center}["']`),`Command Center parent is missing: ${center}`);
const childActionCount=(commandHub.match(/\["[^"]+",\s*"[^"]+",\s*"[^"]+",\s*"[^"]+"\]/g)||[]).length;
assert.equal(childActionCount,25,`Command Center must define exactly 25 child cards; found ${childActionCount}.`);
for(const token of ["workPulse","finishedWork24h","workToBeDone",'fetchJSON("/api/workflows")',"readinessRegistry","centerReadiness","readinessPanel","nextReadinessGate"])assert.ok(commandHub.includes(token),`Command Center contract missing: ${token}`);
const layout=readFileSync(join(repoRoot,"web/kairos-dashboard/scripts/command-center-layout.js"),"utf8");
for(const label of ["Online","In Progress","Done 24h","Not Started","command-menu-button","Real-time visibility. Governed tools. Measurable outcomes."])assert.ok(layout.includes(label),`Command Center layout missing: ${label}`);
const briefingUI=readFileSync(join(repoRoot,"web/kairos-dashboard/scripts/executive-briefing.js"),"utf8");
for(const token of ["America/Los_Angeles","Morning Approval Brief","Evening Approval Brief",'hero.insertAdjacentElement("afterend", section)'])assert.ok(briefingUI.includes(token),`Executive briefing contract missing: ${token}`);
const governance=readFileSync(join(repoRoot,"web/kairos-dashboard/scripts/command-center-governance.js"),"utf8");assert.ok(governance.includes("exactly five parent cards"));
const socialUI=readFileSync(join(repoRoot,"web/kairos-dashboard/scripts/social-production.js"),"utf8");
for(const label of ["TikTok Single Image Post","TikTok Multi-Image / Carousel Post","TikTok Video Post","Cross-Platform Caption Package","Social Asset Production Queue","Approve Package","Request Fix","Connector-ready payload"])assert.ok(socialUI.includes(label),`Social Production UI is missing: ${label}`);
const websiteProduction=readFileSync(join(repoRoot,"web/kairos-dashboard/web-003.html"),"utf8");assert.ok(!websiteProduction.includes("PRESERVE_PROMPT"));assert.ok(!websiteProduction.includes("placeholder:j.placeholder"));
const runtimeModule=await import(`${pathToFileURL(activeEntryPath).href}?validation=${Date.now()}`);
assert.equal(typeof runtimeModule.default?.fetch,"function");assert.equal(typeof runtimeModule.default?.scheduled,"function");assert.equal(typeof runtimeModule.KairosProject,"function");
console.log(JSON.stringify({status:"ready",baseline:"kairos-production-baseline-20260714-9",activeEntry:"kairos-production-entry-v3",certifiedOfferLaunchChain:true,integratedWorkflowPulse:true,commandCenterParents:5,childCardsPerParent:5,totalEntryPoints:25,scheduledWebsiteIntelligence:true,scheduledExecutiveBriefing:true},null,2));
