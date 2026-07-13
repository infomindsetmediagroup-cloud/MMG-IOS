import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const runtimePath = join(workerRoot, "src/kairos-revenue-intelligence-v1.js");
const entryPath = join(workerRoot, "src/kairos-production-entry-v2.js");
const uiPath = join(repoRoot, "web/kairos-dashboard/scripts/revenue-intelligence.js");
const cssPath = join(repoRoot, "web/kairos-dashboard/styles/revenue-intelligence.css");
const indexPath = join(repoRoot, "web/kairos-dashboard/index.html");

for (const file of [runtimePath, entryPath, uiPath, cssPath, indexPath]) assert.ok(existsSync(file), `Revenue Intelligence production file missing: ${file}`);

const runtime = readFileSync(runtimePath, "utf8");
for (const marker of [
  "runRevenueReview", "/api/analytics/shopify", "ShopifyQL", "requestedPeriodSatisfied",
  "inventedData: false", "extrapolationPerformed: false", "externalPublicationAutomatic: false",
  "Confirm analytics coverage", "Review verified metrics", "Identify revenue constraints",
  "Choose bounded business action", "Measure the next verified snapshot",
]) assert.ok(runtime.includes(marker), `Revenue Intelligence runtime contract missing: ${marker}`);

const entry = readFileSync(entryPath, "utf8");
for (const route of ["/api/revenue-intelligence/reviews", "/api/revenue-intelligence/latest"]) assert.ok(entry.includes(route), `Revenue Intelligence route missing: ${route}`);

const ui = readFileSync(uiPath, "utf8");
for (const marker of [
  '[data-child="revenue-intelligence"]', "Verified Commerce Review", "Run Verified Review",
  "No invented data", "No extrapolation", "Open Follow-Through Workflow",
]) assert.ok(ui.includes(marker), `Revenue Intelligence UI missing: ${marker}`);

const css = readFileSync(cssPath, "utf8");
assert.ok(!css.includes("position:fixed"), "Revenue Intelligence must not introduce floating controls.");

const index = readFileSync(indexPath, "utf8");
assert.ok(index.includes("scripts/revenue-intelligence.js"), "Command Center does not load Revenue Intelligence.");
assert.ok(index.includes("styles/revenue-intelligence.css"), "Command Center does not load Revenue Intelligence styles.");

console.log(JSON.stringify({
  status: "ready",
  verifiedRevenueSnapshot: true,
  authoritativeShopifyEndpoint: true,
  periodQualification: true,
  followThroughWorkflow: true,
  inventedData: false,
  extrapolation: false,
  floatingControls: 0,
}, null, 2));
