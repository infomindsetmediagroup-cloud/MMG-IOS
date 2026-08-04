import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../../../web/kairos-dashboard/manuscript.html", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../../../web/kairos-dashboard/scripts/manuscript-deadlock-recovery.js", import.meta.url), "utf8");

test("manuscript recovery loads before direct open", () => {
  const stateReady = route.indexOf("KairosManuscriptRegistryBridge.stateFetchReady");
  const recoveryImport = route.indexOf("manuscript-deadlock-recovery.js?v=kairos-manuscript-deadlock-recovery-20260804-2");
  const directOpenImport = route.indexOf("manuscript-direct-open-controller.js?v=manuscript-flow-recovery-20260803-3");
  assert.ok(stateReady > -1);
  assert.ok(recoveryImport > stateReady);
  assert.ok(directOpenImport > recoveryImport);
});

test("manuscript recovery exposes retry controls", () => {
  assert.ok(recovery.includes("KAIROS_MANUSCRIPT_STATE_TIMEOUT"));
  assert.ok(recovery.includes("Retry Editorial Workbench"));
  assert.ok(recovery.includes("Retry Production State"));
  assert.ok(recovery.includes("data-kairos-recover-editorial"));
  assert.ok(recovery.includes("data-kairos-recover-pipeline"));
  assert.ok(recovery.includes("AbortController"));
});
