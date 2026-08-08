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
  assert.match(ui, /TikTok connector: not connected yet/);
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
