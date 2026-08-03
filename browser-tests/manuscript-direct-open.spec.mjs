import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const indexSource = readFileSync(
  new URL("../web/kairos-dashboard/index.html", import.meta.url),
  "utf8",
);
const manuscriptPageSource = readFileSync(
  new URL("../web/kairos-dashboard/manuscript.html", import.meta.url),
  "utf8",
);
const registryBridgeSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-registry-bridge.js", import.meta.url),
  "utf8",
);
const directOpenSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-direct-open-controller.js", import.meta.url),
  "utf8",
);
const studioSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-studio.js", import.meta.url),
  "utf8",
);
const postIntakeGuardSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-post-intake-guard.js", import.meta.url),
  "utf8",
);
const compatSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", import.meta.url),
  "utf8",
);

const studioCSS = `
  .manuscript-launch { position: fixed; right: 12px; bottom: 12px; }
  .manuscript-overlay { position: fixed; inset: 0; z-index: 100; overflow: auto; background: #05070a; padding: 12px; }
  .manuscript-panel { min-height: 320px; padding: 20px; color: white; background: #07101a; }
`;

async function installSuccessRoutes(page, { delayStudioMs = 100 } = {}) {
  const projectWrites = [];

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      const isManuscriptRoute = url.pathname === "/manuscript" || url.pathname === "/manuscript.html";
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: isManuscriptRoute ? manuscriptPageSource : indexSource,
      });
      return;
    }

    if (url.pathname === "/styles/manuscript-studio.css") {
      await route.fulfill({ status: 200, contentType: "text/css", body: studioCSS });
      return;
    }

    if (url.pathname === "/scripts/manuscript-registry-bridge.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: registryBridgeSource });
      return;
    }

    if (url.pathname === "/scripts/safari-manuscript-intake-compat.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: compatSource });
      return;
    }

    if (url.pathname === "/scripts/manuscript-direct-open-controller.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: directOpenSource });
      return;
    }

    if (url.pathname === "/scripts/manuscript-post-intake-guard.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: postIntakeGuardSource });
      return;
    }

    if (url.pathname === "/scripts/manuscript-studio.js") {
      if (delayStudioMs) await new Promise(resolve => setTimeout(resolve, delayStudioMs));
      await route.fulfill({ status: 200, contentType: "text/javascript", body: studioSource });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/api/production-registry/projects") {
      projectWrites.push(request.postDataJSON());
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ status: "created", project: request.postDataJSON() }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "test_route_unhandled", path: url.pathname } }),
    });
  });

  return projectWrites;
}

test("legacy advanced manuscript URL redirects before the command runtime and opens dedicated Studio", async ({ page }) => {
  const projectWrites = await installSuccessRoutes(page);

  await page.goto("https://kairos.test/?mode=advanced&open=manuscript");

  await expect.poll(() => new URL(page.url()).pathname).toBe("/manuscript");
  await expect(page.locator("body")).toHaveAttribute("data-kairos-dedicated-manuscript", "true");
  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator("#manuscript-studio-overlay h2")).toHaveText("Manuscript Studio");
  await expect(page.locator("#kairos-manuscript-route-boot")).toHaveCount(0);
  await expect(page.locator("[data-kairos-persistent-return]")).toHaveCount(0);
  await expect(page.locator('script[src*="legacy-runtime-loader.js"]')).toHaveCount(0);
  await expect(page.locator('script[src*="manuscript-production-flow-bootstrap.js"]')).toHaveCount(0);

  await expect(page.locator('script[data-kairos-command-script="manuscript-post-intake-guard.js"]')).toHaveCount(1);
  await expect(page.locator('script[data-kairos-command-script="manuscript-studio.js"]')).toHaveCount(1);
  await expect(page.locator('link[data-kairos-command-style="manuscript-studio.css"]')).toHaveCount(1);

  const snapshot = await page.evaluate(() => window.KairosManuscriptDirectOpen.snapshot());
  expect(snapshot.build).toBe("kairos-manuscript-direct-open-20260803-3-mobile-controls");
  expect(snapshot.overlayPresent).toBe(true);
  expect(snapshot.launcherPresent).toBe(true);
  expect(snapshot.shellPresent).toBe(false);
  expect(snapshot.openedOnce).toBe(true);
  expect(snapshot.lastReason).toBe("direct-route");
  expect(snapshot.activeProjectId).toMatch(/^manuscript-studio-/);

  const route = await page.evaluate(() => window.KairosDedicatedManuscriptRoute);
  expect(route.build).toBe("kairos-dedicated-manuscript-route-20260803-2-mobile-controls");
  expect(route.opened).toBe(true);

  const guard = await page.evaluate(() => window.KairosManuscriptPostIntakeGuard.snapshot());
  expect(guard.build).toBe("kairos-manuscript-post-intake-guard-20260731-1");
  expect(guard.acceptedStudioModuleURL).toContain("manuscript-studio.js");
  expect(guard.duplicateStudioModules).toEqual([]);
  await expect.poll(() => projectWrites.length).toBe(1);
});

test("canonical manuscript route forces direct open and converts registry PATCH to canonical upsert", async ({ page }) => {
  const projectWrites = await installSuccessRoutes(page, { delayStudioMs: 0 });

  await page.goto("https://kairos.test/manuscript");

  await expect.poll(() => new URL(page.url()).searchParams.get("open")).toBe("manuscript");
  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible({ timeout: 8_000 });

  const result = await page.evaluate(async () => {
    const projectId = "manuscript-studio-registry-bridge-test";
    const response = await fetch(`/api/production-registry/projects/${projectId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Registry Bridge Test",
        status: "production_intake",
        stage: "project_setup",
        progress: 25,
        sourceProjectId: "PUB-registry-bridge-test",
        summary: "Intake accepted.",
        nextAction: "Complete project setup.",
      }),
    });
    return {
      status: response.status,
      body: await response.json(),
      bridge: window.KairosManuscriptRegistryBridge.snapshot(),
    };
  });

  expect(result.status).toBe(201);
  expect(result.bridge.pending).toBe(false);
  await expect.poll(() => projectWrites.length).toBe(2);
  expect(projectWrites.at(-1)).toMatchObject({
    projectId: "manuscript-studio-registry-bridge-test",
    projectType: "manuscript-studio",
    title: "Registry Bridge Test",
    status: "production_intake",
    stage: "project_setup",
    sourceProjectId: "PUB-registry-bridge-test",
  });
});

test("dedicated route restores an unintentionally removed Studio overlay", async ({ page }) => {
  await installSuccessRoutes(page, { delayStudioMs: 0 });

  await page.goto("https://kairos.test/manuscript?open=manuscript");

  const overlay = page.locator("#manuscript-studio-overlay");
  await expect(overlay).toBeVisible({ timeout: 8_000 });
  await expect.poll(
    () => page.evaluate(() => window.KairosManuscriptDirectOpen.snapshot().openedOnce),
  ).toBe(true);

  await page.evaluate(() => {
    document.querySelector("#manuscript-studio-overlay")?.remove();
  });

  await expect(overlay).toBeVisible({ timeout: 4_000 });
  const snapshot = await page.evaluate(() => window.KairosManuscriptDirectOpen.snapshot());
  expect(snapshot.openAttempts).toBeGreaterThanOrEqual(2);
  expect(snapshot.lastReason).toBe("overlay-watchdog");
});

test("dedicated route displays body-owned recovery controls when Studio cannot load", async ({ page }) => {
  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: manuscriptPageSource });
      return;
    }

    if (url.pathname === "/styles/manuscript-studio.css") {
      await route.fulfill({ status: 200, contentType: "text/css", body: studioCSS });
      return;
    }

    if (url.pathname === "/scripts/manuscript-registry-bridge.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: registryBridgeSource });
      return;
    }

    if (url.pathname === "/scripts/safari-manuscript-intake-compat.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: compatSource });
      return;
    }

    if (url.pathname === "/scripts/manuscript-direct-open-controller.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: directOpenSource });
      return;
    }

    if (url.pathname === "/scripts/manuscript-post-intake-guard.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: postIntakeGuardSource });
      return;
    }

    if (url.pathname === "/scripts/manuscript-studio.js") {
      await route.fulfill({ status: 503, contentType: "text/plain", body: "unavailable" });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/api/production-registry/projects") {
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("https://kairos.test/manuscript?open=manuscript");

  const shell = page.locator("#kairos-manuscript-direct-open-shell");
  await expect(shell).toBeVisible({ timeout: 4_000 });
  await expect(shell).toContainText("Manuscript Studio did not open");
  await expect(page.locator("[data-kairos-manuscript-retry]")).toBeVisible();
  await expect(page.locator("[data-kairos-command-return]")).toBeVisible();
  await expect(shell.evaluate(element => element.parentElement?.tagName)).resolves.toBe("BODY");
});
