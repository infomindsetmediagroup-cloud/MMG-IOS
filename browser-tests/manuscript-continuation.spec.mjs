import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const continuationSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-continuation-controller.js", import.meta.url),
  "utf8",
);
const setupSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-project-setup.js", import.meta.url),
  "utf8",
);
const studioCSS = readFileSync(
  new URL("../web/kairos-dashboard/styles/manuscript-studio.css", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-continuation-test";

function fixtureHTML() {
  return `<!doctype html>
    <html>
      <head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body>
        <div id="manuscript-studio-overlay">
          <section class="manuscript-panel">
            <div class="manuscript-result">
              <h3>Production intake created</h3>
              <p><strong>Accepted source:</strong> 279,045 characters · 31,743 words</p>
              <div class="manuscript-actions manuscript-intake-actions">
                <button class="primary" data-finish>Return to Production Center</button>
                <button class="secondary" data-edit>Review Intake Source</button>
              </div>
            </div>
          </section>
        </div>
      </body>
    </html>`;
}

test("iPhone intake receipt automatically opens visible Project Setup", async ({ page }) => {
  let setupReads = 0;

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (url.pathname === "/scripts/manuscript-project-setup.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: setupSource });
      return;
    }

    if (
      request.method() === "GET" &&
      url.pathname === `/api/production-registry/manuscripts/${PROJECT_ID}/setup`
    ) {
      setupReads += 1;
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "setup_not_started" } }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "test_route_unhandled", path: url.pathname } }),
    });
  });

  await page.goto("https://kairos.test/manuscript?open=manuscript");
  await page.evaluate(projectId => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
    }));

    document.querySelector("[data-finish]").addEventListener("click", () => {
      document.querySelector("#manuscript-studio-overlay")?.remove();
    });
  }, PROJECT_ID);

  await page.addStyleTag({ content: studioCSS });
  await page.addScriptTag({ content: continuationSource });

  const button = page.locator("[data-finish]");
  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible();
  await expect(page.locator("#manuscript-project-setup")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator("#manuscript-project-setup")).toContainText("Complete Project Setup");
  await expect(page.locator("[data-setup-author]")).toBeVisible();
  await expect(page.locator("[data-setup-service]")).toBeVisible();
  await expect(button).toHaveCount(0);
  await expect.poll(() => setupReads).toBeLessThanOrEqual(1);

  const mobileLayout = await page.evaluate(() => {
    const overlay = document.querySelector("#manuscript-studio-overlay");
    const setup = document.querySelector("#manuscript-project-setup");
    const overlayStyle = getComputedStyle(overlay);
    const setupBox = setup.getBoundingClientRect();
    return {
      overlayVisibleHeight: overlay.clientHeight,
      viewportHeight: innerHeight,
      backdropFilter: overlayStyle.backdropFilter,
      webkitBackdropFilter: overlayStyle.webkitBackdropFilter,
      setupTop: setupBox.top,
      setupBottom: setupBox.bottom,
    };
  });
  expect(mobileLayout.overlayVisibleHeight).toBeLessThanOrEqual(mobileLayout.viewportHeight);
  expect(["none", ""]).toContain(mobileLayout.backdropFilter);
  expect(["none", ""]).toContain(mobileLayout.webkitBackdropFilter);
  expect(mobileLayout.setupTop).toBeGreaterThanOrEqual(0);
  expect(mobileLayout.setupTop).toBeLessThan(mobileLayout.viewportHeight);

  const snapshot = await page.evaluate(() => window.KairosManuscriptContinuation.snapshot());
  expect(snapshot.build).toBe("kairos-manuscript-continuation-20260802-3-auto-setup");
  expect(snapshot.opened).toBe(true);
  expect(snapshot.setupPresent).toBe(true);
  expect(snapshot.lastError).toBe("");
  expect(snapshot.automaticContinuations).toBe(1);
});
