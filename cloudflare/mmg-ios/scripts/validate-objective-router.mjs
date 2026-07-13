import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, "..");
const repoRoot = resolve(workerRoot, "../..");
const routerPath = join(workerRoot, "src/kairos-objective-router-v1.js");
const entryPath = join(workerRoot, "src/kairos-production-entry-v2.js");
const uiPath = join(repoRoot, "web/kairos-dashboard/scripts/objective-router.js");
const cssPath = join(repoRoot, "web/kairos-dashboard/styles/objective-router.css");
const indexPath = join(repoRoot, "web/kairos-dashboard/index.html");

for (const file of [routerPath, entryPath, uiPath, cssPath, indexPath]) assert.ok(existsSync(file), `Objective router file missing: ${file}`);

const source = readFileSync(routerPath, "utf8");
for (const center of ["knowledge", "content", "business", "customers", "operations"]) assert.ok(source.includes(`route("${center}"`), `Objective router is missing center: ${center}`);
const routeCount = (source.match(/route\("(?:knowledge|content|business|customers|operations)"/g) || []).length;
assert.equal(routeCount, 25, `Objective router must map exactly 25 entry points; found ${routeCount}.`);
for (const safeguard of ["onePermanentHome: true", "fiveByFiveArchitecturePreserved: true", "floatingControlCreated: false", "externalActionAutomatic: false"]) assert.ok(source.includes(safeguard), `Objective routing safeguard missing: ${safeguard}`);

const module = await import(`${pathToFileURL(routerPath).href}?validation=${Date.now()}`);
const website = module.routeObjective({ objective: "Retool the Shopify homepage header tonight" });
assert.equal(website.center, "content");
assert.equal(website.entryPoint, "website");
const social = module.routeObjective({ objective: "Build a TikTok carousel post package" });
assert.equal(social.entryPoint, "social-production");
const broad = module.routeObjective({ objective: "Help me organize the work I need to finish tonight" });
assert.equal(broad.entryPoint, "work-queue");
assert.equal(broad.workflow.tasks.length, 5);

const entry = readFileSync(entryPath, "utf8");
assert.ok(entry.includes("/api/objectives/route"), "Objective route API is missing.");
assert.ok(entry.includes("/api/objectives/dispatch"), "Objective dispatch API is missing.");

const ui = readFileSync(uiPath, "utf8");
for (const marker of ["Tell Kairos what you want finished", "Route Objective", "Create Workflow", "Open Work Queue"]) assert.ok(ui.includes(marker), `Objective router UI missing: ${marker}`);
const css = readFileSync(cssPath, "utf8");
assert.ok(!css.includes("position:fixed"), "Objective router must not create a floating interface.");
const index = readFileSync(indexPath, "utf8");
assert.ok(index.includes("scripts/objective-router.js"), "Command Center does not load Objective Router.");
assert.ok(index.includes("styles/objective-router.css"), "Command Center does not load Objective Router styles.");

console.log(JSON.stringify({
  status: "ready",
  objectiveRouter: true,
  mappedEntryPoints: 25,
  workflowDispatch: true,
  fiveByFiveArchitecturePreserved: true,
  floatingControls: 0,
}, null, 2));
