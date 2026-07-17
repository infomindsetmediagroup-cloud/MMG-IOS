import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workerRoot, "../..");
const paths = {
  wrapper: join(workerRoot, "src/kairos-production-entry-canonical-v1.js"),
  renderer: join(repoRoot, "web/kairos-dashboard/scripts/command-hub-canonical-v3.js"),
  action: join(repoRoot, "web/kairos-dashboard/scripts/canonical-action-executor-v1.js"),
  website: join(repoRoot, "web/kairos-dashboard/scripts/canonical-website-workspace-v1.js"),
  index: join(repoRoot, "web/kairos-dashboard/index.html"),
  doctrine: join(repoRoot, "docs/KAIROS_ENTERPRISE_WEBSITE_BUILD_INSTRUCTIONS.md"),
  wiring: join(repoRoot, "docs/CANONICAL_COMMAND_WIRING_20260717.md"),
  wrangler: join(workerRoot, "wrangler.toml"),
};
for (const [name, path] of Object.entries(paths)) assert.ok(existsSync(path), `Missing canonical wiring dependency: ${name}`);
const read = key => readFileSync(paths[key], "utf8");
const wrapper = read("wrapper");
const renderer = read("renderer");
const action = read("action");
const website = read("website");
const index = read("index");
const doctrine = read("doctrine");
const wiring = read("wiring");
const wrangler = read("wrangler");

assert.match(wrangler, /^main\s*=\s*"src\/kairos-production-entry-canonical-v1\.js"$/m);
assert.ok(index.includes('kairos-command-hub-canonical-v3-20260717-2'));
assert.ok(index.includes('./scripts/command-hub-canonical-v3.js?v=20260717-2'));
assert.ok(index.includes('./styles/command-hub-canonical-v3.css?v=20260717-1'));
assert.ok(!index.includes('command-hub-stable-v2.js'));

assert.ok(!/^\s*import\s/m.test(renderer), "The core browser shell must not statically import optional workspace modules.");
for (const marker of [
  'const fallback=',
  'getJSON("/api/hub/contracts")',
  './canonical-action-executor-v1.js?v=20260717-1',
  './canonical-website-workspace-v1.js?v=20260717-1',
  'The embedded canonical registry is active',
  'Every child card has a built-in instruction-bound executor',
]) assert.ok(renderer.includes(marker), `Canonical renderer missing: ${marker}`);

const actions = [
  "knowledge-library","research-brief","decision-record","doctrine-vault","intelligence-synthesis",
  "website","manuscript-studio","social-production","publishing-studio","creative-studio",
  "product-launch","revenue-intelligence","growth-plan","offer-builder","campaign-operations",
  "visitor-activity","customer-portal","deliverables","customer-journey","support-intelligence",
  "health","work-queue","release-control","executive-briefing","system-registry",
];
for (const id of actions) assert.ok(renderer.includes(`"${id}"`) || renderer.includes(`${id}:`), `Embedded registry missing ${id}`);

for (const marker of [
  'postJSON("/api/hub/execute"',
  'canonicalInstructionsRequired:true',
  'executionMode:"objective-to-verified-deliverable"',
  'The built-in canonical executor remains available',
]) assert.ok(action.includes(marker), `Built-in executor missing: ${marker}`);

for (const marker of [
  'kairos-enterprise-website-build-instructions@2026.07.15-v1',
  'docs/KAIROS_ENTERPRISE_WEBSITE_BUILD_INSTRUCTIONS.md',
  'EXECUTE CANONICAL STAGING BUILD',
  'requestType:"full-retool"',
  'intent:"canonical-enterprise-website-build"',
  'fullRetoolConfirmed:true',
  'structuralMutationAuthorized:true',
  'styleMutationAuthorized:true',
  'visualMutationAuthorized:true',
  'cssMutationAuthorized:true',
  'assetMutationAuthorized:true',
  'liveThemeMutationAuthorized:false',
  'requireWorkingPreview:true',
  'requireDesktopMobileVerification:true',
  '/api/shopify/staging/visual-verification',
  '/api/shopify/homepage-release/prepare',
  '/api/shopify/homepage-release/publish',
]) assert.ok(website.includes(marker), `Canonical website workspace missing: ${marker}`);
assert.ok(!website.includes('requestType:"homepage-preserve-design"'));

for (const marker of [
  './kairos-canonical-shopify-planner-v3.js',
  'KAIROS_WEBSITE_INSTRUCTION_SET',
  'canonicalWebsiteRequest',
  'moduleRequiredForExecution: false',
  'canonicalInstructionWiring',
  'liveThemeMutation: "separate-explicit-release-approval-only"',
]) assert.ok(wrapper.includes(marker), `Canonical Worker wrapper missing: ${marker}`);

for (const marker of [
  'INSPECT → CLASSIFY → JOURNEY PLAN → BUILD PLAN → GENERATE → STAGE → PREVIEW → VERIFY → REVISE → APPROVE → APPLY → CONFIRM',
  'No live-theme mutation until explicit approval',
  'No plan-only response when the authorized request is to build',
]) assert.ok(doctrine.includes(marker), `Canonical website doctrine missing: ${marker}`);
assert.ok(wiring.includes('Dedicated domain workspaces are progressive enhancements'));
assert.ok(wiring.includes('Live MAIN publication remains prohibited'));

console.log(JSON.stringify({
  status: "passed",
  contract: "kairos-canonical-instruction-wiring-20260717-1",
  childActions: actions.length,
  coreShellStaticOptionalImports: false,
  builtInChildExecutor: true,
  canonicalWebsiteInstructions: "2026.07.15-v1",
  stagingStructuralAndVisualBuild: "authorized",
  liveMainMutation: "separate-explicit-release-approval-only",
}, null, 2));
