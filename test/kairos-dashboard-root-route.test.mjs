import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeURL = new URL("../web/kairos-dashboard/scripts/manuscript-dashboard-route-bridge.js", import.meta.url);
const indexURL = new URL("../web/kairos-dashboard/index.html", import.meta.url);

test("dashboard root owns a clean Command Center boot while preserving manuscript identity", async () => {
  const source = await readFile(routeURL, "utf8");
  assert.match(source, /kairos-manuscript-dashboard-route-20260805-5-durable-project-handoff/);
  assert.match(source, /manuscript-command-center-root-20260805-3/);
  assert.match(source, /durableProject/);
  assert.match(source, /captureProjectFromTrigger/);
  assert.match(source, /enforceCommandCenterRoot\("root-bootstrap"\)/);
  assert.match(source, /routeToDedicatedStudio\(projectFromElement\(embedded\)/);
  assert.match(source, /location\.assign\(target\.href\)/);
  assert.match(source, /target\.searchParams\.set\("project", projectId\)/);
  assert.doesNotMatch(source, /sessionStorage\.removeItem\(ACTIVE_KEY\)/);
  assert.doesNotMatch(source, /element\.remove\(\)/);
  assert.doesNotMatch(source, /location\.replace\(target\.href\)/);
});

test("root dashboard loads the durable route owner and excludes receipt continuation runtime", async () => {
  const index = await readFile(indexURL, "utf8");
  assert.match(index, /kairos-manuscript-dashboard-route-20260805-5-durable-project-handoff/);
  assert.match(index, /manuscript-command-center-root|Executive Command Center/);
  assert.doesNotMatch(index, /manuscript-receipt-continuation-recovery\.js/);
  assert.match(index, /<title>Kairos Executive Command Center<\/title>/);
});
