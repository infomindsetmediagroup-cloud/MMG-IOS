import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const guardPath = new URL("../web/kairos-dashboard/scripts/manuscript-production-flow-guard.js", import.meta.url);
const bootstrapPath = new URL("../web/kairos-dashboard/scripts/manuscript-production-flow-bootstrap.js", import.meta.url);
const indexPath = new URL("../web/kairos-dashboard/index.html", import.meta.url);

test("production flow removes the retired backend generation route from the active browser path", async () => {
  const source = await readFile(guardPath, "utf8");

  assert.doesNotMatch(source, /generation-job/);
  assert.match(source, /KairosLocalInference/);
  assert.match(source, /data-start-local-production/);
  assert.match(source, /ready-for-manufacturing/);
  assert.match(source, /\/editorial/);
  assert.match(source, /\/setup/);
  assert.match(source, /\/auto-pipeline/);
  assert.match(source, /Keep Safari open and in the foreground/);
  assert.match(source, /history\.replaceState/);
  assert.match(source, /window\.location\.reload/);
});

test("the active dashboard boot chain loads the canonical runtime and production flow guard", async () => {
  const [bootstrap, index] = await Promise.all([
    readFile(bootstrapPath, "utf8"),
    readFile(indexPath, "utf8"),
  ]);

  assert.match(bootstrap, /legacy-runtime-loader\.js/);
  assert.match(bootstrap, /KairosLegacyRuntime\.load/);
  assert.match(bootstrap, /manuscript-production-flow-guard\.js/);
  assert.match(index, /manuscript-production-flow-bootstrap\.js\?v=manuscript-production-flow-guard-20260731-1/);
  assert.equal((index.match(/<script type="module"/g) || []).length, 2);
});
