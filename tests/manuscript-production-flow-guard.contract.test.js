import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controllerPath = new URL("../web/kairos-dashboard/scripts/manuscript-auto-pipeline.js", import.meta.url);
const guardPath = new URL("../web/kairos-dashboard/scripts/manuscript-production-flow-guard.js", import.meta.url);
const bootstrapPath = new URL("../web/kairos-dashboard/scripts/manuscript-production-flow-bootstrap.js", import.meta.url);
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

test("the dashboard imports the canonical controller under a new Safari cache key", async () => {
  const [bootstrap, index] = await Promise.all([
    readFile(bootstrapPath, "utf8"),
    readFile(indexPath, "utf8"),
  ]);

  assert.match(bootstrap, /legacy-runtime-loader\.js/);
  assert.match(bootstrap, /KairosLegacyRuntime\.load/);
  assert.match(bootstrap, /manuscript-auto-pipeline\.js\?v=\$\{RELEASE\}/);
  assert.match(bootstrap, /manuscript-production-flow-guard\.js\?v=\$\{RELEASE\}/);
  assert.match(bootstrap, /manuscript-local-production-controller-20260731-3/);
  assert.match(index, /manuscript-production-flow-bootstrap\.js\?v=manuscript-local-production-controller-20260731-3/);
  assert.match(index, /mmg-production-controller-target/);
  assert.equal((index.match(/<script type="module"/g) || []).length, 2);
});
