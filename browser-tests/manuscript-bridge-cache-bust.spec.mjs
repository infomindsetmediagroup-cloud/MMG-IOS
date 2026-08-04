import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const manuscriptRoute = readFileSync(
  new URL("../web/kairos-dashboard/manuscript.html", import.meta.url),
  "utf8",
);
const registryBridge = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-registry-bridge.js", import.meta.url),
  "utf8",
);

test("dedicated Manuscript Studio requests the current registry bridge build", async () => {
  const build = registryBridge.match(/const BUILD = "([^"]+)";/)?.[1];
  expect(build).toBeTruthy();
  expect(manuscriptRoute).toContain(`manuscript-registry-bridge.js?v=${build}`);
  expect(manuscriptRoute).not.toContain(
    "manuscript-registry-bridge.js?v=kairos-manuscript-registry-bridge-20260801-1",
  );
});
