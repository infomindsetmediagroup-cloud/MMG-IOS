import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const ui = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/social-production.js"), "utf8");
const loader = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/legacy-runtime-loader.js"), "utf8");
const commandHub = readFileSync(join(repoRoot, "web/kairos-dashboard/scripts/command-hub.js"), "utf8");
const runtime = readFileSync(join(workerRoot, "src/kairos-production-entry-v2.js"), "utf8");
const engine = readFileSync(join(workerRoot, "src/kairos-social-production-v1.js"), "utf8");
const connector = readFileSync(join(workerRoot, "src/kairos-tiktok-connector-v1.js"), "utf8");
const localCanonical = readFileSync(join(workerRoot, "src/kairos-production-entry-local-canonical-v1.js"), "utf8");

test("Social Production remains the permanent Content Center TikTok entry point", () => {
  assert.match(commandHub, /"Social Production"/);
  assert.match(commandHub, /"social-production"/);
  assert.match(commandHub, /kairos:social-production:open/);
  assert.match(loader, /"social-production\.js"/);
  assert.match(loader, /"social-production\.css"/);
});

test("TikTok UI exposes the four format choices and canonical account identity", () => {
  for (const label of ["TikTok Native Text Post", "TikTok Single Image Post", "TikTok Multi-Image / Carousel Post", "TikTok Video Post"]) {
    assert.ok(ui.includes(label), `Missing UI mode: ${label}`);
  }
  assert.match(ui, /@mindset\.media\.group/);
  assert.match(ui, /2 broad \+ 2 niche \+ 1 #MindsetMediaGroup/);
  assert.match(ui, /Build TikTok Package/);
});

test("applicable Content and Business cards expose context-aware TikTok entry points", () => {
  for (const id of ["creative-studio", "product-launch", "campaign-operations", "growth-plan"]) {
    assert.ok(ui.includes(`"${id}"`), `Missing TikTok card integration: ${id}`);
  }
  for (const label of ["Build TikTok Asset", "Build TikTok Launch Post", "Build TikTok Campaign Post", "Build TikTok Growth Post"]) {
    assert.ok(ui.includes(label), `Missing TikTok card action: ${label}`);
  }
});

test("runtime preserves connector-independent social prepare and approval routes", () => {
  assert.match(runtime, /\/api\/social-production\/prepare/);
  assert.match(runtime, /\/api\/social-production\/decide/);
  assert.match(runtime, /\/api\/social-production\/latest/);
  assert.match(engine, /futureConnectorMustConsumeApprovedPackageWithoutRewriting: true/);
  assert.match(engine, /externalPublishingAutomatic: false/);
  assert.match(engine, /approvalBeforeHandoff: true/);
});

test("social package exposes the eight-step connector handoff process", () => {
  for (const name of ["Objective", "Format", "Hook", "Copy", "Hashtag Pyramid", "Media Brief", "QA & Approval", "Connector Handoff"]) {
    assert.ok(engine.includes(`name: "${name}"`), `Missing production slice: ${name}`);
  }
});

test("Social Production exposes authenticated TikTok connect, publish and receipt controls", () => {
  assert.match(ui, /const CONNECTOR_ROOT="\/api\/social-connectors\/tiktok"/);
  for (const suffix of ["/status", "/connect-url", "/disconnect", "/creator-info", "/publish", "/receipt/refresh"]) {
    assert.ok(ui.includes(`\${"${CONNECTOR_ROOT}"}${suffix}`), `Missing connector UI route suffix: ${suffix}`);
  }
  assert.match(ui, /window\.shopify\.idToken/);
  assert.match(ui, /Authorization:`Bearer \$\{token\}`/);
  assert.match(ui, /Connect TikTok/);
  assert.match(ui, /Upload Approved Package/);
  assert.match(ui, /Publish Approved Package/);
  assert.match(ui, /Refresh TikTok Status/);
});

test("TikTok connector UI keeps native text manual and requires explicit export consent", () => {
  assert.match(ui, /Manual TikTok native text handoff/);
  assert.match(ui, /Content Posting API does not expose native text-post publishing/);
  assert.match(ui, /I explicitly consent to export this approved package to TikTok now/);
  assert.match(ui, /TikTok Content Sharing Guidelines/);
  assert.match(ui, /publish:false/);
});

test("canonical runtime owns the server-side TikTok connector boundary", () => {
  assert.match(localCanonical, /handleTikTokConnectorRequest\(request, env, ctx\)/);
  assert.match(localCanonical, /KairosTikTokConnectorVault/);
  assert.match(localCanonical, /X-Kairos-TikTok-Connector/);
  assert.match(connector, /verifyShopifyAdminSession/);
  assert.match(connector, /KAIROS_TIKTOK_CLIENT_SECRET/);
  assert.match(connector, /TIKTOK_DIRECT_POST_AUDIT_REQUIRED/);
  assert.match(connector, /TIKTOK_ACCOUNT_MISMATCH/);
  assert.match(connector, /TIKTOK_EXPORT_CONSENT_REQUIRED/);
  assert.match(connector, /TIKTOK_MEDIA_ORIGIN_NOT_VERIFIED/);
});
