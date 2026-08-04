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
const stateFetchInstall = readFileSync(
  new URL("../web/kairos-dashboard/scripts/kairos-state-fetch-install.js", import.meta.url),
  "utf8",
);
const stateFetch = readFileSync(
  new URL("../web/kairos-dashboard/scripts/kairos-state-fetch.js", import.meta.url),
  "utf8",
);

test("dedicated Manuscript Studio serializes current state transport before the registry bridge", async () => {
  const registryBuild = registryBridge.match(/const BUILD = "([^"]+)";/)?.[1];
  const stateInstallBuild = stateFetchInstall.match(
    /KAIROS_STATE_FETCH_INSTALL_BUILD\s*=\s*\n?\s*"([^"]+)"/,
  )?.[1];
  const stateFetchBuild = stateFetch.match(
    /KAIROS_STATE_FETCH_BUILD\s*=\s*\n?\s*"([^"]+)"/,
  )?.[1];

  expect(registryBuild).toBeTruthy();
  expect(stateInstallBuild).toBeTruthy();
  expect(stateFetchBuild).toBeTruthy();

  const installImport = `kairos-state-fetch-install.js?v=${stateInstallBuild}`;
  const registryImport = `manuscript-registry-bridge.js?v=${registryBuild}`;
  const stateClientImport = `kairos-state-fetch.js?v=${stateFetchBuild}`;
  const registryReadyGuard = "KairosManuscriptRegistryBridge?.ready";
  const directOpenRuntime = "manuscript-direct-open-controller.js?v=manuscript-flow-recovery-20260803-3";

  expect(manuscriptRoute).toContain(installImport);
  expect(manuscriptRoute).toContain(registryImport);
  expect(manuscriptRoute.indexOf(installImport)).toBeLessThan(
    manuscriptRoute.indexOf(registryImport),
  );
  expect(stateFetchInstall).toContain(stateClientImport);

  expect(manuscriptRoute).toContain("__KAIROS_MANUSCRIPT_RUNTIME_READY__");
  expect(manuscriptRoute).toContain(registryReadyGuard);
  expect(manuscriptRoute).toContain(directOpenRuntime);
  expect(manuscriptRoute.indexOf(registryReadyGuard)).toBeLessThan(
    manuscriptRoute.indexOf(directOpenRuntime),
  );

  expect(manuscriptRoute).not.toContain(
    "manuscript-registry-bridge.js?v=kairos-manuscript-registry-bridge-20260801-1",
  );
  expect(stateFetchInstall).not.toContain(
    "kairos-state-fetch.js?v=kairos-state-fetch-20260731-1",
  );
});
