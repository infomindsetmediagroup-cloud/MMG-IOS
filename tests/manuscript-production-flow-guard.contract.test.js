import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controllerPath = new URL("../web/kairos-dashboard/scripts/manuscript-auto-pipeline.js", import.meta.url);
const guardPath = new URL("../web/kairos-dashboard/scripts/manuscript-production-flow-guard.js", import.meta.url);
const bootstrapPath = new URL("../web/kairos-dashboard/scripts/manuscript-production-flow-bootstrap.js", import.meta.url);
const loaderPath = new URL("../web/kairos-dashboard/scripts/legacy-runtime-loader.js", import.meta.url);
const indexPath = new URL("../web/kairos-dashboard/index.html", import.meta.url);

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

test("the governed loader uses the state-recovery asset lineage", async () => {
  const source = await readFile(loaderPath, "utf8");

  assert.match(source, /const ASSET_RELEASE = "five-center-dashboard-state-check-recovery-20260731-1"/);
  assert.doesNotMatch(source, /const ASSET_RELEASE = "five-center-dashboard-direct-studio-chunks-20260730-4"/);
  assert.match(source, /script\.src = `\.\/scripts\/\$\{filename\}\?v=\$\{ASSET_RELEASE\}`/);
  assert.match(source, /"manuscript-auto-pipeline\.js"/);
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

test("the dashboard installs bounded state transport and evaluates one controller owner", async () => {
  const [bootstrap, index, loader] = await Promise.all([
    readFile(bootstrapPath, "utf8"),
    readFile(indexPath, "utf8"),
    readFile(loaderPath, "utf8"),
  ]);

  assert.match(bootstrap, /kairos-state-fetch-install\.js\?v=\$\{RELEASE\}/);
  assert.match(bootstrap, /legacy-runtime-loader\.js\?v=\$\{COMMAND_RUNTIME_RELEASE\}/);
  assert.match(bootstrap, /KairosLegacyRuntime\.load/);
  assert.doesNotMatch(bootstrap, /import\(`\.\/manuscript-auto-pipeline\.js/);
  assert.match(bootstrap, /manuscript-production-flow-guard\.js\?v=\$\{RELEASE\}/);
  assert.match(bootstrap, /five-center-dashboard-state-check-recovery-20260731-1/);
  assert.match(bootstrap, /manuscript-local-production-controller-20260731-5-state-timeout/);
  assert.match(bootstrap, /singleControllerOwner:\s*"legacy-runtime-loader"/);
  assert.match(loader, /"manuscript-auto-pipeline\.js"/);
  assert.match(index, /manuscript-production-flow-bootstrap\.js\?v=manuscript-local-production-controller-20260731-5-state-timeout/);
  assert.match(index, /legacy-runtime-loader\.js\?v=five-center-dashboard-state-check-recovery-20260731-1/);
  assert.match(index, /manuscript-auto-pipeline\.js\?v=five-center-dashboard-state-check-recovery-20260731-1/);
  assert.match(index, /mmg-production-controller-target/);
  assert.equal((index.match(/<script type="module"/g) || []).length, 2);
});
