import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controllerPath = new URL("../web/kairos-dashboard/scripts/manuscript-auto-pipeline.js", import.meta.url);
const guardPath = new URL("../web/kairos-dashboard/scripts/manuscript-production-flow-guard.js", import.meta.url);
const postIntakeGuardPath = new URL("../web/kairos-dashboard/scripts/manuscript-post-intake-guard.js", import.meta.url);
const directOpenPath = new URL("../web/kairos-dashboard/scripts/manuscript-direct-open-controller.js", import.meta.url);
const workspacePath = new URL("../web/kairos-dashboard/scripts/production-workspace-controller.js", import.meta.url);
const bootstrapPath = new URL("../web/kairos-dashboard/scripts/manuscript-production-flow-bootstrap.js", import.meta.url);
const loaderPath = new URL("../web/kairos-dashboard/scripts/legacy-runtime-loader.js", import.meta.url);
const indexPath = new URL("../web/kairos-dashboard/index.html", import.meta.url);
const manuscriptPagePath = new URL("../web/kairos-dashboard/manuscript.html", import.meta.url);

test("the actual manuscript controller uses only the local WebGPU production route", async () => {
  const source = await readFile(controllerPath, "utf8");

  assert.doesNotMatch(source, /generation-job/);
  assert.doesNotMatch(source, /Start Production Job/);
  assert.doesNotMatch(source, /you may close Safari|continues in the backend|phone-independent/i);
  assert.match(source, /KairosLocalInference/);
  assert.match(source, /data-start-local-production/);
  assert.match(source, /ready-for-manufacturing/);
  assert.match(source, /\/editorial/);
  assert.match(source, /\/setup/);
  assert.match(source, /\/auto-pipeline/);
  assert.match(source, /executionMode:\s*"browser-webgpu"/);
  assert.match(source, /Keep Safari open and in the foreground/);
  assert.match(source, /Do not close Safari during this step/);
});

test("the controller observer cannot recursively schedule renders for its own section", async () => {
  const source = await readFile(controllerPath, "utf8");

  assert.doesNotMatch(source, /new MutationObserver\(scheduleEnhance\)/);
  assert.match(source, /hasSetup && !hasPipeline/);
  assert.match(source, /setTimeout\(\(\) =>/);
});

test("the governed loader uses the post-intake stability lineage and installs the guard first", async () => {
  const source = await readFile(loaderPath, "utf8");
  const activeScripts = source.match(/const SCRIPT_FILES = \[([\s\S]*?)\];/)?.[1] || "";

  assert.match(source, /const ASSET_RELEASE = "five-center-dashboard-post-intake-stability-20260731-1"/);
  assert.doesNotMatch(source, /const ASSET_RELEASE = "five-center-dashboard-direct-studio-chunks-20260730-4"/);
  assert.match(source, /script\.src = `\.\/scripts\/\$\{filename\}\?v=\$\{ASSET_RELEASE\}`/);
  assert.match(activeScripts, /"manuscript-post-intake-guard\.js"/);
  assert.match(activeScripts, /"manuscript-studio\.js"/);
  assert.match(activeScripts, /"manuscript-auto-pipeline\.js"/);
  assert.ok(
    activeScripts.indexOf('"manuscript-post-intake-guard.js"') <
      activeScripts.indexOf('"manuscript-studio.js"'),
    "The post-intake guard must load before Manuscript Studio.",
  );
});

test("the route firewall rewrites any retained legacy button before document handlers run", async () => {
  const source = await readFile(guardPath, "utf8");

  assert.doesNotMatch(source, /generation-job/);
  assert.match(source, /window\.addEventListener\("click"/);
  assert.match(source, /data-start-production/);
  assert.match(source, /data-start-local-production/);
  assert.match(source, /stopImmediatePropagation/);
  assert.match(source, /KairosLocalInference/);
  assert.match(source, /auto-pipeline\/run/);
});

test("the post-intake guard preserves the successful overlay and suppresses duplicate Studio modules", async () => {
  const source = await readFile(postIntakeGuardPath, "utf8");

  assert.match(source, /kairos-manuscript-post-intake-guard-20260731-1/);
  assert.match(source, /duplicate Manuscript Studio module blocked/);
  assert.match(source, /success-overlay-stabilized/);
  assert.match(source, /success-overlay-restored/);
  assert.match(source, /intentionalRemovalUntil/);
  assert.match(source, /kairos:production:workspace-visibility/);
  assert.match(source, /KairosManuscriptPostIntakeGuard/);
});

test("the direct route independently loads Studio and owns visible recovery", async () => {
  const source = await readFile(directOpenPath, "utf8");

  assert.match(source, /kairos-manuscript-direct-open-20260801-2-standalone/);
  assert.match(source, /routeTarget === "manuscript"/);
  assert.match(source, /ensureStyle\("manuscript-studio\.css"\)/);
  assert.match(source, /ensureModule\("manuscript-post-intake-guard\.js"\)/);
  assert.match(source, /ensureModule\("manuscript-studio\.js"\)/);
  assert.match(source, /data-kairos-command-script/);
  assert.match(source, /data-kairos-command-style/);
  assert.match(source, /\.manuscript-launch/);
  assert.match(source, /#manuscript-studio-overlay/);
  assert.match(source, /Manuscript Studio did not open/);
  assert.match(source, /data-kairos-manuscript-retry/);
  assert.match(source, /data-kairos-command-return/);
  assert.match(source, /kairos-manuscript-direct-open-shell/);
  assert.match(source, /overlay-watchdog/);
  assert.match(source, /KairosManuscriptDirectOpen/);
});

test("the manuscript URL is isolated from the advanced command shell", async () => {
  const [index, manuscriptPage] = await Promise.all([
    readFile(indexPath, "utf8"),
    readFile(manuscriptPagePath, "utf8"),
  ]);

  assert.match(index, /current\.searchParams\.get\("open"\) !== "manuscript"/);
  assert.match(index, /new URL\("\.\/manuscript\.html", current\)/);
  assert.match(index, /target\.searchParams\.delete\("mode"\)/);
  assert.match(index, /location\.replace\(target\.href\)/);
  assert.match(index, /mmg-dedicated-manuscript-route/);

  assert.match(manuscriptPage, /kairos-dedicated-manuscript-route-20260801-1/);
  assert.match(manuscriptPage, /data-kairos-dedicated-manuscript="true"/);
  assert.match(manuscriptPage, /safari-manuscript-intake-compat\.js/);
  assert.match(manuscriptPage, /manuscript-direct-open-controller\.js/);
  assert.match(manuscriptPage, /kairos-manuscript-route-boot/);
  assert.doesNotMatch(manuscriptPage, /legacy-runtime-loader\.js/);
  assert.doesNotMatch(manuscriptPage, /manuscript-production-flow-bootstrap\.js/);
  assert.doesNotMatch(manuscriptPage, /data-kairos-persistent-return/);
});

test("the production workspace does not convert arbitrary DOM mutations into durable state changes", async () => {
  const source = await readFile(workspacePath, "utf8");
  const intakeBranch = source.match(/async function captureProductionResponse[\s\S]*?async function upsertWorkspaceRecord/)?.[0] || "";
  const observerBlock = source.match(/const observer = new MutationObserver[\s\S]*?observer\.observe/)?.[0] || "";

  assert.match(source, /kairos-production-workspace-20260731-4-post-intake/);
  assert.doesNotMatch(intakeBranch, /url\.includes\("\/api\/manuscript\/intake\/advance"\)/);
  assert.match(source, /Manuscript Studio exclusively owns the intake-to-registry transition/);
  assert.match(observerBlock, /dispatchWorkspaceVisibility/);
  assert.doesNotMatch(observerBlock, /kairos:production:state-changed/);
  assert.match(source, /kairos:production:workspace-visibility/);
});

test("the dashboard installs bounded state transport, direct-open recovery, and one guarded controller owner", async () => {
  const [bootstrap, index, loader] = await Promise.all([
    readFile(bootstrapPath, "utf8"),
    readFile(indexPath, "utf8"),
    readFile(loaderPath, "utf8"),
  ]);

  assert.match(bootstrap, /kairos-state-fetch-install\.js\?v=\$\{RELEASE\}/);
  assert.match(bootstrap, /manuscript-direct-open-controller\.js\?v=\$\{RELEASE\}/);
  assert.ok(
    bootstrap.indexOf("manuscript-direct-open-controller.js") <
      bootstrap.indexOf("legacy-runtime-loader.js"),
    "Direct-open recovery must install before the command runtime.",
  );
  assert.match(bootstrap, /legacy-runtime-loader\.js\?v=\$\{COMMAND_RUNTIME_RELEASE\}/);
  assert.match(bootstrap, /KairosLegacyRuntime\.load/);
  assert.doesNotMatch(bootstrap, /import\(`\.\/manuscript-auto-pipeline\.js/);
  assert.match(bootstrap, /manuscript-production-flow-guard\.js\?v=\$\{RELEASE\}/);
  assert.match(bootstrap, /five-center-dashboard-post-intake-stability-20260731-1/);
  assert.match(bootstrap, /manuscript-post-intake-stability-20260731-1/);
  assert.match(bootstrap, /BOOT_TIMEOUT_MS = 20_000/);
  assert.match(bootstrap, /renderBootstrapFailure/);
  assert.match(bootstrap, /directOpenController:/);
  assert.match(bootstrap, /singleControllerOwner:\s*"legacy-runtime-loader"/);
  assert.match(loader, /"manuscript-auto-pipeline\.js"/);
  assert.match(loader, /"manuscript-post-intake-guard\.js"/);
  assert.match(index, /manuscript-production-flow-bootstrap\.js\?v=manuscript-post-intake-stability-20260731-1/);
  assert.match(index, /legacy-runtime-loader\.js\?v=five-center-dashboard-post-intake-stability-20260731-1/);
  assert.match(index, /manuscript-auto-pipeline\.js\?v=five-center-dashboard-post-intake-stability-20260731-1/);
  assert.match(index, /manuscript-post-intake-guard\.js\?v=five-center-dashboard-post-intake-stability-20260731-1/);
  assert.match(index, /manuscript-direct-open-controller\.js\?v=kairos-dedicated-manuscript-route-20260801-1/);
  assert.match(index, /mmg-production-controller-target/);
  assert.match(index, /mmg-post-intake-guard-target/);
  assert.match(index, /mmg-direct-open-target/);
  assert.equal((index.match(/<script type="module"/g) || []).length, 2);
});