import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const directOpenSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-direct-open-controller.js", import.meta.url),
  "utf8",
);
const studioSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-studio.js", import.meta.url),
  "utf8",
);

const guardSource = `
  window.KairosManuscriptPostIntakeGuard = Object.freeze({
    build: "test-post-intake-guard",
    ready: true,
  });
`;

const studioCSS = `
  .manuscript-launch { position: fixed; right: 12px; bottom: 12px; }
  .manuscript-overlay { position: fixed; inset: 0; z-index: 100; overflow: auto; background: #05070a; padding: 12px; }
  .manuscript-panel { min-height: 320px; padding: 20px; color: white; background: #07101a; }
`;

function fixtureHTML() {
  return "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body><div id=\"kairos-hub\"></div></body></html>";
}

async function installSuccessRoutes(page, { delayStudioMs = 100 } = {}) {
  const projectWrites = [];

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (url.pathname === "/styles/manuscript-studio.css") {
      await route.fulfill({ status: 200, contentType: "text/css", body: studioCSS });
      return;
    }

    if (url.pathname === "/scripts/manuscript-post-intake-guard.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: guardSource });
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

test("advanced manuscript route independently loads and opens Studio", async ({ page }) => {
  const projectWrites = await installSuccessRoutes(page);

  await page.goto("https://kairos.test/?mode=advanced&open=manuscript");
  await page.addScriptTag({ type: "module", content: directOpenSource });

  const shell = page.locator("#kairos-manuscript-direct-open-shell");
  await expect(shell).toBeVisible();
  await expect(shell).toContainText("Opening Manuscript Studio");
  await expect(shell.evaluate(element => element.parentElement?.tagName)).resolves.toBe("BODY");

  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator("#manuscript-studio-overlay h2")).toHaveText("Manuscript Studio");
  await expect(shell).toHaveCount(0);

  await expect(page.locator('script[data-kairos-command-script="manuscript-post-intake-guard.js"]')).toHaveCount(1);
  await expect(page.locator('script[data-kairos-command-script="manuscript-studio.js"]')).toHaveCount(1);
  await expect(page.locator('link[data-kairos-command-style="manuscript-studio.css"]')).toHaveCount(1);

  const snapshot = await page.evaluate(() => window.KairosManuscriptDirectOpen.snapshot());
  expect(snapshot.build).toBe("kairos-manuscript-direct-open-20260801-2-standalone");
  expect(snapshot.overlayPresent).toBe(true);
  expect(snapshot.launcherPresent).toBe(true);
  expect(snapshot.shellPresent).toBe(false);
  expect(snapshot.openedOnce).toBe(true);
  expect(snapshot.lastReason).toBe("direct-route");
  expect(snapshot.activeProjectId).toMatch(/^manuscript-studio-/);
  await expect.poll(() => projectWrites.length).toBe(1);
});

test("direct route restores an unintentionally removed Studio overlay", async ({ page }) => {
  await installSuccessRoutes(page, { delayStudioMs: 0 });

  await page.goto("https://kairos.test/?mode=advanced&open=manuscript");
  await page.addScriptTag({ type: "module", content: directOpenSource });

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

test("direct route displays body-owned recovery controls when Studio cannot load", async ({ page }) => {
  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (url.pathname === "/styles/manuscript-studio.css") {
      await route.fulfill({ status: 200, contentType: "text/css", body: studioCSS });
      return;
    }

    if (url.pathname === "/scripts/manuscript-post-intake-guard.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: guardSource });
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

  await page.goto("https://kairos.test/?mode=advanced&open=manuscript");
  await page.addScriptTag({ type: "module", content: directOpenSource });

  const shell = page.locator("#kairos-manuscript-direct-open-shell");
  await expect(shell).toBeVisible({ timeout: 4_000 });
  await expect(shell).toContainText("Manuscript Studio did not open");
  await expect(page.locator("[data-kairos-manuscript-retry]")).toBeVisible();
  await expect(page.locator("[data-kairos-command-return]")).toBeVisible();
  await expect(shell.evaluate(element => element.parentElement?.tagName)).resolves.toBe("BODY");
});