import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../../../web/kairos-dashboard/manuscript.html", import.meta.url), "utf8");
const install = readFileSync(new URL("../../../web/kairos-dashboard/scripts/kairos-state-fetch-install.js", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../../../web/kairos-dashboard/scripts/manuscript-deadlock-recovery.js", import.meta.url), "utf8");

test("dedicated manuscript route installs bounded state and deadlock recovery before pipeline controllers", () => {
  const stateIndex = route.indexOf("kairos-state-fetch-install.js?v=kairos-state-fetch-install-20260804-4-deadlock-recovery");
  const recoveryIndex = route.indexOf("manuscript-deadlock-recovery.js?v=kairos-manuscript-deadlock-recovery-20260804-1");
  const registryIndex = route.indexOf("manuscript-registry-bridge.js?v=kairos-manuscript-registry-bridge-20260804-2-editorial-restore");
  const orchestratorIndex = route.indexOf("manuscript-pipeline-orchestrator.js?v=kairos-manuscript-pipeline-orchestrator-20260803-1-deliverable-review");

  assert.ok(stateIndex > -1, "state fetch installer is missing from dedicated route");
  assert.ok(recoveryIndex > -1, "deadlock recovery is missing from dedicated route");
  assert.ok(registryIndex > -1, "registry bridge is missing from dedicated route");
  assert.ok(orchestratorIndex > -1, "pipeline orchestrator is missing from dedicated route");
  assert.ok(stateIndex < recoveryIndex, "state fetch must install before the watchdog");
  assert.ok(recoveryIndex < registryIndex, "watchdog must wrap fetch before registry restoration");
  assert.ok(registryIndex < orchestratorIndex, "registry restoration must load before pipeline ownership");
});

test("bounded state transport covers all manuscript reads that can strand the mobile pipeline", () => {
  assert.match(install, /kairos-state-fetch-install-20260804-4-deadlock-recovery/);
  assert.match(install, /source\\\/text/);
  assert.match(install, /deliverables\\\/(?:build\|zip|\(\?:build\|zip\))/);
  assert.match(install, /editorial\(\?:\\\/\(\?:versions/);
  assert.match(install, /requestJSONWithRetry/);
  assert.doesNotMatch(install, /kairos-state-fetch-20260731-1/);
});

test("deadlock watchdog forces Editorial Workbench and production-state spinners into retryable recovery", () => {
  assert.match(recovery, /KAIROS_MANUSCRIPT_STATE_TIMEOUT/);
  assert.match(recovery, /data-kairos-recover-editorial/);
  assert.match(recovery, /data-kairos-recover-pipeline/);
  assert.match(recovery, /Loading Editorial Workbench/);
  assert.match(recovery, /Checking the saved production state/);
  assert.match(recovery, /Retry Editorial Workbench/);
  assert.match(recovery, /Retry Production State/);
  assert.match(recovery, /AbortController/);
});
