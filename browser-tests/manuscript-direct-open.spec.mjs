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

function fixtureHTML() {
  return "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body><div id=\"kairos-hub\"></div></body></html>";
}

test("advanced manuscript route opens Studio as soon as its launcher mounts", async ({ page }) => {
  const projectWrites = [];

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
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

  await page.goto("https://kairos.test/?mode=advanced&open=manuscript");

  // Production order: the direct-open owner is installed before the larger
  // command runtime and waits for Manuscript Studio to mount.
  await page.addScriptTag({ type: "module", content: directOpenSource });
  await page.waitForTimeout(50);
  await page.addScriptTag({ type: "module", content: studioSource });

  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("#manuscript-studio-overlay h2")).toHaveText("Manuscript Studio");
  await expect(page.locator("#kairos-manuscript-open-failure")).toHaveCount(0);

  const snapshot = await page.evaluate(() => window.KairosManuscriptDirectOpen.snapshot());
  expect(snapshot.overlayPresent).toBe(true);
  expect(snapshot.launcherPresent).toBe(true);
  expect(snapshot.lastReason).toBe("direct-route");
  expect(snapshot.activeProjectId).toMatch(/^manuscript-studio-/);
  await expect.poll(() => projectWrites.length).toBe(1);
});

test("direct route displays recovery controls instead of a blank shell when Studio never mounts", async ({ page }) => {
  await page.route("https://kairos.test/**", async route => {
    if (route.request().resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });

  await page.goto("https://kairos.test/?mode=advanced&open=manuscript");
  await page.evaluate(() => {
    globalThis.__KAIROS_MANUSCRIPT_OPEN_TIMEOUT_MS = 100;
  });
  await page.addScriptTag({ type: "module", content: directOpenSource });

  await expect(page.locator("#kairos-manuscript-open-failure")).toBeVisible({ timeout: 2_000 });
  await expect(page.locator("#kairos-manuscript-open-failure")).toContainText("Manuscript Studio did not open");
  await expect(page.locator("[data-kairos-manuscript-retry]")).toBeVisible();
  await expect(page.locator("[data-kairos-command-return]")).toBeVisible();
});
