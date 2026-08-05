import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeURL = new URL("../web/kairos-dashboard/scripts/manuscript-dashboard-route-bridge.js", import.meta.url);
const indexURL = new URL("../web/kairos-dashboard/index.html", import.meta.url);

test("dashboard root owns a clean Command Center boot", async () => {
  const source = await readFile(routeURL, "utf8");
  assert.match(source, /manuscript-dashboard-route-20260805-3-command-center-root/);
  assert.match(source, /sessionStorage\.removeItem\(ACTIVE_KEY\)/);
  assert.match(source, /enforceCommandCenterRoot\("root-bootstrap"\)/);
  assert.match(source, /element\.remove\(\)/);
  assert.match(source, /content-card-user-action/);
  assert.match(source, /location\.assign\(target\.href\)/);
  assert.doesNotMatch(source, /selectExistingProject/);
  assert.doesNotMatch(source, /projectFromEmbeddedRuntime/);
  assert.doesNotMatch(source, /location\.replace\(target\.href\)/);
});

test("root dashboard does not load the manuscript receipt continuation owner", async () => {
  const index = await readFile(indexURL, "utf8");
  assert.match(index, /kairos-manuscript-dashboard-route-20260805-3-command-center-root/);
  assert.doesNotMatch(index, /manuscript-receipt-continuation-recovery\.js/);
  assert.match(index, /<title>Kairos Executive Command Center<\/title>/);
});
