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
const dashboardRouteBridge = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-dashboard-route-bridge.js", import.meta.url),
  "utf8",
);
const editorialWatchdog = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-editorial-watchdog.js", import.meta.url),
  "utf8",
);

test("dedicated Manuscript Studio waits for current registry state transport before direct open", async () => {
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
  const stateReadyAwait = "await globalThis.KairosManuscriptRegistryBridge.stateFetchReady()";
  const directOpenImport = 'await import("./scripts/manuscript-direct-open-controller.js?v=manuscript-flow-recovery-20260803-3")';
  const watchdogImport = "manuscript-editorial-watchdog.js?v=manuscript-editorial-recovery-20260804-1";

  expect(registryBridge).toContain(installImport);
  expect(stateFetchInstall).toContain(stateClientImport);
  expect(manuscriptRoute).toContain(registryImport);
  expect(manuscriptRoute).toContain(watchdogImport);
  expect(manuscriptRoute).toContain("__KAIROS_MANUSCRIPT_RUNTIME_READY__");
  expect(manuscriptRoute).toContain("KairosManuscriptRegistryBridge?.ready");
  expect(manuscriptRoute).toContain(stateReadyAwait);
  expect(manuscriptRoute).toContain(directOpenImport);

  expect(manuscriptRoute.indexOf(watchdogImport)).toBeLessThan(
    manuscriptRoute.indexOf(registryImport),
  );
  expect(manuscriptRoute.indexOf(registryImport)).toBeLessThan(
    manuscriptRoute.indexOf(stateReadyAwait),
  );
  expect(manuscriptRoute.indexOf(stateReadyAwait)).toBeLessThan(
    manuscriptRoute.indexOf(directOpenImport),
  );

  expect(manuscriptRoute).not.toContain(
    "manuscript-registry-bridge.js?v=kairos-manuscript-registry-bridge-20260801-1",
  );
  expect(stateFetchInstall).not.toContain(
    "kairos-state-fetch.js?v=kairos-state-fetch-20260731-1",
  );
});

test("root dashboard cannot retain a legacy embedded manuscript runtime", async ({ page }) => {
  const projectId = "root-route-guard-project-12345678";

  await page.route("https://kairos.test/**", async route => {
    if (route.request().resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><body><main>Dashboard</main></body></html>",
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(id => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId: id,
    }));
  }, projectId);
  await page.addScriptTag({ content: dashboardRouteBridge });

  await page.evaluate(id => {
    const overlay = document.createElement("div");
    overlay.id = "manuscript-studio-overlay";
    overlay.className = "manuscript-overlay";
    overlay.dataset.projectId = id;
    overlay.innerHTML = `
      <section id="manuscript-editorial-workbench">
        <p>Editorial production</p>
        <h3>Loading Editorial Workbench…</h3>
      </section>
    `;
    document.body.append(overlay);
  }, projectId);

  await expect.poll(() => new URL(page.url()).pathname).toBe("/manuscript");
  const url = new URL(page.url());
  expect(url.searchParams.get("open")).toBe("manuscript");
  expect(url.searchParams.get("project")).toBe(projectId);
  expect(url.searchParams.get("release")).toBe("manuscript-root-canonical-20260804-1");
  expect(url.searchParams.get("reason")).toBe("embedded-runtime-mutation");
});

test("editorial watchdog replaces an indefinite loading card with recovery controls", async ({ page }) => {
  const projectId = "editorial-watchdog-project-12345678";

  await page.setContent("<!doctype html><html data-kairos-route=\"manuscript-studio\"><body data-kairos-dedicated-manuscript=\"true\"></body></html>");
  await page.evaluate(id => {
    globalThis.__KAIROS_EDITORIAL_WATCHDOG_DEADLINE_MS__ = 500;
    globalThis.__KAIROS_EDITORIAL_WATCHDOG_AUTO_RELOAD__ = false;
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId: id,
    }));
  }, projectId);
  await page.addScriptTag({ content: editorialWatchdog });

  await page.evaluate(() => {
    const section = document.createElement("section");
    section.id = "manuscript-editorial-workbench";
    section.innerHTML = `
      <p class="eyebrow">Editorial production</p>
      <h3>Loading Editorial Workbench…</h3>
      <p>Kairos is loading the saved editorial state once.</p>
    `;
    document.body.append(section);
  });

  const workbench = page.locator("#manuscript-editorial-workbench");
  await expect(workbench).toContainText(
    "The saved Editorial Workbench did not finish loading",
    { timeout: 3_000 },
  );
  await expect(workbench.getByRole("button", { name: "Retry Editorial State" })).toBeVisible();
  await expect(workbench.getByRole("button", { name: "Return to Command Center" })).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => window.KairosManuscriptEditorialWatchdog.snapshot()),
  ).toMatchObject({
    projectId,
    recoveryVisible: true,
    deadlineMs: 500,
    requestTimeoutMs: 6_000,
  });
});
