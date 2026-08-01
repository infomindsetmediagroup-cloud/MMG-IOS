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
              <div class="manuscript-actions">
                <button class="primary" data-finish>Return to Production Center</button>
                <button class="secondary" data-edit>Review Intake Source</button>
              </div>
            </div>
          </section>
        </div>
      </body>
    </html>`;
}

test("intake continuation keeps the overlay open and renders Project Setup", async ({ page }) => {
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

  await page.addScriptTag({ content: continuationSource });

  const button = page.locator("[data-finish]");
  await expect(button).toHaveText("Continue to Project Setup");
  await button.tap();

  await expect(page.locator("#manuscript-studio-overlay")).toBeVisible();
  await expect(page.locator("#manuscript-project-setup")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator("#manuscript-project-setup")).toContainText("Complete Project Setup");
  await expect(page.locator("[data-setup-author]")).toBeVisible();
  await expect(page.locator("[data-setup-service]")).toBeVisible();
  await expect(button).toHaveCount(0);
  await expect.poll(() => setupReads).toBeLessThanOrEqual(1);

  const snapshot = await page.evaluate(() => window.KairosManuscriptContinuation.snapshot());
  expect(snapshot.build).toBe("kairos-manuscript-continuation-20260801-1");
  expect(snapshot.opened).toBe(true);
  expect(snapshot.setupPresent).toBe(true);
  expect(snapshot.lastError).toBe("");
});
