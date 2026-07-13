import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const runtimePath = join(workerRoot, "src/kairos-offer-builder-v1.js");
const entryPath = join(workerRoot, "src/kairos-production-entry-v2.js");
const uiPath = join(repoRoot, "web/kairos-dashboard/scripts/offer-builder.js");
const cssPath = join(repoRoot, "web/kairos-dashboard/styles/offer-builder.css");
const commandCSSPath = join(repoRoot, "web/kairos-dashboard/styles/command-hub.css");
const indexPath = join(repoRoot, "web/kairos-dashboard/index.html");

for (const file of [runtimePath, entryPath, uiPath, cssPath, commandCSSPath, indexPath]) assert.ok(existsSync(file), `Offer Builder production file missing: ${file}`);

const runtime = readFileSync(runtimePath, "utf8");
for (const marker of [
  "createOffer", "Lock customer and problem", "Define promise and value", "Design delivery model",
  "Build pricing and economics", "Approve offer package", "pricingRequiresApproval: true",
  "customerClaimsRequireApproval: true", "automaticDiscounting: false", "guaranteedOutcomeClaims: false",
]) assert.ok(runtime.includes(marker), `Offer Builder runtime contract missing: ${marker}`);

const entry = readFileSync(entryPath, "utf8");
for (const route of ["/api/offers", "/api/offers/latest"]) assert.ok(entry.includes(route), `Offer Builder route missing: ${route}`);

const ui = readFileSync(uiPath, "utf8");
for (const marker of [
  '[data-child="offer-builder"]', "Offer Architecture Workspace", "Build Offer + Workflow",
  "Open in Work Queue", "No automatic discounting or guaranteed-outcome language",
]) assert.ok(ui.includes(marker), `Offer Builder UI missing: ${marker}`);

const commandCSS = readFileSync(commandCSSPath, "utf8");
for (const center of ["knowledge", "content", "business", "customers", "operations"]) assert.ok(commandCSS.includes(`data-center=${center}`), `Premium parent icon missing: ${center}`);
for (const icon of ["🧠", "🎬", "💼", "👥", "⚙️"]) assert.ok(commandCSS.includes(icon), `Dimensional parent icon missing: ${icon}`);
assert.ok(!readFileSync(cssPath, "utf8").includes("position:fixed"), "Offer Builder must not introduce floating controls.");

const index = readFileSync(indexPath, "utf8");
assert.ok(index.includes("scripts/offer-builder.js"), "Command Center does not load Offer Builder.");
assert.ok(index.includes("styles/offer-builder.css"), "Command Center does not load Offer Builder styles.");

console.log(JSON.stringify({
  status: "ready",
  premiumParentIcons: 5,
  offerBuilder: true,
  fiveStageWorkflow: true,
  pricingApproval: true,
  customerClaimsApproval: true,
  automaticDiscounting: false,
  guaranteedOutcomeClaims: false,
  floatingControls: 0,
}, null, 2));
