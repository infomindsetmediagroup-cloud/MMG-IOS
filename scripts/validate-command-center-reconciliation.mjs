import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dashboardRoot = path.join(root, "web", "kairos-dashboard");
const indexPath = path.join(dashboardRoot, "index.html");
const html = fs.readFileSync(indexPath, "utf8");

const requiredBuild = "command-center-reconciled-baseline-20260711-44";
const requiredModules = [
  "./scripts/auth-shell.js",
  "./scripts/health-fetch-resilience.js",
  "./scripts/dashboard.js",
  "./scripts/approved-action-router.js",
  "./scripts/live-executive-chat.js",
];
const forbiddenModules = [
  "proposal-store-guard.js",
  "approval-request-guard.js",
  "interaction-watchdog.js",
  "proposal-review-lite.js",
  "execution-finalization-guard.js",
  "theme-plan-objective-guard.js",
  "executive-summary-layer.js",
  "shopify-theme-plan-router.js",
  "production-pipeline-router.js",
  "interrupted-state-recovery.js",
  "website-proposal-resilience.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(html.includes(requiredBuild), `Missing reconciled build marker: ${requiredBuild}`);
assert(html.includes("kairos-app-header.png?v=1783815598"), "Approved Kairos header image is not wired into the shell.");
assert(html.includes("viewport-fit=cover"), "Mobile safe-area viewport support is missing.");

for (const modulePath of requiredModules) {
  assert(html.includes(modulePath), `Required startup module is missing: ${modulePath}`);
  const filePath = path.join(dashboardRoot, modulePath.replace("./", "").split("?")[0]);
  assert(fs.existsSync(filePath), `Referenced startup module does not exist: ${filePath}`);
}

for (const moduleName of forbiddenModules) {
  assert(!html.includes(moduleName), `Deprecated lifecycle interceptor is still loaded: ${moduleName}`);
}

const moduleTags = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)].map(match => match[1]);
assert(moduleTags.length === requiredModules.length, `Expected ${requiredModules.length} startup modules, found ${moduleTags.length}.`);
assert(new Set(moduleTags.map(value => value.split("?")[0])).size === moduleTags.length, "Duplicate startup modules detected.");

const routerPath = path.join(dashboardRoot, "scripts", "approved-action-router.js");
const router = fs.readFileSync(routerPath, "utf8");
assert(router.includes("/api/theme-plan"), "Canonical router does not contain the Shopify planning route.");
assert(router.includes("/api/actions"), "Canonical router does not contain the governed action route.");
assert(router.includes("Needs Attention"), "Canonical router does not guarantee an explicit failure state.");
assert(router.includes("Completed"), "Canonical router does not guarantee an explicit completion state.");

console.log(JSON.stringify({
  status: "passed",
  build: requiredBuild,
  startupModules: moduleTags.map(value => value.split("?")[0]),
}, null, 2));
